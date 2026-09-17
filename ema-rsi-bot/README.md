# Bot de tendencia EMA/RSI/MACD — Binance BTC/USDT

Bot en Python para spot de Binance (largo únicamente, sin apalancamiento)
basado en cruce de medias móviles EMA(20/50), confirmado con un filtro de
RSI(14) y opcionalmente con MACD(12,26,9). Incluye backtesting sobre
datos históricos reales, gestión de riesgo con stop-loss/take-profit
dinámicos por ATR, sizing por riesgo con tope de capital por posición y
un kill switch de pérdida diaria.

Es un proyecto independiente del bot de arbitraje estadístico que ya
existe en `../trading-bot` (pair trading BTC/ETH por cointegración). No
comparte código ni estado con él.

## Aviso importante antes de usarlo

Corre por defecto en **`DRY_RUN=true` + `USE_TESTNET=true`**: paper
trading con dinero ficticio (arranca con `TOTAL_CAPITAL_USDT`) contra
precios reales de Binance, sin mandar órdenes. Pasar a `DRY_RUN=false`
sin haber corrido antes el backtest y un período largo de paper trading
es la forma más rápida de perder plata real con parámetros sin validar.

**El backtest no se pudo correr contra datos reales desde esta sesión**:
el entorno remoto en el que se generó este bot tiene bloqueada por
política de red la salida a `api.binance.com` (y a sus espejos, y a
Yahoo Finance, y a CoinGecko — se probaron los cuatro y los cuatro
devolvieron 403 del proxy de egress). Lo que sí se verificó acá es que
`backtest.py` corre de punta a punta sin errores contra datos sintéticos
(random walk), que el sizing por riesgo, el ATR-stop y el kill switch
diario se comportan como está documentado. Eso prueba que el código no
tiene bugs de ejecución, **no prueba que la estrategia sea rentable**.
Correr `python backtest.py` en tu máquina (con salida a internet normal)
es el paso obligatorio antes de considerar paper trading en vivo, y más
todavía antes de considerar `DRY_RUN=false`.

## Instalación

```bash
cd ema-rsi-bot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# opcional: ajustar parámetros en .env (símbolo, EMA, RSI, riesgo, etc.)
```

## Backtesting (correr esto primero, siempre)

```bash
python backtest.py
```

Descarga el histórico real de Binance para `SYMBOL`/`TIMEFRAME` de los
últimos `BACKTEST_DAYS` días, simula la estrategia vela a vela aplicando
comisión taker y slippage configurados, y muestra en consola: retorno
total, CAGR, max drawdown, Sharpe anualizado, número de operaciones, win
rate, profit factor y PnL promedio por trade. Además guarda
`backtest_trades.csv`, `backtest_equity_curve.csv` y
`backtest_equity_curve.png` (curva de equity) en esta carpeta.

Simplificaciones del motor de backtest (documentadas en el código,
`backtest.py`):
- Entradas/salidas por señal se ejecutan al cierre de la misma vela en
  que se confirma la señal (+ slippage), no al open de la vela
  siguiente: es optimista respecto a una ejecución real.
- El stop-loss y el take-profit sí se evalúan intrabar contra el
  low/high de cada vela; si ambos se tocan en la misma vela se asume que
  ejecuta primero el stop (supuesto conservador).
- No modela profundidad de order book ni impacto de mercado más allá del
  slippage fijo en puntos básicos configurado en `.env`.

Si el backtest te da pocas o cero operaciones en dos años de histórico,
no es necesariamente un bug: con `RSI_LONG_MIN/MAX` y `USE_MACD_FILTER`
activos, el filtro es exigente a propósito. Antes de aflojarlo, confirmá
que entendés qué estás relajando (menos filtro = más señales, pero
también más señales falsas).

## Correrlo en vivo (paper trading por defecto)

```bash
python main.py
```

Queda corriendo en un loop (`POLL_INTERVAL_SECONDS`, default 60s),
imprime cada ciclo el estado (señal evaluada, posición, equity) y se
detiene con `Ctrl+C`. Con `DRY_RUN=true` no hace falta tener fondos ni
API key real: alcanza con dejar `BINANCE_API_KEY`/`SECRET` vacías.

## Gestión de riesgo

| Mecanismo | Cómo funciona |
|---|---|
| Stop-loss dinámico | `entry - ATR(14) * ATR_SL_MULT` (default: 2×ATR) |
| Take-profit dinámico | `entry + ATR(14) * ATR_SL_MULT * REWARD_RISK_RATIO` (default: relación 2:1) |
| Sizing por riesgo | El monto que se puede perder si toca el stop no supera `RISK_PER_TRADE_PCT` (1-2%) del capital |
| Tope de posición | El notional de la posición además queda topeado a `MAX_POSITION_PCT` (1-2%) del capital, el menor de los dos manda |
| Kill switch diario | Si la pérdida realizada del día (UTC) supera `DAILY_LOSS_LIMIT_PCT` (5% default), no se abren posiciones nuevas hasta el día siguiente |

## Estructura

```
config.py        Carga y valida .env
state.py          Position, ClosedTrade, DailyPnLTracker (kill switch)
data.py            OHLCV histórico (paginado) y en vivo vía ccxt
strategy.py         EMA/RSI/MACD/ATR y generación de señales
risk_manager.py      Sizing, SL/TP por ATR, kill switch
execution.py          Fills simulados (paper) o reales vía ccxt
backtest.py            Motor de backtest + métricas + reporte
main.py                  Loop de ejecución en vivo (paper trading por defecto)
```

## Parámetros clave (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `DRY_RUN` | `true` | `true` = paper trading, `false` = órdenes reales |
| `USE_TESTNET` | `true` | Usa el testnet spot de Binance |
| `SYMBOL` / `TIMEFRAME` | `BTC/USDT` / `4h` | Mercado y temporalidad |
| `EMA_FAST` / `EMA_SLOW` | `20` / `50` | Períodos del cruce de medias |
| `RSI_PERIOD`, `RSI_LONG_MIN/MAX` | `14`, `45-70` | Filtro RSI para confirmar entradas |
| `USE_MACD_FILTER` | `true` | Exige MACD > señal para confirmar entrada |
| `ATR_PERIOD`, `ATR_SL_MULT`, `REWARD_RISK_RATIO` | `14`, `2.0`, `2.0` | Stop-loss/take-profit dinámicos |
| `RISK_PER_TRADE_PCT` | `0.01` | Riesgo máximo por operación (1%) |
| `MAX_POSITION_PCT` | `0.02` | Tope de notional por posición (2%) |
| `DAILY_LOSS_LIMIT_PCT` | `0.05` | Kill switch: pérdida diaria máxima antes de pausar |
| `TAKER_FEE_RATE`, `SLIPPAGE_BPS` | `0.001`, `5` | Costos de ejecución para backtest y sizing |
| `TOTAL_CAPITAL_USDT` | `1000` | Capital base (paper trading) |
| `BACKTEST_DAYS` | `730` | Ventana histórica del backtest |

## Limitaciones conocidas

- Estrategia long-only (spot, sin apalancamiento ni venta en corto).
- El backtest no modela order book ni partial fills; el slippage es un
  supuesto fijo en puntos básicos.
- El loop en vivo descarta siempre la última vela (asumida en curso) y
  decide sobre la última vela cerrada; no reacciona intra-vela salvo en
  el próximo poll.
- No hay reconciliación automática contra el saldo real en Binance al
  arrancar en modo real: si vas a pasar a `DRY_RUN=false`, verificá el
  estado de la cuenta a mano primero.
- Pensado para uso educativo y de investigación / testing autorizado,
  no como producto financiero terminado.
