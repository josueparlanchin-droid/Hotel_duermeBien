# Documentación de pruebas — Prototipo Hotel "Duerme Bien"

Ejecución automatizada con `npm test` (Node.js test runner + Supertest) el 22-10-2026, 7:08:23 p. m..

**Resumen:** 52 casos de prueba — 52 aprobados, 0 fallidos.  
**Casos de éxito** (flujo válido que el sistema debe aceptar): 21.  
**Casos de fracaso** (entrada inválida, regla de negocio violada o ataque que el sistema debe rechazar): 31.

| ID | Tipo | Caso de prueba | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|
| CP-01 | ÉXITO | Inicio de sesión con credenciales válidas (Administrador) | 200, rol ADMINISTRADOR y token CSRF entregado | Coincide con lo esperado | Aprobado |
| CP-02 | FRACASO | Inicio de sesión con contraseña incorrecta | 401 con mensaje genérico, sin crear sesión | Coincide con lo esperado | Aprobado |
| CP-03 | FRACASO | Inicio de sesión con usuario inexistente | 401 con el mismo mensaje (no revela si el usuario existe) | Coincide con lo esperado | Aprobado |
| CP-04 | FRACASO | Inyección SQL en el campo usuario (' OR '1'='1' --) | 401, el ataque no evade la autenticación | Coincide con lo esperado | Aprobado |
| CP-05 | FRACASO | Cinco intentos fallidos consecutivos | La cuenta se bloquea (423) incluso con la contraseña correcta | Coincide con lo esperado | Aprobado |
| CP-06 | FRACASO | Acceso a una ruta protegida sin sesión | 401 No autenticado | Coincide con lo esperado | Aprobado |
| CP-07 | FRACASO | Encargado intenta listar usuarios (escalamiento de privilegios) | 403 Prohibido | Coincide con lo esperado | Aprobado |
| CP-08 | FRACASO | Administrador intenta acceder a datos de pasajeros y habitaciones (RNF-08) | 403 Prohibido | Coincide con lo esperado | Aprobado |
| CP-09 | FRACASO | Petición de modificación sin token CSRF | 403 y la habitación no se crea | Coincide con lo esperado | Aprobado |
| CP-10 | ÉXITO | Contraseñas almacenadas con hash bcrypt (RNF-07) | Ninguna contraseña en texto plano en la base de datos | Coincide con lo esperado | Aprobado |
| CP-11 | ÉXITO | Atributos de la cookie de sesión | Cookie HttpOnly y SameSite=Strict | Coincide con lo esperado | Aprobado |
| CP-12 | ÉXITO | Cabeceras de seguridad HTTP (OWASP A05) | CSP presente, nosniff activo y sin X-Powered-By | Coincide con lo esperado | Aprobado |
| CP-13 | ÉXITO | Administrador crea un usuario con rol Encargado (RF-4, CU-02) | 201 y el nuevo usuario puede iniciar sesión | Coincide con lo esperado | Aprobado |
| CP-14 | FRACASO | Creación de usuario con contraseña débil | 400 con mensaje de política de contraseñas | Coincide con lo esperado | Aprobado |
| CP-15 | FRACASO | Usuario desactivado por el Administrador | Pierde el acceso de inmediato (sesión activa y nuevo login) | Coincide con lo esperado | Aprobado |
| CP-16 | ÉXITO | Cierre de sesión | La sesión queda invalidada (401 al consultar el perfil) | Coincide con lo esperado | Aprobado |
| CP-17 | FRACASO | Inyección SQL en la búsqueda de pasajero por RUT | 400, la entrada se rechaza por validación | Coincide con lo esperado | Aprobado |
| CP-18 | FRACASO | Script malicioso (XSS) en el nombre del pasajero | 400, no se registra el pasajero ni se ocupa la habitación | Coincide con lo esperado | Aprobado |
| CP-19 | ÉXITO | Registrar una habitación válida con vista al mar (CU-03, RF-3) | 201, estado DISPONIBLE y capacidad 2 según el tipo Doble | Coincide con lo esperado | Aprobado |
| CP-20 | FRACASO | Registrar una habitación con número duplicado | 409 Conflicto | Coincide con lo esperado | Aprobado |
| CP-21 | FRACASO | Registrar habitaciones con tipo inválido o con la orientación antigua "NORTE" | 400 en ambos casos | Coincide con lo esperado | Aprobado |
| CP-22 | ÉXITO | Eliminar una habitación sin pasajeros activos (CU-04) | 200, sale del listado y el historial se conserva | Coincide con lo esperado | Aprobado |
| CP-23 | FRACASO | Eliminar una habitación con pasajeros activos (CU-05) | 409 y la habitación permanece OCUPADA | Coincide con lo esperado | Aprobado |
| CP-24 | FRACASO | Cambiar manualmente a mantenimiento una habitación ocupada | 409, solo el check-out libera la habitación | Coincide con lo esperado | Aprobado |
| CP-25 | ÉXITO | Asignar habitación disponible dentro de su capacidad (RF-6, CU-07, CU-08, CU-09) | 201, costo 2 ocupantes × 2 noches × $40.000 = $160.000, habitación OCUPADA y fecha/hora registrada | Coincide con lo esperado | Aprobado |
| CP-26 | FRACASO | Asignar con RUT inválido (RN02) | 400 y la habitación sigue DISPONIBLE | Coincide con lo esperado | Aprobado |
| CP-27 | FRACASO | Ocupantes superan la capacidad máxima (RN03) | 422 y la habitación sigue DISPONIBLE | Coincide con lo esperado | Aprobado |
| CP-28 | FRACASO | Asignar una habitación ya ocupada (RN01, RF-7) | 409 y no se crea una segunda asignación | Coincide con lo esperado | Aprobado |
| CP-29 | FRACASO | Asignar una habitación en mantenimiento (RN01) | 409 con el estado actual en el mensaje | Coincide con lo esperado | Aprobado |
| CP-30 | ÉXITO | Grupo distribuido en varias habitaciones con un responsable (CU-10) | 201, 2 asignaciones, costo 5 personas × 2 noches × $40.000 = $400.000 y ambas OCUPADAS | Coincide con lo esperado | Aprobado |
| CP-31 | FRACASO | Varias habitaciones sin marcar la estadía como grupo | 400 | Coincide con lo esperado | Aprobado |
| CP-32 | FRACASO | Fecha de salida igual o anterior a la de entrada | 400 | Coincide con lo esperado | Aprobado |
| CP-33 | FRACASO | Fecha de entrada distinta a la fecha actual | 400 | Coincide con lo esperado | Aprobado |
| CP-34 | ÉXITO | Check-out de un huésped (RF-8, RN04) | 200, fecha real de salida registrada y habitación EN_LIMPIEZA | Coincide con lo esperado | Aprobado |
| CP-35 | FRACASO | Reasignar una habitación inmediatamente después del check-out (RN04) | 409 hasta que el personal la marque como lista | Coincide con lo esperado | Aprobado |
| CP-36 | ÉXITO | Marcar la habitación como lista y volver a asignarla | 200 y nueva asignación 201 | Coincide con lo esperado | Aprobado |
| CP-37 | FRACASO | Check-out de una estadía ya finalizada | 409 | Coincide con lo esperado | Aprobado |
| CP-38 | FRACASO | Grupo con una habitación válida y otra no disponible (atomicidad) | 409 y NINGUNA habitación queda ocupada | Coincide con lo esperado | Aprobado |
| CP-39 | ÉXITO | Consultar historial por habitación y por pasajero (RF-9) | Estadías finalizadas visibles en ambas consultas | Coincide con lo esperado | Aprobado |
| CP-40 | ÉXITO | Buscar pasajero por RUT y actualizar su contacto (RF-5) | 200 con datos actualizados; 400 con correo inválido; 404 si no existe | Coincide con lo esperado | Aprobado |
| CP-41 | ÉXITO | Mismo pasajero en dos estadías distintas | Un solo registro de pasajero y dos estadías en su historial | Coincide con lo esperado | Aprobado |
| CP-42 | ÉXITO | Consultar pasajeros hospedados (CU-12) | Lista con habitación, RUT del responsable y cantidad de ocupantes | Coincide con lo esperado | Aprobado |
| CP-43 | ÉXITO | Registro de auditoría de operaciones sensibles (ISO 27002) | El Administrador ve intentos fallidos, inicios de sesión y asignaciones | Coincide con lo esperado | Aprobado |
| CP-44 | ÉXITO | Costo según la cantidad de noches (1 pasajero, 3 noches) | 201, noches = 3 y costo total $120.000 | Coincide con lo esperado | Aprobado |
| CP-45 | FRACASO | Habitación Simple con 2 ocupantes (capacidad 1 por tipo) | 422 y la habitación sigue DISPONIBLE | Coincide con lo esperado | Aprobado |
| CP-46 | ÉXITO | Capacidad según tipo: Simple 1, Doble 2, Suite 3, Familiar 4 | Habitaciones con la capacidad de su tipo y Familiar acepta 4 ocupantes | Coincide con lo esperado | Aprobado |
| CP-47 | FRACASO | El cliente intenta fijar una capacidad distinta a la del tipo (Simple con capacidad 10) | 201 pero la capacidad queda en 1: se ignora el valor enviado | Coincide con lo esperado | Aprobado |
| CP-48 | FRACASO | Cambiar el tipo de una habitación ocupada | 409, no se altera la capacidad con huéspedes dentro | Coincide con lo esperado | Aprobado |
| CP-49 | ÉXITO | Consumo de servicios externos (Open-Meteo y mindicador.cl) | 200 con temperatura, descripción del clima y valor del dólar | Coincide con lo esperado | Aprobado |
| CP-50 | FRACASO | Servicio externo caído (sin conexión) | 200 con disponible=false y el resto del sistema sigue funcionando | Coincide con lo esperado | Aprobado |
| CP-51 | ÉXITO | Caché de servicios externos | Dos consultas seguidas realizan una sola llamada al tercero | Coincide con lo esperado | Aprobado |
| CP-52 | FRACASO | Acceso a servicios externos sin sesión o con rol Administrador | 401 sin sesión y 403 como Administrador | Coincide con lo esperado | Aprobado |
