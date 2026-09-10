# Editor local

Editor visual mínimo para editar o borrar artículos ya publicados
(`src/content/articulos/`), sin tocar git a mano.

## Cómo abrirlo

- Doble clic en `admin/iniciar.command`, o
- `npm run admin` desde la terminal, en `web2/`.

Se abre solo en el navegador, en `http://127.0.0.1:4322`. Solo funciona en
este Mac — el servidor no escucha en la red, así que no hace falta login.

## Qué hace

- Lista los artículos publicados.
- Editar: cambia título, resumen, tema, fecha o cuerpo, y al guardar hace
  `git pull` (por si hay cambios nuevos de la nube o del pipeline),
  reescribe el archivo, y `commit` + `push` a `main` — se despliega solo,
  igual que el resto del sistema.
- Borrar: quita el archivo del repo con `git rm`, commit y push.

## Límites (a propósito, para mantenerlo simple)

- No crea artículos nuevos — eso ya lo cubre la investigación automática.
- No permite cambiar el nombre de archivo (el slug de la URL), para no
  romper enlaces ya compartidos.
- No hace una comprobación de build antes de publicar: si algo rompe el
  sitio, la Action de GitHub simplemente no despliega — no hay riesgo de
  dejar la web rota en producción.
