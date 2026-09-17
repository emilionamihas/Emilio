"""Obtención de datos OHLCV desde Binance vía ccxt (histórico y en vivo)."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import ccxt
import pandas as pd

from config import Settings

_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def make_exchange(settings: Settings) -> ccxt.Exchange:
    exchange = ccxt.binance(
        {
            "apiKey": settings.api_key or None,
            "secret": settings.api_secret or None,
            "enableRateLimit": True,
            "options": {"defaultType": "spot"},
        }
    )
    if settings.use_testnet:
        exchange.set_sandbox_mode(True)
    return exchange


def fetch_historical_ohlcv(
    exchange: ccxt.Exchange, symbol: str, timeframe: str, days: int
) -> pd.DataFrame:
    """Descarga OHLCV histórico paginando fetch_ohlcv hasta cubrir `days`."""
    since = exchange.parse8601(
        (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    )
    all_rows: list[list[float]] = []
    limit = 1000
    timeframe_ms = exchange.parse_timeframe(timeframe) * 1000
    now_ms = exchange.milliseconds()
    while since < now_ms:
        batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since, limit=limit)
        if not batch:
            break
        all_rows.extend(batch)
        since = batch[-1][0] + timeframe_ms
        if len(batch) < limit:
            break
        time.sleep(exchange.rateLimit / 1000)

    if not all_rows:
        raise RuntimeError(
            f"No se pudo descargar histórico para {symbol} {timeframe}: respuesta vacía."
        )

    df = pd.DataFrame(all_rows, columns=_COLUMNS).drop_duplicates(subset="timestamp")
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def fetch_latest_ohlcv(
    exchange: ccxt.Exchange, symbol: str, timeframe: str, limit: int = 200
) -> pd.DataFrame:
    """Descarga las últimas `limit` velas cerradas (para el loop en vivo)."""
    batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(batch, columns=_COLUMNS)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df
