import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..');
const BASE_DIR = path.resolve(REPO_DIR, '..');
const ARTICULOS_DIR = path.join(REPO_DIR, 'src', 'content', 'articulos');
const PAPELERA_DIR = path.join(REPO_DIR, '_papelera');
const PENDIENTES_DIR = path.join(BASE_DIR, 'Pendientes');
const LISTO_DIR = path.join(BASE_DIR, 'Listo-para-publicar');
const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST = '127.0.0.1';
const PORT = 4322;

const CAMPOS = ['titulo', 'resumen', 'fecha', 'tema'];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf-8' });
}

function parseFrontmatter(texto) {
  const match = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, cuerpo: texto.trim() };
  const [, frontmatterRaw, cuerpo] = match;
  const data = {};
  for (const linea of frontmatterRaw.split('\n')) {
    const idx = linea.indexOf(':');
    if (idx === -1) continue;
    const clave = linea.slice(0, idx).trim();
    let valor = linea.slice(idx + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) {
      valor = valor.slice(1, -1).replace(/\\"/g, '"');
    }
    data[clave] = valor;
  }
  return { data, cuerpo: cuerpo.trim() };
}

function serializarArticulo(data, cuerpo) {
  const escapar = (s) => String(s).replace(/"/g, '\\"');
  const lineas = [
    '---',
    `titulo: "${escapar(data.titulo)}"`,
    `resumen: "${escapar(data.resumen)}"`,
    `fecha: ${data.fecha}`,
    `tema: ${data.tema}`,
  ];
  if (data.imagen && data.imagen.trim()) {
    lineas.push(`imagen: "${escapar(data.imagen.trim())}"`);
  }
  lineas.push('---', '', cuerpo.trim(), '');
  return lineas.join('\n');
}

function idDesdeArchivo(nombre) {
  return nombre.replace(/\.md$/, '');
}

function listarMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const items = archivos.map((nombre) => {
    const ruta = path.join(dir, nombre);
    const { data } = parseFrontmatter(fs.readFileSync(ruta, 'utf-8'));
    return { id: idDesdeArchivo(nombre), ...data };
  });
  items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return items;
}

function leerMarkdown(dir, id) {
  const ruta = path.join(dir, `${id}.md`);
  if (!fs.existsSync(ruta)) return null;
  const { data, cuerpo } = parseFrontmatter(fs.readFileSync(ruta, 'utf-8'));
  return { id, ...data, cuerpo };
}

function validar(data, cuerpo) {
  for (const campo of CAMPOS) {
    if (!data[campo] || !String(data[campo]).trim()) {
      return `Falta el campo "${campo}"`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) {
    return 'La fecha debe tener formato YYYY-MM-DD';
  }
  if (!cuerpo || !cuerpo.trim()) {
    return 'El cuerpo del artículo no puede estar vacío';
  }
  if (data.imagen && data.imagen.trim() && !/^https?:\/\//.test(data.imagen.trim())) {
    return 'La imagen debe ser una URL (empezar por http:// o https://)';
  }
  return null;
}

// --- Publicados (src/content/articulos/, bajo git) ---

function guardarArticulo(id, data, cuerpo) {
  const error = validar(data, cuerpo);
  if (error) return { ok: false, error };

  const ruta = path.join(ARTICULOS_DIR, `${id}.md`);
  if (!fs.existsSync(ruta)) return { ok: false, error: 'El artículo no existe' };

  try {
    git(['pull', '--ff-only', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `No se pudo sincronizar con GitHub antes de guardar: ${e.message}` };
  }

  fs.writeFileSync(ruta, serializarArticulo(data, cuerpo), 'utf-8');

  try {
    git(['add', `src/content/articulos/${id}.md`]);
    git(['commit', '-m', `Editar artículo: ${id}.md`]);
    git(['push', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `Guardado en local pero falló commit/push: ${e.message}` };
  }

  return { ok: true };
}

function borrarArticulo(id) {
  const ruta = path.join(ARTICULOS_DIR, `${id}.md`);
  if (!fs.existsSync(ruta)) return { ok: false, error: 'El artículo no existe' };

  try {
    git(['pull', '--ff-only', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `No se pudo sincronizar con GitHub antes de borrar: ${e.message}` };
  }

  fs.mkdirSync(PAPELERA_DIR, { recursive: true });
  fs.renameSync(ruta, path.join(PAPELERA_DIR, `${id}.md`));

  try {
    git(['add', `src/content/articulos/${id}.md`]);
    git(['add', `_papelera/${id}.md`]);
    git(['commit', '-m', `Eliminar artículo (a papelera): ${id}.md`]);
    git(['push', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `Movido a la papelera en local pero falló commit/push: ${e.message}` };
  }

  return { ok: true };
}

// --- Papelera (artículos quitados de la web, recuperables) ---

function restaurarDePapelera(id) {
  const origen = path.join(PAPELERA_DIR, `${id}.md`);
  if (!fs.existsSync(origen)) return { ok: false, error: 'No está en la papelera' };

  try {
    git(['pull', '--ff-only', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `No se pudo sincronizar con GitHub antes de restaurar: ${e.message}` };
  }

  fs.renameSync(origen, path.join(ARTICULOS_DIR, `${id}.md`));

  try {
    git(['add', `_papelera/${id}.md`]);
    git(['add', `src/content/articulos/${id}.md`]);
    git(['commit', '-m', `Restaurar artículo: ${id}.md`]);
    git(['push', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `Restaurado en local pero falló commit/push: ${e.message}` };
  }

  return { ok: true };
}

function borrarDefinitivoDePapelera(id) {
  const ruta = path.join(PAPELERA_DIR, `${id}.md`);
  if (!fs.existsSync(ruta)) return { ok: false, error: 'No está en la papelera' };

  try {
    git(['pull', '--ff-only', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `No se pudo sincronizar con GitHub antes de borrar: ${e.message}` };
  }

  try {
    git(['rm', `_papelera/${id}.md`]);
    git(['commit', '-m', `Borrar definitivamente: ${id}.md`]);
    git(['push', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `Falló el borrado definitivo: ${e.message}` };
  }

  return { ok: true };
}

// --- Pendientes (revisión humana, fuera de git) ---

function guardarPendiente(id, data, cuerpo) {
  const error = validar(data, cuerpo);
  if (error) return { ok: false, error };

  const ruta = path.join(PENDIENTES_DIR, `${id}.md`);
  if (!fs.existsSync(ruta)) return { ok: false, error: 'El borrador no existe' };

  fs.writeFileSync(ruta, serializarArticulo(data, cuerpo), 'utf-8');
  return { ok: true };
}

function descartarPendiente(id) {
  const ruta = path.join(PENDIENTES_DIR, `${id}.md`);
  if (!fs.existsSync(ruta)) return { ok: false, error: 'El borrador no existe' };
  fs.unlinkSync(ruta);
  return { ok: true };
}

function aprobarPendiente(id) {
  const origen = path.join(PENDIENTES_DIR, `${id}.md`);
  if (!fs.existsSync(origen)) return { ok: false, error: 'El borrador no existe' };
  fs.mkdirSync(LISTO_DIR, { recursive: true });
  const destino = path.join(LISTO_DIR, `${id}.md`);
  fs.renameSync(origen, destino);
  return { ok: true };
}

// --- Listo-para-publicar (cola transitoria, la procesa el vigilante local) ---

function devolverAPendientes(id) {
  const origen = path.join(LISTO_DIR, `${id}.md`);
  if (!fs.existsSync(origen)) return { ok: false, error: 'No está en la cola de publicación' };
  fs.mkdirSync(PENDIENTES_DIR, { recursive: true });
  const destino = path.join(PENDIENTES_DIR, `${id}.md`);
  fs.renameSync(origen, destino);
  return { ok: true };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function servirEstatico(req, res) {
  let ruta = req.url === '/' ? '/index.html' : req.url;
  const rutaCompleta = path.join(PUBLIC_DIR, path.normalize(ruta));
  if (!rutaCompleta.startsWith(PUBLIC_DIR) || !fs.existsSync(rutaCompleta)) {
    res.writeHead(404);
    res.end('No encontrado');
    return;
  }
  const ext = path.extname(rutaCompleta);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(rutaCompleta));
}

function leerCuerpoPeticion(req) {
  return new Promise((resolve, reject) => {
    let cuerpo = '';
    req.on('data', (chunk) => (cuerpo += chunk));
    req.on('end', () => {
      try {
        resolve(cuerpo ? JSON.parse(cuerpo) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);

  // Publicados
  if (url.pathname === '/api/articulos' && req.method === 'GET') {
    return json(res, 200, listarMarkdown(ARTICULOS_DIR));
  }
  const matchArticulo = url.pathname.match(/^\/api\/articulos\/([^/]+)$/);
  if (matchArticulo) {
    const id = decodeURIComponent(matchArticulo[1]);
    if (req.method === 'GET') {
      const articulo = leerMarkdown(ARTICULOS_DIR, id);
      return articulo ? json(res, 200, articulo) : json(res, 404, { error: 'No encontrado' });
    }
    if (req.method === 'PUT') {
      let body;
      try {
        body = await leerCuerpoPeticion(req);
      } catch {
        return json(res, 400, { error: 'JSON inválido' });
      }
      const { cuerpo, ...data } = body;
      const resultado = guardarArticulo(id, data, cuerpo || '');
      return json(res, resultado.ok ? 200 : 400, resultado);
    }
    if (req.method === 'DELETE') {
      const resultado = borrarArticulo(id);
      return json(res, resultado.ok ? 200 : 400, resultado);
    }
  }

  // Pendientes
  if (url.pathname === '/api/pendientes' && req.method === 'GET') {
    return json(res, 200, listarMarkdown(PENDIENTES_DIR));
  }
  const matchAprobar = url.pathname.match(/^\/api\/pendientes\/([^/]+)\/aprobar$/);
  if (matchAprobar && req.method === 'POST') {
    const resultado = aprobarPendiente(decodeURIComponent(matchAprobar[1]));
    return json(res, resultado.ok ? 200 : 400, resultado);
  }
  const matchPendiente = url.pathname.match(/^\/api\/pendientes\/([^/]+)$/);
  if (matchPendiente) {
    const id = decodeURIComponent(matchPendiente[1]);
    if (req.method === 'GET') {
      const borrador = leerMarkdown(PENDIENTES_DIR, id);
      return borrador ? json(res, 200, borrador) : json(res, 404, { error: 'No encontrado' });
    }
    if (req.method === 'PUT') {
      let body;
      try {
        body = await leerCuerpoPeticion(req);
      } catch {
        return json(res, 400, { error: 'JSON inválido' });
      }
      const { cuerpo, ...data } = body;
      const resultado = guardarPendiente(id, data, cuerpo || '');
      return json(res, resultado.ok ? 200 : 400, resultado);
    }
    if (req.method === 'DELETE') {
      const resultado = descartarPendiente(id);
      return json(res, resultado.ok ? 200 : 400, resultado);
    }
  }

  // Listo-para-publicar
  if (url.pathname === '/api/listo' && req.method === 'GET') {
    return json(res, 200, listarMarkdown(LISTO_DIR));
  }
  const matchDevolver = url.pathname.match(/^\/api\/listo\/([^/]+)\/devolver$/);
  if (matchDevolver && req.method === 'POST') {
    const resultado = devolverAPendientes(decodeURIComponent(matchDevolver[1]));
    return json(res, resultado.ok ? 200 : 400, resultado);
  }

  // Papelera
  if (url.pathname === '/api/papelera' && req.method === 'GET') {
    return json(res, 200, listarMarkdown(PAPELERA_DIR));
  }
  const matchRestaurar = url.pathname.match(/^\/api\/papelera\/([^/]+)\/restaurar$/);
  if (matchRestaurar && req.method === 'POST') {
    const resultado = restaurarDePapelera(decodeURIComponent(matchRestaurar[1]));
    return json(res, resultado.ok ? 200 : 400, resultado);
  }
  const matchPapelera = url.pathname.match(/^\/api\/papelera\/([^/]+)$/);
  if (matchPapelera && req.method === 'DELETE') {
    const resultado = borrarDefinitivoDePapelera(decodeURIComponent(matchPapelera[1]));
    return json(res, resultado.ok ? 200 : 400, resultado);
  }

  if (req.method === 'GET') return servirEstatico(req, res);

  res.writeHead(404);
  res.end('No encontrado');
});

server.listen(PORT, HOST, () => {
  console.log(`Editor de Red Agraria en http://${HOST}:${PORT}`);
  const url = `http://${HOST}:${PORT}`;
  try {
    execFileSync('open', [url]);
  } catch {
    console.log(`Ábrelo tú mismo en el navegador: ${url}`);
  }
});
