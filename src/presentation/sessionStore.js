'use strict';
// Almacén de sesiones persistente en SQLite (evita el MemoryStore, no apto para producción)
const session = require('express-session');

class SqliteStore extends session.Store {
  constructor(db, idleMs) {
    super();
    this.db = db;
    this.idleMs = idleMs;
    const limpiar = () => this.db.prepare('DELETE FROM sesiones WHERE expire < ?').run(Date.now());
    limpiar();
    setInterval(limpiar, 10 * 60 * 1000).unref();
  }
  _expire(sess) {
    return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.idleMs;
  }
  get(sid, cb) {
    try {
      const r = this.db.prepare('SELECT sess, expire FROM sesiones WHERE sid = ?').get(sid);
      if (!r) return cb(null, null);
      if (r.expire < Date.now()) {
        this.db.prepare('DELETE FROM sesiones WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(r.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      this.db
        .prepare('INSERT INTO sesiones (sid, sess, expire) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire')
        .run(sid, JSON.stringify(sess), this._expire(sess));
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  touch(sid, sess, cb) {
    try {
      this.db.prepare('UPDATE sesiones SET expire = ? WHERE sid = ?').run(this._expire(sess), sid);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sesiones WHERE sid = ?').run(sid);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
}

module.exports = { SqliteStore };
