function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function extraerFuentes(markdown) {
  const match = markdown.match(/\n?<!--\s*FUENTES:[\s\S]*?-->\s*$/);
  return match ? markdown.slice(0, match.index).trimEnd() : markdown;
}

async function cargar() {
  const params = new URLSearchParams(location.search);
  const tipo = params.get('tipo');
  const id = params.get('id');
  const contenido = document.getElementById('contenido');

  if (!tipo || !id) {
    contenido.innerHTML = '<p class="mensaje error">Falta tipo o id en la URL.</p>';
    return;
  }

  let articulo;
  try {
    const res = await fetch(`/api/${tipo}/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    articulo = data;
  } catch (e) {
    contenido.innerHTML = `<p class="mensaje error">No se pudo cargar: ${escapeHtml(e.message)}</p>`;
    return;
  }

  const cuerpoMd = extraerFuentes(articulo.cuerpo || '');
  const fechaFormateada = articulo.fecha
    ? new Date(`${articulo.fecha}T00:00:00`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  contenido.innerHTML = `
    <article class="articulo">
      <p class="tema">${escapeHtml(articulo.tema)}</p>
      <h1>${escapeHtml(articulo.titulo)}</h1>
      <p class="fecha">${escapeHtml(fechaFormateada)}</p>
      ${articulo.imagen ? `<img class="imagen-destacada" src="${escapeHtml(articulo.imagen)}" alt="" />` : ''}
      <div class="cuerpo">${marked.parse(cuerpoMd)}</div>
    </article>
  `;
  document.title = `${articulo.titulo} · Vista previa`;
}

cargar();
