"""
Carga de configuración desde variables de entorno (.env).

Todo parámetro operativo (símbolos, ventanas, umbrales de riesgo, costos)
vive acá para que el resto del código nunca tenga números mágicos sueltos.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "y", "on")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return float(raw) if raw not in (None, "") else default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    # Credenciales
    api_key: str
    api_secret: str

    # Modo de operación
    dry_run: bool
    use_testnet: bool

    # Par estadístico
    symbol_a: str
    symbol_b: str

    # Calibración de cointegración
    timeframe: str
    lookback_candles: int
    min_cointegration_pvalue: float
    recalibration_interval_seconds: int

    # Z-Score en tiempo real
    zscore_window: int
    zscore_entry: float
    zscore_exit: float

    # Costos de ejecución
    taker_fee_rate: float
    maker_fee_rate: float
    slippage_bps: float

    # Riesgo
    stop_loss_pct: float
    max_capital_per_trade_pct: float
    total_capital_usdt: float

    # Reporte
    report_interval_seconds: int

    # API de control (ver control_api.py / DEPLOY.md)
    control_api_enabled: bool
    control_api_host: str
    control_api_port: int
    control_api_token: str

    def validate(self) -> None:
        if not self.dry_run and (not self.api_key or not self.api_secret):
            raise ValueError(
                "DRY_RUN=false requiere BINANCE_API_KEY y BINANCE_API_SECRET "
                "configuradas en .env"
            )
        if self.zscore_exit >= self.zscore_entry:
            raise ValueError("ZSCORE_EXIT debe ser menor que ZSCORE_ENTRY")
        if not (0 < self.max_capital_per_trade_pct <= 1):
            raise ValueError("MAX_CAPITAL_PER_TRADE_PCT debe estar en (0, 1]")
        if not (0 < self.stop_loss_pct < 1):
            raise ValueError("STOP_LOSS_PCT debe estar en (0, 1)")
        if self.control_api_enabled and self.control_api_host != "127.0.0.1" and not self.control_api_token:
            raise ValueError(
                "CONTROL_API_HOST distinto de 127.0.0.1 requiere CONTROL_API_TOKEN: "
                "no se expone la API de control a la red sin autenticación."
            )


def load_settings() -> Settings:
    settings = Settings(
        api_key=os.getenv("BINANCE_API_KEY", ""),
        api_secret=os.getenv("BINANCE_API_SECRET", ""),
        dry_run=_env_bool("DRY_RUN", True),
        use_testnet=_env_bool("USE_TESTNET", True),
        symbol_a=os.getenv("SYMBOL_A", "BTC/USDT"),
        symbol_b=os.getenv("SYMBOL_B", "ETH/USDT"),
        timeframe=os.getenv("TIMEFRAME", "1h"),
        lookback_candles=_env_int("LOOKBACK_CANDLES", 500),
        min_cointegration_pvalue=_env_float("MIN_COINTEGRATION_PVALUE", 0.05),
        recalibration_interval_seconds=_env_int(
            "RECALIBRATION_INTERVAL_SECONDS", 21600
        ),
        zscore_window=_env_int("ZSCORE_WINDOW", 60),
        zscore_entry=_env_float("ZSCORE_ENTRY", 2.0),
        zscore_exit=_env_float("ZSCORE_EXIT", 0.5),
        taker_fee_rate=_env_float("TAKER_FEE_RATE", 0.001),
        maker_fee_rate=_env_float("MAKER_FEE_RATE", 0.001),
        slippage_bps=_env_float("SLIPPAGE_BPS", 5),
        stop_loss_pct=_env_float("STOP_LOSS_PCT", 0.01),
        max_capital_per_trade_pct=_env_float("MAX_CAPITAL_PER_TRADE_PCT", 0.10),
        total_capital_usdt=_env_float("TOTAL_CAPITAL_USDT", 1000),
        report_interval_seconds=_env_int("REPORT_INTERVAL_SECONDS", 15),
        control_api_enabled=_env_bool("CONTROL_API_ENABLED", True),
        control_api_host=os.getenv("CONTROL_API_HOST", "127.0.0.1"),
        control_api_port=_env_int("CONTROL_API_PORT", 8080),
        control_api_token=os.getenv("CONTROL_API_TOKEN", ""),
    )
    settings.validate()
    return settings
