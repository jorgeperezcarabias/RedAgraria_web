const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

const ENDPOINTS = { articulos: '/api/articulos', pendientes: '/api/pendientes', listo: '/api/listo' };
const TITULOS_TAB = {
  articulos: 'Artículos publicados',
  pendientes: 'Borradores pendientes de revisión',
  listo: 'Cola de publicación (se procesa sola, normalmente en segundos)',
};

let pestanaActual = 'articulos';
let cacheLista = [];
let filtroTexto = '';
let filtroTema = '';

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

function extraerFuentes(markdown) {
  const match = markdown.match(/\n?<!--\s*FUENTES:[\s\S]*?-->\s*$/);
  if (!match) return { cuerpo: markdown, fuentes: '' };
  return { cuerpo: markdown.slice(0, match.index).trimEnd(), fuentes: match[0].trim() };
}

function reinsertarFuentes(cuerpoMd, fuentes) {
  return fuentes ? `${cuerpoMd.trim()}\n\n${fuentes}\n` : cuerpoMd.trim();
}

// --- Pestañas ---

tabsEl.addEventListener('click', (ev) => {
  const boton = ev.target.closest('button[data-tab]');
  if (!boton) return;
  pestanaActual = boton.dataset.tab;
  filtroTexto = '';
  filtroTema = '';
  for (const b of tabsEl.querySelectorAll('.tab')) b.classList.toggle('activa', b === boton);
  vistaLista();
});

// --- Vista lista (con buscador + filtro por tema) ---

async function vistaLista() {
  app.innerHTML = '<p class="cargando">Cargando…</p>';
  try {
    cacheLista = await api(ENDPOINTS[pestanaActual]);
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(mensaje(`No se pudo cargar: ${e.message}`, 'error'));
    return;
  }
  renderLista();
}

function renderLista() {
  const temas = [...new Set(cacheLista.map((a) => a.tema).filter(Boolean))].sort();

  app.innerHTML = `
    <h1>${TITULOS_TAB[pestanaActual]}</h1>
    <div class="controles">
      <input type="search" id="buscar" placeholder="Buscar por título o resumen…" value="${escapeHtml(filtroTexto)}" />
      <select id="filtro-tema">
        <option value="">Todos los temas</option>
        ${temas.map((t) => `<option value="${escapeHtml(t)}" ${t === filtroTema ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div id="lista-contenedor"></div>
  `;

  document.getElementById('buscar').addEventListener('input', (ev) => {
    filtroTexto = ev.target.value;
    renderFilas();
  });
  document.getElementById('filtro-tema').addEventListener('change', (ev) => {
    filtroTema = ev.target.value;
    renderFilas();
  });
  document.getElementById('lista-contenedor').addEventListener('click', manejarAccion);

  renderFilas();
}

function renderFilas() {
  const filtrados = cacheLista.filter((a) => {
    const coincideTexto =
      !filtroTexto ||
      `${a.titulo} ${a.resumen}`.toLowerCase().includes(filtroTexto.toLowerCase());
    const coincideTema = !filtroTema || a.tema === filtroTema;
    return coincideTexto && coincideTema;
  });

  const contenedor = document.getElementById('lista-contenedor');

  if (filtrados.length === 0) {
    contenedor.innerHTML = '<p class="cargando">Nada que mostrar.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'lista';

  for (const item of filtrados) {
    const li = document.createElement('li');
    li.className = 'fila';
    li.innerHTML = `
      <div class="fila__info">
        <span class="fila__tema">${escapeHtml(item.tema)}</span>
        <div class="fila__titulo">${escapeHtml(item.titulo)}</div>
        <div class="fila__fecha">${escapeHtml(item.fecha)}</div>
      </div>
      <div class="fila__acciones">${accionesPara(item.id)}</div>
    `;
    ul.appendChild(li);
  }
  contenedor.appendChild(ul);
}

function accionesPara(id) {
  const idAttr = `data-id="${escapeHtml(id)}"`;
  if (pestanaActual === 'articulos') {
    return `
      <button data-accion="editar" ${idAttr}>Editar</button>
      <button data-accion="borrar" class="peligro" ${idAttr}>Borrar</button>
    `;
  }
  if (pestanaActual === 'pendientes') {
    return `
      <button data-accion="editar" ${idAttr}>Editar</button>
      <button data-accion="aprobar" class="primario" ${idAttr}>Aprobar y publicar</button>
      <button data-accion="descartar" class="peligro" ${idAttr}>Descartar</button>
    `;
  }
  // listo
  return `<button data-accion="devolver" ${idAttr}>Devolver a Pendientes</button>`;
}

async function manejarAccion(ev) {
  const boton = ev.target.closest('button[data-accion]');
  if (!boton) return;
  const id = boton.dataset.id;
  const accion = boton.dataset.accion;

  if (accion === 'editar') return vistaEditar(pestanaActual, id);

  if (accion === 'borrar') {
    if (!confirm(`¿Borrar "${id}"? Esto hace push a GitHub y lo quita de la web publicada.`)) return;
    try {
      await api(`/api/articulos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await vistaLista();
      app.prepend(mensaje('Artículo borrado y publicado el cambio.', 'exito'));
    } catch (e) {
      app.prepend(mensaje(`No se pudo borrar: ${e.message}`, 'error'));
    }
    return;
  }

  if (accion === 'descartar') {
    if (!confirm(`¿Descartar el borrador "${id}"? Se borra sin más, no se puede deshacer.`)) return;
    try {
      await api(`/api/pendientes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await vistaLista();
      app.prepend(mensaje('Borrador descartado.', 'exito'));
    } catch (e) {
      app.prepend(mensaje(`No se pudo descartar: ${e.message}`, 'error'));
    }
    return;
  }

  if (accion === 'aprobar') {
    if (!confirm(`¿Aprobar "${id}"? Se moverá a la cola de publicación y se publicará solo en cuanto el vigilante lo detecte (normalmente segundos).`)) return;
    try {
      await api(`/api/pendientes/${encodeURIComponent(id)}/aprobar`, { method: 'POST' });
      await vistaLista();
      app.prepend(mensaje('Movido a la cola de publicación.', 'exito'));
    } catch (e) {
      app.prepend(mensaje(`No se pudo aprobar: ${e.message}`, 'error'));
    }
    return;
  }

  if (accion === 'devolver') {
    try {
      await api(`/api/listo/${encodeURIComponent(id)}/devolver`, { method: 'POST' });
      await vistaLista();
      app.prepend(mensaje('Devuelto a Pendientes.', 'exito'));
    } catch (e) {
      app.prepend(mensaje(`No se pudo devolver: ${e.message}`, 'error'));
    }
  }
}

// --- Vista edición (con editor visual) ---

let quill = null;
let fuentesActuales = '';

async function vistaEditar(tipo, id) {
  app.innerHTML = '<p class="cargando">Cargando…</p>';
  let articulo;
  try {
    articulo = await api(`/api/${tipo}/${encodeURIComponent(id)}`);
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(mensaje(`No se pudo cargar: ${e.message}`, 'error'));
    return;
  }

  const { cuerpo: cuerpoSinFuentes, fuentes } = extraerFuentes(articulo.cuerpo || '');
  fuentesActuales = fuentes;

  app.innerHTML = `
    <button class="volver" type="button" id="volver">← Volver a la lista</button>
    <h1>Editar</h1>
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
      <label>Cuerpo
        <div id="editor-cuerpo"></div>
      </label>
      ${fuentes ? '<p class="nota-fuentes">Este artículo tiene una nota de fuentes oculta al final — no se toca al editar.</p>' : ''}
      <div class="acciones-form">
        <button type="submit" class="primario">Guardar${tipo === 'articulos' ? ' y publicar' : ''}</button>
        ${tipo === 'pendientes' ? '<button type="button" id="guardar-y-aprobar" class="primario">Guardar y aprobar</button>' : ''}
        <button type="button" id="cancelar">Cancelar</button>
      </div>
    </form>
  `;

  quill = new Quill('#editor-cuerpo', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'link'],
        ['blockquote', 'code-block'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean'],
      ],
    },
  });
  quill.root.innerHTML = marked.parse(cuerpoSinFuentes || '');

  document.getElementById('volver').addEventListener('click', vistaLista);
  document.getElementById('cancelar').addEventListener('click', vistaLista);

  function recogerDatos() {
    const form = document.getElementById('form-editar');
    const datos = Object.fromEntries(new FormData(form).entries());
    const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const cuerpoMd = turndownService.turndown(quill.root.innerHTML);
    datos.cuerpo = reinsertarFuentes(cuerpoMd, fuentesActuales);
    return datos;
  }

  document.getElementById('form-editar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = ev.submitter;
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const datos = recogerDatos();
      await api(`/api/${tipo}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(datos) });
      await vistaLista();
      app.prepend(mensaje('Guardado correctamente.', 'exito'));
    } catch (e) {
      boton.disabled = false;
      boton.textContent = textoOriginal;
      document.getElementById('form-editar').prepend(mensaje(`No se pudo guardar: ${e.message}`, 'error'));
    }
  });

  const botonAprobar = document.getElementById('guardar-y-aprobar');
  if (botonAprobar) {
    botonAprobar.addEventListener('click', async () => {
      botonAprobar.disabled = true;
      botonAprobar.textContent = 'Guardando y aprobando…';
      try {
        const datos = recogerDatos();
        await api(`/api/pendientes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(datos) });
        await api(`/api/pendientes/${encodeURIComponent(id)}/aprobar`, { method: 'POST' });
        pestanaActual = 'pendientes';
        await vistaLista();
        app.prepend(mensaje('Guardado y movido a la cola de publicación.', 'exito'));
      } catch (e) {
        botonAprobar.disabled = false;
        botonAprobar.textContent = 'Guardar y aprobar';
        document.getElementById('form-editar').prepend(mensaje(`No se pudo completar: ${e.message}`, 'error'));
      }
    });
  }
}

vistaLista();
