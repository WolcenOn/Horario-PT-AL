# Configuración fina de tramos horarios, especialistas y apoyos PT/AL

Estado: requisitos y propuesta de evolución de frontend + solver. No significa que
todas las capacidades estén ya implementadas. Rama: `integracion-gestor-escuela`.
No modificar `main` como parte de este trabajo.

## Lo que ya existe (verificado en código)

- `centerPlanningSettings.generation.lessonMinutes` fija el tramo habitual
  global (UI: 30/45/60/75/90 minutos); la rejilla de cálculo es de 15 minutos.
- `centerPlanningSettings.subjectPatterns[course][subject]` permite
  `sessionMinutes`, `minSessionMinutes`, `maxSessionMinutes`,
  `maxSessionsPerDay`, días y ventanas preferidos/permitidos.
- `time-patterns.js::planSessionDurations` distribuye la carga semanal en
  bloques, respetando duración habitual y rangos; `global-scheduler.js` los usa.
- Los profesionales admiten especialidad, materias permitidas, docencia asignada
  por clase, disponibilidad y bloqueos en otros centros.
- El generador comprueba solapes de docentes/clases, disponibilidad y
  compatibilidad con sesiones PT/AL existentes. Esto aún NO garantiza la
  optimización global integrada de todos los apoyos.

## Objetivo de producto

Los centros podrán definir una regla global y refinarla solo cuando sea
necesario, manteniendo la experiencia fácil para un colegio sin configuración:

`Centro → curso/materia → clase/materia → docente/asignación → bloqueo individual`

El valor más específico **solo sobrescribe atributos expresamente editados**;
los demás se heredan. Los bloqueos explícitos son restricciones duras. Las
preferencias se optimizan sin convertirlas en impedimentos absolutos.

### Ejemplo solicitado

- Global: duración habitual 45 min, granularidad 15 min.
- Matemáticas en 1.º: duración permitida 45 o 60 min, con preferencia por 60,
  manteniendo exactamente la carga semanal correspondiente.
- Matemáticas en 2.º: sesiones de 90 min permitidas (por ejemplo preferencia 90,
  mínimo/máximo 90 si es obligatorio o rango flexible si no lo es).
- 2.º B podría requerir 45 min por disponibilidad particular sin afectar a 2.º A.
- Un especialista compartido no puede impartir simultáneamente en dos aulas;
  sus intervalos de desplazamiento entre edificios también pueden bloquear
  combinaciones consecutivas cuando el centro lo configure.

## Modelo a extender (sin romper datos antiguos)

Proponer `durationPolicy` por defecto y override en cada ámbito:

- `preferredMinutes`: duración ideal; preferencia blanda.
- `allowedMinutes`: lista opcional de longitudes expresamente permitidas,
  p. ej. `[45, 60]` o `[90]`, con múltiplos de 15.
- `minMinutes` / `maxMinutes`: límites obligatorios, si se fijan.
- `maxSessionsPerDay`, `minDaysPerWeek`, `maxDaysPerWeek`, separación
  mínima entre sesiones y franjas/días restringidos o preferidos.
- `hard` / `soft` por restricción y pesos configurables: evitar confundir
  un deseo pedagógico con una prohibición absoluta.
- `locked`: bloque situado manualmente y que no se mueve al recalcular.
- Tolerancias visibles cuando la carga semanal no se puede particionar
  en los tamaños permitidos; nunca introducir restos de duración arbitraria
  sin avisar al usuario.

Conservar `lessonMinutes` y `subjectPatterns` como formato compatible;
introducir normalización, herencia y migración gradual con pruebas JSON.

## Especialistas: conflictos prioritarios

1. Docente único por intervalos: todos sus grupos, clases, apoyos, actividades y
   centros externos se consideran en la misma agenda, no en motores aislados.
2. Desplazamientos: cuando el centro tiene pabellones, aulas especiales o
   itinerancia, incorporar tiempo mínimo entre ubicaciones compatibles.
3. Disponibilidad y carga real por persona: horario partido, reducciones,
   horas de coordinación, máximos diarios/semanales, descansos y reparto.
4. Aula/recurso compartido: Educación Física (gimnasio), Música, Inglés,
   espacios especializados; evitar duplicar reservas de un recurso limitado.
5. Actividades con varios docentes: deben coincidir en el mismo bloque.
6. Un conflicto imposible debe producir explicación concreta: docente, grupo,
   materia, franjas involucradas y restricción responsable.

## PT y AL

- Partir de horas objetivo por alumno y grupo de apoyo; el cálculo no debe
  exigir sesiones manuales previas para poder proponerlas.
- Respetar alumno, profesional, aula, disponibilidad y recreo, sin reservar
  al mismo alumno simultáneamente para docencia ordinaria y dos apoyos.
- Las políticas de extracción por asignatura (prohibida / permitida /
  preferente / evitar) conservan prioridad frente a objetivos blandos.
- Soportar sesiones PT/AL de 30/45/60 y otros múltiplos válidos según
  necesidad individual, sin asignar automáticamente horas de más.
- Contemplar grupos de alumnado mixto, incluidos los miembros excluidos de
  una sesión específica, y preservar el dato por alumno para balance semanal.
- Coordinar horarios de especialistas itinerantes y PT/AL en la propuesta
  integral, no únicamente como recolocación posterior.

## Fases propuestas para frontend y motor

1. **Inventario + cobertura**: demostrar con tests las reglas ya soportadas:
   global 45, Matemáticas 1.º 45/60, Matemáticas 2.º 90 y días preferidos.
2. **UI gradual**: editor rápido global y tabla curso/materia; botón
   "Opciones avanzadas" para rangos, tamaños permitidos y prioridades.
3. **Overrides por clase y profesor**: herencia trazable con indicación de
   qué regla afecta a cada sesión y opción "restaurar valor heredado".
4. **Motor de conflictos de especialistas**: recursos, desplazamientos,
   disponibilidad compartida y agenda semanal única.
5. **PT/AL junto con docencia**: generación de sesiones de apoyo desde
   objetivos, integración en búsqueda global y explicación de incompatibilidades.
6. **Edición/recalculo no destructivo**: fijar bloques, corregir preferencias,
   comparar propuesta vs. horario actual, aplicar/deshacer explícitamente.
7. **Regresiones end-to-end**: plantillas JSON antiguas, centro vacío,
   varios cursos con políticas distintas, itinerancia, solape especialista/PT/AL,
   infeasibilidad, timeout y modo offline.

## Criterios de aceptación

- Un centro con solo duración global y currículo produce propuesta sin
  configurar individualmente todas las materias.
- Dos cursos tienen duraciones diferentes para la misma asignatura sin
  interferirse; la suma de minutos por semana coincide con su currículo.
- Si 1.º permite exclusivamente 45/60 y 2.º permite 90, el solver no propone
  30/75 ni tramos residuales fuera de lo permitido.
- Ningún especialista se solapa consigo mismo, en clase, actividad o PT/AL.
- Los bloqueos y las restricciones de extracción de PT/AL no son preferencias.
- Si es imposible encajar todas las reglas duras, aparece la explicación en
  vez de una solución que las incumpla silenciosamente.
- El usuario puede aflojar una preferencia y recalcular, sin perder los
  bloqueos fijados ni sobrescribir su horario anterior hasta que aplique.
