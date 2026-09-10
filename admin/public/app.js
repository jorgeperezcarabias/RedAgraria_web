const app = document.getElementById('app');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

function mensaje(texto, tipo) {
  const div = document.createElement('div');
  div.className = `mensaje ${tipo}`;
  div.textContent = texto;
  return div;
}

async function vistaLista() {
  app.innerHTML = '<p class="cargando">Cargando artículos…</p>';
  let articulos;
  try {
    articulos = await api('/api/articulos');
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(mensaje(`No se pudo cargar la lista: ${e.message}`, 'error'));
    return;
  }

  app.innerHTML = '';
  if (articulos.length === 0) {
    app.innerHTML = '<p class="cargando">No hay artículos publicados todavía.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'lista';

  for (const articulo of articulos) {
    const li = document.createElement('li');
    li.className = 'fila';
    li.innerHTML = `
      <div class="fila__info">
        <span class="fila__tema">${escapeHtml(articulo.tema)}</span>
        <div class="fila__titulo">${escapeHtml(articulo.titulo)}</div>
        <div class="fila__fecha">${escapeHtml(articulo.fecha)}</div>
      </div>
      <div class="fila__acciones">
        <button data-accion="editar" data-id="${escapeHtml(articulo.id)}">Editar</button>
        <button data-accion="borrar" class="peligro" data-id="${escapeHtml(articulo.id)}">Borrar</button>
      </div>
    `;
    ul.appendChild(li);
  }

  app.appendChild(ul);

  ul.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button[data-accion]');
    if (!boton) return;
    const id = boton.dataset.id;
    if (boton.dataset.accion === 'editar') vistaEditar(id);
    if (boton.dataset.accion === 'borrar') confirmarBorrado(id);
  });
}

async function confirmarBorrado(id) {
  if (!confirm(`¿Seguro que quieres borrar "${id}"? Esto hace push a GitHub y lo quita de la web publicada.`)) {
    return;
  }
  try {
    await api(`/api/articulos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await vistaLista();
    app.prepend(mensaje('Artículo borrado y publicado el cambio.', 'exito'));
  } catch (e) {
    app.prepend(mensaje(`No se pudo borrar: ${e.message}`, 'error'));
  }
}

async function vistaEditar(id) {
  app.innerHTML = '<p class="cargando">Cargando…</p>';
  let articulo;
  try {
    articulo = await api(`/api/articulos/${encodeURIComponent(id)}`);
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(mensaje(`No se pudo cargar el artículo: ${e.message}`, 'error'));
    return;
  }

  app.innerHTML = `
    <button class="volver" type="button" id="volver">← Volver a la lista</button>
    <h1>Editar artículo</h1>
    <form id="form-editar">
      <label>Título
        <input type="text" name="titulo" value="${escapeHtml(articulo.titulo)}" required />
      </label>
      <label>Resumen
        <textarea name="resumen" class="resumen" required>${escapeHtml(articulo.resumen)}</textarea>
      </label>
      <label>Tema
        <input type="text" name="tema" value="${escapeHtml(articulo.tema)}" required />
      </label>
      <label>Fecha
        <input type="date" name="fecha" value="${escapeHtml(articulo.fecha)}" required />
      </label>
      <label>Cuerpo (Markdown)
        <textarea name="cuerpo" class="cuerpo" required>${escapeHtml(articulo.cuerpo)}</textarea>
      </label>
      <div class="acciones-form">
        <button type="submit" class="primario">Guardar y publicar</button>
        <button type="button" id="cancelar">Cancelar</button>
      </div>
    </form>
  `;

  document.getElementById('volver').addEventListener('click', vistaLista);
  document.getElementById('cancelar').addEventListener('click', vistaLista);

  document.getElementById('form-editar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Guardando y publicando…';

    const datos = Object.fromEntries(new FormData(form).entries());

    try {
      await api(`/api/articulos/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(datos),
      });
      await vistaLista();
      app.prepend(mensaje('Guardado y publicado correctamente.', 'exito'));
    } catch (e) {
      boton.disabled = false;
      boton.textContent = 'Guardar y publicar';
      form.prepend(mensaje(`No se pudo guardar: ${e.message}`, 'error'));
    }
  });
}

vistaLista();
