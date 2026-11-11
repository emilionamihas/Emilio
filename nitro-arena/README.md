# Nitro Arena

Fútbol con coches en 3D hecho con Vite, TypeScript, Three.js y Rapier (`@dimforge/rapier3d-compat`). La física corre a 120 Hz, igual que el servidor del juego de referencia, y el render se interpola para ir fluido a 60, 144 o 240 Hz. El estilo es Low-Poly con sombreado plano para mantener la tasa de frames estable.

## Puesta en marcha

Necesitas Node 18 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173`). Para una build de producción:

```bash
npm run build
```

```bash
npm run preview
```

## Controles por defecto

Todo se puede reasignar en **Ajustes > Asignación**, y el perfil se guarda en `localStorage`.

| Acción | Teclado / ratón | PlayStation | Xbox |
| --- | --- | --- | --- |
| Acelerar | W, ↑ | R2 | RT |
| Freno / reversa | S, ↓ | L2 | LT |
| Girar / yaw | A D, ← → | Stick izq. X | Stick izq. X |
| Pitch | W S, ↑ ↓ | Stick izq. Y | Stick izq. Y |
| Salto | Espacio, clic der. | Cruz | A |
| Boost | Clic izq., F | Círculo | B |
| Powerslide | Shift izq. | Cuadrado | X |
| Air Roll libre | Shift izq. | Cuadrado | X |
| Air Roll izq. / der. | Q / E | L1 / R1 | LB / RB |
| Ball Cam | C | Triángulo | Y |
| Mirar alrededor | J L I K | Stick der. | Stick der. |
| Marcador | Tab | Share / Create | View |
| Reiniciar balón (juego libre) | R | R3 | RS |
| Pausa | Esc | Options | Menu |

Los gatillos son analógicos (acelerador y freno progresivos). Los sticks tienen zona muerta, sensibilidad y zona muerta de dodge configurables.

## Qué incluye

**Conducción.** Un raycast vehicle propio con cuatro rayos de suspensión, fricción lateral que depende del deslizamiento, fuerza adhesiva hacia la superficie (más intensa en paredes) y giro basado en la curvatura medida en función de la velocidad. Con eso el coche sube por las rampas y paredes solo con acelerador. El powerslide baja la fricción lateral al 10 % y conserva el momento, así que los giros de 180° salen solos.

**Saltos y dodges.** Salto con fuerza extra mientras mantienes el botón (hasta 0,2 s), ventana de 1,25 s para el segundo salto, dodges en ocho direcciones con impulso escalado por la velocidad, amortiguación vertical durante el flip, cancelación del flip tirando del stick en sentido contrario y bloqueo de pitch tras el dodge. El speedflip, el half-flip, el wavedash, el wall dash, el zap dash y el fast aerial no tienen código propio: salen de esas mismas reglas. El half-flip, el wavedash, el flip reset y los pinches están comprobados en simulaciones headless; el resto depende de la misma lógica pero no tiene test dedicado.

**Flip reset.** Los rayos de las ruedas también detectan el balón. Si las cuatro ruedas tocan cualquier superficie en el aire (balón, pared o techo), recuperas el dodge sin temporizador.

**Contacto coche-balón.** Además de la colisión de Rapier (coche 180, balón 30, fricción 2,0 y restitución 0), se aplica el impulso extra que depende de la velocidad relativa, con la misma fórmula que ha medido la comunidad. Como el coche es un cuerpo rígido que gira, los flicks (musty, breezi, scoop) y los toques suaves de los air dribbles salen de la propia física.

**Pinches.** Cuando el balón queda atrapado entre el coche y una superficie (pared, suelo o poste), la velocidad de cierre se libera en la dirección tangente de menor resistencia.

**Arena.** Octógono con chaflanes a 45°, esquinas redondeadas, rampas curvas entre suelo y pared y entre pared y techo, y porterías profundas con postes y larguero sólidos. Es una sola malla que sirve a la vez de collider trimesh y de geometría visible. Hay 36 boost pads: 6 grandes (100 %, 10 s) y 30 pequeños (12 %, 4 s).

**Reglas.** Cinco alineaciones de saque oficiales al azar, reloj de 5 minutos que solo termina cuando el balón toca el suelo, prórroga con gol de oro, explosión de gol que empuja a los coches cercanos, demoliciones en estado supersónico (más del 95 % de la velocidad máxima, con estela) y respawn a los 3 segundos.

**Cámara.** Ball Cam con el horizonte estabilizado y cámara de coche que sigue al vehículo por paredes y techo. Tiene los mismos ajustes del menú del juego de referencia: FOV, distancia, altura, ángulo, rigidez, velocidad de giro y velocidad de transición. Un indicador en el borde de la pantalla marca el balón cuando sale del campo de visión, y otro indicador en el suelo proyecta su posición y su altura.

**Modos.** 1v1, 2v2 y 3v3 contra bots (Novato, Pro y All-Star) y un juego libre para entrenar mecánicas con boost infinito opcional.

## Arquitectura

```
src/
  config/      Constantes físicas calibradas (uu convertidas a metros)
  core/        GameLoop, PhysicsEngine, InputManager, StorageManager, tipos
  controls/    GamepadHandler, KeyboardHandler, ControlMapper
  entities/    Car, Ball, BoostPad, Arena
  camera/      CameraController, CameraSettings
  game/        Game (orquestador), Match (reglas), Interactions, BotController, GameSettings
  fx/          Particles (InstancedMesh), Trail (estela supersónica)
  ui/          HUD, SettingsMenu, KeybindMenu, Scoreboard, MainMenu, estilos
```

El orden de cada tick físico es este: entrada del jugador y de los bots, reglas de partida, fuerzas de cada coche (suspensión, conducción, saltos y control aéreo), paso de Rapier, interacciones (impulso de contacto, pinches, bumps y demoliciones), límites de velocidad y recogida de boost.

Para depurar, en la consola del navegador puedes leer `nitro.debugInfo`.

## Límites conocidos

La física no es una copia exacta del juego original, porque su código (un Bullet modificado) no es público. Las constantes vienen de mediciones de la comunidad (RLBot, RocketSim) y se han validado con simulaciones headless: velocidad máxima sin boost de 14,1 m/s, supersónico a 22 m/s, salto completo de unos 2,5 m y dodge frontal de +5 m/s. Aun así, el tacto no será idéntico en cada situación.

El pinch es un modelo explícito. Rapier no sobrecorrige la penetración como Bullet, que es lo que produce el pinch en el original, así que se reproduce con la velocidad de cierre real del contacto.

En un techo plano te caes, igual que en el original. Solo te mantienes pegado mientras la curvatura de las rampas te dé fuerza centrípeta.

Los menús se manejan con el ratón. El mando sirve para jugar, pausar y reasignar controles, pero no para navegar por los menús.
