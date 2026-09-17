"""
Persistencia de la posición abierta a disco.

Si el proceso se cae o se reinicia (deploy, crash, restart del contenedor)
con una posición abierta, sin esto el bot la "olvida": deja de vigilar el
stop-loss y el z-score de salida sobre una exposición que sigue viva en el
exchange con dinero real. Esto es la diferencia entre una molestia y una
posición huérfana que nadie está mirando.

La escritura es atómica (se escribe a un archivo temporal y se reemplaza)
para no dejar un JSON a medio escribir si el proceso muere justo en el
momento de guardar.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from state import Leg, PairPosition

logger = logging.getLogger("trading-bot.persistence")

DEFAULT_STATE_PATH = Path(os.getenv("STATE_FILE_PATH", "state/position.json"))


def save_position(position: PairPosition | None, path: Path = DEFAULT_STATE_PATH) -> None:
    """Guarda la posición abierta (o borra el archivo si no hay ninguna)."""
    path.parent.mkdir(parents=True, exist_ok=True)

    if position is None:
        if path.exists():
            path.unlink()
        return

    data = {
        "leg_a": vars(position.leg_a),
        "leg_b": vars(position.leg_b),
        "entry_zscore": position.entry_zscore,
        "allocated_capital": position.allocated_capital,
        "opened_at": position.opened_at,
    }
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(data, indent=2))
    tmp_path.replace(path)


def load_position(path: Path = DEFAULT_STATE_PATH) -> PairPosition | None:
    """Recupera la posición abierta de una corrida anterior, si existe.

    Ante un archivo corrupto se prefiere fallar ruidosamente (excepción) a
    asumir en silencio que no hay posición abierta: con dinero real, esa
    suposición equivocada es la que deja una exposición sin stop-loss.
    """
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text())
        leg_a = Leg(**data["leg_a"])
        leg_b = Leg(**data["leg_b"])
        position = PairPosition(
            leg_a=leg_a,
            leg_b=leg_b,
            entry_zscore=data["entry_zscore"],
            allocated_capital=data["allocated_capital"],
            opened_at=data["opened_at"],
        )
    except Exception:
        logger.exception(
            "No se pudo leer el archivo de posición persistida (%s). "
            "Revisalo manualmente antes de asumir que no hay exposición abierta "
            "en el exchange: NO se va a arrancar el bot con este archivo corrupto.",
            path,
        )
        raise

    logger.warning(
        "Se encontró una posición abierta de una corrida anterior, se retoma su "
        "monitoreo: %s %.8f %s @ %.2f | %s %.8f %s @ %.2f (z_entrada=%.2f, capital=%.2f USDT)",
        leg_a.side.upper(), leg_a.quantity, leg_a.symbol, leg_a.entry_price,
        leg_b.side.upper(), leg_b.quantity, leg_b.symbol, leg_b.entry_price,
        position.entry_zscore, position.allocated_capital,
    )
    return position
