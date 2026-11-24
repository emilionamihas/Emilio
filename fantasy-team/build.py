#!/usr/bin/env python3
"""Empaqueta FantasyTeam en un único archivo HTML.

    python3 build.py                 -> FantasyTeam.html (documento completo, se abre con doble clic)
    python3 build.py --embed RUTA    -> fragmento para publicar como Artifact en claude.ai
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent
css = (ROOT / 'css/styles.css').read_text()
js = '\n'.join((ROOT / f'js/{n}.js').read_text() for n in ('scoring', 'store', 'app'))
favicon = (ROOT / 'favicon.svg').read_text().replace('"', "'").replace('\n', '').replace('#', '%23')
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800'
         '&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">')
body = ('<div id="app"></div><div id="overlay-root"></div><div id="toasts" aria-live="polite"></div>\n'
        '<noscript><p style="padding:24px;color:#fff">FantasyTeam necesita JavaScript activado.</p></noscript>\n')
js_safe = js.replace('</script', '<\\/script')

if '--embed' in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index('--embed') + 1])
    out.write_text(f'<title>FantasyTeam</title>\n{fonts}\n<style>\n{css}\n</style>\n{body}'
                   f'<script>window.FT_EMBEDDED = true;</script>\n<script>\n{js_safe}\n</script>\n')
else:
    out = ROOT / 'FantasyTeam.html'
    out.write_text(f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0f1c">
<title>FantasyTeam</title>
<link rel="icon" href="data:image/svg+xml,{favicon}">
{fonts}
<style>
{css}
</style>
</head>
<body>
{body}<script>
{js_safe}
</script>
</body>
</html>
''')
print('Generado', out, f'({out.stat().st_size // 1024} KB)')
