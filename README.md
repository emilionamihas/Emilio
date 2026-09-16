# ASCEND & CONNECT (A&C)

Plataforma web para recién egresados: búsqueda de empleo con filtros, registro de perfil profesional, sistema de códigos premium y vista previa del perfil tal como la verían las empresas.

## Stack

Frontend en HTML, CSS y JavaScript vanilla (sin frameworks ni paso de build) y un backend en Node.js usando solo módulos nativos (`http`, `fs`), sin dependencias externas que instalar. Los perfiles, el estado premium y el catálogo de empleos se sirven desde el servidor; el navegador guarda únicamente el ID del perfil actual en `localStorage`, a modo de sesión simple (no hay autenticación con usuario y contraseña todavía).

## Estructura

```
index.html            Estructura de la página y las cuatro vistas principales
css/styles.css         Paleta de colores, layout y componentes
js/app.js              Navegación entre vistas y consumo de la API del backend
server/server.js       Servidor HTTP: API REST + archivos estáticos
server/store.js        Persistencia de perfiles y validación de códigos premium
server/jobs.js         Catálogo de ofertas de empleo
data/db.json           Base de datos en JSON (se genera sola, no se versiona)
```

## Cómo correrlo

Requiere Node.js 18 o superior. No hay dependencias que instalar.

```
npm start
```

y luego visitar `http://localhost:3000`. El puerto se puede cambiar con la variable de entorno `PORT`.

## Cómo subirlo a internet (para que cualquiera lo use, sin cuenta de Claude)

La forma más simple, gratis para empezar, es [Render](https://render.com):

1. Creá una cuenta en render.com (podés entrar directo con tu cuenta de GitHub).
2. En el dashboard: **New +** → **Blueprint**.
3. Conectá tu cuenta de GitHub y elegí el repositorio `emilionamihas/Emilio`, rama `claude/ascend-connect-platform-odli3v`.
4. Render va a detectar el archivo `render.yaml` que ya está en el repo y va a configurar todo solo (servicio web, `npm start`, plan gratuito). Solo confirmá con **Apply**.
5. En unos minutos te da una URL pública (algo como `https://ascend-connect.onrender.com`) que ya podés mandarle a cualquiera. No necesitan cuenta de Claude ni pertenecer a ninguna organización: entran directo.

**Importante antes de que confíes en esto para datos reales:** el plan gratuito de Render no tiene disco persistente. Ahora mismo el servidor guarda los perfiles en un archivo (`data/db.json`); en el plan gratuito ese archivo se borra cada vez que el servicio se reinicia (se reinicia solo, por inactividad, o cada vez que hacés un nuevo deploy). Sirve perfecto para probar el flujo completo con tu amigo ahora mismo, pero si esto va a manejar perfiles reales que la gente espera no perder, el siguiente paso es cambiar el almacenamiento a una base de datos de verdad (Render y otros ofrecen Postgres gratis) — avisame cuando quieras y lo armamos.

## API

| Método | Ruta                          | Descripción                                    |
|--------|-------------------------------|-------------------------------------------------|
| GET    | `/api/jobs`                   | Lista ofertas (`?area=&modalidad=&exclusivo=true`) |
| POST   | `/api/profiles`               | Crea un perfil de egresado                      |
| GET    | `/api/profiles/:id`           | Obtiene un perfil                               |
| PUT    | `/api/profiles/:id`           | Actualiza un perfil                             |
| POST   | `/api/profiles/:id/redeem`    | Canjea un código premium (`{ "code": "AC2026" }`) |

La validación de los códigos promocionales ocurre del lado del servidor: ya no es posible activar el Pase Premium editando el almacenamiento del navegador.

## Funcionalidades

- **Header/Navbar**: logo tipográfico A&C, navegación a las cuatro secciones y botón de "Pase Premium".
- **Búsqueda de empleo**: filtros por área, modalidad (remoto/presencial/híbrido) y ofertas exclusivas para recién egresados.
- **Perfil de egresado**: formulario con nombre completo, dirección, universidad, carrera, año de graduación, habilidades, enlace a CV/portafolio y biografía.
- **Códigos premium**: canje de códigos (`AC2026`, `A&CVIP`, `PREMIUM2026`) que activan la insignia "Perfil Destacado" y prioridad en el buscador de las empresas.
- **Vista para reclutadores**: previsualización de cómo una empresa vería el perfil del egresado, con opción de "Contactar candidato".

## Próximos pasos sugeridos

Esta versión ya tiene backend real con validación server-side de los códigos premium. Para producción todavía haría falta: autenticación con usuario y contraseña (hoy la "sesión" es solo un ID guardado en el navegador, sin verificación de identidad), una base de datos real en lugar del archivo JSON, y un panel de administración para que las empresas publiquen sus propias vacantes.
