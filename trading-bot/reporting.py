"""
Reporte de ganancias y pérdidas en tiempo real, impreso en consola.
"""

from __future__ import annotations

import logging
import time

from state import ClosedTrade, MarketState, PairPosition

logger = logging.getLogger("trading-bot.reporting")


class Reporter:
    def __init__(self):
        self.closed_trades: list[ClosedTrade] = []
        self.started_at = time.time()

    def record_trade(self, trade: ClosedTrade) -> None:
        self.closed_trades.append(trade)

    @property
    def total_net_pnl(self) -> float:
        return sum(t.net_pnl for t in self.closed_trades)

    @property
    def total_fees_paid(self) -> float:
        return sum(t.fees_paid for t in self.closed_trades)

    @property
    def win_rate(self) -> float:
        if not self.closed_trades:
            return 0.0
        wins = sum(1 for t in self.closed_trades if t.net_pnl > 0)
        return wins / len(self.closed_trades)

    def print_snapshot(
        self,
        market_state: MarketState,
        open_position: PairPosition | None,
        mode_label: str,
    ) -> None:
        uptime = time.time() - self.started_at
        lines = [
            "=" * 72,
            f" BOT DE ARBITRAJE ESTADÍSTICO — {mode_label} | uptime {uptime/60:.1f} min",
            "-" * 72,
            f" Par: {market_state.symbol_a} / {market_state.symbol_b}"
            f"   hedge_ratio={market_state.hedge_ratio if market_state.hedge_ratio is not None else float('nan'):.4f}"
            f"   cointegrado={'SÍ' if market_state.cointegrated else 'NO'}"
            f" (p={market_state.cointegration_pvalue if market_state.cointegration_pvalue is not None else float('nan'):.4f})",
            f" Precios: {market_state.symbol_a}={market_state.price_a}   "
            f"{market_state.symbol_b}={market_state.price_b}",
            (
                f" Z-Score actual: {market_state.current_zscore:.3f}"
                if market_state.current_zscore is not None
                else " Z-Score actual: n/d"
            ),
        ]

        if open_position is not None and market_state.price_a and market_state.price_b:
            unrealized = open_position.unrealized_pnl(market_state.price_a, market_state.price_b)
            lines.append(
                f" Posición ABIERTA | capital={open_position.allocated_capital:.2f} USDT | "
                f"z_entrada={open_position.entry_zscore:.2f} | PnL no realizado={unrealized:+.2f} USDT"
            )
        else:
            lines.append(" Posición: sin exposición abierta")

        lines.append("-" * 72)
        lines.append(
            f" Trades cerrados: {len(self.closed_trades)} | Win rate: {self.win_rate*100:.1f}% | "
            f"Fees totales pagados: {self.total_fees_paid:.2f} USDT"
        )
        lines.append(f" PnL NETO ACUMULADO: {self.total_net_pnl:+.2f} USDT")
        lines.append("=" * 72)

        print("\n".join(lines))

    def print_trade_closed(self, trade: ClosedTrade) -> None:
        print(
            f"[TRADE CERRADO] {trade.symbol_a}/{trade.symbol_b} | motivo={trade.close_reason} | "
            f"PnL bruto={trade.gross_pnl:+.2f} | fees={trade.fees_paid:.2f} | "
            f"PnL NETO={trade.net_pnl:+.2f} USDT ({trade.net_return_pct*100:+.2f}%)"
        )

    def print_trade_rejected(self, reason: str) -> None:
        print(f"[SEÑAL RECHAZADA POR FILTRO DE RENTABILIDAD] {reason}")
