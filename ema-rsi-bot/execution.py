"""
Ejecución de órdenes.

En DRY_RUN=true (default) las órdenes se simulan: se aplica slippage
estimado y la comisión taker configurada, sin tocar la cuenta real. En
DRY_RUN=false se envían órdenes de mercado reales vía ccxt (contra
testnet si USE_TESTNET=true, o producción si además se desactiva testnet
explícitamente).
"""

from __future__ import annotations

from dataclasses import dataclass

import ccxt

from config import Settings


@dataclass
class Fill:
    price: float
    qty: float
    fee: float


class OrderExecutor:
    def __init__(self, exchange: ccxt.Exchange, settings: Settings):
        self.exchange = exchange
        self.settings = settings

    def _simulated_fill(self, side: str, qty: float, reference_price: float) -> Fill:
        slippage = reference_price * (self.settings.slippage_bps / 10_000)
        fill_price = reference_price + slippage if side == "buy" else reference_price - slippage
        fee = fill_price * qty * self.settings.taker_fee_rate
        return Fill(price=fill_price, qty=qty, fee=fee)

    def buy(self, qty: float, reference_price: float) -> Fill:
        if self.settings.dry_run:
            return self._simulated_fill("buy", qty, reference_price)
        order = self.exchange.create_market_buy_order(self.settings.symbol, qty)
        return self._fill_from_order(order, reference_price, qty)

    def sell(self, qty: float, reference_price: float) -> Fill:
        if self.settings.dry_run:
            return self._simulated_fill("sell", qty, reference_price)
        order = self.exchange.create_market_sell_order(self.settings.symbol, qty)
        return self._fill_from_order(order, reference_price, qty)

    @staticmethod
    def _fill_from_order(order: dict, reference_price: float, qty: float) -> Fill:
        price = order.get("average") or order.get("price") or reference_price
        filled_qty = order.get("filled") or qty
        fee_info = order.get("fee") or {}
        fee = fee_info.get("cost", 0.0) or 0.0
        return Fill(price=price, qty=filled_qty, fee=fee)
