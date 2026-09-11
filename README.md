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
