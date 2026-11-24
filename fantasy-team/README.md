# FantasyTeam

Liga privada de Fantasy Fútbol para los jugadores de tu propio equipo. Es una web estática (HTML, CSS y JavaScript sin dependencias), pensada para usarse desde el móvil.

## Cómo abrirla

Abre `index.html` en el navegador. También puedes servir la carpeta:

```bash
cd fantasy-team && python3 -m http.server 8000
```

Y entra en http://localhost:8000. Para que el botón "Copiar invitación" incluya el enlace de la app, la web tiene que estar publicada en una dirección http(s), por ejemplo en GitHub Pages, Netlify o Vercel.

## Accesos

- **Mánagers:** código de liga + nombre de usuario + nombre del equipo. Si el usuario ya existe, el nombre del equipo tiene que coincidir para entrar.
- **Panel Admin:** botón de la esquina superior, contraseña `secretteam`.

La primera vez se carga una liga de ejemplo con 12 jugadores, 3 mánagers (`carlos` / Los Galácticos, `lucia` / Atlético Barrio, `pedro` / Real Sofá) y una jornada jugada. El código de la liga de ejemplo aparece en la pantalla de inicio.

## Funciones

**Admin:** crear y configurar la liga (nombre, presupuesto, Fútbol 5/7/11), código de invitación con mensaje listo para WhatsApp, alta/edición/baja de jugadores, carga de jornadas con cálculo automático de puntos, expulsión de mánagers, copia de seguridad (exportar/importar JSON) y reinicio de la liga.

**Mánagers:** mercado de fichajes con presupuesto, alineación en una cancha visual con varias formaciones, capitán x2, clasificación en vivo e historial de puntos por jornada y por jugador.

## Reglas de puntuación

| Concepto | Puntos |
| --- | --- |
| Jugar el partido (minutos > 0) | +2 |
| Gol de DEL / MED / DEF-POR | +4 / +5 / +6 |
| Asistencia | +3 |
| Portería a cero (POR/DEF que jugaron) | +4 |
| MVP del partido | +3 |
| Tarjeta amarilla / roja | -1 / -3 |
| Capitán | x2 |

Al guardar una jornada nueva se congelan las alineaciones y los capitanes de ese momento, así que cambiar la alineación después no altera puntos pasados.

## Decisiones de diseño

- Varios mánagers pueden tener al mismo jugador (con una sola plantilla real no habría jugadores para todos).
- Plantilla máxima: titulares del formato + suplentes (F5: 7, F7: 10, F11: 15). Solo puntúan los titulares.
- Fichar y vender se hace al valor de mercado actual del jugador.
- Los jugadores lesionados no se pueden fichar.

## Limitaciones importantes

- **Los datos viven en el `localStorage` de cada navegador.** Una liga creada en un móvil no existe en los demás, así que para jugar de verdad entre varios dispositivos hace falta un backend compartido (Supabase o Firebase, por ejemplo). Toda la persistencia está en `js/store.js` para que ese cambio quede acotado.
- **La contraseña de admin está en el código JavaScript** y cualquiera puede leerla. Con un backend, la validación debe hacerse en el servidor.

## Estructura

```
fantasy-team/
├── index.html
├── favicon.svg
├── css/styles.css
├── js/scoring.js   # reglas, formatos y formaciones (lógica pura)
├── js/store.js     # persistencia y datos de ejemplo
├── js/app.js       # interfaz
└── tests/scoring.test.js
```

## Pruebas

```bash
node fantasy-team/tests/scoring.test.js
```
