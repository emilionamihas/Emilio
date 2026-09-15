"""Estructuras de estado: posición abierta, trades cerrados y PnL diario."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class PositionSide(Enum):
    LONG = "long"


@dataclass
class Position:
    side: PositionSide
    entry_price: float
    qty: float
    stop_price: float
    take_profit_price: float
    opened_at: datetime

    def unrealized_pnl(self, current_price: float) -> float:
        return (current_price - self.entry_price) * self.qty


@dataclass
class ClosedTrade:
    side: PositionSide
    entry_price: float
    exit_price: float
    qty: float
    opened_at: datetime
    closed_at: datetime
    pnl: float
    exit_reason: str


@dataclass
class DailyPnLTracker:
    """Trackea el PnL realizado del día en curso para el kill switch."""

    day: str
    start_equity: float
    realized_pnl: float = 0.0
    halted: bool = False

    @staticmethod
    def _today_key(now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        return now.strftime("%Y-%m-%d")

    def roll_if_new_day(self, current_equity: float, now: datetime | None = None) -> None:
        today = self._today_key(now)
        if today != self.day:
            self.day = today
            self.start_equity = current_equity
            self.realized_pnl = 0.0
            self.halted = False

    def register_pnl(self, pnl: float) -> None:
        self.realized_pnl += pnl

    def loss_pct(self) -> float:
        if self.start_equity <= 0:
            return 0.0
        return max(0.0, -self.realized_pnl) / self.start_equity


@dataclass
class BotState:
    position: Position | None = None
    trades: list[ClosedTrade] = field(default_factory=list)
    daily_pnl: DailyPnLTracker | None = None
