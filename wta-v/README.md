# WTA V · World Theft Auto (prototipo)

Prototipo jugable en el navegador de un sandbox urbano en tercera persona. Usa Three.js para el render y cannon-es (el fork mantenido de Cannon.js, con módulos ES) para la física. No tiene paso de build: las librerías se cargan desde jsDelivr con un import map.

## Cómo ejecutarlo

Los módulos ES no funcionan abriendo el archivo con `file://`, así que hace falta un servidor HTTP estático. Desde esta carpeta (`wta-v/`):

```
python3 -m http.server 8080
# o bien
npx serve .
```

Luego abre `http://localhost:8080`. La primera vez necesitas conexión a internet para descargar Three.js, cannon-es y las fuentes desde el CDN.

Parámetros de URL útiles para depurar: `?time=21.5` empieza a esa hora del día y `?autostart` arranca sin Pointer Lock. Desde la consola, `game` expone todo el estado y `game.simulate(60)` avanza un segundo de simulación sin renderizar.

## Controles

| Tecla | A pie | En vehículo |
|---|---|---|
| WASD | moverse | acelerar, frenar/marcha atrás, girar |
| Ratón | cámara orbital y apuntar | mirar alrededor (vuelve sola detrás del coche) |
| Shift | correr | |
| Espacio | saltar | freno de mano (derrape) |
| Clic izquierdo | disparar | |
| Clic derecho | apuntar (zoom al hombro) | |
| F | entrar / robar el vehículo cercano | salir (en marcha, saltas del coche) |
| TAB (mantener) | rueda de armas con cámara lenta | |
| 1-4 | cambio rápido de arma | |
| R | recargar | enderezar el coche volcado |
| T (mantener) | acelerar el reloj del día | |
| Esc | pausa | |

## Estructura

```
index.html                 Canvas WebGL, HUD, rueda de armas, estrellas, pantalla de inicio
style.css                  HUD estilo GTA: radar circular, velocímetro, estrellas, rueda
js/main.js                 Inicialización, materiales de contacto y bucle (lógica → física → render)
js/PlayerController.js     Personaje de cubos animado, armas por raycast, cámara orbital/persecución
js/VehicleController.js    RaycastVehicle de 4 ruedas: suspensión, motor, frenos, derrape, daños
js/InteractionSystem.js    Máquina de estados a pie ↔ conduciendo (tecla F), faros
js/AITraffic.js            Tráfico por waypoints (intersecciones) con semáforos y object pooling
js/WantedSystem.js         1-5 estrellas, patrullas con física, búsqueda, evasión y BUSTED
js/Environment.js          Ciudad procedural, red de calles, semáforos, ciclo día/noche
js/HUD.js                  Radar, velocímetro, arma, vida y avisos
js/Input.js                Teclado y ratón con Pointer Lock API
js/Effects.js              Chispas, trazadoras, agujeros de bala, fogonazo y humo (pools fijos)
```

## Notas de diseño

La física del coche usa `CANNON.RaycastVehicle`: cada rueda es un rayo con muelle y amortiguador, y la tracción es trasera. El freno de mano bloquea las ruedas traseras y baja su `frictionSlip`, que es lo que provoca el sobreviraje. Los valores de agarre salen de pruebas simuladas: con menos agarre trasero el coche hacía un trompo en vez de derrapar. En cannon-es los frenos son impulsos por paso y por rueda, por eso escalan con la masa del vehículo.

El tráfico y la policía comparten el mismo controlador de conducción (`driveTo`). Los civiles siguen el carril derecho entre intersecciones, respetan los semáforos y frenan ante obstáculos. La policía embiste en línea recta cuando la calle está despejada y, si no, va de cruce en cruce hacia la última posición conocida. Para perder las estrellas hay que salir del círculo de búsqueda del radar y no dejarse ver durante unos segundos.

Para mantener el rendimiento, los semáforos, las farolas y los árboles son `InstancedMesh`, la textura del suelo es un único canvas que también sirve de radar, y el número de luces de la escena nunca cambia (así Three.js no recompila shaders al disparar o al encender los faros).

## Limitaciones conocidas

No hay peatones ni audio. La policía no dispara: te arresta si te quedas parado a su lado. En los cruces el tráfico no detecta bien a quien viene por los lados, así que a veces hay choques. Los coches que vuelcan se reciclan solos.
