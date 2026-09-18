# ASCEND & CONNECT (A&C)

Plataforma web para recién egresados: búsqueda de empleo, publicación de ofertas por parte de empresas, perfil profesional con foto, postulaciones, códigos premium con aprobación manual, vista previa para reclutadores con lista de candidatos guardados, y un panel de administración completo.

## Stack

Frontend en HTML, CSS y JavaScript vanilla (sin frameworks). Backend en Node.js (módulos nativos `http`/`fs`, sin frameworks web) con **PostgreSQL** como base de datos real — los datos persisten entre reinicios y despliegues, a diferencia de una versión anterior que usaba un archivo JSON. Cualquier persona puede usar la plataforma desde su navegador, sin necesitar cuenta de ningún tipo.

La contraseña del panel de administración se verifica **en el servidor** (variable de entorno `ADMIN_PASSPHRASE`) y la sesión de administrador se guarda en una cookie `HttpOnly`: nunca queda visible en el código del navegador.

## Estructura

```
index.html            Estructura de la página y las vistas
css/styles.css         Paleta de colores, tipografía y layout
js/app.js              Toda la lógica de frontend, consume la API REST
server/server.js       Servidor HTTP: rutas de la API + archivos estáticos
server/store.js        Consultas a la base de datos (perfiles, ofertas, canjes,
                        postulaciones, candidatos guardados, sesiones de admin)
server/db.js           Conexión a Postgres y creación del esquema al arrancar
render.yaml            Configuración de despliegue en Render (web + Postgres)
```

## Cómo correrlo en tu computadora

Requiere Node.js 18+ y una base de datos Postgres (local o remota).

```
npm install
export DATABASE_URL="postgresql://usuario:password@localhost:5432/ascend_connect"
export ADMIN_PASSPHRASE="la-contraseña-que-quieras"
npm start
```

y luego visitar `http://localhost:3000`. El esquema de tablas se crea solo la primera vez que arranca.

## Cómo subirlo a internet (para que cualquiera lo use)

1. Creá una cuenta en [render.com](https://render.com) (podés entrar con GitHub).
2. **New +** → **Blueprint** → conectá el repo `emilionamihas/Emilio`, rama `claude/ascend-connect-platform-odli3v`.
3. Render lee `render.yaml` y crea **dos cosas solo**: el servicio web y una base de datos Postgres gratuita, ya conectados entre sí. Apretás **Apply** y listo.
4. En unos minutos tenés una URL pública real. Cualquiera que entre puede crear su perfil, publicar o buscar empleo, postularse, etc. — sin cuenta de Claude ni de nada.

**Contraseña del panel de administración:** el Blueprint le genera una automáticamente por seguridad (no queda "ACwork" ni ningún valor fijo en el código). Para verla o cambiarla por una que prefieras: en el dashboard de Render, entrá a tu servicio → **Environment** → variable `ADMIN_PASSPHRASE`.

**Sobre los datos:** al usar Postgres administrado por Render (no un archivo en el disco del servicio), los datos sobreviven a reinicios y a nuevos despliegues. El plan gratuito de la base de datos de Render expira a los 30 días si no lo pasás a un plan pago — es el único límite real a tener en cuenta para uso de largo plazo.

## API

| Método | Ruta                                       | Quién                | Descripción |
|--------|---------------------------------------------|----------------------|-------------|
| GET    | `/api/jobs`                                  | Público              | Ofertas aprobadas (`?area=&modalidad=&exclusivo=true`) |
| POST   | `/api/jobs`                                  | Público (empresas)   | Publica una oferta, queda pendiente de revisión |
| POST   | `/api/profiles`                              | Público              | Crea o actualiza un perfil (upsert por `id`) |
| GET    | `/api/profiles/:id`                          | Público              | Obtiene un perfil completo |
| PUT    | `/api/profiles/:id`                          | Público              | Actualiza un perfil |
| POST   | `/api/profiles/:id/redeem`                   | Público              | Envía un código premium (`{code}`), queda pendiente |
| GET    | `/api/redemptions?profileId=`                | Público              | Estado de los propios canjes enviados |
| POST   | `/api/applications`                          | Público              | Postularse a una oferta (`{jobId, profileId}`) |
| GET    | `/api/applications?profileId=`               | Público              | Ofertas a las que ya se postuló ese perfil |
| GET    | `/api/saved-candidates`                      | Público              | Lista de candidatos guardados (vista de reclutador) |
| POST   | `/api/saved-candidates`                      | Público              | Guarda un candidato (`{profileId}`) |
| DELETE | `/api/saved-candidates/:profileId`           | Público              | Quita un candidato guardado |
| POST   | `/api/admin/login`                           | —                    | `{passphrase}` → cookie de sesión de administrador |
| POST   | `/api/admin/logout`                          | Admin                | Cierra la sesión |
| GET    | `/api/admin/applications`                    | Admin                | Todas las postulaciones |
| POST   | `/api/admin/applications/:id/status`         | Admin                | Cambia estado (`nueva`/`contactada`/`cerrada`) |
| DELETE | `/api/admin/applications/:id`                | Admin                | Elimina una postulación |
| GET    | `/api/admin/redemptions`                     | Admin                | Todas las solicitudes de canje |
| POST   | `/api/admin/redemptions/:id/approve`         | Admin                | Aprueba (activa Premium en el perfil) |
| POST   | `/api/admin/redemptions/:id/reject`          | Admin                | Rechaza |
| DELETE | `/api/admin/redemptions/:id`                 | Admin                | Elimina la solicitud |
| GET    | `/api/admin/jobs`                            | Admin                | Todas las ofertas (cualquier estado) |
| POST   | `/api/admin/jobs`                            | Admin                | Carga una oferta ya aprobada |
| POST   | `/api/admin/jobs/:id/approve` / `/reject`    | Admin                | Modera una oferta pendiente |
| DELETE | `/api/admin/jobs/:id`                        | Admin                | Elimina una oferta |
| GET    | `/api/admin/profiles`                        | Admin                | Todos los perfiles registrados |
| DELETE | `/api/admin/profiles/:id`                    | Admin                | Elimina un perfil |

## Funcionalidades

- **Búsqueda de empleo**: filtros por área, modalidad y ofertas exclusivas para recién egresados.
- **Publicar oferta**: las empresas cargan su vacante, que queda pendiente hasta que un administrador la aprueba.
- **Perfil de egresado**: nombre, correo, teléfono, dirección, universidad, carrera, año de graduación, habilidades, CV/portafolio, biografía y foto de perfil.
- **Código premium**: se canjea un código y queda pendiente hasta que un administrador lo aprueba manualmente — no hay una lista de códigos válidos visible en el cliente.
- **Postulaciones**: al postularse a una oferta, queda un registro con los datos de contacto del candidato y de la empresa, para que el administrador cierre el contacto.
- **Vista de reclutador**: previsualización completa del perfil, con un botón para "contactar y guardar" al candidato en una lista, y "Ver Perfil" para revisar el detalle completo de cualquier candidato guardado.
- **Panel de administración**: pestañas de postulaciones, canjes premium, ofertas por revisar, ofertas publicadas y perfiles registrados — todo con opción de aprobar, rechazar o eliminar.

## Próximos pasos sugeridos

Esta versión ya resuelve lo esencial: persistencia real, acceso sin restricciones de cuenta, y autenticación de administrador del lado del servidor. Lo siguiente, si el proyecto crece, sería: autenticación real de egresados (hoy la "sesión" es un ID generado en el navegador, sin contraseña), envío de correos automáticos en vez de enlaces `mailto:`, y paginación en las listas del panel de administración cuando haya muchos registros.
