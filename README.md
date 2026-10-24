# Duerme Bien — Prototipo funcional de gestión hotelera

Prototipo del **Sistema Automatizado de Gestión Hotelera** del Hotel "Duerme Bien" (Ingeniería de Software, Inacap, Unidad 3).
Reemplaza las planillas Excel por un sistema web centralizado: registro de pasajeros, asignación de habitaciones (individual y por grupos), check-out, tablero de estado casi en tiempo real, historial y administración de usuarios.

## Tecnologías (todas libres / open source)

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3 y JavaScript (sin frameworks) |
| Backend | JavaScript sobre Node.js 22 con Express 5 |
| Base de datos | SQL sobre SQLite (better-sqlite3), motor relacional con integridad referencial |
| Seguridad | bcryptjs, helmet, express-session, express-rate-limit |
| Servicios externos (cloud) | Open-Meteo (clima) y mindicador.cl (dólar observado, datos del Banco Central de Chile): APIs REST públicas, sin clave |
| Pruebas | Node.js test runner + Supertest |

## Arquitectura: capas + cliente-servidor

```
Navegador (SaaS)  ──HTTPS/JSON──▶  src/presentation  (rutas REST, sesión, CSRF, RBAC, errores)
 public/ (SPA)                      src/business      (reglas de negocio RN01–RN04, validaciones, costos)
                                    src/data          (repositorios SQL parametrizados, esquema)
                                          └── SQLite
```

## Cómo ejecutarlo

```bash
npm install
npm start            # http://localhost:3000  (crea la BD y los usuarios la primera vez)
npm run demo         # opcional: carga estadías de ejemplo
npm test             # 52 casos de prueba; regenera docs/CASOS_DE_PRUEBA.md
```

| Rol | Usuario | Contraseña (solo demo) |
|---|---|---|
| Administrador | `admin` | `Admin#2026` |
| Encargado de Hotel | `encargado` | `Encargado#2026` |

Variables de entorno: `PORT`, `DB_PATH`, `SESSION_SECRET` (obligatoria con `NODE_ENV=production`), `HOTEL_CIUDAD`, `HOTEL_LAT`, `HOTEL_LON` (ubicación del hotel para el clima; por defecto Viña del Mar).

> **Si ya había ejecutado una versión anterior**, borre el archivo `data/duerme-bien.db` y vuelva a ejecutar `npm start`: las orientaciones, las noches y la capacidad por tipo cambiaron el esquema y el sistema se lo avisará.

## Qué hace cada rol

- **Administrador**: crea, activa y desactiva usuarios (RF-2, RF-4, CU-02) y consulta el registro de auditoría. No accede a datos de pasajeros (RNF-08).
- **Encargado de Hotel**: tablero de estado, registro y asignación (individual o grupo en varias habitaciones con un responsable), check-out, gestión de habitaciones, pasajeros hospedados, búsqueda/actualización de pasajeros e historial.

## Trazabilidad con el informe

| Requisito / regla | Implementación |
|---|---|
| RF-1, RF-2, RF-4 | `authService`, `usuarioService`, roles ADMINISTRADOR / ENCARGADO |
| RF-3, CU-03/04/05 | `habitacionService` (eliminación lógica que conserva el historial; bloqueada si está ocupada) |
| RF-5 | `pasajeroService` + autocompletado por RUT en el formulario |
| RF-6, RF-7, RN01, RN03 | `asignacionService.crear` (solo habitaciones "Disponible", capacidad máxima según el tipo de habitación, transacción atómica) |
| RF-8, RN04 | `asignacionService.checkout` → habitación "En limpieza" hasta que el personal la marque lista |
| RF-9 | Historial por habitación y por pasajero |
| RN02 | RUT chileno validado con módulo 11 |
| CU-08, CU-09, CU-10 | Costo informativo = ocupantes × noches × $40.000 (1 pasajero, 3 noches = $120.000), timestamp de asignación, grupos en varias habitaciones |
| RNF-03 | Tablero con actualización automática cada 10 s |
| RNF-07 | Contraseñas con bcrypt (costo 12) |
| RNF-08 | RBAC, sin exportaciones masivas (consultas con límite de 100 filas) |

## Habitaciones: tipo, capacidad y orientación

La capacidad no se digita: se deriva del tipo (`src/business/reglas.js`). **Simple 1 · Doble 2 · Suite 3 · Familiar 4.** La orientación es **Vista al mar** o **Vista a la ciudad**. El cliente no puede alterar la capacidad (se ignora cualquier valor enviado) y no se puede cambiar el tipo de una habitación ocupada.

## Servicios externos en la nube

El backend consume dos APIs REST públicas (modelo SaaS), implementadas en `src/business/serviciosExternos.js`:

| Servicio | Uso en el sistema |
|---|---|
| **Open-Meteo** (`api.open-meteo.com`) | Clima actual de la ciudad del hotel en el tablero |
| **mindicador.cl** (datos del Banco Central de Chile) | Dólar observado: en el tablero y como equivalente en US$ del costo de la estadía |

Se consumen siempre desde el servidor (el navegador nunca contacta a terceros, la CSP lo impide), con tiempo máximo de espera de 4 s y caché de 10 min. Si el servicio no responde, el sistema **sigue funcionando** y la interfaz oculta ese dato (degradación elegante). Requiere conexión a internet para mostrar esos datos.

## Seguridad aplicada (OWASP Top 10, ISO/IEC 27000 y Ley 21.459)

| Riesgo / control | Medida en el código |
|---|---|
| A01 Control de acceso (ISO 27002 · control de acceso) | RBAC por rol en cada ruta; el usuario se revalida en cada petición (una cuenta desactivada pierde acceso al instante); token CSRF + cookie SameSite=Strict |
| A02 Criptografía | Hash bcrypt; cookie `Secure` en producción |
| A03 Inyección / XSS | Consultas parametrizadas; validación estricta de entradas; el frontend nunca usa `innerHTML`; CSP sin scripts inline |
| A04 Diseño inseguro | Reglas de negocio en la capa de negocio, transacciones atómicas |
| A05 Configuración | helmet (CSP, nosniff, frame-ancestors), sin `X-Powered-By`, errores genéricos |
| A07 Autenticación | Bloqueo tras 5 intentos fallidos (15 min), límite de solicitudes por IP, mensajes genéricos, regeneración de sesión, expiración por inactividad (20 min) |
| A09 Registro y monitoreo (ISO 27002 · logs) | Tabla `auditoria`: inicios de sesión, fallos, creación de usuarios, asignaciones, check-outs, accesos denegados |
| Ley 21.459 (delitos informáticos) | Controles contra acceso ilícito (autenticación, bloqueo, RBAC) y trazabilidad de todas las operaciones |

## Pruebas

`npm test` ejecuta 52 casos (flujos válidos = *éxito*; entradas inválidas, reglas violadas o ataques que el sistema debe rechazar = *fracaso*) y genera `docs/CASOS_DE_PRUEBA.md` con ID, descripción, resultado esperado, resultado obtenido y estado.

## Despliegue en la nube

- **Recomendado:** [Render](https://render.com/) (plan Free). Soporta proceso Node persistente y disco efímero/sin disco para SQLite en archivo. Las variables necesarias son `NODE_ENV=production`, `SESSION_SECRET` y opcional `DB_PATH`.
- **Blueprint:** este repo incluye `render.yaml`. En Render, `New > Blueprint` y conecta el repositorio.
- **Nota:** En plan Free los datos se reinician en cada deploy/reinicio y el servicio duerme tras 15 min sin uso. Si se requiere persistencia entre reinicios se necesita disco persistente (plan pago) o migrar a una BD externa.
- **Servicios externos:** El sistema ya consume **Open-Meteo** y **mindicador.cl** (sin API key), cumpliendo el requisito de uso de un servicio externo.

## Decisiones respecto al informe

- **Capacidad por tipo**: Simple 1, Doble 2, Suite 3, Familiar 4 (editable en `src/business/reglas.js`). Los 4 valores se derivaron del enunciado; la capacidad de la Suite (3) es una decisión del equipo.
- **Capacidad (RN03 vs CU-07)**: el informe dice "máximo" en RN03 y "coincidencia exacta" en CU-07. Se implementó RN03 (los ocupantes no pueden superar la capacidad), que es lo coherente con un hotel real.
- El rol "Recepcionista" del diagrama de clases se unificó como **Encargado de Hotel** (nombre usado en los casos de uso).
- Se agregó el atributo **tipo** de habitación (Simple, Doble, Suite, Familiar), que RN03 menciona.
- La **fecha de entrada** de una asignación es la del día (es un check-in); no hay reservas futuras en esta fase.
- El costo es solo informativo (RE-4): no hay pasarela de pago. Se calcula por pasajero y por noche.
