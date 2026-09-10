# Editor local

Editor visual para gestionar los artículos de Red Agraria sin tocar git ni
las carpetas a mano.

## Cómo abrirlo

- Doble clic en `admin/iniciar.command`, o
- `npm run admin` desde la terminal, en `web2/`.

Se abre solo en el navegador, en `http://127.0.0.1:4322`. Solo funciona en
este Mac (no requiere login) — el servidor no escucha en la red.

## Pestañas

- **Publicados** — los artículos ya en la web (`src/content/articulos/`).
  Editar o borrar hace `git pull` → escribe/borra el archivo → `commit` +
  `push` a `main`. El despliegue se dispara solo, igual que el resto del
  sistema.
- **Pendientes** — los borradores en revisión (`Pendientes/`, fuera del
  repo). Editar guarda el archivo sin más (no hay git de por medio).
  "Aprobar y publicar" lo mueve a `Listo-para-publicar/`; desde ahí lo
  recoge el vigilante local (`launchd`) y lo publica solo, normalmente en
  segundos. "Descartar" lo borra sin posibilidad de deshacer.
- **Listo para publicar** — la cola transitoria justo antes de publicarse.
  Normalmente debería estar vacía o vaciarse sola muy rápido. Si algo se
  queda atascado ahí, "Devolver a Pendientes" lo saca de la cola.

## Buscador y filtro

En Publicados y Pendientes: caja de búsqueda (por título/resumen) y un
desplegable para filtrar por tema.

## Editor visual del cuerpo

El cuerpo del artículo se edita con un editor visual (tipo Word), no
Markdown en crudo. Por detrás: al abrir, el Markdown se convierte a HTML
para mostrarlo; al guardar, el HTML se vuelve a convertir a Markdown.

Esto funciona bien para texto normal (párrafos, títulos, negrita, cursiva,
enlaces, listas, citas, bloques de código). Cosas menos habituales
(tablas, HTML incrustado) pueden salir algo distintas al volver a
Markdown — es una limitación conocida de convertir ida y vuelta.

La nota oculta de fuentes al final del artículo (`<!-- FUENTES: ... -->`,
que usa la investigación automática para que puedas comprobar en qué se
basó) se protege aparte: el editor visual nunca la toca ni la muestra, y
se vuelve a añadir automáticamente al guardar.

## Límites (a propósito, para mantenerlo simple)

- No crea artículos nuevos desde cero — eso ya lo cubre la investigación
  automática.
- No permite cambiar el nombre de archivo (el slug de la URL) de un
  artículo publicado, para no romper enlaces ya compartidos.
- Sin comprobación de build antes de publicar: si algo rompe el sitio, la
  Action de GitHub simplemente no despliega — no hay riesgo de dejar la
  web rota en producción.
