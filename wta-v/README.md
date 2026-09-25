# WTA V · World Theft Auto

Sandbox urbano en tercera persona que se juega en el navegador. Estás en Puerto Sombra, una ciudad ficticia: robas coches, atracas tiendas y bancos, compras armas, negocios y vehículos, y te las ves con una policía de hasta cinco estrellas. Render con Three.js y física con cannon-es (el fork mantenido de Cannon.js). No hay paso de build: las librerías se cargan desde jsDelivr con un import map.

## Cómo jugar

Los módulos ES no funcionan abriendo el archivo con `file://`, así que hace falta un servidor estático. Desde esta carpeta:

```
python3 -m http.server 8080
# o bien
npx serve .
```

Abre `http://localhost:8080` y elige modo. La primera vez necesitas internet para descargar Three.js, cannon-es y las fuentes.

## Modos

**Modo historia.** Nueve misiones encadenadas con tres personajes: Lucho, el mecánico que te da tus primeros trabajos; Vera, que planifica los golpes; y Don Aurelio, que manda en la ciudad. Empiezas con 300 dólares y solo con los puños. Los golpes van subiendo de nivel: primero un coche cualquiera, luego una tienda, un deportivo por encargo, el Banco del Puerto, una huida cronometrada, una banda rival, el Banco Central y, al final, la Reserva Federal. Cada banco se desbloquea con su misión. La partida se guarda sola al terminar cada misión.

**Modo libre.** Toda la ciudad abierta desde el principio, con 60.000 dólares, una pistola y medio chaleco. Las armas, los negocios y los coches se siguen comprando. Cada modo guarda su propia partida en el navegador.

## Qué hay en la ciudad

| Radar | Lugar | Qué haces allí |
|---|---|---|
| H | Tu casa | Guardar, descansar (vida al máximo, +6 h) y sacar coches del garaje |
| A | Armería Plomo | Comprar armas, munición y chaleco antibalas |
| C | Autos Velasco | Comprar coches (no cuentan como robo y quedan en tu garaje) |
| T | Cinco tiendas 24/7 | Atraco corto: 7 s, de 600 a 1.400 dólares, 2 estrellas |
| $ | Tres bancos | Atracos largos con botín que hay que asegurar |
| N | Cinco negocios | Ingresos automáticos cada hora de juego |
| + / P | Hospital y comisaría | Donde reapareces si te matan o te arrestan |

**Bancos.** Te quedas junto a la cámara acorazada con un arma de fuego en la mano mientras se vacía. Mientras estás dentro la policía rodea el edificio, pero no dispara. El botín va a la bolsa y solo pasa a ser tuyo cuando pierdes a la policía: si te matan o te arrestan antes, lo pierdes. Si te vas a mitad, te llevas la parte proporcional (a partir del 30 %).

| Banco | Duración | Botín | Estrellas |
|---|---|---|---|
| Banco del Puerto | 15 s | 12.000 a 18.000 | 2 → 3 |
| Banco Central | 25 s | 35.000 a 50.000 | 3 → 4 |
| Reserva Federal | 35 s | 110.000 a 150.000 | 4 → 5 |

**Negocios.** Lavandería Espuma (8.000, 120/h), Taller Pistón (15.000, 220/h), Club Neón (30.000, 450/h), Hotel Marina (60.000, 900/h) y Casino Sombra (150.000, 2.500/h). Una hora de juego son 20 segundos reales. Acelerar el reloj con T no acelera los ingresos.

**Armas.** Puños, pistola (400), subfusil (2.200), escopeta (3.200), rifle de asalto (6.500) y lanzacohetes (25.000). Cada arma viene con dos cargadores; luego la munición se compra por cajas. El chaleco (600) absorbe el 70 % del daño. A partir de tres estrellas la policía dispara.

**Muerte y arresto.** Reapareces en el hospital o en la comisaría y pagas el 10 % de tu dinero (como mucho 5.000). Pierdes el botín que no habías asegurado, y si estabas en una misión, falla.

## Vehículos

Diez modelos con física propia (masa, tracción, agarre, suspensión y medidas). Todos se ajustaron con un banco de pruebas automático que comprueba aceleración, frenada, curvas y slalom sin volcar, y que el freno de mano derrapa sin hacer trompo.

| Modelo | Tipo | Tracción | 0-100 | Punta | Precio |
|---|---|---|---|---|---|
| Brío | Compacto | delantera | 8,2 s | 137 km/h | 3.000 |
| Estela | Sedán | trasera | 7,0 s | 151 km/h | 6.000 |
| Carga | Furgoneta | trasera | 9,9 s | 130 km/h | 7.000 |
| Mula | Pickup | trasera | 7,7 s | 150 km/h | 9.000 |
| Cumbre | Todoterreno | total | 6,4 s | 158 km/h | 14.000 |
| Toro | Muscle | trasera | 4,5 s | 187 km/h | 22.000 |
| Vento GT | Deportivo | trasera | 3,7 s | 215 km/h | 38.000 |
| Furia R | Superdeportivo | total | 2,5 s | 265 km/h | 95.000 |
| Taxi y Patrulla | Solo se roban | trasera | | | |

Para volver a pasar las pruebas (solo hace falta Node):

```
npm install
npm run test:vehicles
```

## Controles

| Tecla | A pie | En vehículo |
|---|---|---|
| WASD | moverse | acelerar, frenar/marcha atrás, girar |
| Ratón | cámara y apuntar | mirar alrededor |
| Shift | correr | |
| Espacio | saltar | freno de mano (derrape) |
| Clic izquierdo / derecho | disparar / apuntar | |
| F | entrar o robar un vehículo | salir (en marcha, saltas) |
| E | tiendas, atracos, negocios, misiones | |
| TAB (mantener) o 1-6 | rueda de armas | |
| R | recargar | enderezar el coche volcado |
| Enter | saltar diálogo | saltar diálogo |
| T (mantener) | acelerar el reloj | |
| Esc | pausa | |

Los menús de las tiendas se manejan con W/S y E (o las teclas 1-9), y se cierran con Q.

## Estructura

```
index.html                Canvas, HUD, menús y pantalla de inicio
style.css                 Estilos del HUD, radar, rueda de armas, tiendas y menú principal
js/main.js                Arranque, modos, explosiones, muerte/arresto y bucle principal
js/GameState.js           Dinero, armas, negocios, coches, progreso y guardado
js/Missions.js            Guion del modo historia y lógica de objetivos
js/Locations.js           Lugares de la ciudad, letreros, marcadores y menús de compra
js/Heists.js              Atracos a tiendas y bancos, botín y enfriamiento
js/Menus.js               Menú de tienda manejable con teclado o ratón
js/PlayerController.js    Personaje, armas y cámara en tercera persona
js/VehicleController.js   Catálogo de vehículos y física RaycastVehicle con estabilizador
js/InteractionSystem.js   Entrar y salir de vehículos
js/AITraffic.js           Tráfico por la red de calles con semáforos y object pooling
js/WantedSystem.js        Estrellas, patrullas, disparos de la policía y arrestos
js/Environment.js         Ciudad procedural y ciclo día/noche
js/HUD.js                 Radar, dinero, velocímetro, objetivos y avisos
js/Input.js / Effects.js  Entrada con Pointer Lock y efectos visuales
tools/vehicle-test.mjs    Banco de pruebas de conducción en Node
```

Para depurar: `?autostart=story` o `?autostart=free` arranca directamente (añade `&fresh` para ignorar la partida guardada), `?time=21.5` empieza de noche y en la consola `game.simulate(60)` avanza un segundo de simulación.

## Limitaciones

No hay peatones, audio ni motos. Los interiores no existen: las tiendas y los bancos se atracan desde un marcador en la acera. En los cruces el tráfico no siempre ve a quien llega por los lados y a veces choca.
