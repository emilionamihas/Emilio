# ASCEND & CONNECT (A&C)

Plataforma web para recién egresados: búsqueda de empleo con filtros, registro de perfil profesional, sistema de códigos premium y vista previa del perfil tal como la verían las empresas.

## Stack

Frontend estático sin dependencias de build: HTML, CSS y JavaScript vanilla. La persistencia del perfil y del estado premium se simula con `localStorage` en el navegador (no hay backend en esta primera versión).

## Estructura

```
index.html          Estructura de la página y las cuatro vistas principales
css/styles.css       Paleta de colores, layout y componentes
js/app.js            Navegación entre vistas, filtros de empleo, formulario de perfil,
                     canje de códigos premium y render de la vista de reclutador
```

## Cómo probarlo

No requiere instalación. Basta con abrir `index.html` en el navegador, o servirlo con cualquier servidor estático:

```
python3 -m http.server 8080
```

y luego visitar `http://localhost:8080`.

## Funcionalidades

- **Header/Navbar**: logo tipográfico A&C, navegación a las cuatro secciones y botón de "Pase Premium".
- **Búsqueda de empleo**: filtros por área, modalidad (remoto/presencial/híbrido) y ofertas exclusivas para recién egresados.
- **Perfil de egresado**: formulario con nombre completo, dirección, universidad, carrera, año de graduación, habilidades, enlace a CV/portafolio y biografía.
- **Códigos premium**: canje de códigos (`AC2026`, `A&CVIP`, `PREMIUM2026`) que activan la insignia "Perfil Destacado" y prioridad en el buscador de las empresas.
- **Vista para reclutadores**: previsualización de cómo una empresa vería el perfil del egresado, con opción de "Contactar candidato".

## Próximos pasos sugeridos

Esta versión resuelve el frontend completo con datos simulados. Para producción haría falta: backend con base de datos para perfiles y ofertas, autenticación real, validación de códigos promocionales del lado del servidor y un panel de administración para publicar vacantes.
