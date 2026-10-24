'use strict';
// CAPA DE NEGOCIO - Autenticación (RF-1). OWASP A07: bloqueo por intentos, mensajes genéricos, bcrypt.
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors');

function crearAuthService(repos, config) {
  // Hash ficticio para igualar tiempos de respuesta cuando el usuario no existe
  const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente', config.BCRYPT_ROUNDS);
  const GENERICO = 'Usuario o contraseña incorrectos.';

  return {
    iniciarSesion(username, password, ip) {
      const u = typeof username === 'string' ? repos.usuarios.porUsername(username.trim().toLowerCase()) : undefined;
      const clave = typeof password === 'string' ? password.slice(0, 72) : '';

      if (!u) {
        bcrypt.compareSync(clave, HASH_FALSO);
        repos.auditoria.registrar({ username: String(username).slice(0, 30), accion: 'LOGIN_FALLIDO', detalle: 'Usuario inexistente', ip });
        throw new AppError(401, GENERICO, 'CREDENCIALES');
      }

      if (u.bloqueado_hasta && u.bloqueado_hasta > Date.now()) {
        repos.auditoria.registrar({ usuarioId: u.id, username: u.username, accion: 'LOGIN_BLOQUEADO', detalle: 'Cuenta bloqueada temporalmente', ip });
        throw new AppError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.', 'BLOQUEADO');
      }

      const ok = bcrypt.compareSync(clave, u.password_hash);
      if (!ok || !u.activo) {
        const intentos = u.intentos_fallidos + 1;
        const bloquear = intentos >= config.MAX_INTENTOS;
        repos.usuarios.registrarFallo(u.id, bloquear ? 0 : intentos, bloquear ? Date.now() + config.BLOQUEO_MS : null);
        repos.auditoria.registrar({
          usuarioId: u.id, username: u.username, accion: 'LOGIN_FALLIDO',
          detalle: !u.activo ? 'Cuenta desactivada' : bloquear ? 'Cuenta bloqueada por intentos fallidos' : `Intento ${intentos}`, ip,
        });
        throw new AppError(401, GENERICO, 'CREDENCIALES');
      }

      repos.usuarios.limpiarFallos(u.id);
      repos.auditoria.registrar({ usuarioId: u.id, username: u.username, accion: 'LOGIN_OK', ip });
      return { id: u.id, username: u.username, nombre: u.nombre_completo, rol: u.rol };
    },
  };
}

module.exports = { crearAuthService };
