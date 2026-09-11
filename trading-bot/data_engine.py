"""
Motor de datos:
1. Calibración: descarga velas históricas por REST, corre el test de
   cointegración de Engle-Granger y calcula el hedge ratio (OLS).
2. Tiempo real: se suscribe por WebSocket (ccxt.pro) a ambos símbolos y
   actualiza el MarketState en cada tick.

ccxt >= 4.x incluye el soporte de WebSocket ("ccxt pro") dentro del mismo
paquete, expuesto como `ccxt.pro`. La misma instancia de exchange sirve
tanto para las llamadas REST (fetch_ohlcv, create_order) como para los
métodos watch_* de WebSocket.
"""

from __future__ import annotations

import asyncio
import logging

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.stattools import coint

from config import Settings
from state import MarketState

logger = logging.getLogger("trading-bot.data_engine")


def build_exchange(settings: Settings):
    """Crea la instancia de exchange (ccxt.pro) ya configurada."""
    import ccxt.pro as ccxtpro

    exchange = ccxtpro.binance(
        {
            "apiKey": settings.api_key,
            "secret": settings.api_secret,
            "enableRateLimit": True,
            "options": {"defaultType": "spot"},
        }
    )
    if settings.use_testnet:
        exchange.set_sandbox_mode(True)
    return exchange


async def calibrate_pair(exchange, settings: Settings, market_state: MarketState) -> None:
    """
    Descarga histórico OHLCV de ambos símbolos, calcula el hedge ratio por
    OLS y corre el test de cointegración de Engle-Granger. Actualiza
    market_state.hedge_ratio / cointegration_pvalue / cointegrated.
    """
    ohlcv_a = await exchange.fetch_ohlcv(
        settings.symbol_a, timeframe=settings.timeframe, limit=settings.lookback_candles
    )
    ohlcv_b = await exchange.fetch_ohlcv(
        settings.symbol_b, timeframe=settings.timeframe, limit=settings.lookback_candles
    )

    closes_a = pd.Series([c[4] for c in ohlcv_a])
    closes_b = pd.Series([c[4] for c in ohlcv_b])

    n = min(len(closes_a), len(closes_b))
    closes_a, closes_b = closes_a.iloc[-n:].reset_index(drop=True), closes_b.iloc[-n:].reset_index(drop=True)

    # Hedge ratio (beta) vía OLS: precio_a = alpha + beta * precio_b
    x = sm.add_constant(closes_b)
    model = sm.OLS(closes_a, x).fit()
    hedge_ratio = float(model.params.iloc[1])

    # Test de cointegración de Engle-Granger sobre las series de precio.
    _, pvalue, _ = coint(closes_a, closes_b)

    market_state.hedge_ratio = hedge_ratio
    market_state.cointegration_pvalue = float(pvalue)
    market_state.cointegrated = pvalue <= settings.min_cointegration_pvalue

    status = "OK" if market_state.cointegrated else "NO PASA EL UMBRAL"
    logger.info(
        "Calibración %s/%s -> hedge_ratio=%.6f, p-value=%.4f (%s, umbral=%.2f)",
        settings.symbol_a,
        settings.symbol_b,
        hedge_ratio,
        pvalue,
        status,
        settings.min_cointegration_pvalue,
    )
    if not market_state.cointegrated:
        logger.warning(
            "El par %s/%s NO pasó el test de cointegración (p=%.4f > %.2f). "
            "El bot seguirá monitoreando pero NO abrirá posiciones nuevas "
            "hasta la próxima recalibración en que el test pase.",
            settings.symbol_a,
            settings.symbol_b,
            pvalue,
            settings.min_cointegration_pvalue,
        )


async def recalibration_loop(exchange, settings: Settings, market_state: MarketState) -> None:
    """Vuelve a correr calibrate_pair() periódicamente: la relación de
    cointegración no es estática y se degrada con el tiempo."""
    while True:
        await asyncio.sleep(settings.recalibration_interval_seconds)
        try:
            await calibrate_pair(exchange, settings, market_state)
        except Exception:
            logger.exception("Falló la recalibración periódica, se reintenta en el próximo ciclo")


async def _watch_symbol(exchange, symbol: str, market_state: MarketState) -> None:
    """Loop infinito de WebSocket para un símbolo: actualiza el precio en
    cada tick y dispara el recálculo de spread/z-score."""
    while True:
        try:
            ticker = await exchange.watch_ticker(symbol)
            price = ticker.get("last") or ticker.get("close")
            if price is None:
                continue
            market_state.update_price(symbol, float(price))
            market_state.push_spread_and_update_zscore()
        except Exception:
            logger.exception("Error en watch_ticker(%s), reintentando en 2s", symbol)
            await asyncio.sleep(2)


async def run_market_data_feed(exchange, settings: Settings, market_state: MarketState) -> None:
    """Lanza los dos watchers de WebSocket en paralelo (uno por símbolo)."""
    await asyncio.gather(
        _watch_symbol(exchange, settings.symbol_a, market_state),
        _watch_symbol(exchange, settings.symbol_b, market_state),
    )
