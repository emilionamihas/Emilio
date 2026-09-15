"""
Motor de backtesting bar-a-bar sobre datos históricos reales de Binance.

Simplificaciones documentadas (afectan el resultado, hay que tenerlas en
cuenta antes de confiar en los números):
- Las entradas y salidas por señal se ejecutan al precio de cierre de la
  misma vela en que se confirma la señal (+ slippage configurado). Es una
  aproximación estándar para timeframes >=1h, pero es optimista respecto
  a una ejecución real intra-vela.
- El stop-loss y el take-profit sí se evalúan de forma intrabar (contra el
  low/high de cada vela), asumiendo que si ambos se tocan en la misma vela
  se ejecuta primero el stop-loss (supuesto conservador).
- Sin apalancamiento, una sola posición larga a la vez (long-only spot).
- No modela profundidad de order book ni impacto de mercado más allá del
  slippage fijo en puntos básicos.

Uso: python backtest.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from config import Settings, load_settings
from data import fetch_historical_ohlcv, make_exchange
from execution import OrderExecutor
from risk_manager import calculate_position_size, calculate_stop_take_profit, is_trading_halted
from state import ClosedTrade, DailyPnLTracker, Position, PositionSide
from strategy import Signal, compute_indicators, evaluate_signal


@dataclass
class BacktestResult:
    equity_curve: pd.DataFrame
    trades: list[ClosedTrade]
    initial_capital: float
    final_equity: float
    bars_per_year: float


def _bars_per_year(timeframe: str) -> float:
    unit = timeframe[-1]
    value = int(timeframe[:-1])
    seconds = {"m": 60, "h": 3600, "d": 86400}[unit] * value
    return (365 * 86400) / seconds


def run_backtest(df: pd.DataFrame, settings: Settings) -> BacktestResult:
    df = compute_indicators(df, settings)
    executor = OrderExecutor(exchange=None, settings=settings)  # type: ignore[arg-type]

    cash = settings.total_capital_usdt
    position: Position | None = None
    trades: list[ClosedTrade] = []
    equity_points: list[tuple[datetime, float]] = []
    daily_tracker: DailyPnLTracker | None = None

    for i in range(len(df)):
        row = df.iloc[i]
        ts: datetime = row["timestamp"].to_pydatetime()

        current_equity = cash if position is None else cash + position.qty * row["close"]
        if daily_tracker is None:
            daily_tracker = DailyPnLTracker(day=ts.strftime("%Y-%m-%d"), start_equity=current_equity)
        else:
            daily_tracker.roll_if_new_day(current_equity, ts)

        if position is not None:
            exit_reason = None
            exit_price = None
            if row["low"] <= position.stop_price:
                exit_reason, exit_price = "stop_loss", position.stop_price
            elif row["high"] >= position.take_profit_price:
                exit_reason, exit_price = "take_profit", position.take_profit_price
            else:
                sig = evaluate_signal(df, i, settings, has_open_position=True)
                if sig.signal == Signal.LONG_EXIT:
                    exit_reason, exit_price = "signal_exit", row["close"]

            if exit_reason is not None:
                fill = executor.sell(position.qty, exit_price)
                cash += fill.qty * fill.price - fill.fee
                pnl = (fill.price - position.entry_price) * fill.qty - fill.fee
                trades.append(
                    ClosedTrade(
                        side=PositionSide.LONG,
                        entry_price=position.entry_price,
                        exit_price=fill.price,
                        qty=fill.qty,
                        opened_at=position.opened_at,
                        closed_at=ts,
                        pnl=pnl,
                        exit_reason=exit_reason,
                    )
                )
                daily_tracker.register_pnl(pnl)
                position = None

        if position is None and not is_trading_halted(daily_tracker, settings):
            sig = evaluate_signal(df, i, settings, has_open_position=False)
            if sig.signal == Signal.LONG_ENTRY and not pd.isna(row["atr"]) and row["atr"] > 0:
                st = calculate_stop_take_profit(row["close"], row["atr"], settings)
                qty = calculate_position_size(cash, row["close"], st.stop_price, settings)
                if qty > 0:
                    fill = executor.buy(qty, row["close"])
                    cost = fill.qty * fill.price + fill.fee
                    if cost <= cash:
                        cash -= cost
                        position = Position(
                            side=PositionSide.LONG,
                            entry_price=fill.price,
                            qty=fill.qty,
                            stop_price=st.stop_price,
                            take_profit_price=st.take_profit_price,
                            opened_at=ts,
                        )

        mark_equity = cash if position is None else cash + position.qty * row["close"]
        equity_points.append((ts, mark_equity))

    if position is not None:
        last_row = df.iloc[-1]
        fill = executor.sell(position.qty, last_row["close"])
        cash += fill.qty * fill.price - fill.fee
        pnl = (fill.price - position.entry_price) * fill.qty - fill.fee
        trades.append(
            ClosedTrade(
                side=PositionSide.LONG,
                entry_price=position.entry_price,
                exit_price=fill.price,
                qty=fill.qty,
                opened_at=position.opened_at,
                closed_at=last_row["timestamp"].to_pydatetime(),
                pnl=pnl,
                exit_reason="backtest_end",
            )
        )
        equity_points[-1] = (equity_points[-1][0], cash)

    equity_curve = pd.DataFrame(equity_points, columns=["timestamp", "equity"])
    return BacktestResult(
        equity_curve=equity_curve,
        trades=trades,
        initial_capital=settings.total_capital_usdt,
        final_equity=equity_curve["equity"].iloc[-1] if len(equity_curve) else settings.total_capital_usdt,
        bars_per_year=_bars_per_year(settings.timeframe),
    )


def compute_metrics(result: BacktestResult) -> dict:
    eq = result.equity_curve["equity"]
    initial, final = result.initial_capital, result.final_equity
    total_return_pct = (final / initial - 1) * 100

    running_max = eq.cummax()
    drawdown = (eq - running_max) / running_max
    max_drawdown_pct = drawdown.min() * 100 if len(drawdown) else 0.0

    days = (
        (result.equity_curve["timestamp"].iloc[-1] - result.equity_curve["timestamp"].iloc[0]).days
        if len(result.equity_curve) > 1
        else 0
    )
    cagr_pct = ((final / initial) ** (365 / days) - 1) * 100 if days > 0 and final > 0 else 0.0

    returns = eq.pct_change().dropna()
    if len(returns) > 1 and returns.std() > 0:
        sharpe = (returns.mean() / returns.std()) * np.sqrt(result.bars_per_year)
    else:
        sharpe = 0.0

    trades = result.trades
    num_trades = len(trades)
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    win_rate_pct = (len(wins) / num_trades * 100) if num_trades else 0.0
    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")
    avg_trade_pnl = (sum(t.pnl for t in trades) / num_trades) if num_trades else 0.0

    return {
        "initial_capital": initial,
        "final_equity": final,
        "total_return_pct": total_return_pct,
        "cagr_pct": cagr_pct,
        "max_drawdown_pct": max_drawdown_pct,
        "sharpe_ratio": sharpe,
        "num_trades": num_trades,
        "win_rate_pct": win_rate_pct,
        "profit_factor": profit_factor,
        "avg_trade_pnl": avg_trade_pnl,
        "days": days,
    }


def print_report(settings: Settings, metrics: dict) -> None:
    print("\n" + "=" * 60)
    print(f"  BACKTEST — {settings.symbol} {settings.timeframe}  "
          f"({metrics['days']} días)")
    print("=" * 60)
    print(f"  Capital inicial:        {metrics['initial_capital']:,.2f} USDT")
    print(f"  Capital final:          {metrics['final_equity']:,.2f} USDT")
    print(f"  Retorno total:          {metrics['total_return_pct']:+.2f} %")
    print(f"  CAGR:                   {metrics['cagr_pct']:+.2f} %")
    print(f"  Max drawdown:           {metrics['max_drawdown_pct']:.2f} %")
    print(f"  Sharpe ratio (anual.):  {metrics['sharpe_ratio']:.2f}")
    print("-" * 60)
    print(f"  N° de operaciones:      {metrics['num_trades']}")
    print(f"  Win rate:               {metrics['win_rate_pct']:.1f} %")
    print(f"  Profit factor:          {metrics['profit_factor']:.2f}")
    print(f"  PnL promedio/trade:     {metrics['avg_trade_pnl']:+.2f} USDT")
    print("=" * 60 + "\n")


def save_outputs(result: BacktestResult, out_prefix: str = "backtest") -> None:
    trades_df = pd.DataFrame(
        [
            {
                "opened_at": t.opened_at,
                "closed_at": t.closed_at,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "qty": t.qty,
                "pnl": t.pnl,
                "exit_reason": t.exit_reason,
            }
            for t in result.trades
        ]
    )
    trades_df.to_csv(f"{out_prefix}_trades.csv", index=False)
    result.equity_curve.to_csv(f"{out_prefix}_equity_curve.csv", index=False)

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(11, 5))
        ax.plot(result.equity_curve["timestamp"], result.equity_curve["equity"], color="#1f77b4")
        ax.set_title("Equity curve — backtest EMA/RSI/MACD")
        ax.set_xlabel("Fecha")
        ax.set_ylabel("Equity (USDT)")
        ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(f"{out_prefix}_equity_curve.png", dpi=140)
        plt.close(fig)
    except ImportError:
        print("matplotlib no instalado: se omite el gráfico de equity curve.")


def main() -> None:
    settings = load_settings()
    exchange = make_exchange(settings)

    print(f"Descargando histórico de {settings.symbol} ({settings.timeframe}, "
          f"últimos {settings.backtest_days} días)...")
    df = fetch_historical_ohlcv(exchange, settings.symbol, settings.timeframe, settings.backtest_days)
    print(f"{len(df)} velas descargadas "
          f"({df['timestamp'].iloc[0]} → {df['timestamp'].iloc[-1]}).")

    result = run_backtest(df, settings)
    metrics = compute_metrics(result)
    print_report(settings, metrics)
    save_outputs(result)
    print("Resultados guardados: backtest_trades.csv, backtest_equity_curve.csv/.png")

    if metrics["num_trades"] == 0:
        print("\nADVERTENCIA: cero operaciones en todo el período. Con estos parámetros "
              "la estrategia casi no encuentra señales válidas; no es evidencia de "
              "rentabilidad ni de lo contrario, es falta de datos para concluir.", file=sys.stderr)


if __name__ == "__main__":
    main()
