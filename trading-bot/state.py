"""
Estructuras de datos compartidas entre los módulos del bot:
- estado de mercado en vivo (últimos precios, historial de spread)
- posición abierta del par
- registro de trades cerrados (para el reporte de PnL)
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class MarketState:
    """Últimos precios conocidos de cada pata y el historial de spread/z-score."""

    symbol_a: str
    symbol_b: str
    zscore_window: int

    price_a: float | None = None
    price_b: float | None = None
    last_update_a: float = 0.0
    last_update_b: float = 0.0

    hedge_ratio: float | None = None  # beta de la regresión OLS: precio_a ~ beta * precio_b
    cointegration_pvalue: float | None = None
    cointegrated: bool = False

    spread_history: deque = field(default_factory=deque)
    current_zscore: float | None = None
    current_spread: float | None = None
    spread_mean: float | None = None
    spread_std: float | None = None

    def has_fresh_prices(self, max_age_seconds: float = 30.0) -> bool:
        now = time.time()
        return (
            self.price_a is not None
            and self.price_b is not None
            and (now - self.last_update_a) <= max_age_seconds
            and (now - self.last_update_b) <= max_age_seconds
        )

    def update_price(self, symbol: str, price: float) -> None:
        now = time.time()
        if symbol == self.symbol_a:
            self.price_a = price
            self.last_update_a = now
        elif symbol == self.symbol_b:
            self.price_b = price
            self.last_update_b = now
        else:
            raise ValueError(f"Símbolo desconocido: {symbol}")

    def push_spread_and_update_zscore(self) -> None:
        """Recalcula spread y z-score con el precio más reciente de ambas patas."""
        if self.hedge_ratio is None or self.price_a is None or self.price_b is None:
            return

        spread = self.price_a - self.hedge_ratio * self.price_b
        self.current_spread = spread

        if self.spread_history.maxlen != self.zscore_window:
            self.spread_history = deque(self.spread_history, maxlen=self.zscore_window)
        self.spread_history.append(spread)

        if len(self.spread_history) < max(10, self.zscore_window // 4):
            # Todavía no hay suficiente historia para un z-score confiable.
            self.current_zscore = None
            return

        import numpy as np

        arr = np.array(self.spread_history)
        mean = float(arr.mean())
        std = float(arr.std(ddof=1)) if len(arr) > 1 else 0.0
        self.spread_mean = mean
        self.spread_std = std

        if std == 0:
            self.current_zscore = 0.0
        else:
            self.current_zscore = (spread - mean) / std


@dataclass
class Leg:
    """Una pata individual (compra o venta) dentro de una posición de par."""

    symbol: str
    side: str  # "buy" | "sell"
    quantity: float
    entry_price: float


@dataclass
class PairPosition:
    """Posición dollar-neutral abierta sobre el par (dos patas simultáneas)."""

    leg_a: Leg
    leg_b: Leg
    entry_zscore: float
    allocated_capital: float
    opened_at: float = field(default_factory=time.time)

    def unrealized_pnl(self, price_a: float, price_b: float) -> float:
        pnl_a = (
            (price_a - self.leg_a.entry_price) * self.leg_a.quantity
            if self.leg_a.side == "buy"
            else (self.leg_a.entry_price - price_a) * self.leg_a.quantity
        )
        pnl_b = (
            (price_b - self.leg_b.entry_price) * self.leg_b.quantity
            if self.leg_b.side == "buy"
            else (self.leg_b.entry_price - price_b) * self.leg_b.quantity
        )
        return pnl_a + pnl_b


@dataclass
class ClosedTrade:
    symbol_a: str
    symbol_b: str
    entry_zscore: float
    exit_zscore: float
    gross_pnl: float
    fees_paid: float
    slippage_cost: float
    net_pnl: float
    allocated_capital: float
    opened_at: float
    closed_at: float
    close_reason: str  # "mean_reversion" | "stop_loss"

    @property
    def net_return_pct(self) -> float:
        if self.allocated_capital == 0:
            return 0.0
        return self.net_pnl / self.allocated_capital
