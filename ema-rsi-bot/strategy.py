"""
Indicadores técnicos y generación de señales.

Estrategia: cruce de medias móviles EMA(rápida/lenta) como señal de
tendencia, confirmado con un filtro de RSI (evita comprar en sobrecompra
extrema o sin momentum) y, opcionalmente, un filtro de MACD (la línea MACD
debe estar por encima de su señal para confirmar impulso alcista).

Solo largo (spot, sin apalancamiento): se entra en cruce alcista de EMA
confirmado, se sale en cruce bajista de EMA o cuando el risk_manager
dispara el stop-loss / take-profit (eso se resuelve fuera de esta función,
bar a bar, porque depende del precio intrabar).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
import pandas as pd

from config import Settings


class Signal(Enum):
    NONE = "none"
    LONG_ENTRY = "long_entry"
    LONG_EXIT = "long_exit"


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def _macd(series: pd.Series, fast: int, slow: int, signal: int) -> tuple[pd.Series, pd.Series]:
    macd_line = _ema(series, fast) - _ema(series, slow)
    signal_line = _ema(macd_line, signal)
    return macd_line, signal_line


def _atr(df: pd.DataFrame, period: int) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def compute_indicators(df: pd.DataFrame, settings: Settings) -> pd.DataFrame:
    df = df.copy()
    df["ema_fast"] = _ema(df["close"], settings.ema_fast)
    df["ema_slow"] = _ema(df["close"], settings.ema_slow)
    df["rsi"] = _rsi(df["close"], settings.rsi_period)
    df["macd_line"], df["macd_signal"] = _macd(
        df["close"], settings.macd_fast, settings.macd_slow, settings.macd_signal
    )
    df["atr"] = _atr(df, settings.atr_period)
    return df


@dataclass
class SignalResult:
    signal: Signal
    reason: str


def evaluate_signal(
    df: pd.DataFrame, i: int, settings: Settings, has_open_position: bool
) -> SignalResult:
    """Evalúa la señal en la barra `i` (requiere `i >= 1` e indicadores ya calculados)."""
    if i < 1:
        return SignalResult(Signal.NONE, "barra insuficiente")

    row, prev = df.iloc[i], df.iloc[i - 1]
    if pd.isna(row["ema_slow"]) or pd.isna(row["atr"]) or pd.isna(prev["ema_slow"]):
        return SignalResult(Signal.NONE, "indicadores aún no disponibles (warm-up)")

    ema_cross_up = prev["ema_fast"] <= prev["ema_slow"] and row["ema_fast"] > row["ema_slow"]
    ema_cross_down = prev["ema_fast"] >= prev["ema_slow"] and row["ema_fast"] < row["ema_slow"]

    if has_open_position:
        if ema_cross_down:
            return SignalResult(Signal.LONG_EXIT, "cruce bajista EMA fast/slow")
        return SignalResult(Signal.NONE, "posición abierta, sin señal de salida")

    if not ema_cross_up:
        return SignalResult(Signal.NONE, "sin cruce alcista de EMA")

    if not (settings.rsi_long_min <= row["rsi"] <= settings.rsi_long_max):
        return SignalResult(
            Signal.NONE,
            f"RSI={row['rsi']:.1f} fuera de [{settings.rsi_long_min}, {settings.rsi_long_max}]",
        )

    if settings.use_macd_filter and row["macd_line"] <= row["macd_signal"]:
        return SignalResult(Signal.NONE, "MACD no confirma impulso alcista")

    return SignalResult(Signal.LONG_ENTRY, "cruce alcista EMA + RSI + MACD confirmados")
