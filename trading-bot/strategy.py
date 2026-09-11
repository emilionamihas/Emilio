"""
Lógica de señal de pair trading basada en z-score del spread cointegrado.

Reglas:
- z-score >= +ZSCORE_ENTRY  -> spread anormalmente alto -> vender A / comprar B
  (apuesta a que el spread baja de vuelta hacia la media)
- z-score <= -ZSCORE_ENTRY  -> spread anormalmente bajo -> comprar A / vender B
- |z-score| <= ZSCORE_EXIT con una posición abierta -> cerrar (reversión lograda)

El test de cointegración se corre aparte (data_engine.calibrate_pair) y su
resultado (market_state.cointegrated) es una precondición dura: si el par
no está cointegrado según el último test, NO se generan señales de entrada
nuevas, aunque el z-score cruce el umbral.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from config import Settings
from state import MarketState


class Signal(Enum):
    NONE = "none"
    ENTER_LONG_A_SHORT_B = "enter_long_a_short_b"
    ENTER_SHORT_A_LONG_B = "enter_short_a_long_b"
    EXIT = "exit"


@dataclass
class SignalResult:
    signal: Signal
    zscore: float
    reason: str


def generate_signal(
    market_state: MarketState, settings: Settings, has_open_position: bool
) -> SignalResult:
    z = market_state.current_zscore

    if z is None:
        return SignalResult(Signal.NONE, 0.0, "z-score aún no disponible (historial insuficiente)")

    if has_open_position:
        if abs(z) <= settings.zscore_exit:
            return SignalResult(Signal.EXIT, z, f"|z|={abs(z):.2f} <= umbral de salida {settings.zscore_exit}")
        return SignalResult(Signal.NONE, z, "posición abierta, esperando reversión")

    if not market_state.cointegrated:
        return SignalResult(
            Signal.NONE,
            z,
            "par no cointegrado según la última calibración: no se abren posiciones nuevas",
        )

    if z >= settings.zscore_entry:
        return SignalResult(
            Signal.ENTER_SHORT_A_LONG_B,
            z,
            f"z={z:.2f} >= +{settings.zscore_entry} (spread sobreextendido al alza)",
        )

    if z <= -settings.zscore_entry:
        return SignalResult(
            Signal.ENTER_LONG_A_SHORT_B,
            z,
            f"z={z:.2f} <= -{settings.zscore_entry} (spread sobreextendido a la baja)",
        )

    return SignalResult(Signal.NONE, z, f"z={z:.2f} dentro de rango normal")
