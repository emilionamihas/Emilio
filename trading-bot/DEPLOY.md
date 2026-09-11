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

## 5. Checklist antes de poner `DRY_RUN=false`

- [ ] Corriste el bot en paper trading en **este mismo servidor** (no solo
      en tu laptop) al menos unos días, cubriendo distintas condiciones de
      mercado.
- [ ] Revisaste el log y viste que el filtro de rentabilidad rechaza
      señales cuyo PnL neto proyectado da negativo (si nunca rechazó
      ninguna, sospechá del cálculo antes de confiar en él).
- [ ] `TOTAL_CAPITAL_USDT` en `.env` refleja el capital real que estás
      dispuesto a arriesgar, no un número de prueba.
- [ ] La API key NO tiene permiso de retiro.
- [ ] Tenés forma de recibir una alerta si el proceso se cae (ver punto 6).
- [ ] Sabés cómo cerrar una posición a mano desde la app/web de Binance si
      hace falta intervenir de urgencia.

## 6. Monitoreo básico

El bot imprime el reporte de PnL cada `REPORT_INTERVAL_SECONDS` por stdout
(`docker compose logs -f` o `journalctl -u trading-bot -f`). Para algo más
robusto sin agregar dependencias nuevas al proyecto:

- Docker: `docker compose ps` para ver si el contenedor sigue up; un cron
  externo simple con `docker inspect --format='{{.State.Status}}'` alcanza
  para una alerta básica por email/webhook.
- systemd: `systemctl is-active trading-bot`, o `OnFailure=` en la unit
  apuntando a otra unit que dispare una notificación.

## 7. Actualizar el bot sin perder una posición abierta

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
