'use strict';
// CAPA DE DATOS - Repositorios. Todas las consultas son parametrizadas (OWASP A03: Inyección SQL).

function crearRepos(db) {
  const usuarios = {
    porUsername: (u) => db.prepare('SELECT * FROM usuarios WHERE username = ?').get(u),
    porId: (id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id),
    porRut: (rut) => db.prepare('SELECT id FROM usuarios WHERE rut = ?').get(rut),
    listar: () =>
      db
        .prepare('SELECT id, username, nombre_completo, rut, rol, activo, creado_en FROM usuarios ORDER BY id')
        .all(),
    crear: (u) =>
      db
        .prepare(
          `INSERT INTO usuarios (username, nombre_completo, rut, password_hash, rol, activo, creado_en)
           VALUES (@username, @nombre_completo, @rut, @password_hash, @rol, 1, @creado_en)`
        )
        .run(u).lastInsertRowid,
    setActivo: (id, activo) => db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id),
    registrarFallo: (id, intentos, bloqueadoHasta) =>
      db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?').run(intentos, bloqueadoHasta, id),
    limpiarFallos: (id) =>
      db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(id),
  };

  const habitaciones = {
    listar: () => db.prepare('SELECT * FROM habitaciones WHERE activa = 1 ORDER BY numero').all(),
    porId: (id) => db.prepare('SELECT * FROM habitaciones WHERE id = ?').get(id),
    porNumeroActiva: (n) => db.prepare('SELECT * FROM habitaciones WHERE numero = ? AND activa = 1').get(n),
    crear: (h) =>
      db
        .prepare(
          `INSERT INTO habitaciones (numero, tipo, capacidad_maxima, orientacion)
           VALUES (@numero, @tipo, @capacidad_maxima, @orientacion)`
        )
        .run(h).lastInsertRowid,
    actualizar: (id, h) =>
      db
        .prepare(
          `UPDATE habitaciones SET numero=@numero, tipo=@tipo, capacidad_maxima=@capacidad_maxima,
           orientacion=@orientacion WHERE id=@id`
        )
        .run({ ...h, id }),
    setEstado: (id, estado) => db.prepare('UPDATE habitaciones SET estado = ? WHERE id = ?').run(estado, id),
    desactivar: (id) => db.prepare('UPDATE habitaciones SET activa = 0 WHERE id = ?').run(id),
    contar: () => db.prepare('SELECT COUNT(*) AS n FROM habitaciones').get().n,
  };

  const pasajeros = {
    porRut: (rut) => db.prepare('SELECT * FROM pasajeros WHERE rut = ?').get(rut),
    porId: (id) => db.prepare('SELECT * FROM pasajeros WHERE id = ?').get(id),
    crear: (p) =>
      db
        .prepare(
          `INSERT INTO pasajeros (rut, nombre_completo, email, telefono, creado_en)
           VALUES (@rut, @nombre_completo, @email, @telefono, @creado_en)`
        )
        .run(p).lastInsertRowid,
    actualizar: (id, p) =>
      db
        .prepare('UPDATE pasajeros SET nombre_completo=@nombre_completo, email=@email, telefono=@telefono WHERE id=@id')
        .run({ ...p, id }),
  };

  const BASE_ASIG = `
    SELECT a.id, a.grupo_id, a.cantidad_ocupantes, a.acompanantes, a.fecha_entrada, a.fecha_salida_estimada,
           a.fecha_salida_real, a.noches, a.tarifa_noche, a.costo_total, a.estado, a.creado_en,
           h.id AS habitacion_id, h.numero AS habitacion_numero, h.tipo AS habitacion_tipo,
           p.id AS pasajero_id, p.nombre_completo AS pasajero_nombre, p.rut AS pasajero_rut
    FROM asignaciones a
    JOIN habitaciones h ON h.id = a.habitacion_id
    JOIN pasajeros p ON p.id = a.pasajero_id`;

  const asignaciones = {
    crear: (a) =>
      db
        .prepare(
          `INSERT INTO asignaciones (grupo_id, habitacion_id, pasajero_id, cantidad_ocupantes, acompanantes,
             fecha_entrada, fecha_salida_estimada, noches, tarifa_noche, costo_total, estado, creado_en, usuario_id)
           VALUES (@grupo_id, @habitacion_id, @pasajero_id, @cantidad_ocupantes, @acompanantes,
             @fecha_entrada, @fecha_salida_estimada, @noches, @tarifa_noche, @costo_total, 'ACTIVA', @creado_en, @usuario_id)`
        )
        .run(a).lastInsertRowid,
    porId: (id) => db.prepare(`${BASE_ASIG} WHERE a.id = ?`).get(id),
    activas: () => db.prepare(`${BASE_ASIG} WHERE a.estado = 'ACTIVA' ORDER BY h.numero`).all(),
    finalizar: (id, fechaReal) =>
      db.prepare("UPDATE asignaciones SET estado='FINALIZADA', fecha_salida_real=? WHERE id=?").run(fechaReal, id),
    historial: ({ habitacionId, pasajeroId }) => {
      const cond = [];
      const params = [];
      if (habitacionId) { cond.push('a.habitacion_id = ?'); params.push(habitacionId); }
      if (pasajeroId) { cond.push('a.pasajero_id = ?'); params.push(pasajeroId); }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      // Límite fijo: previene exportaciones masivas (RNF-08)
      return db.prepare(`${BASE_ASIG} ${where} ORDER BY a.creado_en DESC LIMIT 100`).all(...params);
    },
  };

  const auditoria = {
    registrar: ({ usuarioId = null, username = null, accion, detalle = null, ip = null }) =>
      db
        .prepare('INSERT INTO auditoria (fecha, usuario_id, username, accion, detalle, ip) VALUES (?,?,?,?,?,?)')
        .run(new Date().toISOString(), usuarioId, username, accion, detalle, ip),
    listar: (limite = 200) => db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(limite),
  };

  return { usuarios, habitaciones, pasajeros, asignaciones, auditoria };
}

module.exports = { crearRepos };
