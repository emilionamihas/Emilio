# Bot de Arbitraje Estadístico (Pair Trading) — Binance

Bot en Python que opera arbitraje estadístico entre dos criptoactivos
correlacionados (por defecto BTC/USDT y ETH/USDT), usando un modelo de
cointegración y z-score del spread, con un filtro obligatorio de
rentabilidad neta (comisiones + slippage) y gestión de riesgo con
stop-loss y límite de exposición por operación.

## Aviso importante antes de usarlo

Este bot corre por defecto en **modo paper trading** (`DRY_RUN=true`): calcula
señales y un PnL simulado, pero no manda órdenes reales. Eso es intencional.

La cointegración entre BTC y ETH no es una propiedad fija: el test de
Engle-Granger que corre el bot al arrancar (y cada `RECALIBRATION_INTERVAL_SECONDS`)
puede fallar en distintos períodos, especialmente en tramos de alta
volatilidad, que es justo cuando el z-score generaría más señales. Cuando el
test falla, el bot **sigue monitoreando pero no abre posiciones nuevas**
hasta que el par vuelva a pasar el umbral configurado en
`MIN_COINTEGRATION_PVALUE`.

Además, el filtro de rentabilidad (`profitability_filter.py`) descarta toda
señal cuya ganancia neta esperada, después de comisiones (0.1% por lado,
4 fills por round-trip) y slippage estimado, no sea positiva. En pares muy
líquidos y correlacionados, eso puede significar que el bot rechace la
mayoría de las señales de z-score: es el comportamiento esperado, no un
error. Correr en paper trading un tiempo prolongado antes de considerar
`DRY_RUN=false` es la forma de verificar si, con tus parámetros y el nivel
de comisiones real de tu cuenta, la estrategia efectivamente deja edge neto.

## Instalación

```bash
cd trading-bot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# completar BINANCE_API_KEY / BINANCE_API_SECRET en .env
```

## Uso

```bash
python main.py
```

Con `DRY_RUN=true` y `USE_TESTNET=true` (valores por defecto) no hace falta
tener fondos ni permisos de trading en la API key: alcanza con una key de
solo lectura para los datos de mercado. Para pasar a testnet real o a
producción, ajustar `.env` explícitamente.

## Estructura

```
config.py                Carga y valida las variables de entorno (.env)
state.py                 Estructuras: MarketState, PairPosition, ClosedTrade
data_engine.py           Calibración (REST + cointegración) y feed WebSocket
strategy.py               Señales de entrada/salida por z-score
profitability_filter.py   Filtro obligatorio: PnL neto proyectado (fees + slippage)
risk_manager.py            Sizing por capital máximo y stop-loss del 1%
execution.py               Ejecución de órdenes (simulada en dry-run, real vía ccxt)
reporting.py                Reporte de PnL en consola
main.py                      Orquestación asyncio de todos los loops
```

## Parámetros clave (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `DRY_RUN` | `true` | `true` = paper trading, `false` = órdenes reales |
| `USE_TESTNET` | `true` | Usa el testnet spot de Binance |
| `SYMBOL_A` / `SYMBOL_B` | `BTC/USDT` / `ETH/USDT` | Par a operar |
| `ZSCORE_ENTRY` | `2.0` | Umbral de entrada (desviaciones estándar) |
| `ZSCORE_EXIT` | `0.5` | Umbral de salida por reversión |
| `MIN_COINTEGRATION_PVALUE` | `0.05` | p-value máximo del test de Engle-Granger para habilitar entradas |
| `TAKER_FEE_RATE` | `0.001` | Comisión por fill (0.1%) |
| `SLIPPAGE_BPS` | `5` | Slippage estimado por fill, en puntos básicos |
| `STOP_LOSS_PCT` | `0.01` | Stop-loss del 1% sobre el capital asignado al trade |
| `MAX_CAPITAL_PER_TRADE_PCT` | `0.10` | Máximo 10% del capital total por operación |
| `TOTAL_CAPITAL_USDT` | `1000` | Capital base para el sizing (paper trading) |

## Limitaciones conocidas

- El z-score se calcula sobre precios tick a tick (WebSocket), no sobre
  velas cerradas; es más reactivo pero también más ruidoso que un z-score
  calculado sobre barras de 1m/5m.
- El modelo de ganancia esperada en `profitability_filter.py` es una
  aproximación lineal (reversión proporcional a la distancia al umbral de
  salida), no una simulación de ejecución real contra el order book.
- No incluye reconexión con backoff exponencial ni persistencia de estado
  entre reinicios: si el proceso se cae con una posición abierta, hay que
  cerrarla manualmente en el exchange.
- Pensado para uso educativo y de investigación / testing autorizado, no
  como producto financiero terminado.
