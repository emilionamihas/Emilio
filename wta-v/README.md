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

## La ciudad

Puerto Sombra mide algo más de un kilómetro de lado. El **Centro** conserva su cuadrícula de rascacielos, pero con una glorieta en medio y una avenida en diagonal que corta las manzanas. Alrededor hay una **circunvalación** de curvas amplias que conecta los barrios: el **Polígono** (naves industriales), **Jardines** y **Las Lomas** (casas con tejado a dos aguas y calles sinuosas), **Colinas** (mansiones) y la costa, con **El Puerto** (contenedores y almacenes) y **La Playa**, junto al mar. Entre el centro y Colinas está **La Meseta**, una colina con bosque que la Avenida Norte atraviesa por un **túnel** de 90 metros. Los cruces entre avenidas tienen semáforo y paso de cebra, y el tráfico, la policía y el GPS siguen la red de calles, respetando el sentido de la glorieta.

| Radar | Lugar | Qué haces allí |
|---|---|---|
| H | Tu casa | Se entra: cama (guardar y dormir), ordenador (negocios y coches) y vestidor |
| A | Armería Plomo y Armería Costa | Comprar armas, munición y chaleco antibalas |
| C | Autos Velasco | Comprar coches (no cuentan como robo y quedan en tu garaje) |
| T | Siete tiendas 24/7 | Se entra: encañonas al dependiente y vacías la caja en 3 segundos (900 a 2.000 dólares, 1 estrella) |
| $ | Cuatro bancos | Se entra: atraco con guardias, taladro y carros de dinero |
| N | Doce negocios | Pagan cada 30 segundos y se pueden mejorar dos veces |
| + / P | Hospital y comisaría | Donde reapareces si te matan o te arrestan |

**Bancos.** El atraco empieza cuando apuntas a un cajero, disparas dentro o pulsas E en las ventanillas. Salta la alarma y los clientes se tiran al suelo. Coloca el taladro en la puerta de la cámara acorazada y quédate a su lado; en unos segundos se abre y los carros de dinero (en la Reserva Federal, también lingotes) se vacían con una pulsación de E. Un atraco completo dura menos de diez segundos si vas directo. Mientras estás dentro la policía aún no ha llegado: los guardias disparan poco y los agentes a pie solo entran si te entretienes más de 25 segundos. Al salir tienes **20 segundos de ventaja** sin patrullas. El botín va a la bolsa y pasa a ser tuyo cuando pierdes a la policía; si te matan o te arrestan antes, lo pierdes.

| Banco | Dónde | Guardias | Taladro | Carros | Botín | Estrellas |
|---|---|---|---|---|---|---|
| Banco del Puerto | Centro | 1 | 4 s | 3 | 12.000 a 18.000 | 1 → 2 |
| Caja de las Colinas | Colinas | 2 | 5 s | 3 | 22.000 a 30.000 | 2 → 2 |
| Banco Central | Centro | 2 | 6 s | 4 | 35.000 a 50.000 | 2 → 3 |
| Reserva Federal | Centro | 3 | 8 s | 5 | 110.000 a 150.000 | 3 → 4 |

La policía también es más llevadera que antes: menos patrullas por estrella, disparan con menos puntería y se despistan antes.

**Negocios.** Pagan cada 30 segundos y están repartidos por toda la ciudad.

| Negocio | Zona | Precio | Por minuto |
|---|---|---|---|
| Café Brisa | La Playa | 5.000 | 700 |
| Lavandería Espuma | Centro | 8.000 | 1.000 |
| Taller Pistón | Centro | 15.000 | 1.800 |
| Gasolinera Ruta 9 | Avenida Oeste | 22.000 | 2.600 |
| Club Neón | Centro | 30.000 | 3.600 |
| Almacenes del Puerto | El Puerto | 45.000 | 5.200 |
| Hotel Marina | Centro | 60.000 | 7.000 |
| Restaurante Vista | Colinas | 85.000 | 9.800 |
| Fábrica Hierro | Polígono | 110.000 | 12.500 |
| Casino Sombra | Centro | 150.000 | 16.000 |
| Torre Delta | Avenida del Este | 260.000 | 27.000 |
| Club Náutico | La Playa | 420.000 | 42.000 |

Cada uno se puede reformar (x1,6) y llevar a lujo (x2,4). Mientras no juegas siguen generando la mitad, hasta una hora. Con **P** abres *Mis propiedades*: negocios, mejoras, tus coches, un resumen de lo ganado y el GPS.

**Tus coches.** Empiezas con un sedán propio aparcado frente a casa. Los coches propios (el de serie y los que compras en Autos Velasco) no son robo: subir a ellos nunca da estrellas; solo robar uno ajeno. Puedes tener varios, incluso del mismo modelo, y cada uno con su diseño: pintura (16 colores), segundo color, dibujo (liso, franjas dobles, racing o bicolor) y acabado (brillo, metalizado o mate), 300 por cambio desde *P › Mis coches*. Desde el ordenador de casa te lo sacan a la puerta gratis; en la calle, un mecánico te lo trae por 250.

**Vestidor.** En tu casa: parte de arriba (camiseta, polo, camisa, sudadera o tirantes), gorro (gorra, gorra hacia atrás, gorro de lana o sombrero), pantalón largo o short, zapatillas, tono de piel, peinado y color de pelo, cada uno con su color. También hay conjuntos completos.

**Mapa y GPS.** La tecla **M** abre el mapa de la ciudad. Elige un destino de la lista (W/S y E) o haz clic en cualquier punto: la ruta se calcula por las calles y se dibuja en morado en el radar, con la distancia debajo.

**Código secreto.** En el ordenador de tu casa, la última opción del menú (`>_`) abre una terminal. Escribe `WTASECRET` y pulsa Enter. También funciona tecleándolo de corrido mientras juegas. Da 10 millones de dólares, todas las armas con munición infinita, un vehículo de cada modelo, motos incluidas (propios, sin estrellas), los doce negocios al nivel máximo, salud y chaleco llenos y, en el modo historia, la historia completada con todos los bancos abiertos.

**Armas.** Puños, pistola (400), subfusil (2.200), escopeta (3.200), rifle de asalto (6.500) y lanzacohetes (25.000). Cada arma viene con dos cargadores; luego la munición se compra por cajas. El chaleco (600) absorbe el 70 % del daño. A partir de tres estrellas la policía dispara.

**Muerte y arresto.** Reapareces en el hospital o en la comisaría y pagas el 10 % de tu dinero (como mucho 5.000). Pierdes el botín que no habías asegurado, y si estabas en una misión, falla.

## Vehículos

Doce modelos (diez coches y dos motos) con física propia (masa, tracción, agarre, suspensión y medidas). Todos se ajustaron con un banco de pruebas automático que comprueba aceleración, frenada, curvas y slalom sin volcar, y que el freno de mano derrapa sin hacer trompo.

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
| Vespino | Scooter | trasera | 6,6 s | 126 km/h | 1.500 |
| Rayo | Moto deportiva | trasera | 2,8 s | 224 km/h | 12.000 |
| Taxi y Patrulla | Solo se roban | trasera | | | |

**Motos.** Se compran en Autos Velasco (hay un Vespino aparcado cerca de casa para probarlo) y el código secreto también te las da. El piloto va a la vista y la moto se inclina en las curvas según la velocidad. Por dentro usan cuatro ruedas físicas muy juntas, dos por eje, con más inercia de giro y un estabilizador más fuerte, así que no se caen solas; la inclinación es visual. Aguantan menos golpes que un coche.

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
| E | entrar en edificios, comprar, atracar, misiones | |
| M | mapa y ruta GPS | mapa y ruta GPS |
| P | mis negocios y coches | mis negocios y coches |
| TAB (mantener) o 1-6 | rueda de armas | |
| R | recargar | enderezar el coche volcado |
| Enter | saltar diálogo | saltar diálogo |
| T (mantener) | acelerar el reloj | |
| Esc | pausa | |

Los menús de las tiendas se manejan con W/S y E (o las teclas 1-9), y se cierran con Q.

## Rendimiento

En el menú de pausa, el botón **Gráficos** cambia entre Auto, Alta, Media y Baja, y **F3** muestra los FPS. En Auto el juego empieza en Media y, si no llega a unos 40 FPS durante varios segundos, baja solo a Baja (y vuelve a Media cuando sobra margen).

| | Alta | Media | Baja |
|---|---|---|---|
| Resolución interna | hasta 1,5× | 1× | 0,7× |
| Antialiasing (MSAA) | sí (al recargar) | no | no |
| Sombras | 2048, suaves, cada fotograma | 1024, cada 2 fotogramas | no |
| Barniz de los coches | sí | no | no |
| Distancia de visión | 650 m | 560 m | 430 m |
| Tráfico / peatones | 12 / 10 | 10 / 8 | 7 / 5 |

Además, en todas las calidades: las luces de los interiores solo existen cuando estás dentro, el túnel se ilumina sin luces puntuales, las piezas de cada coche se fusionan por material (menos de la mitad de llamadas de dibujo) y el reflejo del cielo se regenera como mucho cada 4 segundos.

## Aspecto

Todo es procedural: no hay modelos ni imágenes externas. Los personajes (jugador, peatones, guardias, cajeros y policías) son figuras de 1,80 m con codos, rodillas, cara y ropa intercambiable. Los coches usan carrocerías extruidas desde un perfil lateral, con pintura barnizada que refleja el cielo. La ciudad tiene seis estilos de fachada (hormigón, ladrillo, cristal, moderno, nave industrial y vivienda con tejado), edificios orientados a su calle aunque sea curva, árboles, farolas, semáforos por acceso, una colina con bosque y el mar con barcos. Los bancos, las tiendas y tu casa tienen edificio e interior propios. Sigue siendo estilizado: el fotorrealismo necesitaría modelos y texturas hechos a mano.

## Estructura

```
index.html                Canvas, HUD, menús y pantalla de inicio
style.css                 Estilos del HUD, radar, rueda de armas, tiendas y menú principal
js/main.js                Arranque, modos, explosiones, muerte/arresto y bucle principal
js/GameState.js           Dinero, armas, negocios, coches, progreso y guardado
js/Missions.js            Guion del modo historia y lógica de objetivos
js/Interiors.js           Interiores de casa, tiendas y bancos (se construyen fuera del mapa)
js/Properties.js          Negocios, mejoras, menú de propiedades, personalización de coches y vestidor
js/MapView.js             Mapa completo con barrios y ruta por las calles (A*)
js/HumanModel.js          Figura humana articulada y vestuarios
js/NPC.js                 Guardias, policías, cajeros, clientes y peatones
js/Textures.js            Texturas procedurales (fachadas, mármol, parqué, baldosas...)
js/Locations.js           Lugares de la ciudad, letreros, marcadores y menús de compra
js/Heists.js              Atracos dentro de tiendas y bancos, botín y enfriamiento
js/Menus.js               Menú de tienda manejable con teclado o ratón
js/PlayerController.js    Personaje, armas y cámara en tercera persona
js/VehicleController.js   Catálogo de vehículos y física RaycastVehicle con estabilizador
js/InteractionSystem.js   Entrar y salir de vehículos
js/AITraffic.js           Tráfico por la red de calles con semáforos y object pooling
js/WantedSystem.js        Estrellas, patrullas, disparos de la policía y arrestos
js/Environment.js         Red de calles (curvas, glorieta, túnel), barrios, edificios, mar y ciclo día/noche
js/Cheats.js              Código secreto (terminal del ordenador de casa)
js/Quality.js             Calidad gráfica, contador de FPS y ajuste automático
js/HUD.js                 Radar, dinero, velocímetro, objetivos y avisos
js/Input.js / Effects.js  Entrada con Pointer Lock y efectos visuales
tools/vehicle-test.mjs    Banco de pruebas de conducción en Node
```

Para depurar: `?autostart=story` o `?autostart=free` arranca directamente (añade `&fresh` para ignorar la partida guardada), `?time=21.5` empieza de noche y en la consola `game.simulate(60)` avanza un segundo de simulación.

## Limitaciones

No hay audio. Las motos no aparecen en el tráfico (no hay pilotos de IA en moto). El suelo es plano: la colina se cruza por el túnel o se rodea, no se sube. Solo tienen interior tu casa, las tiendas y los bancos; la armería, el concesionario y los negocios se usan desde la puerta. En los cruces el tráfico no siempre ve a quien llega por los lados y a veces choca. La ciudad ocupa unas cinco veces más superficie que la primera versión; con muchos peatones y un banco lleno de NPC, un ordenador modesto puede bajar de 60 FPS.
