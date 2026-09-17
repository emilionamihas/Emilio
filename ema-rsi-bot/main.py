"""
Loop de ejecución en vivo.

Por defecto corre en DRY_RUN=true + USE_TESTNET=true: paper trading con
dinero ficticio (arranca con TOTAL_CAPITAL_USDT) contra precios reales de
Binance en tiempo real. No manda órdenes reales hasta que se cambie
DRY_RUN=false explícitamente en el .env, y aun así primero pasa por el
testnet de Binance si USE_TESTNET=true.

Para dejarlo corriendo: `python main.py`. Se detiene con Ctrl+C.
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from config import load_settings
from data import fetch_latest_ohlcv, make_exchange
from execution import OrderExecutor
from risk_manager import calculate_position_size, calculate_stop_take_profit, is_trading_halted
from state import BotState, ClosedTrade, DailyPnLTracker, Position, PositionSide
from strategy import Signal, compute_indicators, evaluate_signal

WARMUP_BARS = 300


def _log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] {msg}", flush=True)


def run() -> None:
    settings = load_settings()
    exchange = make_exchange(settings)
    executor = OrderExecutor(exchange, settings)

    mode = "PAPER TRADING (dry-run)" if settings.dry_run else "LIVE (órdenes reales)"
    net = "testnet" if settings.use_testnet else "producción"
    _log(f"Arrancando bot EMA/RSI/MACD — {settings.symbol} {settings.timeframe} — {mode} — {net}")
    _log(f"Capital inicial simulado: {settings.total_capital_usdt:,.2f} USDT "
         f"(riesgo por trade: {settings.risk_per_trade_pct*100:.1f}%, "
         f"tope por posición: {settings.max_position_pct*100:.1f}%, "
         f"kill switch diario: {settings.daily_loss_limit_pct*100:.1f}%)")

    cash = settings.total_capital_usdt
    state = BotState()

    try:
        while True:
            try:
                df = fetch_latest_ohlcv(exchange, settings.symbol, settings.timeframe, limit=WARMUP_BARS)
                df = df.iloc[:-1].reset_index(drop=True)  # descarta la vela en curso (incompleta)
                if len(df) < max(settings.ema_slow, settings.macd_slow, settings.atr_period) + 5:
                    _log("Historial insuficiente para calcular indicadores todavía, esperando...")
                    time.sleep(settings.poll_interval_seconds)
                    continue

                df = compute_indicators(df, settings)
                i = len(df) - 1
                row = df.iloc[i]
                ts = row["timestamp"].to_pydatetime()

                current_equity = cash if state.position is None else cash + state.position.qty * row["close"]
                if state.daily_pnl is None:
                    state.daily_pnl = DailyPnLTracker(day=ts.strftime("%Y-%m-%d"), start_equity=current_equity)
                else:
                    state.daily_pnl.roll_if_new_day(current_equity, ts)

                if state.position is not None:
                    exit_reason, exit_price = None, None
                    if row["low"] <= state.position.stop_price:
                        exit_reason, exit_price = "stop_loss", state.position.stop_price
                    elif row["high"] >= state.position.take_profit_price:
                        exit_reason, exit_price = "take_profit", state.position.take_profit_price
                    else:
                        sig = evaluate_signal(df, i, settings, has_open_position=True)
                        if sig.signal == Signal.LONG_EXIT:
                            exit_reason, exit_price = "signal_exit", row["close"]

                    if exit_reason is not None:
                        fill = executor.sell(state.position.qty, exit_price)
                        cash += fill.qty * fill.price - fill.fee
                        pnl = (fill.price - state.position.entry_price) * fill.qty - fill.fee
                        state.trades.append(
                            ClosedTrade(
                                side=PositionSide.LONG,
                                entry_price=state.position.entry_price,
                                exit_price=fill.price,
                                qty=fill.qty,
                                opened_at=state.position.opened_at,
                                closed_at=ts,
                                pnl=pnl,
                                exit_reason=exit_reason,
                            )
                        )
                        state.daily_pnl.register_pnl(pnl)
                        _log(f"CIERRE ({exit_reason}) qty={fill.qty:.6f} @ {fill.price:.2f} "
                             f"PnL={pnl:+.2f} USDT — cash={cash:,.2f}")
                        state.position = None

                if state.position is None:
                    if is_trading_halted(state.daily_pnl, settings):
                        _log(f"KILL SWITCH activo: pérdida diaria {state.daily_pnl.loss_pct()*100:.2f}% "
                             f">= límite {settings.daily_loss_limit_pct*100:.1f}%. No se abren posiciones hoy.")
                    else:
                        sig = evaluate_signal(df, i, settings, has_open_position=False)
                        if sig.signal == Signal.LONG_ENTRY and row["atr"] > 0:
                            st = calculate_stop_take_profit(row["close"], row["atr"], settings)
                            qty = calculate_position_size(cash, row["close"], st.stop_price, settings)
                            if qty > 0:
                                fill = executor.buy(qty, row["close"])
                                cost = fill.qty * fill.price + fill.fee
                                if cost <= cash:
                                    cash -= cost
                                    state.position = Position(
                                        side=PositionSide.LONG,
                                        entry_price=fill.price,
                                        qty=fill.qty,
                                        stop_price=st.stop_price,
                                        take_profit_price=st.take_profit_price,
                                        opened_at=ts,
                                    )
                                    _log(f"ENTRADA qty={fill.qty:.6f} @ {fill.price:.2f} "
                                         f"SL={st.stop_price:.2f} TP={st.take_profit_price:.2f} — "
                                         f"cash={cash:,.2f} — {sig.reason}")
                        else:
                            _log(f"Sin señal — precio={row['close']:.2f} RSI={row['rsi']:.1f} — {sig.reason}")

                equity = cash if state.position is None else cash + state.position.qty * row["close"]
                _log(f"Equity actual: {equity:,.2f} USDT — trades cerrados: {len(state.trades)}")

            except Exception as exc:  # noqa: BLE001 — el loop en vivo no debe morir por un error puntual de red/API
                _log(f"ERROR en el ciclo: {exc!r} — se reintenta en el próximo poll.")

            time.sleep(settings.poll_interval_seconds)

    except KeyboardInterrupt:
        final_equity = cash if state.position is None else cash + state.position.qty * (
            state.position.entry_price
        )
        _log("Detenido por el usuario (Ctrl+C).")
        _log(f"Trades cerrados: {len(state.trades)} — cash final: {cash:,.2f} USDT")
        sys.exit(0)


if __name__ == "__main__":
    run()
