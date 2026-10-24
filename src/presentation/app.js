'use strict';
// CAPA DE PRESENTACIÓN (API REST + archivos estáticos del frontend)
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { AppError } = require('../errors');
const V = require('../business/validadores');
const { crearRepos } = require('../data/repositorios');
const { crearServicios } = require('../business');
const { SqliteStore } = require('./sessionStore');
const { crearServiciosExternos } = require('../business/serviciosExternos');

function crearApp(db, config, deps = {}) {
  const repos = crearRepos(db);
  const externos = crearServiciosExternos(config, deps.fetch);
  const svc = crearServicios(repos, db, config);
  const app = express();

  app.disable('x-powered-by');
  if (config.esProd) app.set('trust proxy', 1);

  // OWASP A05 (configuración segura): cabeceras de seguridad + CSP estricta
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    })
  );
  app.use(express.json({ limit: '20kb' }));

  // ISO 27002: sesión con expiración por inactividad, cookie HttpOnly + SameSite estricta
  app.use(
    session({
      name: 'db.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new SqliteStore(db, config.SESSION_IDLE_MS),
      cookie: { httpOnly: true, sameSite: 'strict', secure: config.esProd, maxAge: config.SESSION_IDLE_MS },
    })
  );

  const ip = (req) => req.ip;
  const wrap = (fn) => (req, res, next) => {
    try {
      const r = fn(req, res, next);
      if (r && typeof r.catch === 'function') r.catch(next);
    } catch (e) { next(e); }
  };

  // --- Middlewares de seguridad ---
  // OWASP A01: control de acceso. Revalida el usuario en cada petición (cuentas desactivadas pierden acceso de inmediato)
  const requireAuth = (req, _res, next) => {
    const uid = req.session?.usuarioId;
    const u = uid ? repos.usuarios.porId(uid) : null;
    if (!u || !u.activo) throw new AppError(401, 'Debe iniciar sesión.', 'NO_AUTENTICADO');
    req.usuario = { id: u.id, username: u.username, nombre: u.nombre_completo, rol: u.rol };
    next();
  };
  const requireRol = (rol) => (req, _res, next) => {
    requireAuth(req, _res, () => {
      if (req.usuario.rol !== rol) {
        repos.auditoria.registrar({ usuarioId: req.usuario.id, username: req.usuario.username, accion: 'ACCESO_DENEGADO', detalle: `${req.method} ${req.originalUrl}`, ip: ip(req) });
        return next(new AppError(403, 'No tiene permisos para realizar esta acción.', 'PROHIBIDO'));
      }
      next();
    });
  };
  const soloAdmin = requireRol('ADMINISTRADOR');
  const soloEncargado = requireRol('ENCARGADO');

  // OWASP A01/A04: protección CSRF con token por sesión (además de SameSite=Strict)
  const csrf = (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login') return next();
    const esperado = req.session?.csrf;
    const recibido = req.get('x-csrf-token');
    const ok = esperado && recibido && esperado.length === recibido.length &&
      crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido));
    if (!ok) return next(new AppError(403, 'Token CSRF inválido o ausente.', 'CSRF'));
    next();
  };

  const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.LOGIN_LIMIT_IP,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de inicio de sesión. Intente más tarde.', code: 'RATE_LIMIT' },
  });

  const api = express.Router();
  api.use(csrf);

  // ---------- Autenticación (RF-1) ----------
  api.post('/auth/login', limiteLogin, wrap((req, res, next) => {
    const { username, password } = req.body ?? {};
    const usuario = svc.auth.iniciarSesion(username, password, ip(req));
    // Regenerar sesión previene fijación de sesión
    req.session.regenerate((e) => {
      if (e) return next(e);
      req.session.usuarioId = usuario.id;
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      res.json({ usuario, csrfToken: req.session.csrf });
    });
  }));

  api.get('/auth/me', requireAuth, (req, res) => res.json({ usuario: req.usuario, csrfToken: req.session.csrf }));

  api.post('/auth/logout', requireAuth, (req, res, next) => {
    repos.auditoria.registrar({ usuarioId: req.usuario.id, username: req.usuario.username, accion: 'LOGOUT', ip: ip(req) });
    req.session.destroy((e) => {
      if (e) return next(e);
      res.clearCookie('db.sid');
      res.json({ ok: true });
    });
  });

  // ---------- Administración (solo ADMINISTRADOR) RF-2, RF-4 ----------
  api.get('/usuarios', soloAdmin, (_req, res) => res.json(svc.usuarios.listar()));
  api.post('/usuarios', soloAdmin, wrap((req, res) => res.status(201).json(svc.usuarios.crear(req.body ?? {}, req.usuario, ip(req)))));
  api.patch('/usuarios/:id/activo', soloAdmin, wrap((req, res) => {
    svc.usuarios.cambiarActivo(V.idParam(req.params.id), (req.body ?? {}).activo, req.usuario, ip(req));
    res.json({ ok: true });
  }));
  api.get('/auditoria', soloAdmin, (_req, res) => res.json(svc.auditoria.listar()));

  // ---------- Operación (solo ENCARGADO) ----------
  api.get('/habitaciones', soloEncargado, (_req, res) => res.json(svc.habitaciones.listar()));
  api.post('/habitaciones', soloEncargado, wrap((req, res) => res.status(201).json(svc.habitaciones.crear(req.body ?? {}, req.usuario, ip(req)))));
  api.put('/habitaciones/:id', soloEncargado, wrap((req, res) => res.json(svc.habitaciones.actualizar(V.idParam(req.params.id), req.body ?? {}, req.usuario, ip(req)))));
  api.delete('/habitaciones/:id', soloEncargado, wrap((req, res) => {
    svc.habitaciones.eliminar(V.idParam(req.params.id), req.usuario, ip(req));
    res.json({ ok: true });
  }));
  api.patch('/habitaciones/:id/estado', soloEncargado, wrap((req, res) =>
    res.json(svc.habitaciones.cambiarEstado(V.idParam(req.params.id), (req.body ?? {}).estado, req.usuario, ip(req)))));

  api.get('/pasajeros', soloEncargado, wrap((req, res) => res.json(svc.pasajeros.buscarPorRut(String(req.query.rut ?? '')))));
  api.put('/pasajeros/:id', soloEncargado, wrap((req, res) => res.json(svc.pasajeros.actualizarContacto(V.idParam(req.params.id), req.body ?? {}, req.usuario, ip(req)))));

  api.post('/asignaciones', soloEncargado, wrap((req, res) => res.status(201).json(svc.asignaciones.crear(req.body ?? {}, req.usuario, ip(req)))));
  api.get('/asignaciones/activas', soloEncargado, (_req, res) => res.json(svc.asignaciones.activas()));
  api.post('/asignaciones/:id/checkout', soloEncargado, wrap((req, res) => res.json(svc.asignaciones.checkout(V.idParam(req.params.id), req.usuario, ip(req)))));
  api.get('/historial', soloEncargado, wrap((req, res) =>
    res.json(svc.asignaciones.historial({ habitacionId: req.query.habitacionId, rut: req.query.rut }))));

  // Servicios externos en la nube (clima y dólar). Nunca fallan la petición: si el tercero cae, disponible=false
  api.get('/externos/clima', soloEncargado, wrap(async (_req, res) => res.json(await externos.clima())));
  api.get('/externos/dolar', soloEncargado, wrap(async (_req, res) => res.json(await externos.dolar())));

  api.get('/config', requireAuth, (_req, res) => res.json({ tarifaPorPasajero: config.TARIFA_POR_PASAJERO, ciudad: config.HOTEL_CIUDAD }));
  api.use((_req, _res, next) => next(new AppError(404, 'Recurso no encontrado.', 'NO_ENCONTRADO')));

  app.use('/api', api);
  app.use(express.static(path.join(__dirname, '..', '..', 'public'), { index: 'index.html' }));

  // Manejo centralizado de errores: no se filtran detalles internos (OWASP A05/A09)
  // eslint-disable-next-line no-unused-vars
  app.use((e, req, res, _next) => {
    if (e instanceof AppError) return res.status(e.status).json({ error: e.message, code: e.code });
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.', code: 'VALIDACION' });
    if (e.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande.', code: 'VALIDACION' });
    console.error(e);
    res.status(500).json({ error: 'Error interno del servidor.', code: 'ERROR_INTERNO' });
  });

  return app;
}

module.exports = { crearApp };
