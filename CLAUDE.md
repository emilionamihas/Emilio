# Reglas del repositorio

## Una rama por proyecto

Cada vez que el usuario pida generar un proyecto nuevo (una app, un bot, una web, etc.):

1. Crea una rama nueva a partir de la rama por defecto del repositorio, nunca a partir de la rama de otro proyecto:
   `git fetch origin <rama-por-defecto> && git checkout -b <nombre-del-proyecto> origin/<rama-por-defecto>`
2. Usa un nombre de rama corto en kebab-case que describa el proyecto (por ejemplo `trading-bot`, `wia-app`).
3. Pon el proyecto en su propia carpeta en la raíz del repo.
4. Haz commit y push solo a esa rama: `git push -u origin <nombre-del-proyecto>`.
5. No hagas push a ramas de otros proyectos ni mezcles archivos de varios proyectos en la misma rama.

Si la sesión asigna una rama de desarrollo que ya contiene otro proyecto, avisa al usuario antes de empezar y crea la rama nueva para el proyecto nuevo.

Los cambios sobre un proyecto existente van en la rama de ese proyecto.
