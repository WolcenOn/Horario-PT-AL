# Ausencias simultáneas de profesorado y ranking de alternativas

**Estado:** cálculo conjunto de clases y PT/AL incorporado en ramas de
integración; la ampliación backend **no está desplegada**. La respuesta de
servidores anteriores sigue marcando como desconocidos los apoyos que no
resuelven. Se audita también **cada sesión completa**, con continuidad
del especialista y recursos locales configurados. Ahora revisa además
extracción configurada y desplazamientos explícitos (sin emitir identidades
de alumnado), pero no certifica su atención ni inventa tiempos de viaje.
Ranking, aplicación y comprobación individual real pendientes.  
**Fecha:** 13 de octubre de 2026.  
**Ramas objetivo:** Horario-PT-AL/`integracion-gestor-escuela` y
GestorEscuela/`integracion-horario-pt-al`, sin tocar `main`.

## 1. Problema que resuelve

Un centro debe reaccionar al mismo tiempo a ausencias de varios docentes:
tutoría, especialistas, PT, AL y personal compartido/itinerante.
Una sustitución aislada puede consumir al único docente que permitía
resolver otra ausencia. Todas las decisiones deben evaluarse juntas.

El sistema **no decidirá ni publicará una sustitución automáticamente**.
Mostrará escenarios temporales sobre una copia de la planificación y
permitirá al equipo responsable comparar la cobertura conseguida, las
restricciones incumplibles y el coste pedagógico u organizativo.

El **ranking es de propuestas de organización**, no una calificación del
profesorado ni del alumnado.

## 2. Base existente y limitaciones verificadas

| Elemento | Estado hoy | Implicación |
|---|---|---|
| Disponibilidad semanal del personal | Existe `disponibilidad`, `bloqueosExternos` y `professionalCanWork` | Reutilizar para el control de disponibilidad permanente, no representar ahí una baja de fechas concretas |
| Generador semanal | `buildWeeklyPreviewRequest` deriva materias y apoyo PT/AL de asignaciones y metas | Extender mediante una capa temporal validada, manteniendo la plantilla base |
| GestorEscuela | La API diaria `solve-academic` admite varias ausencias; el motor de integración también trata PT/AL sin grupo único y exige especialidad exacta, sin solapamientos | **No desplegado**. No comprueba asistencia por participante, aforos ni desplazamientos; sigue generando una única solución, no múltiples propuestas para ranking |
| Comparación y auditoría | Existen calendarios, filtros y diferencias de minutos, salas y docentes en modo vista previa | Reutilizar la revisión para mostrar cada escenario con idénticos criterios |
| Aplicación de escenarios | La aplicación conjunta de un resultado del solver sigue pendiente de Fase 3 | No confundir el ranking con una aprobación |

Este documento no afirma disponibilidad de sustitutos ni cobertura oficial
que los datos no permitan demostrar.

## 3. Modelo de ausencias separado del horario base

Se utiliza una colección local `staffAbsences` con esquema aditivo de IndexedDB v3 y respaldo JSON v6. La colección tiene campos
validables y mínimos (nombres aquí ilustrativos, no contrato ya activo):

- `id` local e identificador de docente referenciado;
- `fromDate`, `toDate` (fechas locales, inclusive), con franja opcional
  `startTime` y `endTime` para todos los días afectados;
- `status` pendiente/resuelta y `resolvedAt` solo tras confirmación humana,
  **sin que el solver dé por buena esa cobertura**;
- *sin* diagnóstico médico, causa sensible ni nota clínica.

Una ausencia prevalece sobre la disponibilidad semanal para los días
afectados: **estar habitualmente disponible no habilita trabajar durante
una ausencia**. Dos ausencias solapadas no se sobrescriben entre sí.
El centro conserva una única agenda de recursos para sustitutos,
titulares, especialistas, actividades y apoyos PT/AL.

**Delimitación temporal:** GestorEscuela calcula actualmente sobre
lunes-viernes sin fecha específica. Para períodos de más de una semana,
crear instancias por semana y fecha, no representar una ausencia del martes
15 de forma permanente todos los martes del curso. Al vencer el período,
el horario base permanece intacto.

**Privacidad:** solo identificadores profesionales y ventanas relevantes
para la resolución de conflictos; nunca el motivo médico. Los datos
individuales del alumnado siguen anonimizados o se quedan en local.

## 4. Gestión conjunta de varias ausencias

1. Elegir una semana/período y registrar *todas* las ausencias activas.
2. Extraer sobre una instantánea los bloques perjudicados: clase, materia,
   docente, PT/AL, sala, restricciones, recreos, actividades y desplazamientos.
3. Construir la lista de reemplazos *elegibles*: presencia efectiva,
   habilitación para materia/etapa, compatibilidad PT/AL, límites
   laborales y de carga cuando estén configurados, no coincidencia de
   sesiones y tiempo de traslado cuando esté definido.
4. Generar **varias alternativas globales**, no resolver a una persona de
   forma aislada y dar por concluida la semana.
5. Si la cobertura total es imposible, mostrar las sesiones desatendidas y
   sus causas sin crear profesorado, disponibilidad o permisos ficticios.
6. Poder comparar, descartar y volver a calcular sin cambiar el horario.
7. La aprobación y aplicación temporal será otro incremento, con control
   de concurrencia, auditoría, reversión y vigencia explícita.

Distinguir ausencia de **reemplazo** y ausencia de **reorganización**:
no siempre habrá un profesional de sustitución. El motor podrá proponer
movimientos o intercambios viables sin perder las sesiones obligatorias.

## 5. Ranking transparente de resultados

**Primero un filtro de validez; solo después una valoración.** Un escenario
que infringe restricciones duras se marca como `no elegible`, aunque
parezca conveniente desde otros puntos de vista.

### Restricciones duras (no se intercambian por puntos)

- No asignar una persona ausente ni un sustituto fuera de su disponibilidad
  real, especialidad/competencia autorizada o carga máxima obligatoria.
- No permitir dobles ocupaciones, solapes, salas imposibles ni saltarse
  desplazamientos configurados.
- Respetar bloqueos y protecciones de extracción PT/AL, seguridad,
  normativa y minutos que hayan sido clasificados como obligatorios.
- No atribuir cobertura individual de grupos PT/AL cuando la respuesta no
  la permite verificar: marcar `desconocido`, no `cumplido`.

### Criterios de calidad (entre candidatos válidos)

Priorizar en orden *lexicográfico*, antes de preferencias ajustables:

1. **Cobertura demostrable** de las sesiones/servicios exigidos.
   Separar alternativas completas de parciales; las parciales se
   etiquetan como `cobertura incompleta`.
2. **Continuidad pedagógica:** minimizar clases sin docente,
   pérdida de PT/AL y materias relevantes, con prioridades definidas
   por el centro (no arbitrarias ni inventadas).
3. **Menor impacto**: traslados o cambios de aula, sesiones desplazadas
   y sustituciones innecesarias.
4. **Distribución de carga:** evitar concentrar sustituciones y
   desplazamientos en una sola persona.
5. **Preferencias blandas**: horarios preferidos, estabilidad y
   criterios configurables, sin invalidar la seguridad.

Dentro de cada nivel se pueden usar **pesos configurables y visibles**
para comparar escenarios equivalentes en requisitos duros. Una
calificación 0–100 puede ayudar a leer el resultado, pero **no** debe
presentarse como probabilidad de éxito ni permitir ganar a una propuesta
que rompe restricciones. Guardar versión de fórmula/pesos para hacer
reproducible la clasificación; desempatar de forma determinista.

Cada alternativa incluirá:

- Identificador de escenario e instantánea de datos de referencia;
- estado (`apta`, `incompleta`, `no elegible` o `indeterminada`);
- desglose de cobertura, minutos, cambios, conflictos, carga y
  preferencias;
- razones de su posición: «menos clases sin cubrir»,
  «mantiene más apoyos PT», «reorganiza menos sesiones»;
- advertencias verificables y condiciones que requieran confirmación.

**Nunca declarar varias alternativas** si la API solo ha devuelto una:
primero crear un contrato de `n` candidatos diferentes o de exploración
iterativa controlada, con presupuesto de tiempo, semilla/diversificación
y deduplicación. El frontend ordenará únicamente respuestas realmente
calculadas y verificadas.

## 6. Ejemplo de decisión conjunta (ficticio)

El mismo martes faltan tutora de 3.º A, especialista de Inglés y docente
PT. Un sustituto disponible para Inglés también cubre 3.º A.

- **Opción A:** ocupa la sustitución de 3.º A, mantiene Inglés sin cubrir
  y deja apoyo PT pendiente.
- **Opción B:** cubre Inglés con el profesional habilitado, reorganiza
  3.º A con otro docente disponible y conserva el apoyo PT existente.
- **Opción C:** parece tener menos cambios, pero asigna dos sesiones
  simultáneas al mismo profesor: **no elegible**, por mucho que sume puntos.

La clasificación real dependerá de los horarios, competencias y
restricciones **registrados**; este ejemplo no representa una solución
ya generada ni una regla legal universal.

## 7. Orden de implementación y criterios de aceptación

### Paso A — Registro local de ausencias (frontend)

- [x] Modelo local fechado y validado; altas simultáneas para varios docentes,
      bloques de jornada completa o parcial y migración aditiva de IndexedDB.
- [x] Calendario mensual global con filtros pendiente/resuelta, vista por día,
      confirmación manual, reapertura, eliminación y respaldo JSON de ausencias.
- [x] Pruebas de fechas imposibles, bisiestos, solapes, simultaneidad y límites.
- [x] Preparar una petición conjunta por fecha de todos los ausentes
      registrados, con franjas según jornada completa/parcial y agrupación
      de indisponibilidades por docente (incluidas ausencias con cobertura
      confirmada manualmente: siguen estando ausentes).
- [x] Calcular sustitución de clases ordinarias con el contrato diario ya
      existente y mostrar propuesta, sin cubrir, desconocido y detalle por
      franja. La ejecución requiere aceptación del usuario y guarda un
      borrador remoto, nunca una aplicación automática.
- [x] Solver PT/AL conjunto en rama de integración, también con grupo-clase
      desconocido o mixto; la especialidad exacta y los bloques protegidos
      son restricciones duras. CI del backend en verde; **sin despliegue**.
- [x] Clasificación conservadora por franja en frontend: PT/AL propuesto
      por especialista compatible, sin cubrir o sin verificar si la respuesta
      antigua omite el apoyo. Sin aplicar horarios ni cambiar estados.
- [x] Auditoría PT/AL **por sesión original completa**: continuidad de
      sustituto entre franjas, cortes, dobles asignaciones, aforo,
      equipamiento, horario y solapes de salas, donde los datos existen.
      Se usan conteos agregados, no identidades de alumnado; el vínculo
      local entre sesión y franjas no se envía al motor.
- [x] Comprobación local y agregada por sesión de extracciones expresamente
      prohibidas, doble participación simultánea, disponibilidad efectiva,
      bloqueo externo y tiempos de viaje declarados entre salas; ausencia
      de datos se indica como «sin verificar».
- [ ] Comprobar la asistencia real por participante, permisos, itinerarios
      entre edificios/centros no configurados y normativa antes de
      declarar cobertura aplicada.
- [ ] Confirmar/aplicar cada franja con control de versiones y trazabilidad
      diferenciada de la simple propuesta.
- [ ] Probar escenarios de más semanas, vacaciones y zona horaria en E2E.

### Paso B — Escenarios temporales sobre instantáneas

- [ ] Derivar demanda afectada y restricciones conjuntas sin modificar
      horarios actuales, indisponibilidad permanente ni sesiones PT/AL.
- [ ] Manejar falta de sustituto y prioridades incompletas sin inventar
      asignaciones; mostrar demandas que no pueden cubrirse.
- [ ] Comparación *actual vs. contingencia* con fechas explícitas,
      no solo días recurrentes de la semana.

### Paso C — Generación de alternativas en el motor

- [ ] Ampliar contrato con múltiples candidatos, su origen y estado de
      verificación, sin introducir identificadores de menores.
- [ ] Garantizar diversidad real, deduplicación y resultados estables
      frente a versiones y límites del solver.
- [ ] Asegurar que `unknown` por tiempo agotado no sea `infeasible`.
- [ ] Ensayar dos, tres o más ausencias solapadas en distintos servicios.

### Paso D — Ranking y comparación explicables

- [ ] Modelo de score independiente de frontend y backend, con
      restricciones duras no compensables y desempate estable.
- [ ] Visualización comparativa de hasta varias alternativas, con desglose
      y una tarjeta destacada por recomendación *solo si está verificada*.
- [ ] Pesos de centro editables sin cambiar normativa ni límites obligatorios.
- [ ] Pruebas de escenarios dominados, empates, datos incompletos,
      privacidad y variación de preferencias.

### Paso E — Aplicación segura (Fase 3)

- [ ] Confirmación humana, vigencia temporal, copia y reversión.
- [ ] Comprobar que las ausencias o el horario base no cambiaron desde
      la instantánea evaluada; rechazar aplicación desactualizada.
- [ ] Auditoría de quién aprobó la sustitución y cuándo, sin almacenar
      razones sensibles para la ausencia.
- [ ] Nunca aplicar por defecto la opción `#1`.

## 8. Reglas de entrega

Trabajar en ramas de integración; nunca desplegar cambios del backend sin
autorización. Cada paso requiere pruebas unitarias y navegador, privacidad,
CI verde y comprobación de que `main` permanece intacta.

**Orden recomendado desde el estado actual:** consolidar los casos
ficticios con tres ausencias simultáneas, grupos PT/AL mixtos, materias de
extracción, indisponibilidades externas y traslados expresamente configurados.
Estas comprobaciones son locales y agregadas, no sustituyen la
certificación individual. El backend ampliado permanece sin desplegar hasta
autorización expresa. Después: alternativas realmente distintas, ranking
explicable y aprobación segura. Las propuestas no resuelven ausencias ni
alteran el horario base.
