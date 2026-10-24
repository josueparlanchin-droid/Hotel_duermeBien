'use strict';
// CAPA DE NEGOCIO - Integración con servicios externos en la nube (APIs REST públicas, modelo SaaS)
//   1) Open-Meteo        → clima actual de la ciudad del hotel (https://open-meteo.com)
//   2) mindicador.cl     → dólar observado, datos del Banco Central de Chile (https://mindicador.cl)
// Se consumen desde el servidor (el navegador nunca contacta a terceros: la CSP lo impide) con:
//   · tiempo máximo de espera, · caché de 10 minutos, · degradación elegante: si el servicio
//   externo cae, el sistema sigue funcionando y la interfaz simplemente oculta ese dato.

const CLIMA = [
  [[0], 'Despejado'], [[1, 2], 'Parcialmente nublado'], [[3], 'Nublado'], [[45, 48], 'Niebla'],
  [[51, 53, 55, 56, 57], 'Llovizna'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Lluvia'],
  [[71, 73, 75, 77, 85, 86], 'Nieve'], [[95, 96, 99], 'Tormenta'],
];
const descripcionClima = (codigo) => CLIMA.find(([codigos]) => codigos.includes(codigo))?.[1] ?? 'Sin datos';

function crearServiciosExternos(config, fetchFn = globalThis.fetch) {
  const cache = new Map();

  async function consultar(clave, url, transformar) {
    const previo = cache.get(clave);
    if (previo && Date.now() - previo.t < config.EXTERNOS_CACHE_MS) return previo.v;
    try {
      const res = await fetchFn(url, {
        signal: AbortSignal.timeout(config.EXTERNOS_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = { disponible: true, ...transformar(await res.json()) };
      cache.set(clave, { v, t: Date.now() });
      return v;
    } catch (e) {
      if (!config.esTest) console.warn(`[servicio externo] ${clave} no disponible: ${e.message}`);
      if (previo) return { ...previo.v, desactualizado: true }; // último dato conocido
      return { disponible: false };
    }
  }

  return {
    clima: () =>
      consultar(
        'clima',
        `https://api.open-meteo.com/v1/forecast?latitude=${config.HOTEL_LAT}&longitude=${config.HOTEL_LON}` +
          '&current=temperature_2m,weather_code,wind_speed_10m&timezone=America%2FSantiago',
        (d) => {
          const c = d?.current;
          if (!c || typeof c.temperature_2m !== 'number') throw new Error('respuesta inesperada');
          return {
            ciudad: config.HOTEL_CIUDAD,
            temperatura: Math.round(c.temperature_2m),
            vientoKmH: Math.round(c.wind_speed_10m ?? 0),
            descripcion: descripcionClima(c.weather_code),
            fuente: 'Open-Meteo',
          };
        }
      ),

    dolar: () =>
      consultar('dolar', 'https://mindicador.cl/api', (d) => {
        const valor = Number(d?.dolar?.valor);
        if (!(valor > 0)) throw new Error('respuesta inesperada');
        return { valor, fecha: d.dolar.fecha ?? null, fuente: 'mindicador.cl (Banco Central de Chile)' };
      }),
  };
}

module.exports = { crearServiciosExternos, descripcionClima };
