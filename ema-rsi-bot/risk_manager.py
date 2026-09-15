"""
Gestión de riesgo: sizing por posición, stop-loss/take-profit dinámicos y
kill switch de pérdida diaria.

Sizing: el tamaño de cada posición se calcula por riesgo (el monto que se
puede perder si se toca el stop no supera RISK_PER_TRADE_PCT del capital,
1-2% por defecto) y además queda topeado en notional por MAX_POSITION_PCT
del capital, como límite duro adicional pedido explícitamente por el
proyecto. El menor de los dos determina el tamaño final: en spot, sin
apalancamiento, ese tope de notional suele ser la restricción activa
cuando el stop (ATR) es ancho.
"""

from __future__ import annotations

from dataclasses import dataclass

from config import Settings
from state import DailyPnLTracker


@dataclass
class StopTakeProfit:
    stop_price: float
    take_profit_price: float
    stop_distance: float


def calculate_stop_take_profit(
    entry_price: float, atr: float, settings: Settings
) -> StopTakeProfit:
    stop_distance = atr * settings.atr_sl_mult
    stop_price = entry_price - stop_distance
    take_profit_price = entry_price + stop_distance * settings.reward_risk_ratio
    return StopTakeProfit(stop_price, take_profit_price, stop_distance)


def calculate_position_size(
    equity: float, entry_price: float, stop_price: float, settings: Settings
) -> float:
    stop_distance = entry_price - stop_price
    if stop_distance <= 0 or equity <= 0:
        return 0.0

    risk_amount = equity * settings.risk_per_trade_pct
    qty_by_risk = risk_amount / stop_distance

    max_notional = equity * settings.max_position_pct
    qty_by_cap = max_notional / entry_price

    return max(0.0, min(qty_by_risk, qty_by_cap))


def is_trading_halted(daily_tracker: DailyPnLTracker, settings: Settings) -> bool:
    """Kill switch: si la pérdida realizada del día supera el límite, no se
    abren posiciones nuevas hasta el próximo día (UTC)."""
    if daily_tracker.loss_pct() >= settings.daily_loss_limit_pct:
        daily_tracker.halted = True
    return daily_tracker.halted
