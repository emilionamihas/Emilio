"""
API HTTP mínima para ver y operar el bot de forma remota, sin entrar por
SSH al servidor cada vez (por ejemplo, para que Claude la consulte cuando
se le pregunta "cómo va el bot" en una conversación).

Corre sobre aiohttp.web, que ya está instalado como dependencia de ccxt
(no agrega ningún framework nuevo al proyecto).

Endpoints:
    GET  /health   -> liveness check, sin autenticación, sin datos sensibles
    GET  /status   -> snapshot: precios, z-score, posición abierta, PnL acumulado
    GET  /trades   -> últimos trades cerrados
    POST /pause    -> deja de abrir posiciones nuevas (sigue vigilando la abierta)
    POST /resume   -> reanuda la apertura de posiciones nuevas
    POST /close    -> pide el cierre inmediato de la posición abierta, si hay una

Seguridad:
- Si CONTROL_API_TOKEN está seteado, todos los endpoints salvo /health
  exigen header "Authorization: Bearer <token>".
- Por defecto CONTROL_API_HOST=127.0.0.1: el puerto no queda expuesto a la
  red a menos que se cambie explícitamente (ver DEPLOY.md sobre cómo
  exponerlo con HTTPS detrás de un reverse proxy si se quiere consultar
  desde afuera del servidor).
- Nunca se devuelven las API keys del exchange ni el contenido de .env.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from aiohttp import web

from config import Settings
from reporting import Reporter
from state import MarketState

logger = logging.getLogger("trading-bot.control_api")

# El dashboard es un HTML estático servido en "/", mismo origen que la API:
# así el fetch() del navegador no pisa CORS ni necesita infraestructura
# aparte (ver dashboard/index.html).
DASHBOARD_PATH = Path(__file__).parent / "dashboard" / "index.html"

# Rutas que no requieren el Bearer token: /health (liveness check, sin
# datos sensibles) y "/" (el HTML del dashboard es solo la interfaz; cada
# llamada que hace desde el navegador SÍ pasa por la autenticación normal).
PUBLIC_PATHS = {"/health", "/"}


def _auth_middleware_factory(token: str):
    @web.middleware
    async def auth_middleware(request: web.Request, handler):
        if request.path in PUBLIC_PATHS or not token:
            return await handler(request)
        header = request.headers.get("Authorization", "")
        if header != f"Bearer {token}":
            return web.json_response({"error": "unauthorized"}, status=401)
        return await handler(request)

    return auth_middleware


def build_app(
    settings: Settings,
    market_state: MarketState,
    reporter: Reporter,
    holder,  # PositionHolder de main.py (import evitado acá para no crear un ciclo)
) -> web.Application:
    app = web.Application(middlewares=[_auth_middleware_factory(settings.control_api_token)])

    async def health(request: web.Request) -> web.Response:
        return web.json_response({"status": "ok"})

    async def dashboard(request: web.Request) -> web.Response:
        if not DASHBOARD_PATH.exists():
            return web.Response(text="dashboard/index.html no encontrado", status=500)
        return web.Response(text=DASHBOARD_PATH.read_text(encoding="utf-8"), content_type="text/html")

    async def status(request: web.Request) -> web.Response:
        position = holder.position
        open_position_data = None
        if position is not None and market_state.price_a and market_state.price_b:
            open_position_data = {
                "leg_a": {
                    "symbol": position.leg_a.symbol,
                    "side": position.leg_a.side,
                    "quantity": position.leg_a.quantity,
                    "entry_price": position.leg_a.entry_price,
                },
                "leg_b": {
                    "symbol": position.leg_b.symbol,
                    "side": position.leg_b.side,
                    "quantity": position.leg_b.quantity,
                    "entry_price": position.leg_b.entry_price,
                },
                "entry_zscore": position.entry_zscore,
                "allocated_capital": position.allocated_capital,
                "opened_at": position.opened_at,
                "unrealized_pnl": position.unrealized_pnl(market_state.price_a, market_state.price_b),
            }

        return web.json_response(
            {
                "mode": "paper" if settings.dry_run else "live",
                "paused": holder.paused,
                "symbol_a": market_state.symbol_a,
                "symbol_b": market_state.symbol_b,
                "price_a": market_state.price_a,
                "price_b": market_state.price_b,
                "hedge_ratio": market_state.hedge_ratio,
                "cointegrated": market_state.cointegrated,
                "cointegration_pvalue": market_state.cointegration_pvalue,
                "current_zscore": market_state.current_zscore,
                "open_position": open_position_data,
                "closed_trades_count": len(reporter.closed_trades),
                "total_net_pnl": reporter.total_net_pnl,
                "total_fees_paid": reporter.total_fees_paid,
                "win_rate": reporter.win_rate,
                "server_time": time.time(),
            }
        )

    async def trades(request: web.Request) -> web.Response:
        limit = int(request.query.get("limit", 20))
        recent = reporter.closed_trades[-limit:]
        return web.json_response(
            [
                {
                    "symbol_a": t.symbol_a,
                    "symbol_b": t.symbol_b,
                    "entry_zscore": t.entry_zscore,
                    "exit_zscore": t.exit_zscore,
                    "gross_pnl": t.gross_pnl,
                    "fees_paid": t.fees_paid,
                    "net_pnl": t.net_pnl,
                    "net_return_pct": t.net_return_pct,
                    "close_reason": t.close_reason,
                    "opened_at": t.opened_at,
                    "closed_at": t.closed_at,
                }
                for t in recent
            ]
        )

    async def pause(request: web.Request) -> web.Response:
        holder.paused = True
        logger.warning("Pausa solicitada vía API de control: no se abrirán posiciones nuevas.")
        return web.json_response({"paused": True})

    async def resume(request: web.Request) -> web.Response:
        holder.paused = False
        logger.info("Reanudado vía API de control.")
        return web.json_response({"paused": False})

    async def close_position(request: web.Request) -> web.Response:
        if holder.position is None:
            return web.json_response({"error": "no hay posición abierta"}, status=400)
        holder.force_close_requested = True
        logger.warning("Cierre forzado de la posición solicitado vía API de control.")
        return web.json_response({"requested": True})

    app.router.add_get("/health", health)
    app.router.add_get("/", dashboard)
    app.router.add_get("/status", status)
    app.router.add_get("/trades", trades)
    app.router.add_post("/pause", pause)
    app.router.add_post("/resume", resume)
    app.router.add_post("/close", close_position)
    return app


async def run_control_api(
    settings: Settings,
    market_state: MarketState,
    reporter: Reporter,
    holder,
) -> web.AppRunner | None:
    """Arranca el servidor y devuelve el AppRunner para poder cerrarlo
    prolijamente en el shutdown. Devuelve None si CONTROL_API_ENABLED=false."""
    if not settings.control_api_enabled:
        logger.info("API de control deshabilitada (CONTROL_API_ENABLED=false).")
        return None

    if not settings.control_api_token:
        logger.warning(
            "CONTROL_API_TOKEN vacío: la API de control queda SIN autenticación. "
            "Aceptable solo si CONTROL_API_HOST=127.0.0.1 (no expuesta a la red)."
        )

    app = build_app(settings, market_state, reporter, holder)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, settings.control_api_host, settings.control_api_port)
    await site.start()
    logger.info(
        "API de control escuchando en http://%s:%d (auth=%s)",
        settings.control_api_host,
        settings.control_api_port,
        "token" if settings.control_api_token else "NINGUNA",
    )
    return runner
