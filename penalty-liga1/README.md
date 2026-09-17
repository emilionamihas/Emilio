# Penalty Liga 1 ⚽

Juego arcade de tanda de penales estilo Poki, ambientado en el fútbol peruano.
Hecho con **Phaser 3 + Vite**, en 2.5D (canvas 2D con trucos de perspectiva:
escalado del balón, paralaje de tribuna, portería "lejana"), sin dependencias
de assets externos: todo el arte (escudos, balón, portero, estadio) se genera
por código con `Phaser.Graphics`.

## ⚠️ Nota legal sobre nombres y escudos

Este proyecto usa los **nombres reales** de clubes de la Liga 1 peruana (uso
informativo/de fans, sin fines comerciales), pero **no reproduce ningún escudo
oficial**. Los escudos que ves en el juego son diseños **100% originales**,
generados por código a partir de los colores de cada club (ver
`src/data/CrestFactory.js`). Esto evita infringir las marcas registradas de
los clubes y de la Federación Peruana de Fútbol. Si en algún momento se
consigue una licencia oficial, basta con reemplazar la generación de texturas
por imágenes reales sin tocar el resto del código (misma texture key
`crest_<id>`). Jugadores y atributos de plantilla son ficticios.

## Por qué Phaser 3 (2.5D) y no un motor 3D real

Para un arcade de penales, la mecánica central (swipe de tiro, timing del
portero, IA, torneo) es lógica 2D. Meter Three.js/Unity implica modelar y
animar jugadores/estadios en 3D real, un costo de desarrollo 3-4x mayor sin
aportar jugabilidad extra. Phaser 3 + trucos de perspectiva (escalado,
paralaje, sombras) da la sensación de profundidad al costo de un juego 2D:
ligero, rápido de cargar y con excelente soporte táctil, ideal para el
formato "arcade Poki".

## Arquitectura y estructura de archivos

```
penalty-liga1/
├── index.html                 Punto de entrada HTML
├── css/style.css               Estilos del contenedor responsivo del canvas
├── vite.config.js              Configuración de build (Vite)
├── package.json
└── src/
    ├── main.js                 Bootstrap de Phaser.Game (config, lista de escenas)
    ├── config/
    │   └── gameConfig.js        Constantes: tamaño de mundo, rect. de portería,
    │                            grid 3x3, rondas por tanda, niveles de dificultad
    ├── data/
    │   ├── teams.js             Datos de 15 equipos (nombres reales, colores,
    │   │                        stats de Fuerza/Precisión/Portero, plantilla)
    │   └── CrestFactory.js      Generador de escudos ORIGINALES por canvas
    ├── entities/
    │   ├── Ball.js              Balón: vuelo en curva de Bézier, efecto/spin,
    │   │                        encogido de profundidad, estela en tiros fuertes
    │   └── Goalkeeper.js        Portero: animación de estirada hacia una zona
    ├── systems/
    │   ├── ShotInputSystem.js   Captura swipe/drag → potencia, dirección,
    │   │                        curva (efecto) y margen de error
    │   ├── AIShooter.js         Genera un disparo "virtual" para equipos CPU
    │   ├── GoalkeeperAI.js      Decide zona de estirada IA + resuelve atajada
    │   ├── MatchState.js        Rondas, marcador, muerte súbita, victoria anticipada
    │   ├── TournamentManager.js Bracket de eliminación directa + simulación
    │   │                        instantánea de partidos CPU vs CPU
    │   ├── AudioManager.js      Comentarista (Web Speech API) + hook de audio
    │   │                        ambiente opcional (public/audio/hinchada.mp3)
    │   └── SaveManager.js       Persistencia en localStorage (settings, high score)
    ├── ui/
    │   ├── GoalZones.js         Geometría del grid 3x3 de la portería (9 zonas)
    │   ├── HUD.js                Marcador, ronda, texto de comentarista
    │   └── Stadium.js            Fondo de estadio genérico + fuegos artificiales
    └── scenes/
        ├── BootScene.js
        ├── PreloadScene.js       Genera texturas (balón, portero, escudos)
        ├── MainMenuScene.js      Menú principal (Torneo / Local / Práctica)
        ├── TeamSelectScene.js    Selección de equipo (torneo y 2 jugadores)
        ├── TournamentBracketScene.js  Llave visible, simula CPU, lanza tu partido
        ├── ShootoutScene.js      Mecánica principal de penales (1v1, IA o local)
        ├── PracticeScene.js      Desafío rápido: dianas por zona + viento + barrera
        └── ResultScene.js        Pantalla de campeón / ganador local / puntaje
```

### Flujo de pantallas

```
MainMenu ──► TeamSelect(torneo) ──► TournamentBracket ──► Shootout ──► TournamentBracket ──► ... ──► Result (campeón)
        ├──► TeamSelect(P1) ──► TeamSelect(P2) ──► Shootout(local) ──► Result (ganador local)
        └──► Practice ──► Result (puntaje)
```

## Mecánicas implementadas

- **Tiro por swipe/drag**: arrastra desde el balón hacia la portería. La
  **velocidad** del trazo define la potencia; la **curvatura** del trazo
  define el efecto (comba) del balón. A mayor potencia, mayor margen de
  error (más impreciso), modulado por la precisión del equipo.
- **Portero**: grid de 9 zonas (3x3). Contra la IA, el portero "lee" el tiro
  con una probabilidad ligada a su stat de Portero y a la dificultad. Cuando
  tú defiendes, eliges la zona con el teclado (`7-8-9 / 4-5-6 / 1-2-3`, como
  un numpad) o tocando la zona en pantalla, **mientras el balón todavía está
  en el aire**: lanzarte muy tarde reduce la atajada, y el propio efecto del
  disparo puede hacer que adivines mal si te apresuras.
- **Torneo Copa Liga 1**: bracket de 8 equipos (Cuartos → Semifinal → Final),
  con llave visible antes y después de cada partido. Los partidos en los que
  no participas se simulan al instante según las estadísticas de cada CPU,
  para no obligarte a jugar toda la llave.
- **Muerte súbita**: si hay empate tras las rondas regulares, un tiro por
  equipo hasta romper el empate (con detección de victoria anticipada, igual
  que en un partido real).
- **Multijugador local (2 jugadores, mismo dispositivo)**: alternan quién
  patea (arrastre con mouse/touch) y quién defiende (teclado), turno a turno.
- **Práctica / Desafío Rápido**: 10 tiros libres, dianas con puntaje por zona
  (esquinas = 50, laterales = 30, centro = 10), viento variable que desvía el
  disparo, y una barrera dinámica que puede bloquear tiros débiles cercanos.
- **Comentarista arcade**: usa la Web Speech API del navegador (sin clips de
  audio con derechos de autor) para narrar "¡GOOOL!", "¡Atajó el portero!",
  "¡A la tribuna!". Si el navegador no soporta síntesis de voz, el texto se
  muestra igual en pantalla.

## No incluido en esta primera versión (Fase 2)

- **Multijugador en línea** (WebSockets/PeerJS, salas por código o
  matchmaking): requiere un servidor de señalización/salas, que es un
  proyecto de infraestructura aparte. La arquitectura ya está desacoplada
  (`ShootoutScene` no sabe si el rival es local o de red) para poder añadir
  un `NetPlayerController` más adelante sin rehacer la mecánica de juego.
- Audio real de cánticos de hinchada: el `AudioManager` ya intenta cargar
  `public/audio/hinchada.mp3` si existe (lo reproduce en loop); si no lo
  agregas, el juego sigue funcionando en silencio ambiental.

## Cómo correrlo localmente

Requiere Node.js 18+.

```bash
cd penalty-liga1
npm install
npm run dev
```

Abre la URL que muestra la terminal (por defecto `http://localhost:5173`).

## Cómo compilar para producción

```bash
npm run build
```

Esto genera una carpeta `dist/` con archivos estáticos (HTML/CSS/JS). Puedes
previsualizar el build con:

```bash
npm run preview
```

## Cómo desplegarlo en la web

Al ser un sitio 100% estático, cualquiera de estas opciones funciona:

- **Netlify / Vercel**: conecta el repositorio, comando de build `npm run
  build`, carpeta de publicación `dist`.
- **GitHub Pages**: sube el contenido de `dist/` a la rama `gh-pages` (o usa
  una GitHub Action con `actions/deploy-pages`).
- **Cualquier hosting estático**: sube el contenido de `dist/` tal cual.

## Extender el juego

- **Agregar un equipo**: añade una entrada en `src/data/teams.js` (nombre,
  colores, stats, plantilla). El escudo se genera solo.
- **Cambiar dificultad de la IA**: ajusta `DIFFICULTY` en
  `src/config/gameConfig.js`.
- **Sumar audio real**: coloca `public/audio/hinchada.mp3` (cánticos en
  loop); `AudioManager` lo detecta y reproduce automáticamente.
- **Multijugador online (Fase 2)**: implementar un servidor Socket.io/PeerJS
  que sincronice los objetos `shot` que ya produce `ShotInputSystem` (son
  serializables) y las zonas de `GoalkeeperAI`/input humano; sustituir la
  IA en `ShootoutScene._resolveShot` por eventos de red.
