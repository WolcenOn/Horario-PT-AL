# Hoja de ruta multiusuario, seguridad y versatilidad

Estado: rama `integracion-gestor-escuela` + backend `GestorEscuela/integracion-horario-pt-al`.

## Principios

1. El modo local debe seguir funcionando sin cuenta ni servidor. IndexedDB continúa siendo válido para uso offline autónomo.
2. En un centro gestionado online, PostgreSQL será la fuente compartida de verdad y el almacenamiento local actuará como caché/soporte offline, nunca como sincronización silenciosa sin versiones.
3. La identidad debe estar verificada criptográficamente. `X-Actor-Id` y `X-Actor-Role` son únicamente un mecanismo temporal de integración.
4. Toda escritura relevante debe ser atribuible a una persona y conservar trazabilidad mínima sin duplicar datos personales en los logs.
5. Dirección y Jefatura tendrán capacidades diferentes; el profesorado podrá evolucionar hacia una vista de solo lectura de su propio horario.

## Roles y capacidades objetivo

| Rol | Uso esperado | Capacidades principales |
| --- | --- | --- |
| ADMIN | Dirección / administración del sistema | usuarios, membresías, publicación, auditoría, restauración y configuración sensible |
| PLANNER | Jefatura de estudios | plantilla, reparto, horario, optimización, ausencias, sustituciones y actividades |
| VIEWER | consulta autorizada | lectura del centro sin cambios |
| Docente propio (futuro) | profesorado | lectura de su ficha/horario y, si se habilita, preferencias personales limitadas |

A medio plazo conviene expresar permisos como capacidades (`planning.edit`, `planning.solve`, `planning.publish`, `audit.view`, `roster.edit`, `users.manage`) y mantener los roles como conjuntos de capacidades.

## Modelo multi-centro y cursos académicos

La siguiente evolución del backend debería ser:

`School -> AcademicYear -> PlanningScenario -> configuración / plantilla / matrícula / horarios`

Un centro debe poder conservar 2026/27 publicado mientras prepara 2027/28. Un escenario podrá estar en borrador, publicado o archivado. Publicar un escenario debe ser una acción explícita y auditada.

## Concurrencia y sincronización

Los planes diarios ya tienen versionado optimista. Hay que extender el mismo principio a configuración académica, matrícula, reparto y horario semanal. Cada escritura desde el navegador debe enviar la versión base; si otro usuario ha cambiado el recurso, el backend debe responder `409 Conflict` y la interfaz mostrar las diferencias antes de sobrescribir.

No se implementará una fusión automática bidireccional IndexedDB/PostgreSQL sin control de versiones.

## Autenticación

La integración actual usa cabeceras provisionales. El objetivo es autenticación OIDC/OAuth 2.1 con Authorization Code + PKCE y tokens de corta duración, o una sesión backend equivalente basada en un proveedor de identidad fiable. Antes de elegir proveedor hay que confirmar si el centro utiliza Microsoft 365, Google Workspace u otro sistema institucional.

Cuando el modo seguro esté listo:

- `ALLOW_LEGACY_ROLE_BOOTSTRAP=false` en producción.
- ningún `actorId` presentado por el cliente se considerará prueba de identidad.
- logout/revocación y expiración serán verificables.
- no se guardarán tokens de larga duración en `localStorage`.

## Auditoría

El backend dispone de una traza transversal para escrituras. El registro base contiene request-id, usuario, rol, centro, método, ruta, resultado y fecha. No contiene cuerpos de peticiones ni respuestas.

Siguiente nivel de auditoría semántica para cambios sensibles:

- profesor creado/modificado/desactivado;
- tutoría cambiada;
- reparto docente aplicado;
- horario generado/aplicado/publicado;
- actividad añadida/modificada;
- matrícula sincronizada;
- ausencia y sustitución confirmada;
- usuario/rol modificado.

Para estos eventos se guardarán identificadores y campos mínimos modificados, no copias completas de fichas de alumnado.

## Hardening

Prioridades:

- CORS limitado a orígenes aprobados.
- límites de tamaño de petición.
- cabeceras `nosniff`, anti-frame, referrer y permissions policy; HSTS en HTTPS.
- documentación OpenAPI deshabilitable en producción.
- rate limiting en autenticación y operaciones de cálculo costosas.
- límites de tiempo/tamaño en solver.
- validación estricta de cargas JSON.
- secretos únicamente en variables del despliegue.
- backups PostgreSQL y restauraciones ensayadas.
- pruebas automáticas de aislamiento entre centros.
- dependencias revisadas y actualizadas regularmente.

## Playwright

Matriz mínima frontend:

- 1440x900 escritorio;
- 1024x768 escritorio compacto;
- posteriormente tablet/móvil para vistas de consulta.

Flujos críticos a cubrir:

1. arranque offline sin errores;
2. navegación principal;
3. formularios complejos sin solapes visuales;
4. crear clases y matrícula masiva;
5. alumno con PT + AL;
6. perfil docente con tutoría, especialidad, habilitaciones y otro centro;
7. ficha individual de horario docente;
8. Biblioteca/Lectura/Coordinación y patrones temporales;
9. estudio de plantilla y reparto;
10. generación y aplicación del horario;
11. exportación/importación sin pérdida;
12. login/logout/expiración cuando exista auth real;
13. controles visibles según ADMIN/PLANNER/VIEWER;
14. operación de jefatura que genera un evento de auditoría;
15. usuario de centro A incapaz de leer/escribir centro B;
16. conflicto de edición simultánea con respuesta 409.

## Versatilidad para centros distintos

El modelo debería poder activar de forma opcional, sin obligar a todos los centros, estas capacidades:

- varios recreos y jornadas partidas;
- etapas adicionales y nomenclaturas de grupos configurables;
- profesorado parcial o itinerante;
- dos docentes simultáneos / codocencia;
- desdobles y agrupamientos flexibles;
- aulas, edificios y recursos compartidos;
- bilingüismo y materias con requisitos adicionales;
- optativas y grupos mezclados;
- actividades de biblioteca, lectura, programas y coordinaciones;
- criterios de desplazamiento entre edificios;
- perfiles curriculares importables por normativa/territorio;
- reglas y pesos de optimización por centro.

La configuración debe distinguir siempre entre restricción dura y preferencia para evitar que una peculiaridad organizativa convierta innecesariamente un horario en imposible.
