import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..');
const ARTICULOS_DIR = path.join(REPO_DIR, 'src', 'content', 'articulos');
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
  return [
    '---',
    `titulo: "${escapar(data.titulo)}"`,
    `resumen: "${escapar(data.resumen)}"`,
    `fecha: ${data.fecha}`,
    `tema: ${data.tema}`,
    '---',
    '',
    cuerpo.trim(),
    '',
  ].join('\n');
}

function idDesdeArchivo(nombre) {
  return nombre.replace(/\.md$/, '');
}

function listarArticulos() {
  const archivos = fs.readdirSync(ARTICULOS_DIR).filter((f) => f.endsWith('.md'));
  const articulos = archivos.map((nombre) => {
    const ruta = path.join(ARTICULOS_DIR, nombre);
    const { data } = parseFrontmatter(fs.readFileSync(ruta, 'utf-8'));
    return { id: idDesdeArchivo(nombre), ...data };
  });
  articulos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return articulos;
}

function leerArticulo(id) {
  const ruta = path.join(ARTICULOS_DIR, `${id}.md`);
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
  return null;
}

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

  try {
    git(['rm', `src/content/articulos/${id}.md`]);
    git(['commit', '-m', `Eliminar artículo: ${id}.md`]);
    git(['push', 'origin', 'main']);
  } catch (e) {
    return { ok: false, error: `Falló el borrado/commit/push: ${e.message}` };
  }

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

function leerCuerpo(req) {
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

  if (url.pathname === '/api/articulos' && req.method === 'GET') {
    return json(res, 200, listarArticulos());
  }

  const matchUno = url.pathname.match(/^\/api\/articulos\/([^/]+)$/);
  if (matchUno) {
    const id = decodeURIComponent(matchUno[1]);

    if (req.method === 'GET') {
      const articulo = leerArticulo(id);
      if (!articulo) return json(res, 404, { error: 'No encontrado' });
      return json(res, 200, articulo);
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = await leerCuerpo(req);
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
