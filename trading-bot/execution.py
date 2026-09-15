"""
Ejecución de órdenes.

En DRY_RUN=true (default) no se manda nada al exchange: se simula el fill
al precio de mercado actual, aplicando el slippage estimado como costo
adicional, para que el reporte de PnL sea realista aunque no haya operado
en vivo.

En DRY_RUN=false se usa la misma instancia de ccxt.pro para mandar órdenes
de mercado reales (create_order), tanto en testnet como en producción según
USE_TESTNET.
"""

from __future__ import annotations

import logging

from config import Settings
from risk_manager import PositionSizing
from state import ClosedTrade, Leg, MarketState, PairPosition

logger = logging.getLogger("trading-bot.execution")


class ExecutionEngine:
    def __init__(self, exchange, settings: Settings):
        self.exchange = exchange
        self.settings = settings

    async def _fill_price(self, symbol: str, side: str, market_price: float) -> float:
        """Precio de fill simulado: aplica el slippage estimado en contra
        de la operación (peor precio del esperado)."""
        slippage_factor = self.settings.slippage_bps / 10_000
        if side == "buy":
            return market_price * (1 + slippage_factor)
        return market_price * (1 - slippage_factor)

    async def _place_order(self, symbol: str, side: str, quantity: float) -> None:
        if self.settings.dry_run:
            return
        order_side = "buy" if side == "buy" else "sell"
        logger.info("Enviando orden real: %s %s %.8f", order_side.upper(), symbol, quantity)
        await self.exchange.create_order(symbol, "market", order_side, quantity)

    async def open_pair_position(
        self,
        market_state: MarketState,
        sizing: PositionSizing,
        side_a: str,
        side_b: str,
        entry_zscore: float,
    ) -> PairPosition:
        fill_a = await self._fill_price(market_state.symbol_a, side_a, market_state.price_a)
        fill_b = await self._fill_price(market_state.symbol_b, side_b, market_state.price_b)

        await self._place_order(market_state.symbol_a, side_a, sizing.quantity_a)
        await self._place_order(market_state.symbol_b, side_b, sizing.quantity_b)

        leg_a = Leg(market_state.symbol_a, side_a, sizing.quantity_a, fill_a)
        leg_b = Leg(market_state.symbol_b, side_b, sizing.quantity_b, fill_b)

        mode = "PAPER" if self.settings.dry_run else "LIVE"
        logger.info(
            "[%s] Abriendo posición: %s %.6f %s @ %.2f | %s %.6f %s @ %.2f | z=%.2f | capital=%.2f USDT",
            mode,
            side_a.upper(),
            leg_a.quantity,
            leg_a.symbol,
            leg_a.entry_price,
            side_b.upper(),
            leg_b.quantity,
            leg_b.symbol,
            leg_b.entry_price,
            entry_zscore,
            sizing.allocated_capital,
        )

        return PairPosition(
            leg_a=leg_a,
            leg_b=leg_b,
            entry_zscore=entry_zscore,
            allocated_capital=sizing.allocated_capital,
        )

    async def close_pair_position(
        self,
        position: PairPosition,
        market_state: MarketState,
        exit_zscore: float,
        close_reason: str,
    ) -> ClosedTrade:
        close_side_a = "sell" if position.leg_a.side == "buy" else "buy"
        close_side_b = "sell" if position.leg_b.side == "buy" else "buy"

        exit_price_a = await self._fill_price(market_state.symbol_a, close_side_a, market_state.price_a)
        exit_price_b = await self._fill_price(market_state.symbol_b, close_side_b, market_state.price_b)

        await self._place_order(market_state.symbol_a, close_side_a, position.leg_a.quantity)
        await self._place_order(market_state.symbol_b, close_side_b, position.leg_b.quantity)

        gross_pnl = position.unrealized_pnl(exit_price_a, exit_price_b)

        entry_notional = (
            position.leg_a.entry_price * position.leg_a.quantity
            + position.leg_b.entry_price * position.leg_b.quantity
        )
        exit_notional = (
            exit_price_a * position.leg_a.quantity + exit_price_b * position.leg_b.quantity
        )
        fees_paid = (entry_notional + exit_notional) * self.settings.taker_fee_rate
        # El costo de slippage ya está incorporado en los fill prices simulados
        # (_fill_price); acá lo dejamos explícito para el reporte, calculado
        # como la diferencia entre el precio de mercado "limpio" y el fill.
        slippage_cost = (entry_notional + exit_notional) * (self.settings.slippage_bps / 10_000)

        net_pnl = gross_pnl - fees_paid

        mode = "PAPER" if self.settings.dry_run else "LIVE"
        logger.info(
            "[%s] Cerrando posición (%s): PnL bruto=%.2f, fees=%.2f, neto=%.2f USDT (z_salida=%.2f)",
            mode,
            close_reason,
            gross_pnl,
            fees_paid,
            net_pnl,
            exit_zscore,
        )

        import time

        return ClosedTrade(
            symbol_a=position.leg_a.symbol,
            symbol_b=position.leg_b.symbol,
            entry_zscore=position.entry_zscore,
            exit_zscore=exit_zscore,
            gross_pnl=gross_pnl,
            fees_paid=fees_paid,
            slippage_cost=slippage_cost,
            net_pnl=net_pnl,
            allocated_capital=position.allocated_capital,
            opened_at=position.opened_at,
            closed_at=time.time(),
            close_reason=close_reason,
        )
