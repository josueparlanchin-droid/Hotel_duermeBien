'use strict';
/* CAPA DE PRESENTACIÓN (frontend). JavaScript puro, sin innerHTML: todo texto se inserta con nodos de texto (OWASP A03 / XSS). */

// ---------- Utilidades ----------
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly']);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  const props = [];
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) props.push([k, v]);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  for (const [k, v] of props) el[k] = v; // después de los hijos (necesario para <select>)
  return el;
}

const ESTADOS = { DISPONIBLE: 'Disponible', OCUPADA: 'Ocupada', EN_LIMPIEZA: 'En limpieza', EN_MANTENIMIENTO: 'Mantenimiento' };
const TIPOS = { SIMPLE: 'Simple', DOBLE: 'Doble', SUITE: 'Suite', FAMILIAR: 'Familiar' };
const ORIENT = { VISTA_MAR: 'Vista al mar', VISTA_CIUDAD: 'Vista a la ciudad' };
const CAP = { SIMPLE: 1, DOBLE: 2, SUITE: 3, FAMILIAR: 4 }; // capacidad máxima según el tipo de habitación
const fmtRut = (r) => { const m = /^(\d+)-([\dK])$/.exec(r || ''); return m ? `${Number(m[1]).toLocaleString('es-CL')}-${m[2]}` : r || ''; };
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
const fmtFecha = (f) => (f ? f.split('-').reverse().join('-') : '—');
const fmtTS = (iso) => (iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' }) : '—');
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const mas = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

const estado = { usuario: null, csrf: null, timer: null };

function toast(msg, tipo = 'ok') {
  const t = h('div', { class: `toast ${tipo}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4200);
}

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function api(metodo, url, cuerpo) {
  const opts = { method: metodo, credentials: 'same-origin', headers: {} };
  if (cuerpo !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(cuerpo); }
  if (metodo !== 'GET' && estado.csrf) opts.headers['X-CSRF-Token'] = estado.csrf;
  const res = await fetch(url, opts);
  let datos = null;
  try { datos = await res.json(); } catch (_) { /* sin cuerpo */ }
  if (res.status === 401 && !url.startsWith('/api/auth/login')) {
    if (estado.usuario) { estado.usuario = null; estado.csrf = null; mostrarLogin('Su sesión expiró. Inicie sesión nuevamente.'); }
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) throw new ApiError(res.status, datos?.error || 'Error inesperado del servidor.');
  return datos;
}

// ---------- Modal ----------
function abrirModal(contenido) {
  const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'modal' }, contenido));
  const cerrar = () => { ov.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrar(); });
  document.addEventListener('keydown', esc);
  document.body.append(ov);
  return cerrar;
}

function confirmar(titulo, mensaje, textoBoton, claseBoton = 'btn-navy') {
  return new Promise((resolver) => {
    let cerrar;
    const fin = (v) => { cerrar(); resolver(v); };
    cerrar = abrirModal([
      h('h2', {}, titulo),
      h('p', {}, mensaje),
      h('div', { class: 'foot' },
        h('button', { class: 'btn btn-ghost', onclick: () => fin(false) }, 'Cancelar'),
        h('button', { class: `btn ${claseBoton}`, onclick: () => fin(true) }, textoBoton)),
    ]);
  });
}

const pillEstado = (e) => h('span', { class: `pill ${e}` }, ESTADOS[e] || e);
const campo = (etq, input, ayuda) => h('div', { class: 'field' }, h('label', {}, etq), input, ayuda ? h('div', { class: 'hint' }, ayuda) : null);
const encabezado = (titulo, sub, extra) => h('div', { class: 'topline' }, h('div', {}, h('h1', {}, titulo), sub ? h('p', {}, sub) : null), extra);

function tabla(columnas, filas, vacio = 'Sin registros.') {
  if (!filas.length) return h('div', { class: 'tablewrap' }, h('div', { class: 'empty' }, vacio));
  return h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, columnas.map((c) => h('th', {}, c)))),
    h('tbody', {}, filas.map((f) => h('tr', {}, f.map((c) => h('td', { class: c instanceof Node && c.dataset?.acciones ? 'actions' : null }, c)))))));
}
const acciones = (...btns) => { const d = h('div', {}, ...btns); d.dataset.acciones = '1'; return d; };

// ---------- Login ----------
function mostrarLogin(mensaje) {
  clearInterval(estado.timer);
  const user = h('input', { id: 'u', type: 'text', autocomplete: 'username', placeholder: 'nombre.apellido', required: true });
  const pass = h('input', { id: 'p', type: 'password', autocomplete: 'current-password', placeholder: '••••••••', required: true });
  const err = h('div', { class: 'alert alert-err hidden', role: 'alert' });
  const btn = h('button', { class: 'btn btn-navy', type: 'submit' }, 'Iniciar sesión');
  if (mensaje) { err.textContent = mensaje; err.classList.remove('hidden'); }
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.classList.add('hidden'); btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/login', { username: user.value, password: pass.value });
      estado.usuario = r.usuario; estado.csrf = r.csrfToken;
      location.hash = '';
      render();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); pass.value = ''; }
    btn.disabled = false;
  } },
    campo('Usuario', user), campo('Contraseña', pass), err, btn,
    h('div', { class: 'helper' }, '¿Olvidó su contraseña? Contacte al Administrador'));
  document.getElementById('root').replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-shell' },
    h('div', { class: 'login-art' },
      h('img', { src: '/img/hotel.svg', alt: 'Hotel Duerme Bien al atardecer, frente al mar y la ciudad' }),
      h('div', { class: 'login-art-text' }, h('b', {}, 'Bienvenido a Duerme Bien'), 'Habitaciones con vista al mar o a la ciudad')),
    h('div', { class: 'login-card' },
      h('div', { class: 'login-brand' }, h('div', { class: 'mark' }, 'Duerme ', h('span', {}, 'Bien')), h('div', { class: 'tag' }, 'Sistema de gestión hotelera')),
      form))));
  user.focus();
}

// ---------- Shell + router ----------
const RUTAS = {
  tablero: { rol: 'ENCARGADO', nombre: 'Tablero de estado', vista: vistaTablero },
  asignar: { rol: 'ENCARGADO', nombre: 'Registro y asignación', vista: vistaAsignar },
  habitaciones: { rol: 'ENCARGADO', nombre: 'Habitaciones', vista: vistaHabitaciones },
  hospedados: { rol: 'ENCARGADO', nombre: 'Pasajeros hospedados', vista: vistaHospedados },
  historial: { rol: 'ENCARGADO', nombre: 'Pasajeros e historial', vista: vistaHistorial },
  usuarios: { rol: 'ADMINISTRADOR', nombre: 'Usuarios', vista: vistaUsuarios },
  auditoria: { rol: 'ADMINISTRADOR', nombre: 'Registro de auditoría', vista: vistaAuditoria },
};

function dibujarShell() {
  const u = estado.usuario;
  const enlaces = Object.entries(RUTAS).filter(([, r]) => r.rol === u.rol)
    .map(([k, r]) => h('a', { href: `#/${k}`, dataset: undefined, 'data-ruta': k }, r.nombre));
  const main = h('main', { class: 'main', id: 'vista' });
  document.getElementById('root').replaceChildren(h('div', { class: 'app' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, 'Duerme ', h('span', {}, 'Bien')),
      h('nav', {}, enlaces),
      h('div', { class: 'who' }, 'Conectado como', h('strong', {}, u.nombre), u.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Encargado de Hotel',
        h('button', { onclick: async () => {
          try { await api('POST', '/api/auth/logout'); } catch (_) { /* ya expirada */ }
          estado.usuario = null; estado.csrf = null; location.hash = ''; mostrarLogin();
        } }, 'Cerrar sesión'))),
    main));
  return main;
}

async function render() {
  clearInterval(estado.timer);
  if (!estado.usuario) return mostrarLogin();
  const [path, q] = location.hash.slice(2).split('?');
  const ruta = RUTAS[path];
  if (!ruta || ruta.rol !== estado.usuario.rol) {
    location.hash = estado.usuario.rol === 'ADMINISTRADOR' ? '#/usuarios' : '#/tablero';
    return;
  }
  let main = document.getElementById('vista');
  if (!main) main = dibujarShell();
  document.querySelectorAll('.side nav a').forEach((a) => a.classList.toggle('on', a.dataset.ruta === path));
  main.replaceChildren(h('p', {}, 'Cargando…'));
  try { await ruta.vista(main, new URLSearchParams(q || '')); }
  catch (e) { if (e.status !== 401) main.replaceChildren(h('div', { class: 'alert alert-err' }, e.message)); }
}
window.addEventListener('hashchange', render);

// ---------- Vista: Tablero (RNF-03, matriz de habitaciones) ----------
async function vistaTablero(main) {
  const cont = h('div');
  const marca = h('p', {}, '');
  main.replaceChildren(encabezado('Estado del hotel', null, h('button', { class: 'btn btn-brass', onclick: () => { location.hash = '#/asignar'; } }, '+ Nueva asignación')), marca, cont);

  async function cargar() {
    const sinDato = () => ({ disponible: false });
    const [habs, activas, clima, dolar] = await Promise.all([
      api('GET', '/api/habitaciones'), api('GET', '/api/asignaciones/activas'),
      api('GET', '/api/externos/clima').catch(sinDato), api('GET', '/api/externos/dolar').catch(sinDato)]);
    const porHab = new Map(activas.map((a) => [a.habitacion_id, a]));
    const cuenta = (e) => habs.filter((x) => x.estado === e).length;
    marca.textContent = `Vista en tiempo real — actualizado a las ${new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' })}`;
    marca.className = 'hint';
    cont.replaceChildren(
      h('div', { class: 'chips' },
        h('div', { class: 'chip' }, h('b', {}, habs.length), 'Habitaciones'),
        ...Object.keys(ESTADOS).map((e) => h('div', { class: 'chip' }, h('b', {}, cuenta(e)), ESTADOS[e])),
        h('div', { class: 'chip' }, h('b', {}, activas.reduce((s, a) => s + a.cantidad_ocupantes, 0)), 'Huéspedes alojados'),
        clima.disponible ? h('div', { class: 'chip chip-ext', title: `Fuente: ${clima.fuente}` }, h('b', {}, `${clima.temperatura}°C`), `${clima.ciudad} · ${clima.descripcion}`) : null,
        dolar.disponible ? h('div', { class: 'chip chip-ext', title: `Fuente: ${dolar.fuente}` }, h('b', {}, fmtCLP(dolar.valor)), 'Dólar observado') : null),
      habs.length ? h('div', { class: 'grid-rooms' }, habs.map((hab) => {
        const a = porHab.get(hab.id);
        return h('button', { class: `room r-${hab.estado}`, onclick: () => abrirDetalle(hab, a) },
          h('div', { class: 'num' }, hab.numero),
          h('div', { class: 'meta' }, `${TIPOS[hab.tipo]} · ${ORIENT[hab.orientacion]} · cap. ${hab.capacidad_maxima}`),
          a ? h('div', { class: 'who2' }, a.pasajero_nombre.split(' ').slice(0, 2).join(' ')) : null,
          h('span', { class: 'status' }, ESTADOS[hab.estado]));
      })) : h('div', { class: 'alert alert-info' }, 'No hay habitaciones registradas. Agréguelas en la sección Habitaciones.'),
      h('div', { class: 'legend' }, Object.keys(ESTADOS).map((e) => h('span', {}, h('span', { class: 'dot', style: undefined, 'data-e': e }), ESTADOS[e]))));
    cont.querySelectorAll('.dot').forEach((d) => { d.style.background = `var(--${{ DISPONIBLE: 'ok', OCUPADA: 'occ', EN_LIMPIEZA: 'clean', EN_MANTENIMIENTO: 'maint' }[d.dataset.e]})`; });
  }

  async function accion(fn, okMsg, cerrar) {
    try { await fn(); toast(okMsg); cerrar(); await cargar(); } catch (e) { if (e.status !== 401) toast(e.message, 'err'); }
  }

  function abrirDetalle(hab, a) {
    let cerrar;
    const cambiar = (nuevo, msg) => accion(() => api('PATCH', `/api/habitaciones/${hab.id}/estado`, { estado: nuevo }), msg, () => cerrar());
    const botones = [h('button', { class: 'btn btn-ghost', onclick: () => cerrar() }, 'Cerrar')];
    if (hab.estado === 'DISPONIBLE') {
      botones.push(h('button', { class: 'btn btn-ghost', onclick: () => cambiar('EN_MANTENIMIENTO', 'Habitación en mantenimiento') }, 'Poner en mantenimiento'));
      botones.push(h('button', { class: 'btn btn-brass', onclick: () => { cerrar(); location.hash = `#/asignar?hab=${hab.id}`; } }, 'Asignar habitación'));
    } else if (hab.estado === 'EN_LIMPIEZA') {
      botones.push(h('button', { class: 'btn btn-brass', onclick: () => cambiar('DISPONIBLE', `Habitación ${hab.numero} lista y disponible`) }, 'Marcar como lista'));
    } else if (hab.estado === 'EN_MANTENIMIENTO') {
      botones.push(h('button', { class: 'btn btn-brass', onclick: () => cambiar('DISPONIBLE', `Habitación ${hab.numero} habilitada`) }, 'Habilitar'));
    } else if (a) {
      botones.push(h('button', { class: 'btn btn-danger', onclick: async () => {
        if (!(await confirmar('Registrar check-out', `Se registrará la salida de ${a.pasajero_nombre} y la habitación ${hab.numero} pasará a "En limpieza".`, 'Confirmar check-out', 'btn-danger'))) return;
        accion(() => api('POST', `/api/asignaciones/${a.id}/checkout`), `Check-out registrado. Habitación ${hab.numero} en limpieza`, () => cerrar());
      } }, 'Registrar check-out'));
    }
    cerrar = abrirModal([
      h('h2', {}, `Habitación ${hab.numero}`), pillEstado(hab.estado),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Tipo'), h('dd', {}, TIPOS[hab.tipo]),
        h('dt', {}, 'Orientación'), h('dd', {}, ORIENT[hab.orientacion]),
        h('dt', {}, 'Capacidad máxima'), h('dd', {}, hab.capacidad_maxima),
        ...(a ? [
          h('dt', {}, 'Pasajero responsable'), h('dd', {}, a.pasajero_nombre),
          h('dt', {}, 'RUT'), h('dd', {}, fmtRut(a.pasajero_rut)),
          h('dt', {}, 'Ocupantes'), h('dd', {}, a.cantidad_ocupantes),
          h('dt', {}, 'Acompañantes'), h('dd', {}, a.acompanantes || '—'),
          h('dt', {}, 'Entrada'), h('dd', {}, fmtFecha(a.fecha_entrada)),
          h('dt', {}, 'Salida estimada'), h('dd', {}, fmtFecha(a.fecha_salida_estimada)),
          h('dt', {}, 'Noches'), h('dd', {}, a.noches),
          h('dt', {}, 'Costo informativo'), h('dd', {}, fmtCLP(a.costo_total)),
        ] : [])),
      h('div', { class: 'foot' }, botones),
    ]);
  }

  await cargar();
  // Actualización periódica sin recargar la página (matriz en tiempo real)
  estado.timer = setInterval(() => { if (!document.querySelector('.overlay')) cargar().catch(() => {}); }, 10000);
}

// ---------- Vista: Registro y asignación (RF-3, RF-6, RF-7, CU-06..CU-10) ----------
async function vistaAsignar(main, params) {
  const [habs, cfg, dolar] = await Promise.all([api('GET', '/api/habitaciones'), api('GET', '/api/config'), api('GET', '/api/externos/dolar').catch(() => ({ disponible: false }))]);
  const libres = habs.filter((x) => x.estado === 'DISPONIBLE');
  const tarifa = cfg.tarifaPorPasajero;

  const nombre = h('input', { type: 'text', maxlength: '100', placeholder: 'Ej: Ana Torres Muñoz' });
  const rut = h('input', { type: 'text', maxlength: '12', placeholder: '12.345.678-5' });
  const email = h('input', { type: 'email', maxlength: '120', placeholder: 'opcional' });
  const tel = h('input', { type: 'tel', maxlength: '20', placeholder: 'opcional' });
  const notaRut = h('div', { class: 'hint' }, 'Documento obligatorio para realizar el check-in.');
  const entrada = h('input', { type: 'date', value: hoy(), readOnly: true });
  const salida = h('input', { type: 'date', min: mas(1), value: mas(1) });
  const esGrupo = h('input', { type: 'checkbox', id: 'esGrupo' });
  const acomp = h('textarea', { rows: '2', maxlength: '300', placeholder: 'Nombres separados por coma (opcional)' });
  const bloqueGrupo = h('div', { class: 'hidden' }, campo('Acompañantes del grupo', acomp, 'El pasajero responsable de arriba responde por la estadía de todo el grupo.'));
  const filasEl = h('div');
  const btnMas = h('button', { type: 'button', class: 'btn btn-ghost btn-sm hidden', onclick: () => agregarFila() }, '+ Agregar otra habitación (grupo grande)');
  const costo = h('div', { class: 'cost' }, '');
  const nochesInfo = h('div', { class: 'hint' }, '');
  const calcNoches = () => { const n = Math.round((Date.parse(`${salida.value}T00:00:00Z`) - Date.parse(`${entrada.value}T00:00:00Z`)) / 864e5); return Number.isFinite(n) && n > 0 ? n : 0; };
  const err = h('div', { class: 'alert alert-err hidden', role: 'alert' });
  const btnEnviar = h('button', { class: 'btn btn-brass', type: 'submit' }, 'Asignar habitación');
  const filas = [];

  // RF-5: si el RUT ya existe, se cargan sus datos
  rut.addEventListener('blur', async () => {
    if (!rut.value.trim()) return;
    try {
      const p = await api('GET', `/api/pasajeros?rut=${encodeURIComponent(rut.value.trim())}`);
      if (!nombre.value) nombre.value = p.nombre_completo;
      if (!email.value && p.email) email.value = p.email;
      if (!tel.value && p.telefono) tel.value = p.telefono;
      notaRut.textContent = 'Pasajero ya registrado: se cargaron sus datos.';
    } catch (e) { notaRut.textContent = e.status === 400 ? e.message : 'Documento obligatorio para realizar el check-in.'; }
  });

  function refrescar() {
    const elegidos = new Set(filas.map((f) => f.sel.value));
    let total = 0;
    for (const f of filas) {
      for (const o of f.sel.options) o.disabled = o.value !== f.sel.value && elegidos.has(o.value);
      const hab = libres.find((x) => String(x.id) === f.sel.value);
      f.ocu.max = hab ? hab.capacidad_maxima : 10;
      f.ayuda.textContent = hab ? `Capacidad máxima: ${hab.capacidad_maxima}` : '';
      total += Number(f.ocu.value) || 0;
    }
    const n = calcNoches();
    const clp = total * n * tarifa;
    nochesInfo.textContent = n ? `${n} noche${n === 1 ? '' : 's'} de estadía` : 'La salida debe ser posterior a la entrada.';
    costo.textContent = `Costo informativo: ${fmtCLP(clp)} (${total} ocupante${total === 1 ? '' : 's'} × ${n} noche${n === 1 ? '' : 's'} × ${fmtCLP(tarifa)})` +
      (dolar.disponible && clp > 0 ? ` ≈ US$ ${(clp / dolar.valor).toFixed(2)}` : '');
    btnMas.disabled = filas.length >= libres.length;
  }

  function agregarFila(pre) {
    const sel = h('select', {}, libres.map((x) => h('option', { value: x.id }, `${x.numero} — ${TIPOS[x.tipo]} · ${ORIENT[x.orientacion]} · cap. ${x.capacidad_maxima}`)));
    if (pre) sel.value = pre; else { const usados = new Set(filas.map((f) => f.sel.value)); const libre = libres.find((x) => !usados.has(String(x.id))); if (libre) sel.value = libre.id; }
    const ocu = h('input', { type: 'number', min: '1', value: '1' });
    const ayuda = h('div', { class: 'hint' });
    const quitar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { filas.splice(filas.indexOf(f), 1); fila.remove(); refrescar(); } }, 'Quitar');
    const fila = h('div', { class: 'room-row' }, h('div', { class: 'field' }, h('label', {}, filas.length ? 'Habitación adicional' : 'Habitación'), sel, ayuda), campo('Ocupantes', ocu), filas.length ? quitar : h('span'));
    const f = { sel, ocu, ayuda };
    sel.addEventListener('change', refrescar); ocu.addEventListener('input', refrescar);
    filas.push(f); filasEl.append(fila); refrescar();
  }

  salida.addEventListener('input', refrescar);

  esGrupo.addEventListener('change', () => {
    bloqueGrupo.classList.toggle('hidden', !esGrupo.checked);
    btnMas.classList.toggle('hidden', !esGrupo.checked);
    if (!esGrupo.checked) { while (filas.length > 1) { filas.pop(); filasEl.lastChild.remove(); } refrescar(); }
  });

  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.classList.add('hidden'); btnEnviar.disabled = true;
    try {
      const r = await api('POST', '/api/asignaciones', {
        pasajero: { nombreCompleto: nombre.value, rut: rut.value, email: email.value, telefono: tel.value },
        fechaEntrada: entrada.value, fechaSalidaEstimada: salida.value, esGrupo: esGrupo.checked,
        acompanantes: acomp.value,
        habitaciones: filas.map((f) => ({ habitacionId: Number(f.sel.value), ocupantes: Number(f.ocu.value) })),
      });
      toast('Asignación registrada');
      comprobante(r);
    } catch (ex) { if (ex.status !== 401) { err.textContent = ex.message; err.classList.remove('hidden'); err.scrollIntoView({ block: 'nearest' }); } }
    btnEnviar.disabled = false;
  } },
    h('h2', {}, 'Pasajero responsable'), h('div', { class: 'sub' }, 'Persona que responde por la estadía (si es un grupo, quien queda a cargo)'),
    h('div', { class: 'row2' }, campo('Nombre completo', nombre), h('div', {}, campo('RUT', rut), notaRut)),
    h('div', { class: 'row2' }, campo('Correo electrónico', email), campo('Teléfono', tel)),
    h('div', { class: 'divider' }),
    h('h2', {}, 'Estadía'), h('div', { class: 'sub' }, 'La fecha de entrada corresponde al check-in de hoy'),
    h('div', { class: 'row2' }, campo('Fecha de entrada', entrada), campo('Fecha estimada de salida', salida)), nochesInfo,
    h('div', { class: 'check' }, esGrupo, h('label', { for: 'esGrupo' }, 'Es un grupo (más de un ocupante)')),
    bloqueGrupo,
    h('div', { class: 'divider' }),
    h('h2', {}, 'Habitación'), h('div', { class: 'sub' }, 'Solo se muestran habitaciones en estado Disponible'),
    filasEl, h('div', { class: 'field' }, btnMas), costo, err,
    h('div', { class: 'foot-actions' }, h('div', { style: undefined, class: 'field' }, h('div', { class: 'row-btns' }, btnEnviar, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { location.hash = '#/tablero'; } }, 'Cancelar')))));

  function comprobante(r) {
    main.replaceChildren(encabezado('Asignación registrada', 'Comprobante de la operación'),
      h('div', { class: 'card' },
        h('div', { class: 'alert alert-ok' }, 'La asignación se realizó correctamente. Las habitaciones quedaron en estado Ocupada.'),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Pasajero responsable'), h('dd', {}, r.responsable.nombre),
          h('dt', {}, 'RUT'), h('dd', {}, fmtRut(r.responsable.rut)),
          h('dt', {}, 'Entrada'), h('dd', {}, fmtFecha(r.fechaEntrada)),
          h('dt', {}, 'Salida estimada'), h('dd', {}, fmtFecha(r.fechaSalidaEstimada)),
          h('dt', {}, 'Noches'), h('dd', {}, r.noches),
          h('dt', {}, 'Registrada el'), h('dd', {}, fmtTS(r.creadoEn))),
        h('div', { class: 'divider' }),
        tabla(['Habitación', 'Ocupantes', 'Noches', 'Costo informativo'], [...r.asignaciones.map((a) => [a.habitacion, a.ocupantes, a.noches, fmtCLP(a.costo)]), [h('b', {}, 'Total'), '', '', h('b', {}, fmtCLP(r.costoTotal))]]),
        dolar.disponible ? h('p', { class: 'hint' }, `Equivalente aproximado: US$ ${(r.costoTotal / dolar.valor).toFixed(2)} (dólar observado ${fmtCLP(dolar.valor)}, fuente: ${dolar.fuente}).`) : null,
        h('p', { class: 'hint' }, 'El costo es informativo; el sistema no integra una pasarela de pago.'),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn btn-brass', onclick: () => { location.hash = '#/asignar'; render(); } }, 'Nueva asignación'), h('button', { class: 'btn btn-ghost', onclick: () => { location.hash = '#/tablero'; } }, 'Ir al tablero'))));
  }

  main.replaceChildren(encabezado('Registrar pasajero y asignar habitación', 'Complete los datos del huésped y seleccione una habitación disponible'),
    libres.length ? h('div', { class: 'card' }, form) : h('div', { class: 'alert alert-info' }, 'No hay habitaciones disponibles en este momento.'));
  if (libres.length) agregarFila(params.get('hab') && libres.some((x) => String(x.id) === params.get('hab')) ? params.get('hab') : undefined);
  nombre.focus();
}

// ---------- Vista: Habitaciones (CU-03, CU-04, CU-05) ----------
async function vistaHabitaciones(main) {
  const habs = await api('GET', '/api/habitaciones');

  function formulario(hab) {
    const numero = h('input', { type: 'text', maxlength: '10', value: hab?.numero || '' });
    const tipo = h('select', {}, Object.entries(TIPOS).map(([v, t]) => h('option', { value: v }, t)));
    const capTxt = h('div', { class: 'alert alert-info' }, '');
    const ori = h('select', {}, Object.entries(ORIENT).map(([v, t]) => h('option', { value: v }, t)));
    if (hab) { tipo.value = hab.tipo; ori.value = hab.orientacion; }
    const actualizarCap = () => { const c = CAP[tipo.value]; capTxt.textContent = `Capacidad máxima según el tipo: ${c} pasajero${c === 1 ? '' : 's'} (Simple 1 · Doble 2 · Suite 3 · Familiar 4).`; };
    tipo.addEventListener('change', actualizarCap); actualizarCap();
    const err = h('div', { class: 'alert alert-err hidden' });
    let cerrar;
    cerrar = abrirModal(h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.classList.add('hidden');
      const datos = { numero: numero.value, tipo: tipo.value, orientacion: ori.value };
      try {
        if (hab) await api('PUT', `/api/habitaciones/${hab.id}`, datos); else await api('POST', '/api/habitaciones', datos);
        cerrar(); toast(hab ? 'Habitación actualizada' : 'Habitación registrada'); render();
      } catch (ex) { if (ex.status !== 401) { err.textContent = ex.message; err.classList.remove('hidden'); } }
    } },
      h('h2', {}, hab ? `Editar habitación ${hab.numero}` : 'Registrar habitación'),
      campo('Número', numero, 'Debe ser único.'), campo('Tipo', tipo), capTxt, campo('Orientación (vista)', ori), err,
      h('div', { class: 'foot' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => cerrar() }, 'Cancelar'), h('button', { type: 'submit', class: 'btn btn-brass' }, 'Guardar'))));
    numero.focus();
  }

  const filtro = h('input', { class: 'search', type: 'search', placeholder: 'Buscar por número…' });
  const lista = h('div');
  function pintar() {
    const q = filtro.value.trim().toLowerCase();
    const vis = habs.filter((x) => x.numero.toLowerCase().includes(q));
    lista.replaceChildren(tabla(['N.º', 'Tipo', 'Orientación', 'Capacidad máx.', 'Estado', 'Acciones'],
      vis.map((x) => [h('b', {}, x.numero), TIPOS[x.tipo], ORIENT[x.orientacion], x.capacidad_maxima, pillEstado(x.estado),
        acciones(
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => formulario(x) }, 'Editar'),
          h('button', { class: 'btn btn-ghost btn-sm', disabled: x.estado === 'OCUPADA', title: x.estado === 'OCUPADA' ? 'Tiene pasajeros activos' : '', onclick: async () => {
            if (!(await confirmar('Eliminar habitación', `Se eliminará la habitación ${x.numero}. El historial de pasajeros que la ocuparon se conservará.`, 'Eliminar', 'btn-danger'))) return;
            try { await api('DELETE', `/api/habitaciones/${x.id}`); toast(`Habitación ${x.numero} eliminada`); render(); } catch (ex) { if (ex.status !== 401) toast(ex.message, 'err'); }
          } }, 'Eliminar'))]), 'No hay habitaciones que coincidan.'));
  }
  filtro.addEventListener('input', pintar);
  main.replaceChildren(encabezado('Gestión de habitaciones', `${habs.length} habitaciones registradas en el sistema`, h('button', { class: 'btn btn-brass', onclick: () => formulario() }, '+ Registrar habitación')),
    h('div', { class: 'filters' }, campo('Buscar', filtro)), lista);
  pintar();
}

// ---------- Vista: Pasajeros hospedados (CU-12) ----------
async function vistaHospedados(main) {
  const activas = await api('GET', '/api/asignaciones/activas');
  main.replaceChildren(encabezado('Pasajeros hospedados', `${activas.length} habitaciones con huéspedes actualmente`),
    tabla(['Habitación', 'Responsable', 'RUT', 'Ocupantes', 'Acompañantes', 'Entrada', 'Salida est.', 'Noches', 'Costo', ''],
      activas.map((a) => [h('b', {}, a.habitacion_numero), a.pasajero_nombre, fmtRut(a.pasajero_rut), a.cantidad_ocupantes, a.acompanantes || '—', fmtFecha(a.fecha_entrada), fmtFecha(a.fecha_salida_estimada), a.noches, fmtCLP(a.costo_total),
        acciones(h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          if (!(await confirmar('Registrar check-out', `Salida de ${a.pasajero_nombre} (habitación ${a.habitacion_numero}). La habitación pasará a "En limpieza".`, 'Confirmar check-out', 'btn-danger'))) return;
          try { await api('POST', `/api/asignaciones/${a.id}/checkout`); toast('Check-out registrado'); render(); } catch (ex) { if (ex.status !== 401) toast(ex.message, 'err'); }
        } }, 'Check-out'))]), 'No hay pasajeros hospedados en este momento.'));
}

// ---------- Vista: Pasajeros e historial (RF-5, RF-9) ----------
async function vistaHistorial(main) {
  const habs = await api('GET', '/api/habitaciones');
  const rut = h('input', { type: 'text', placeholder: '12.345.678-5', maxlength: '12' });
  const hab = h('select', {}, h('option', { value: '' }, 'Todas las habitaciones'), habs.map((x) => h('option', { value: x.id }, `Habitación ${x.numero}`)));
  const ficha = h('div');
  const resultados = h('div');
  const err = h('div', { class: 'alert alert-err hidden' });

  async function buscar(e) {
    e?.preventDefault(); err.classList.add('hidden'); ficha.replaceChildren();
    const q = new URLSearchParams();
    if (rut.value.trim()) q.set('rut', rut.value.trim());
    if (hab.value) q.set('habitacionId', hab.value);
    try {
      if (rut.value.trim()) {
        try { fichaPasajero(await api('GET', `/api/pasajeros?rut=${encodeURIComponent(rut.value.trim())}`)); }
        catch (ex) { if (ex.status === 400) throw ex; ficha.replaceChildren(h('div', { class: 'alert alert-info' }, 'No hay un pasajero registrado con ese RUT.')); }
      }
      const filas = await api('GET', `/api/historial?${q}`);
      resultados.replaceChildren(h('p', { class: 'hint' }, rut.value.trim() || hab.value ? `${filas.length} estadías encontradas` : 'Últimas estadías registradas (máximo 100)'),
        tabla(['Registrada', 'Habitación', 'Pasajero responsable', 'RUT', 'Ocup.', 'Entrada', 'Salida', 'Noches', 'Estado', 'Costo'],
          filas.map((a) => [fmtTS(a.creado_en), a.habitacion_numero, a.pasajero_nombre, fmtRut(a.pasajero_rut), a.cantidad_ocupantes, fmtFecha(a.fecha_entrada), a.fecha_salida_real ? fmtTS(a.fecha_salida_real) : `${fmtFecha(a.fecha_salida_estimada)} (est.)`, a.noches, h('span', { class: `pill ${a.estado}` }, a.estado === 'ACTIVA' ? 'Activa' : 'Finalizada'), fmtCLP(a.costo_total)]),
          'No hay estadías para los filtros indicados.'));
    } catch (ex) { if (ex.status !== 401) { err.textContent = ex.message; err.classList.remove('hidden'); resultados.replaceChildren(); } }
  }

  function fichaPasajero(p) {
    const email = h('input', { type: 'email', maxlength: '120', value: p.email || '' });
    const tel = h('input', { type: 'tel', maxlength: '20', value: p.telefono || '' });
    ficha.replaceChildren(h('div', { class: 'card' },
      h('h2', {}, p.nombre_completo), h('div', { class: 'sub' }, `RUT ${fmtRut(p.rut)} · registrado el ${fmtTS(p.creado_en)}`),
      h('div', { class: 'row2' }, campo('Correo electrónico', email), campo('Teléfono', tel)),
      h('div', { class: 'field' }, h('button', { class: 'btn btn-brass btn-sm', type: 'button', onclick: async () => {
        try { await api('PUT', `/api/pasajeros/${p.id}`, { email: email.value, telefono: tel.value }); toast('Datos de contacto actualizados'); } catch (ex) { if (ex.status !== 401) toast(ex.message, 'err'); }
      } }, 'Guardar datos de contacto'))));
  }

  main.replaceChildren(encabezado('Pasajeros e historial', 'Busque un pasajero por RUT, actualice su contacto y consulte las estadías pasadas'),
    h('form', { class: 'filters', novalidate: true, onsubmit: buscar }, campo('RUT del pasajero', rut), campo('Habitación', hab), h('button', { class: 'btn btn-navy', type: 'submit' }, 'Buscar')),
    err, ficha, resultados);
  await buscar();
}

// ---------- Vista: Usuarios (RF-2, RF-4, CU-02) ----------
async function vistaUsuarios(main) {
  const usuarios = await api('GET', '/api/usuarios');
  function formulario() {
    const f = { nombre: h('input', { type: 'text', maxlength: '100' }), rut: h('input', { type: 'text', maxlength: '12', placeholder: '12.345.678-5' }), user: h('input', { type: 'text', maxlength: '30', autocomplete: 'off' }),
      pass: h('input', { type: 'password', autocomplete: 'new-password' }), rol: h('select', {}, h('option', { value: 'ENCARGADO' }, 'Encargado de Hotel'), h('option', { value: 'ADMINISTRADOR' }, 'Administrador')) };
    const err = h('div', { class: 'alert alert-err hidden' });
    let cerrar;
    cerrar = abrirModal(h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.classList.add('hidden');
      try {
        await api('POST', '/api/usuarios', { nombreCompleto: f.nombre.value, rut: f.rut.value, username: f.user.value, password: f.pass.value, rol: f.rol.value });
        cerrar(); toast('Usuario creado'); render();
      } catch (ex) { if (ex.status !== 401) { err.textContent = ex.message; err.classList.remove('hidden'); } }
    } },
      h('h2', {}, 'Crear usuario'),
      campo('Nombre completo', f.nombre), campo('RUT', f.rut), campo('Nombre de usuario', f.user, 'Minúsculas, números, punto, guion o guion bajo.'),
      campo('Contraseña inicial', f.pass, 'Mínimo 8 caracteres con mayúsculas, minúsculas y números.'), campo('Rol', f.rol), err,
      h('div', { class: 'foot' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => cerrar() }, 'Cancelar'), h('button', { type: 'submit', class: 'btn btn-brass' }, 'Crear usuario'))));
    f.nombre.focus();
  }
  main.replaceChildren(encabezado('Gestión de usuarios', 'Cuentas del personal con acceso al sistema', h('button', { class: 'btn btn-brass', onclick: formulario }, '+ Crear usuario')),
    tabla(['Usuario', 'Nombre', 'RUT', 'Rol', 'Estado', 'Creado', ''],
      usuarios.map((u) => [h('b', {}, u.username), u.nombre_completo, fmtRut(u.rut), h('span', { class: `pill ${u.rol}` }, u.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Encargado'),
        h('span', { class: `pill ${u.activo ? 'ACTIVA' : 'FINALIZADA'}` }, u.activo ? 'Activo' : 'Desactivado'), fmtTS(u.creado_en),
        acciones(h('button', { class: 'btn btn-ghost btn-sm', disabled: u.id === estado.usuario.id, onclick: async () => {
          try { await api('PATCH', `/api/usuarios/${u.id}/activo`, { activo: !u.activo }); toast(u.activo ? 'Usuario desactivado' : 'Usuario activado'); render(); } catch (ex) { if (ex.status !== 401) toast(ex.message, 'err'); }
        } }, u.activo ? 'Desactivar' : 'Activar'))])));
}

// ---------- Vista: Auditoría (ISO 27002) ----------
async function vistaAuditoria(main) {
  const reg = await api('GET', '/api/auditoria');
  main.replaceChildren(encabezado('Registro de auditoría', 'Últimos 200 eventos de seguridad y operación'),
    tabla(['Fecha', 'Usuario', 'Acción', 'Detalle', 'IP'], reg.map((r) => [fmtTS(r.fecha), r.username || '—', h('b', {}, r.accion), r.detalle || '—', r.ip || '—'])));
}

// ---------- Inicio ----------
(async function iniciar() {
  try {
    const r = await api('GET', '/api/auth/me');
    estado.usuario = r.usuario; estado.csrf = r.csrfToken;
    render();
  } catch (_) { mostrarLogin(); }
})();
