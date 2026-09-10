# Modelo de producto, horarios y evolución UX

Estado: propuesta de diseño para `integracion-gestor-escuela`.

Este documento complementa `INTEGRATION_SECURITY_ROADMAP.md`. No sustituye las reglas actuales ni cambia todavía el formato persistido. Su objetivo es fijar un modelo común antes de seguir ampliando la interfaz y los solvers.

## 1. Modelo mental del producto

La aplicación deja de entenderse como tres calendarios independientes. El modelo objetivo es:

**Horario académico del centro + capa PT + capa AL**

El horario académico define qué ocurre en cada grupo-clase, materia, franja y profesorado ordinario. PT y AL son capas de apoyo que pueden superponerse al horario académico cuando las reglas de extracción lo permitan.

Consecuencias:

- una clase puede continuar con su materia aunque parte del alumnado esté en PT o AL;
- una coincidencia temporal entre aula y PT/AL no es un conflicto por sí misma;
- la compatibilidad depende de alumnado, profesional, materia y reglas de extracción;
- el mismo alumno no puede estar simultáneamente en dos apoyos incompatibles;
- el mismo profesional no puede atender dos sesiones incompatibles;
- PT y AL pueden ocurrir a la vez si no comparten alumnado ni profesional y las materias de origen lo permiten;
- las restricciones duras nunca deben confundirse con preferencias de optimización.

## 2. Vistas del calendario

La sección principal debe evolucionar hacia una única experiencia de horario con cuatro vistas:

- **Centro**: horario ordinario completo por grupos-clase.
- **Combinado**: horario ordinario como base y capas PT/AL superpuestas.
- **PT**: sesiones y carga específica de PT.
- **AL**: sesiones y carga específica de AL.

Filtros transversales deseables:

- grupo-clase;
- docente;
- profesional PT/AL;
- alumno;
- curso/etapa;
- materia;
- conflicto o aviso.

La vista combinada debe permitir responder rápidamente a preguntas como: "¿de qué materia sale este alumno para recibir AL?" o "¿qué estaba haciendo 4ºA mientras dos alumnos estaban en PT?".

## 3. Política unificada de extracción PT/AL

Actualmente las prioridades PT/AL se expresan con valores `low`, `medium`, `high` y `blocked`. El modelo futuro debe conservar compatibilidad, pero separar dos conceptos:

### Restricción dura

Define si una materia permite extracción:

- `blocked`: no se puede extraer alumnado.
- `pt`: se permite PT.
- `al`: se permite AL.
- `ptal`: se permite PT o AL.

El valor exacto del esquema persistido se decidirá durante la migración. No se introduce todavía un campo nuevo en producción.

### Preferencia

Cuando la extracción está permitida, indica su conveniencia:

- `preferred`: buena franja para apoyo;
- `neutral`: aceptable;
- `avoid`: usar si es necesario.

Una preferencia nunca debe convertir por sí sola un horario factible en imposible.

## 4. Matriz de compatibilidad temporal

La validación común debe tratar, al menos, estos casos:

| Coincidencia | Resultado objetivo |
| --- | --- |
| Clase ordinaria + PT del mismo alumno | Permitido solo si la materia admite PT |
| Clase ordinaria + AL del mismo alumno | Permitido solo si la materia admite AL |
| PT + AL del mismo alumno | Bloqueado |
| Dos sesiones del mismo profesional | Bloqueado |
| Dos clases ordinarias del mismo docente | Bloqueado |
| PT y AL con alumnado y profesionales distintos | Permitido |
| Actividad fija de un docente + cualquier otra tarea del mismo docente | Bloqueado |
| Recreo + docencia ordinaria | Bloqueado según la etapa/configuración |
| Restricción dura de disponibilidad + cualquier tarea del profesional | Bloqueado |

Esta matriz debe convertirse progresivamente en una API de dominio reutilizable por:

1. validación de formularios;
2. detector de conflictos;
3. generador heurístico;
4. futuro solver CP-SAT;
5. vista combinada del calendario.

No deben existir cinco implementaciones distintas de la misma regla.

## 5. Fuente única de verdad

Principio: **un dato se edita en un lugar y puede resumirse en muchos**.

| Concepto | Propietario funcional objetivo | Otros lugares solo muestran/resumen |
| --- | --- | --- |
| Estructura del centro y clases | Centro | asistente, horario, alumnado |
| Jornada general | Centro | PT/AL hereda por defecto |
| Recreos | Centro | generadores y validadores consumen |
| Curso académico | Contexto del proyecto / GestorEscuela online | perfil curricular y cabecera muestran |
| Currículo | Planificación académica | asistente, cobertura, solver |
| Profesorado y disponibilidad | Profesorado | plan del centro y horario resumen |
| Actividades y responsabilidades | Centro / profesorado | solver y horario consumen |
| Política de extracción PT/AL | Apoyos / reglas académicas | generadores y conflictos consumen |
| Necesidades de apoyo | Alumnado / apoyos | grupos y calendario resumen |
| Escenario | GestorEscuela en modo online | cabecera y planificación muestran |

### Duplicidades a eliminar progresivamente

- curso académico escrito como texto local y creado además como entidad remota;
- jornada del centro y ventanas PT/AL repetidas por curso cuando no existe una excepción real;
- navegación y cabecera gestionadas desde varios controladores;
- reglas equivalentes implementadas de forma separada en heurístico, automatización y conflictos.

Las migraciones deben mantener lectura de JSON antiguos mediante normalización.

## 6. Arquitectura de navegación objetivo

La barra lateral debe reducir su primer nivel. Propuesta:

### Inicio

Resumen del centro y siguiente acción recomendada.

### Horario

Centro, combinado, PT y AL. Conflictos se muestran contextualmente y disponen de vista completa secundaria.

### Centro

Clases, currículo, profesorado, actividades, restricciones temporales y estudio de plantilla.

### Apoyos PT/AL

Alumnado con necesidades, grupos PT/AL, reglas de extracción y optimización/recalculo de apoyos.

### Operativa

Ausencias, sustituciones y funcionamiento diario.

### Configuración / cuenta

Integración GestorEscuela, importación/exportación, autenticación, curso/escenario, acciones avanzadas y destructivas.

El **Asistente de configuración** sigue existiendo, pero como flujo transversal de puesta en marcha, no como almacén alternativo de configuración.

## 7. Identidad del producto

La interfaz no debe presentarse únicamente como "Horario PT / AL" cuando está activado el modo global.

Dirección propuesta:

- nombre visible genérico: **Planificador del centro** o **Horario del centro**;
- subtítulo contextual: centro, curso académico y escenario;
- PT y AL aparecen como capacidades especializadas dentro del producto.

La decisión final de naming puede aplazarse, pero la estructura visual debe dejar de asumir que toda la aplicación es PT/AL.

## 8. Configuración asistida por IA · experimental

La IA no introduce una segunda fuente de datos ni sustituye las validaciones del producto.

### Objetivo

Ofrecer al final del asistente una opción:

**Preparar configuración con IA · Experimental**

El sistema genera un prompt autocontenido con la información ya disponible y las decisiones todavía pendientes. El usuario puede llevarlo a una IA externa y pegar después una respuesta estructurada.

### Flujo inicial sin dependencia de proveedor

1. El usuario completa la información mínima del centro.
2. La aplicación genera un prompt en lenguaje natural y un esquema de salida.
3. Se omiten por defecto nombres, diagnósticos y datos personales innecesarios del alumnado.
4. La IA devuelve una propuesta estructurada.
5. La aplicación valida esa propuesta con exactamente las mismas reglas internas que una configuración manual.
6. Se muestra una comparación de cambios.
7. El usuario acepta o rechaza antes de aplicar.
8. Solo después puede generar/recalcular un horario.

### Qué puede pedir el prompt

- completar jornada y distribución cuando falten decisiones;
- proponer restricciones y preferencias temporales;
- ayudar a clasificar materias para extracción PT/AL;
- detectar inconsistencias en disponibilidad y carga;
- producir una propuesta de configuración, no un horario libre en texto.

### Qué no debe hacer

- inventar docentes inexistentes;
- dar de alta el centro automáticamente;
- aplicar cambios sin validación;
- saltarse restricciones duras;
- enviar datos personales no necesarios;
- convertirse en la única forma de configurar el producto.

## 9. Heurística, IA y CP-SAT no son alternativas equivalentes

Cada mecanismo resuelve una capa distinta:

- **Asistente/reglas**: captura y valida configuración.
- **IA**: ayuda a expresar o completar configuración en lenguaje natural.
- **Heurística**: intenta generar rápido una propuesta local factible.
- **CP-SAT**: debe ser el camino para problemas globales donde se necesita búsqueda combinatoria robusta y optimización.

La IA no debe decidir por sí sola que un horario es factible. Esa responsabilidad pertenece a validadores y solver.

## 10. Autenticación y contexto institucional

La evolución de autenticación está desarrollada con más detalle en `INTEGRATION_SECURITY_ROADMAP.md`.

Orden recomendado:

1. frontend con login/logout y `Authorization: Bearer` usando la autenticación ya disponible en GestorEscuela;
2. retirar de la UX normal `School ID` / `Actor ID` y las cabeceras provisionales;
3. mantener selección explícita de centro/curso/escenario cuando un usuario tenga varios;
4. añadir Google Workspace y Microsoft 365 como proveedores de identidad sobre el mismo usuario/membresía;
5. no duplicar roles por proveedor de identidad.

## 11. Fases de implementación

### Fase A · Fiabilidad del horario

- regresiones de callejones sin salida del greedy;
- backtracking/reparación acotada;
- diagnóstico de imposibilidad matemática frente a fallo de búsqueda;
- decidir umbral para migrar generación semanal completa a CP-SAT.

### Fase B · Shell y navegación

- corregir recorte vertical/horizontal de la barra lateral;
- unificar navegación, título, filtros y acciones de cabecera;
- reducir primer nivel de menú;
- introducir identidad de centro sin romper las vistas actuales.

### Fase C · Modelo PT/AL unificado

- definir contrato de política de extracción;
- añadir normalización compatible con datos antiguos;
- reutilizar la misma función de compatibilidad en conflictos y generadores;
- pruebas de combinaciones Centro/PT/AL.

### Fase D · Calendario combinado

- vista Centro;
- vista PT;
- vista AL;
- vista Combinado;
- filtros por aula, docente, alumno y apoyo.

### Fase E · IA experimental

- generador de prompt;
- esquema de respuesta versionado;
- pegado/importación de propuesta;
- validación y comparación antes de aplicar;
- tests que garanticen que una IA no puede saltarse restricciones duras.

### Fase F · Cuenta e identidad

- frontend Bearer;
- login, logout y expiración;
- Google Workspace;
- Microsoft 365;
- controles por rol/capacidad.

## 12. Criterios de producto

Antes de considerar estable esta evolución:

- un usuario entiende que el horario ordinario y PT/AL pueden coexistir;
- ninguna preferencia se trata como restricción dura;
- la barra lateral es usable en 1024x768 y 1440x900;
- el usuario no introduce el mismo dato base en dos pantallas;
- recalcular conserva siempre el horario aplicado hasta confirmación;
- toda propuesta de IA pasa por validación y revisión humana;
- la configuración manual sigue disponible;
- los formatos antiguos se pueden importar sin pérdida;
- frontend y backend comparten semántica de restricciones aunque la implementación técnica sea distinta.
