'use strict';
// Reporter personalizado: genera docs/CASOS_DE_PRUEBA.md a partir de los casos CP-xx
module.exports = async function* reporteMarkdown(fuente) {
  const filas = [];
  for await (const ev of fuente) {
    if ((ev.type === 'test:pass' || ev.type === 'test:fail') && ev.data.nesting === 0 && /^CP-\d+/.test(ev.data.name)) {
      const [id, tipo, descripcion, esperado] = ev.data.name.split(' | ');
      const ok = ev.type === 'test:pass';
      const msg = ok ? '' : String(ev.data.details?.error?.message ?? 'Error').split('\n')[0];
      filas.push({ id, tipo, descripcion, esperado, ok, msg });
    }
  }
  filas.sort((a, b) => a.id.localeCompare(b.id));
  const total = filas.length;
  const aprobados = filas.filter((f) => f.ok).length;
  const exitos = filas.filter((f) => f.tipo === 'ÉXITO').length;
  const fracasos = total - exitos;
  const esc = (t) => String(t ?? '').replace(/\|/g, '\\|');
  const fecha = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  let md = `# Documentación de pruebas — Prototipo Hotel "Duerme Bien"\n\n`;
  md += `Ejecución automatizada con \`npm test\` (Node.js test runner + Supertest) el ${fecha}.\n\n`;
  md += `**Resumen:** ${total} casos de prueba — ${aprobados} aprobados, ${total - aprobados} fallidos.  \n`;
  md += `**Casos de éxito** (flujo válido que el sistema debe aceptar): ${exitos}.  \n`;
  md += `**Casos de fracaso** (entrada inválida, regla de negocio violada o ataque que el sistema debe rechazar): ${fracasos}.\n\n`;
  md += `| ID | Tipo | Caso de prueba | Resultado esperado | Resultado obtenido | Estado |\n|---|---|---|---|---|---|\n`;
  for (const f of filas) {
    const obtenido = f.ok ? 'Coincide con lo esperado' : `No coincide: ${f.msg}`;
    md += `| ${f.id} | ${f.tipo} | ${esc(f.descripcion)} | ${esc(f.esperado)} | ${esc(obtenido)} | ${f.ok ? 'Aprobado' : 'FALLÓ'} |\n`;
  }
  yield md;
};
