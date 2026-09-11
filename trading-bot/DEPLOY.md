# Despliegue en producción (dinero real)

Este documento asume que ya corriste el bot en `DRY_RUN=true` el tiempo
suficiente como para confiar en la lógica de señales y en el filtro de
rentabilidad con tus propios números. Si no lo hiciste todavía, hacelo
antes de seguir: el checklist de abajo protege contra errores de
infraestructura, no contra una estrategia sin validar.

## 0. Por qué no puede correr "en la nube de Claude"

Esta sesión de Claude Code corre en un contenedor efímero que se recicla
por inactividad, y además la política de red de esta organización bloquea
explícitamente el acceso a `api.binance.com` / `fapi.binance.com` /
`dapi.binance.com` (lo verificamos: el proxy devuelve 403 por política, no
por un error de configuración). Ninguna de las dos cosas se arregla desde
acá. El bot tiene que correr en un servidor que vos controlás.

## 1. Elegí dónde va a correr

Cualquier VPS Linux chico alcanza (1 vCPU / 1-2 GB RAM: el bot es liviano).
Opciones típicas: una gota de DigitalOcean, un droplet, un EC2 t3.micro, un
Lightsail, o un servidor propio. Preferí una región cercana a los
datacenters de Binance (ej. Tokio o Singapur) si la latencia del fill te
importa; para z-score en el rango de segundos que usa este bot no es
crítico, pero ayuda.

## 2. Preparación de la API key en Binance

En Binance, al crear la API key:

- **NO habilites permiso de retiro (withdrawal).** El bot no lo necesita
  para operar spot, y así un compromiso de la key no puede vaciar la cuenta.
- Habilitá únicamente **Enable Spot & Margin Trading** (o Spot Trading, según
  la UI vigente).
- Restringí la key por **IP whitelist** a la IP pública del servidor donde
  va a correr el bot, apenas la tengas.
- Guardá el secret en un gestor de contraseñas. No lo pegues nunca en un
  chat, ticket, o mensaje que no sea el archivo `.env` del propio servidor.

## 3. Despliegue con Docker (recomendado)

```bash
# En el servidor:
git clone <tu-fork-o-remoto> && cd trading-bot
cp .env.example .env
nano .env   # completar API keys, y dejar DRY_RUN=true la primera vez

docker compose up -d --build
docker compose logs -f       # ver el reporte de PnL en vivo
```

Para pasar a real, una vez que viste unas cuantas corridas de paper trading
sanas en este mismo servidor (mismo entorno de red, misma latencia real):

```bash
nano .env   # DRY_RUN=false, USE_TESTNET=false
docker compose up -d --build
```

`docker-compose.yml` ya usa `restart: unless-stopped` (se levanta solo si
el servidor reinicia) y persiste `./state/position.json` como volumen, así
que una posición abierta sobrevive a un `docker compose restart` o a un
redeploy: el bot la recupera al arrancar (ver `persistence.py`).

## 4. Despliegue con systemd (sin Docker)

```bash
sudo useradd --system --create-home tradingbot
sudo mkdir -p /opt/trading-bot
sudo cp -r trading-bot/* /opt/trading-bot/
cd /opt/trading-bot
sudo -u tradingbot python3 -m venv venv
sudo -u tradingbot venv/bin/pip install -r requirements.txt
sudo -u tradingbot cp .env.example .env
sudo -u tradingbot nano .env   # completar credenciales

sudo cp deploy/trading-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trading-bot

journalctl -u trading-bot -f   # ver el reporte de PnL en vivo
```

## 5. API de control: ver y operar el bot desde afuera del servidor

El bot expone una API HTTP mínima (`control_api.py`) con estado en vivo y
tres acciones: pausar, reanudar, cerrar la posición abierta. Por defecto
(`CONTROL_API_HOST=127.0.0.1`) queda **cerrada**, solo accesible desde
dentro del servidor. Para consultarla desde afuera (por ejemplo, para que
se pueda pedir el estado del bot en una conversación con Claude) hay que
exponerla a propósito:

```bash
# En .env:
CONTROL_API_HOST=0.0.0.0
CONTROL_API_TOKEN=$(openssl rand -hex 32)   # generar uno y guardarlo
```

**Nunca la dejes así, directa a internet sin HTTPS.** Ponela detrás de un
reverse proxy que termine TLS. La forma más simple es Caddy, que saca el
certificado solo:

```bash
sudo apt install -y caddy   # o el método de instalación que prefieras

# /etc/caddy/Caddyfile
bot.tudominio.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl restart caddy
```

Con Docker, descomentá el mapeo de puerto en `docker-compose.yml`
(`127.0.0.1:8080:8080`, no `0.0.0.0`: que solo Caddy en el propio host le
pegue directo, y Caddy sea lo único expuesto a internet en el puerto 443).

Probar que responde:

```bash
curl https://bot.tudominio.com/status \
  -H "Authorization: Bearer $CONTROL_API_TOKEN"
```

Endpoints disponibles:

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | liveness check, sin autenticación, sin datos sensibles |
| GET | `/status` | precios, z-score, posición abierta, PnL acumulado |
| GET | `/trades?limit=20` | últimos trades cerrados |
| POST | `/pause` | deja de abrir posiciones nuevas (sigue vigilando la abierta) |
| POST | `/resume` | reanuda la apertura de posiciones nuevas |
| POST | `/close` | pide el cierre inmediato de la posición abierta, si hay una |

El token nunca da acceso a las API keys de Binance ni al `.env`: solo a
estas seis rutas. Igual, tratalo como una credencial real (no lo compartas
en un canal que no controlás) y regenéralo si sospechás que se filtró.

## 6. Checklist antes de poner `DRY_RUN=false`

- [ ] Corriste el bot en paper trading en **este mismo servidor** (no solo
      en tu laptop) al menos unos días, cubriendo distintas condiciones de
      mercado.
- [ ] Revisaste el log y viste que el filtro de rentabilidad rechaza
      señales cuyo PnL neto proyectado da negativo (si nunca rechazó
      ninguna, sospechá del cálculo antes de confiar en él).
- [ ] `TOTAL_CAPITAL_USDT` en `.env` refleja el capital real que estás
      dispuesto a arriesgar, no un número de prueba.
- [ ] La API key NO tiene permiso de retiro.
- [ ] Tenés forma de recibir una alerta si el proceso se cae (ver punto 7).
- [ ] Sabés cómo cerrar una posición a mano desde la app/web de Binance si
      hace falta intervenir de urgencia.

## 7. Monitoreo básico

El bot imprime el reporte de PnL cada `REPORT_INTERVAL_SECONDS` por stdout
(`docker compose logs -f` o `journalctl -u trading-bot -f`), y lo mismo por
`GET /status` en la API de control si la expusiste (punto 5). Para algo más
robusto sin agregar dependencias nuevas al proyecto:

- Docker: `docker compose ps` para ver si el contenedor sigue up; un cron
  externo simple con `docker inspect --format='{{.State.Status}}'` alcanza
  para una alerta básica por email/webhook.
- systemd: `systemctl is-active trading-bot`, o `OnFailure=` en la unit
  apuntando a otra unit que dispare una notificación.

## 8. Actualizar el bot sin perder una posición abierta

```bash
git pull
docker compose up -d --build   # o: sudo systemctl restart trading-bot
```

El SIGTERM que manda Docker/systemd al bajar el proceso es capturado por
`main.py`: si hay una posición abierta, queda persistida en
`state/position.json` (Docker) o en el `STATE_FILE_PATH` configurado
(systemd) y se retoma su monitoreo (stop-loss incluido) al volver a
arrancar. Igual, evitá redeploys innecesarios mientras haya una posición
abierta si podés esperar a que cierre sola.
