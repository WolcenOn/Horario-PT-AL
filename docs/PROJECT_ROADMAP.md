# Hoja de ruta viva — Horario-PT-AL + GestorEscuela

**Fecha de revisión:** 2026-10-13  
**Estado general:** Fase 1 avanzada; preparar entrega incremental de Fase 2.  
**Fuente de despliegue frontend:** `Horario-PT-AL/integracion-gestor-escuela`.  
**Backend:** `GestorEscuela/integracion-horario-pt-al`.  

> Esta hoja distingue funciones presentes, trabajo incompleto y requisitos de
> aceptación. Que una CI esté verde no significa que una fase de producto esté
> terminada ni autoriza publicar horarios reales.

## Resumen por fases

| Orden | Fase | Estado | Criterio para cerrarla |
|---|---|---|---|
| 1 | Diagnósticos y correcciones | **Muy avanzada; no cerrada** | Correcciones precisas, sin falsos positivos, privacidad y regresiones E2E |
| Transversal | Legislación y currículo | **Estructura técnica lista; datos oficiales pendientes** | Al menos un perfil de normativa contrastado, versionado y probado |
| 2 | Vista previa integral y comparación | **En curso; calendario inicial** | Propuesta semanal remota y horario actual juntos, sin escribir datos |
| 3 | Aprobación y aplicación controlada | **Pendiente** | Versiones, comprobación previa, confirmación, auditoría y recuperación |
| 4 | Pruebas de centros completos | **Parcial** | Centros ficticios realistas y E2E de extremo a extremo |
| 5 | Optimización y preparación de producción | **Pendiente** | Medición, equidad, recursos, seguridad y despliegue expresamente autorizado |
| Transversal | Ausencias simultáneas y ranking | **Auditoría de sesiones PT/AL y solver ampliado en integración** | Cobertura individual y desplazamientos, backend sin desplegar, ranking y aprobación pendientes |

## Fase 1 — Consolidación de validación y corrección

### Ya disponible

- Validación previa de asignaciones curriculares, profesorado, carga y
  configuración de aulas y salas.
- Diagnósticos estructurados del solver junto a textos compatibles con
  clientes anteriores.
- Detección conservadora de incompatibilidades demostrables para apoyos
  PT/AL: minutos disponibles, bloques fijos y materias de extracción
  prohibida. No convertir preferencias blandas en restricciones duras.
- Mensajes correctivos con navegación a un conjunto cerrado de vistas
  locales; ninguna URL o selector remoto decide la navegación.
- Agrupaciones PT/AL compatibles y alternativa individual cuando procede.
- Pruebas unitarias y Playwright de los incrementos implementados.

### Para declarar la fase cerrada

- [ ] Revisar todas las rutas de corrección tras rerenderizados y guardados,
  especialmente formularios y foco en el control correcto.
- [ ] Comprobar que los diagnósticos coinciden con minutos **realmente
  pendientes**, no solo objetivos originales, y evitar errores duplicados.
- [ ] Cubrir más restricciones y casos `unknown` sin atribuir causas no probadas.
- [ ] Añadir pruebas de regresión de pasos de corrección completos con
  escenarios representativos, también en modo local/offline.

## Línea transversal — Legislación autonómica y perfiles curriculares

### Ya disponible

- `curriculum-regulations/catalog.json` y perfiles JSON por familia y versión,
  separados del motor, las vistas y los datos de los centros.
- Validación de territorio, materia, curso, minutos exactos (cuartos de hora),
  identificador, versión, vigencia y fuente.
- Selección y revisión explícita del perfil antes de aplicar las horas.
- Una **copia** de minutos queda guardada en IndexedDB con procedencia.
  Actualizar los archivos de legislación no reescribe proyectos existentes.
- Las modificaciones del centro marcan el perfil como personalizado.
- Importación manual compatible si no existe todavía un perfil del catálogo.

### Pendiente — no inventar cifras legales

- [ ] Elegir la primera comunidad/norma oficial y consultar su anexo horario.
- [ ] Verificar horas por curso y materia, cursos de vigencia y disposiciones
  transitorias; registrar fuente oficial exacta.
- [ ] Publicar primera versión oficial probada en el catálogo.
- [ ] Incorporar nuevas comunidades y modificaciones legislativas mediante
  archivos nuevos, sin sustituir versiones históricas.
- [ ] Probar escenarios de cambio de año académico y adopción voluntaria.

**Situación actual del catálogo:** vacío por diseño, hasta verificar anexos
oficiales. Seleccionar una comunidad **no** aplica horas legales inventadas.

## Fase 2 — Vista previa integral y comparación de horarios

### Base reutilizable

Ya existe visualización combinada de **horarios guardados** y vista previa
semanal del motor con materias ordinarias, PT/AL, aulas y recursos. Lo que
falta es una **revisión visual única de la propuesta remota** frente a las
sesiones vigentes. No duplicar sin más el calendario existente.

### Próxima secuencia de incrementos

1. **Calendario de propuesta de solo lectura — primer incremento implementado**:
   franjas semanales diferenciadas para materias, apoyo PT, apoyo AL y salas
   conocidas; dos columnas por día con horario guardado y simulación del
   motor. Los apoyos existentes fijos se muestran también en la propuesta.
   No persistir resultados ni revelar identidades del alumnado.
2. **Comparación con horario actual — segundo incremento implementado**:
   franjas coincidentes, reprogramaciones inequívocas, altas y bajas;
   escenarios ambiguos se presentan sin emparejamientos supuestos.
   Las clases excluidas del alcance del motor conservan sus franjas y no
   cuentan como supresiones de la propuesta parcial.
   Incluye minutos de sesiones por clase y de PT/AL (fijos y adicionales),
   sin confundir minutos del profesional con minutos por alumno.
   No equivale todavía a verificar la cobertura curricular exigida.
3. **Filtros y vistas — primer incremento implementado**: filtros combinables
   por clase, docente y sala en el calendario y en sus resúmenes, sin nuevas
   llamadas al backend ni escrituras en IndexedDB. Los apoyos propuestos se
   vinculan a su docente y clases mediante las referencias anónimas de
   `payload`, sin mostrar tokens de alumnado. Las franjas sin una asignación
   conocida no se atribuyen a un docente, clase o sala de forma especulativa.
   Quedan pendientes vistas avanzadas por recurso y revisión individual
   anonimizada de coberturas, sin identidad del menor.
4. **Revisión de conflictos y cobertura — primer incremento implementado**:
   contraste de minutos por materia y demanda individual enviada al motor;
   colisiones comprobables de docentes y clases y ocupación/ventanas de sala
   cuando existen datos suficientes. Aforos desconocidos y reparto individual
   de apoyos grupales se indican como no verificables. El informe es global
   incluso al filtrar el calendario. `feasible` **no** certifica cobertura
   íntegra del colegio ni cumplimiento de la normativa autonómica.
   Pendiente: validación de actividades móviles, rutas y comprobación
   individual por participante con contrato de respuesta adecuado; estados
   `infeasible` y `unknown` más ricos y acciones de corrección.
5. **Alternativas y recálculo**: probar/deshacer una propuesta visual,
   corregir restricciones y recalcular sin cambiar el horario existente.
6. **Contingencias y clasificación de alternativas — apoyo PT/AL en integración**:
   registro global de ausencias, cálculo conjunto por fecha y comparador de
   clases y apoyos. El backend en `integracion-horario-pt-al` ya exige
   especialidad PT/AL para cubrir un apoyo, incluso si es mixto y no tiene
   grupo-clase único. **Este backend no se ha desplegado**: el frontend
   marca los apoyos omitidos por una versión anterior como «sin verificar».
   Una sustitución propuesta no certifica atención individual, desplazamientos,
   aforos ni aplicación. El frontend ahora reconstruye **sesiones completas**
   desde sus franjas atómicas, exige un mismo especialista durante toda la
   sesión y audita sala, aforo, ventanas y equipamiento con datos locales.
   Los datos faltantes se marcan «sin verificar», sin transmitir identidades
   de alumnos a GestorEscuela. Siguen pendientes cobertura individual,
   desplazamientos y ranking de alternativas auténticas.
   Diseño y pruebas previstas en
   [ausencias simultáneas y ranking](MULTI_TEACHER_ABSENCES_AND_RANKED_ALTERNATIVES.md).

### Criterios para cerrar

- [ ] Una vista permite distinguir inequívocamente **actual** y
  **propuesto** en la misma semana.
- [ ] Las duraciones y los totales PT/AL y de materias son exactos.
- [ ] La visualización no consulta nombres de alumnado para enviar al
  backend ni muestra tokens técnicos como identidad.
- [ ] Descartar o cambiar filtros no modifica IndexedDB ni el servidor.
- [ ] Unitarios y E2E de propuesta factible, infactible, inconclusa y error
  de conexión.

## Fase 3 — Aprobación y aplicación controlada

El generador académico local ya dispone de aplicación explícita para algunas
propuestas y el backend de escenarios tiene snapshots. **No equivalen** a
la aplicación segura del resultado semanal conjunto de GestorEscuela.

- [ ] Identidad inmutable de la propuesta y versión de los datos de partida.
- [ ] Revalidación de restricciones y de cambios externos antes de aplicar.
- [ ] Confirmación humana de clases, docentes, PT/AL, salas y operaciones.
- [ ] Protección de concurrencia, conflictos `409` y aplicación atómica.
- [ ] Copia previa, auditoría y recuperación/deshacer ensayados.
- [ ] Pruebas de que cancelar, fallar o perder conectividad conserva todo.
- [ ] Aplicar solo el escenario de contingencia seleccionado, con vigencia
  temporal explícita y sin sobrescribir el horario base indefinidamente.
- [ ] **No publicar ni desplegar aplicación definitiva de horarios reales
  sin autorización expresa.**

## Fase 4 — Centros ficticios de prueba y recorrido completo

Hay una base de pruebas unitarias y E2E, pero faltan recorridos
representativos de centros completos:

- [ ] Infantil/Primaria, una y varias líneas, currículos distintos.
- [ ] Docentes multigrupo, itinerantes y centros/edificios separados.
- [ ] Apoyos PT/AL individuales y grupales, extracción y bloqueos reales.
- [ ] Recreos, biblioteca, coordinaciones, actividades y salas/aforos.
- [ ] Configurar → calcular → avisar → corregir → recalcular → comparar.
- [ ] Desconexión, fallo API, tiempo agotado, restricciones incompatibles.
- [ ] Ausencias solapadas de dos, tres o más docentes, varios días y jornadas
  parciales; todos los sustitutos se comprueban de manera conjunta.
- [ ] Ranking estable de alternativas factibles, cobertura parcial bien
  señalada, restricciones legales y pedagógicas no ponderables.
- [ ] Verificar privacidad y cero alteraciones del horario hasta aprobar.

## Fase 5 — Optimización, permisos y preparación de producción

- [ ] Medir rendimiento/memoria/soluciones del solver con casos realistas.
- [ ] Comparar alternativas y mejorar equidad de carga y calidad semanal;
  disponer de ranking explicable y pruebas de dominancia, empates y pesos.
- [ ] Especialistas compartidos, recursos especiales y desplazamientos
  con restricciones físicas declaradas; no inferir distancias.
- [ ] Auditoría de cambios, aislamiento multi-centro y permisos efectivos.
- [ ] Concurrencia, copias, restauración y despliegue controlado.
- [ ] Preparar documentación y pruebas de aceptación con equipos educativos.

**Límites de referencia actuales:** ~100 demandas conjuntas, ~150 sesiones
calculables, hasta 500 ocupaciones y ocho salas candidatas por necesidad.
No subir límites sin pruebas de rendimiento y memoria.

## Decisión de siguientes incrementos

**Fase 2 actual:** completar correcciones guiadas de la revisión global de
conflictos/cobertura y su recalculado no destructivo. Conservar y comparar
la propuesta semanal actual antes de permitir aplicación alguna.

**Siguiente bloque transversal:** la rama de integración de GestorEscuela
ya calcula conjuntamente **clases ordinarias y PT/AL**; incluye apoyos
mixtos sin grupo-clase único, obligación de especialidad y rechazo de dobles
asignaciones. En el frontend, cada franja de clase y apoyo se clasifica como
propuesta, sin cubrir o sin verificar (también frente a servidores antiguos).
**No se ha desplegado el nuevo backend** ni se aplica ninguna sustitución.
Los planes remotos se calculan solo tras confirmación y quedan como borrador;
las ausencias siguen pendientes hasta decisión humana. Además, la vista
ahora detecta sesiones PT/AL fragmentadas entre especialistas y problemas
comprobables de sala, aforo, horario o equipamiento; no presupone recursos
desconocidos. Sigue pendiente comprobar atención individual y
desplazamientos. Próximos pasos: centros ficticios de prueba, cobertura
por participante, diversificación y ranking explicable.

**En paralelo:** verificar el primer anexo autonómico curricular e incluirlo
sin inventar cargas horarias.

## Reglas no negociables

- Horas semanales exactas, bloqueos y extracciones duras respetados.
- Privacidad: tokens efímeros de alumnos en solicitudes, nunca identidad real
  ni datos clínicos en las vistas previas.
- Vista previa no destructiva, modo offline IndexedDB y compatibilidad
  con clientes previos.
- Nada se aplica o sincroniza por sorpresa; respetar centro y usuario.
- Trabajar solo en las dos ramas de integración. Las `main` siguen intactas.
- Cada incremento exige pruebas, CI, Pages y revisión de HEAD independiente.

## Referencias técnicas

- [Diseño de tramos flexibles y especialistas](FLEXIBLE_LESSON_LENGTHS_AND_SPECIALISTS_ROADMAP.md)
- [Diseño de ausencias simultáneas y alternativas ordenadas](MULTI_TEACHER_ABSENCES_AND_RANKED_ALTERNATIVES.md)
- [Seguridad, multiusuario y sincronización](INTEGRATION_SECURITY_ROADMAP.md)
- [Mantenimiento del catálogo normativo](../curriculum-regulations/README.md)
- [Frontend publicado](https://wolcenon.github.io/Horario-PT-AL/)
- [Última CI frontend verificada al redactar este documento](https://github.com/WolcenOn/Horario-PT-AL/actions/runs/38400805170)
- [CI backend de integración](https://github.com/WolcenOn/GestorEscuela/actions/runs/38377013740)
