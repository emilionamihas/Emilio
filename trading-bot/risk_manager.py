"""
Gestión de riesgo:
- Sizing: nunca arriesgar más de MAX_CAPITAL_PER_TRADE_PCT del capital total
  en una sola operación de par, repartido de forma beta-neutral (no 50/50 en
  dólares) según el hedge_ratio calculado en la calibración: por cada unidad
  de la pata A se toman hedge_ratio unidades de la pata B. Así el PnL de la
  posición sigue linealmente al spread (precio_a - hedge_ratio*precio_b) que
  usan strategy.py y profitability_filter.py, en vez de quedar descalzado.
- Stop-loss: corta la posición si la pérdida no realizada supera
  STOP_LOSS_PCT del capital asignado a esa operación, sin importar qué diga
  el z-score en ese momento.
"""

from __future__ import annotations

from dataclasses import dataclass

from config import Settings
from state import MarketState, PairPosition


@dataclass
class PositionSizing:
    allocated_capital: float
    notional_a: float
    notional_b: float
    quantity_a: float
    quantity_b: float


class RiskManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def size_position(self, market_state: MarketState, available_capital: float) -> PositionSizing:
        """Calcula quantity_a de forma que quantity_b = hedge_ratio * quantity_a
        (posición beta-neutral respecto al spread), consumiendo como máximo
        el capital tope por trade:

            allocated_capital = quantity_a * price_a + quantity_b * price_b
                               = quantity_a * (price_a + hedge_ratio * price_b)
        """
        allocated_capital = min(
            available_capital, self.settings.total_capital_usdt * self.settings.max_capital_per_trade_pct
        )

        hedge_ratio = market_state.hedge_ratio
        if not hedge_ratio or hedge_ratio <= 0 or not market_state.price_a or not market_state.price_b:
            return PositionSizing(0.0, 0.0, 0.0, 0.0, 0.0)

        denom = market_state.price_a + hedge_ratio * market_state.price_b
        quantity_a = allocated_capital / denom
        quantity_b = hedge_ratio * quantity_a

        notional_a = quantity_a * market_state.price_a
        notional_b = quantity_b * market_state.price_b

        return PositionSizing(
            allocated_capital=allocated_capital,
            notional_a=notional_a,
            notional_b=notional_b,
            quantity_a=quantity_a,
            quantity_b=quantity_b,
        )

    def stop_loss_triggered(self, position: PairPosition, price_a: float, price_b: float) -> bool:
        """True si la pérdida no realizada de la posición supera el
        STOP_LOSS_PCT configurado sobre el capital asignado a ese trade."""
        pnl = position.unrealized_pnl(price_a, price_b)
        if position.allocated_capital <= 0:
            return False
        loss_pct = -pnl / position.allocated_capital
        return loss_pct >= self.settings.stop_loss_pct
