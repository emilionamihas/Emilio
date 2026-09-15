"""
Filtro obligatorio de rentabilidad neta.

Ninguna señal de entrada llega a ejecución sin pasar por acá. La idea es
simple y deliberadamente conservadora: estimar la ganancia bruta esperada
por la reversión del spread hacia su media, restarle comisiones en las
CUATRO patas de un round-trip de pair trading (compra+venta en el símbolo A,
compra+venta en el símbolo B) y el slippage estimado en esas mismas cuatro
patas. Si lo que queda no es positivo, no hay trade.

Esto es una estimación, no una garantía: el spread puede no revertir del
todo, o puede seguir alejándose de la media (por eso existe el stop-loss en
risk_manager.py). El filtro solo evita entrar a operaciones cuyo edge
esperado ya es negativo ANTES de asumir ningún riesgo de mercado.
"""

from __future__ import annotations

from dataclasses import dataclass

from config import Settings


@dataclass
class ProfitabilityEstimate:
    notional_a: float
    notional_b: float
    expected_gross_pnl: float
    estimated_fees: float
    estimated_slippage: float
    expected_net_pnl: float

    @property
    def is_profitable(self) -> bool:
        return self.expected_net_pnl > 0


def estimate_round_trip_costs(
    notional_a: float, notional_b: float, settings: Settings
) -> tuple[float, float]:
    """Comisiones y slippage estimados para las 4 patas de un round-trip
    (entrada en A y B, salida en A y B). Se asume la comisión "taker" en
    todas las patas por ser el escenario más conservador (órdenes de
    mercado para garantizar la ejecución del par de forma simultánea)."""
    total_notional_per_leg = notional_a + notional_b  # una vez por entrada, una por salida
    fees = total_notional_per_leg * settings.taker_fee_rate * 2  # entrada + salida
    slippage = total_notional_per_leg * (settings.slippage_bps / 10_000) * 2
    return fees, slippage


def estimate_net_pnl(
    *,
    current_zscore: float,
    zscore_exit: float,
    spread_std: float,
    quantity_a: float,
    notional_a: float,
    notional_b: float,
    settings: Settings,
) -> ProfitabilityEstimate:
    """
    Ganancia bruta esperada: se asume que el spread revierte desde su
    z-score actual hasta zscore_exit (el umbral de salida configurado, no
    necesariamente cero). La magnitud de esa reversión, en las mismas
    unidades de precio que el spread (USDT), es:

        expected_spread_move = (|z_actual| - |z_exit|) * spread_std

    Como la posición se dimensiona en risk_manager de forma beta-neutral
    (quantity_b = hedge_ratio * quantity_a), el PnL de la posición ante un
    movimiento del spread es lineal en quantity_a:

        expected_gross_pnl = quantity_a * expected_spread_move
    """
    expected_spread_move = max(abs(current_zscore) - abs(zscore_exit), 0.0) * spread_std
    expected_gross_pnl = quantity_a * expected_spread_move

    fees, slippage = estimate_round_trip_costs(notional_a, notional_b, settings)
    expected_net_pnl = expected_gross_pnl - fees - slippage

    return ProfitabilityEstimate(
        notional_a=notional_a,
        notional_b=notional_b,
        expected_gross_pnl=expected_gross_pnl,
        estimated_fees=fees,
        estimated_slippage=slippage,
        expected_net_pnl=expected_net_pnl,
    )
