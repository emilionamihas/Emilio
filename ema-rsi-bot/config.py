"""
Carga de configuración desde variables de entorno (.env).

Todo parámetro operativo (símbolo, indicadores, riesgo, costos) vive acá
para que el resto del código nunca tenga números mágicos sueltos.
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

    # Mercado
    symbol: str
    timeframe: str

    # Cruce de medias
    ema_fast: int
    ema_slow: int

    # RSI
    rsi_period: int
    rsi_long_min: float
    rsi_long_max: float

    # MACD
    use_macd_filter: bool
    macd_fast: int
    macd_slow: int
    macd_signal: int

    # SL/TP dinámicos por ATR
    atr_period: int
    atr_sl_mult: float
    reward_risk_ratio: float

    # Riesgo
    total_capital_usdt: float
    risk_per_trade_pct: float
    max_position_pct: float
    daily_loss_limit_pct: float

    # Costos de ejecución
    taker_fee_rate: float
    slippage_bps: float

    # Backtesting
    backtest_days: int

    # Loop en vivo
    poll_interval_seconds: int

    def validate(self) -> None:
        if not self.dry_run and (not self.api_key or not self.api_secret):
            raise ValueError(
                "DRY_RUN=false requiere BINANCE_API_KEY y BINANCE_API_SECRET "
                "configuradas en .env"
            )
        if self.ema_fast >= self.ema_slow:
            raise ValueError("EMA_FAST debe ser menor que EMA_SLOW")
        if not (0 < self.risk_per_trade_pct <= 0.05):
            raise ValueError(
                "RISK_PER_TRADE_PCT fuera de rango razonable (0, 0.05]. "
                "El requisito del proyecto es 1-2% (0.01-0.02)."
            )
        if not (0 < self.max_position_pct <= 1):
            raise ValueError("MAX_POSITION_PCT debe estar en (0, 1]")
        if not (0 < self.daily_loss_limit_pct < 1):
            raise ValueError("DAILY_LOSS_LIMIT_PCT debe estar en (0, 1)")
        if self.atr_sl_mult <= 0 or self.reward_risk_ratio <= 0:
            raise ValueError("ATR_SL_MULT y REWARD_RISK_RATIO deben ser positivos")


def load_settings() -> Settings:
    settings = Settings(
        api_key=os.getenv("BINANCE_API_KEY", ""),
        api_secret=os.getenv("BINANCE_API_SECRET", ""),
        dry_run=_env_bool("DRY_RUN", True),
        use_testnet=_env_bool("USE_TESTNET", True),
        symbol=os.getenv("SYMBOL", "BTC/USDT"),
        timeframe=os.getenv("TIMEFRAME", "4h"),
        ema_fast=_env_int("EMA_FAST", 20),
        ema_slow=_env_int("EMA_SLOW", 50),
        rsi_period=_env_int("RSI_PERIOD", 14),
        rsi_long_min=_env_float("RSI_LONG_MIN", 45),
        rsi_long_max=_env_float("RSI_LONG_MAX", 70),
        use_macd_filter=_env_bool("USE_MACD_FILTER", True),
        macd_fast=_env_int("MACD_FAST", 12),
        macd_slow=_env_int("MACD_SLOW", 26),
        macd_signal=_env_int("MACD_SIGNAL", 9),
        atr_period=_env_int("ATR_PERIOD", 14),
        atr_sl_mult=_env_float("ATR_SL_MULT", 2.0),
        reward_risk_ratio=_env_float("REWARD_RISK_RATIO", 2.0),
        total_capital_usdt=_env_float("TOTAL_CAPITAL_USDT", 1000),
        risk_per_trade_pct=_env_float("RISK_PER_TRADE_PCT", 0.01),
        max_position_pct=_env_float("MAX_POSITION_PCT", 0.02),
        daily_loss_limit_pct=_env_float("DAILY_LOSS_LIMIT_PCT", 0.05),
        taker_fee_rate=_env_float("TAKER_FEE_RATE", 0.001),
        slippage_bps=_env_float("SLIPPAGE_BPS", 5),
        backtest_days=_env_int("BACKTEST_DAYS", 730),
        poll_interval_seconds=_env_int("POLL_INTERVAL_SECONDS", 60),
    )
    settings.validate()
    return settings
