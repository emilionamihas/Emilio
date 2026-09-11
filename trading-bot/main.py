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
import sys

from config import Settings, load_settings
from data_engine import build_exchange, calibrate_pair, recalibration_loop, run_market_data_feed
from execution import ExecutionEngine
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
    """Contenedor mutable de la posición abierta, compartido entre el loop
    de estrategia (que la escribe) y el loop de reporte (que solo la lee)."""

    def __init__(self) -> None:
        self.position: PairPosition | None = None


async def strategy_loop(
    settings: Settings,
    market_state: MarketState,
    risk_manager: RiskManager,
    execution_engine: ExecutionEngine,
    reporter: Reporter,
    holder: PositionHolder,
) -> None:
    available_capital = settings.total_capital_usdt

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
            continue

        result = generate_signal(market_state, settings, has_open_position=open_position is not None)

        if result.signal == Signal.EXIT and open_position is not None:
            trade = await execution_engine.close_pair_position(
                open_position, market_state, result.zscore, "mean_reversion"
            )
            reporter.record_trade(trade)
            reporter.print_trade_closed(trade)
            available_capital += open_position.allocated_capital + trade.net_pnl
            holder.position = None
            continue

        if result.signal in (Signal.ENTER_LONG_A_SHORT_B, Signal.ENTER_SHORT_A_LONG_B):
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

    try:
        await asyncio.gather(
            run_market_data_feed(exchange, settings, market_state),
            recalibration_loop(exchange, settings, market_state),
            strategy_loop(settings, market_state, risk_manager, execution_engine, reporter, holder),
            reporting_loop(settings, market_state, reporter, holder),
        )
    finally:
        await exchange.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBot detenido por el usuario.")
