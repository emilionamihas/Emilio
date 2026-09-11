"""
Punto de entrada del bot de arbitraje estadístico (pair trading) para Binance.

Flujo:
1. Carga config (.env) y crea el exchange (ccxt.pro).
2. Calibra el par: hedge ratio (OLS) + test de cointegración (Engle-Granger).
3. Lanza en paralelo:
   - feed de precios en tiempo real por WebSocket (data_engine)
   - loop de recalibración periódica (la cointegración se degrada con el tiempo)
   - loop de estrategia: en cada tick evalúa señal -> filtro de rentabilidad
     -> gestión de riesgo -> ejecución
   - loop de reporte: imprime PnL en consola cada REPORT_INTERVAL_SECONDS

Modo por defecto: DRY_RUN=true (paper trading). Para operar en real hay que
poner DRY_RUN=false explícitamente en .env, además de USE_TESTNET=false y
API keys con permiso de trading.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from config import Settings, load_settings
from control_api import run_control_api
from data_engine import build_exchange, calibrate_pair, recalibration_loop, run_market_data_feed
from execution import ExecutionEngine
from persistence import load_position, save_position
from profitability_filter import estimate_net_pnl
from reporting import Reporter
from risk_manager import RiskManager
from state import MarketState, PairPosition
from strategy import Signal, generate_signal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("trading-bot.main")


class PositionHolder:
    """Contenedor mutable de estado compartido entre el loop de estrategia
    (que lo escribe) y los loops de reporte y de la API de control (que lo
    leen, y en el caso de la API también lo usan para pedir acciones)."""

    def __init__(self) -> None:
        self.position: PairPosition | None = None
        # Kill switch remoto: en pausa, el bot no abre posiciones nuevas
        # pero sigue vigilando el stop-loss y la salida de la posición
        # abierta (no la abandona a mitad de camino).
        self.paused: bool = False
        # Pedido de cierre inmediato desde la API de control, sin esperar
        # a que el z-score revierta ni a que salte el stop-loss.
        self.force_close_requested: bool = False


async def strategy_loop(
    settings: Settings,
    market_state: MarketState,
    risk_manager: RiskManager,
    execution_engine: ExecutionEngine,
    reporter: Reporter,
    holder: PositionHolder,
) -> None:
    # Si al arrancar ya había una posición persistida de una corrida
    # anterior, ese capital ya está comprometido: no se vuelve a contar
    # como disponible hasta que la posición se cierre.
    available_capital = settings.total_capital_usdt
    if holder.position is not None:
        available_capital -= holder.position.allocated_capital

    while True:
        await asyncio.sleep(1)

        if not market_state.has_fresh_prices():
            continue

        open_position = holder.position

        # --- Stop-loss: se chequea primero, tiene prioridad sobre cualquier señal ---
        if open_position is not None and risk_manager.stop_loss_triggered(
            open_position, market_state.price_a, market_state.price_b
        ):
            trade = await execution_engine.close_pair_position(
                open_position, market_state, market_state.current_zscore or 0.0, "stop_loss"
            )
            reporter.record_trade(trade)
            reporter.print_trade_closed(trade)
            available_capital += open_position.allocated_capital + trade.net_pnl
            holder.position = None
            save_position(None)
            continue

        # --- Cierre forzado pedido desde la API de control (kill switch manual) ---
        if open_position is not None and holder.force_close_requested:
            trade = await execution_engine.close_pair_position(
                open_position, market_state, market_state.current_zscore or 0.0, "manual_close"
            )
            reporter.record_trade(trade)
            reporter.print_trade_closed(trade)
            available_capital += open_position.allocated_capital + trade.net_pnl
            holder.position = None
            holder.force_close_requested = False
            save_position(None)
            continue
        holder.force_close_requested = False  # no había nada que cerrar, se descarta el pedido

        result = generate_signal(market_state, settings, has_open_position=open_position is not None)

        if result.signal == Signal.EXIT and open_position is not None:
            trade = await execution_engine.close_pair_position(
                open_position, market_state, result.zscore, "mean_reversion"
            )
            reporter.record_trade(trade)
            reporter.print_trade_closed(trade)
            available_capital += open_position.allocated_capital + trade.net_pnl
            holder.position = None
            save_position(None)
            continue

        if result.signal in (Signal.ENTER_LONG_A_SHORT_B, Signal.ENTER_SHORT_A_LONG_B):
            if holder.paused:
                continue

            sizing = risk_manager.size_position(market_state, available_capital)

            if sizing.allocated_capital <= 0 or not market_state.spread_std:
                continue

            estimate = estimate_net_pnl(
                current_zscore=result.zscore,
                zscore_exit=settings.zscore_exit,
                spread_std=market_state.spread_std,
                quantity_a=sizing.quantity_a,
                notional_a=sizing.notional_a,
                notional_b=sizing.notional_b,
                settings=settings,
            )

            if not estimate.is_profitable:
                reporter.print_trade_rejected(
                    f"z={result.zscore:.2f} | PnL neto esperado={estimate.expected_net_pnl:+.2f} USDT "
                    f"(bruto={estimate.expected_gross_pnl:.2f}, fees={estimate.estimated_fees:.2f}, "
                    f"slippage={estimate.estimated_slippage:.2f}) -> no cubre costos, se descarta"
                )
                continue

            side_a, side_b = (
                ("sell", "buy") if result.signal == Signal.ENTER_SHORT_A_LONG_B else ("buy", "sell")
            )
            holder.position = await execution_engine.open_pair_position(
                market_state, sizing, side_a, side_b, result.zscore
            )
            save_position(holder.position)
            available_capital -= sizing.allocated_capital


async def reporting_loop(
    settings: Settings, market_state: MarketState, reporter: Reporter, holder: PositionHolder
) -> None:
    mode_label = "PAPER TRADING (DRY_RUN)" if settings.dry_run else "LIVE TRADING"
    while True:
        await asyncio.sleep(settings.report_interval_seconds)
        reporter.print_snapshot(market_state, holder.position, mode_label)


async def main() -> None:
    settings = load_settings()
    exchange = build_exchange(settings)

    market_state = MarketState(
        symbol_a=settings.symbol_a, symbol_b=settings.symbol_b, zscore_window=settings.zscore_window
    )

    logger.info(
        "Iniciando bot | par=%s/%s | modo=%s | testnet=%s",
        settings.symbol_a,
        settings.symbol_b,
        "DRY_RUN (paper)" if settings.dry_run else "LIVE",
        settings.use_testnet,
    )

    await calibrate_pair(exchange, settings, market_state)

    reporter = Reporter()
    risk_manager = RiskManager(settings)
    execution_engine = ExecutionEngine(exchange, settings)
    holder = PositionHolder()

    # Recupera una posición abierta de una corrida anterior (crash, redeploy,
    # restart del contenedor) para no perder el stop-loss sobre exposición
    # real que sigue viva en el exchange. Si el archivo está corrupto,
    # load_position() lanza una excepción y el bot NO arranca a ciegas.
    holder.position = load_position()

    stop_event = asyncio.Event()

    def _request_shutdown(sig_name: str) -> None:
        if holder.position is not None:
            logger.critical(
                "Señal %s recibida con una posición ABIERTA (capital=%.2f USDT). "
                "El bot deja de monitorearla al apagarse: la posición sigue viva en el "
                "exchange. Queda persistida en disco y se retoma al reiniciar el proceso.",
                sig_name,
                holder.position.allocated_capital,
            )
        else:
            logger.info("Señal %s recibida, apagando sin posiciones abiertas.", sig_name)
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _request_shutdown, sig.name)

    control_api_runner = await run_control_api(settings, market_state, reporter, holder)

    tasks = [
        asyncio.create_task(run_market_data_feed(exchange, settings, market_state)),
        asyncio.create_task(recalibration_loop(exchange, settings, market_state)),
        asyncio.create_task(strategy_loop(settings, market_state, risk_manager, execution_engine, reporter, holder)),
        asyncio.create_task(reporting_loop(settings, market_state, reporter, holder)),
    ]

    try:
        await stop_event.wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if control_api_runner is not None:
            await control_api_runner.cleanup()
        await exchange.close()
        logger.info("Bot apagado de forma prolija.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBot detenido por el usuario.")
