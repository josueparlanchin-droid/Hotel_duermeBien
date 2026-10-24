'use strict';
const config = require('./src/config');
const { abrirDb } = require('./src/data/db');
const { crearApp } = require('./src/presentation/app');
const { sembrarSiVacio, USUARIOS } = require('./src/seed');

const db = abrirDb(config.DB_PATH);
if (sembrarSiVacio(db, config)) {
  console.log('\nBase de datos inicializada. Usuarios de demostración (cámbielos en producción):');
  for (const u of USUARIOS) console.log(`  ${u.rol.padEnd(14)} usuario: ${u.username.padEnd(10)} contraseña: ${u.pass}`);
}

const app = crearApp(db, config);
app.listen(config.PORT, () => console.log(`\nDuerme Bien en http://localhost:${config.PORT}\n`));
