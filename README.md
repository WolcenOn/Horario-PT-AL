# Planificador del centro

Aplicación web para construir, revisar y operar el horario de un centro educativo combinando **horario académico ordinario + apoyos PT + apoyos AL**.

**Aplicación publicada en GitHub Pages:** https://wolcenon.github.io/Horario-PT-AL/

**Ramas de desarrollo y publicación del planificador escolar:**

- **Frontend y fuente de GitHub Pages:** `WolcenOn/Horario-PT-AL`, rama `integracion-gestor-escuela`.
- **Backend y motor de optimización:** `WolcenOn/GestorEscuela`, rama `integracion-horario-pt-al`.
- Las dos ramas `main` no reciben cambios ni fusiones durante este trabajo de integración.
- `.github/workflows/pages.yml` valida la rama `integracion-gestor-escuela` con unitarios y Playwright. El despliegue GitHub Pages se registra además como una ejecución separada `pages build and deployment`.

**Seguimiento del proyecto:** [Hoja de ruta general, fases y pendientes](docs/PROJECT_ROADMAP.md). Las líneas de normativa curricular y seguridad tienen documentos técnicos separados.

La filosofía del producto es:

> Configurar lo mínimo → calcular → revisar → corregir → recalcular.

El proyecto conserva un modo local basado en IndexedDB y añade de forma progresiva cuenta, escenarios compartidos y operativa remota mediante GestorEscuela.

## Modelo de planificación

El producto trabaja con un horario académico base y dos capas de apoyo, PT y AL. No son tres calendarios independientes: una sesión PT/AL puede superponerse parcialmente a una clase ordinaria cuando las reglas de extracción, personas y recursos lo permiten.

La duración de un apoyo no determina la duración de la materia de origen. Por ejemplo, un apoyo PT de 30 minutos puede extraer a un alumno durante parte de una sesión ordinaria de 60 minutos sin dividir esa asignatura en dos bloques de 30.

## Áreas principales

La navegación de integración se organiza en:

- **Inicio**: resumen del centro y asistente inicial;
- **Horario**: vista combinada, horario de apoyos, horario de aulas y conflictos;
- **Centro**: clases/alumnado, profesorado, planificación académica, actividades, patrones temporales y reparto;
- **Apoyos PT/AL**: necesidades, grupos, sesiones y optimización;
- **Operativa**: conexión con la planificación diaria y GestorEscuela;
- **Cuenta y datos**: sesión, escenarios, sincronización, importación/exportación y configuración avanzada.

## Capacidades actuales

Entre otras, la rama de integración contiene:

- planificación académica del centro y estructura de clases;
- horario semanal de aulas con vista centralizada por curso/clase;
- materias con duración preferida, mínima y máxima de sesión;
- reglas temporales y máximo de sesiones diarias por materia;
- calendario PT/AL con sesiones de duración variable, incluidas sesiones de 30 minutos;
- disponibilidad de profesionales y alumnado;
- política explícita de extracción PT/AL con restricciones duras y preferencias blandas;
- vista combinada del horario académico y los apoyos;
- detección de conflictos y avisos;
- generación automática del horario académico mediante Worker para no bloquear la interfaz;
- optimización PT/AL también ejecutada en Worker;
- propuestas revisables antes de aplicar cambios;
- exportación/importación del proyecto completo;
- IndexedDB como almacenamiento local;
- cuenta Bearer opcional contra GestorEscuela;
- cursos y escenarios online con snapshots compartidos;
- listado y revocación de sesiones de cuenta;
- throttling visible de login;
- cambio y recuperación de contraseña;
- sincronización de configuración académica para operativa diaria.

## Avisos con acceso directo a la corrección

En **Cuenta y sincronización**, la comprobación de una propuesta semanal
señala errores locales antes de llamar a GestorEscuela. Cada problema que
tiene una ubicación inequívoca muestra un botón para abrir la pantalla
donde se corrige: profesorado, estructura de clases, currículo, patrones
temporales o inventario de salas. Cuando procede, se enfoca el campo.

Las advertencias de sincronización y las causas concretas comunicadas
por el motor también pueden incluir ese acceso. No se abre ninguna dirección
web aportada por una respuesta remota: las acciones pertenecen a una lista
cerrada de vistas locales. Los motivos genéricos de inviabilidad o búsqueda
inconclusa no reciben un botón que adivine la causa.

El panel de **Planificación académica** ofrece los mismos accesos junto
a sus indicadores de preparación pendientes. Navegar para corregir no
guarda ni aplica horarios; vuelve a ejecutar la comprobación para revisar
el resultado después de guardar los cambios.

## Salas PT/AL y trayectos por ubicación (vista previa GestorEscuela)

En **Centro → Planificación del centro** puedes fijar un tiempo de traslado
general (0–60 minutos, en pasos de 15) y rutas específicas con formato
`origen | destino | minutos`. Los sentidos se configuran por separado, por
ejemplo `class:1ºA | room:Sala AL | 15` y
`room:Sala AL | class:1ºA | 30`. Sin regla específica se usa el margen
general; con margen 0 y sin rutas no hay cambios respecto al legado.

La asignación de salas para un apoyo tiene esta prioridad: **aula explícita
de una sesión existente > sala configurada en su grupo > sala habitual del
profesional > sala global de PT/AL**. Las salas específicas se editan en
**Grupos de apoyo** y **Profesionales**. No se mezclan automáticamente
grupos con salas obligatorias diferentes.

La vista previa solo comprueba salas y trayectos cuyos identificadores se
hayan suministrado. No calcula distancias reales, no guarda la propuesta
y no modifica las sesiones ya existentes.

**Aforos y horarios de salas:** en los Parámetros de generación global también
puedes definir `Sala | 4` (cuatro plazas, disponible toda la jornada) o
`Sala | 4 | lunes | 09:00 | 12:00` (solo ese tramo el lunes).
Repite la segunda forma para los demás días o franjas admitidos; los días
que no aparezcan quedan cerrados. Se admiten 1–30 plazas por sala.
El cálculo descuenta las plazas realmente ocupadas por los alumnos de una
sesión PT/AL y permite simultaneidad hasta el aforo, respetando también
la agenda de cada profesional y alumno.

**Compatibilidad:** las salas sin aforo explícito mantienen su reserva
exclusiva (una sesión a la vez). La disponibilidad restringida no se aplica
hasta que se configure. Las horas del centro y los horarios ya guardados
no se alteran al solicitar esta vista previa.

**Selección automática de salas:** con dos o más salas configuradas en
«Planificación del centro» puedes activar la casilla de selección automática
para que GestorEscuela asigne una sala a **cada sesión PT/AL que no tenga una
sala obligatoria**. Se comprueban aforo, franjas disponibles, reservas y
trayectos del profesional. La simulación indica la sala elegida, incluso
cuando dos sesiones del mismo grupo acaban en espacios diferentes.
Los grupos o profesionales con una sala explícita mantienen esa asignación;
las sesiones existentes tampoco se trasladan.
La opción comienza desactivada para conservar los horarios previos.

**Adecuación de las salas por equipamiento y accesibilidad:** en
«Planificación del centro» también puedes especificar características
**no personales** de las salas, y marcar lo que exige cada servicio PT
o AL. Los códigos admitidos son `acceso_sin_escalones`,
`mesa_regulable`, `aislamiento_acustico`, `material_logopedico`
y `pizarra_digital`. Por ejemplo:

```text
Sala AL | 4 | aislamiento_acustico,material_logopedico
Sala PT | 2 | lunes | 09:00 | 12:00 | acceso_sin_escalones,mesa_regulable
```

Cada servicio tiene casillas para exigir una o varias características.
Una sala elegida automáticamente debe cumplirlas todas. Las salas
asignadas explícitamente también se comprueban; una sala fija sin
ficha de características no se supone equipada y da un error de
configuración. Si ninguna opción es adecuada, la vista previa indica
que el horario no puede satisfacerse con esas restricciones.

Estas casillas describen requisitos generales de la actividad: **no
se deducen necesidades de un alumno ni se transmiten informes clínicos**.
La configuración anterior sigue siendo válida con requisitos vacíos.



## Modo local y modo online

El proyecto sigue pudiendo utilizarse sin cuenta: IndexedDB conserva el estado del navegador y las funciones locales continúan disponibles sin backend.

Al iniciar sesión, GestorEscuela aporta identidad multiusuario, membresías por centro, cursos académicos online, escenarios, snapshots y funciones operativas. El token Bearer se guarda únicamente en `sessionStorage`, no se incluye en exportaciones ni se persiste junto con el proyecto.

Las conexiones antiguas `Actor ID` solo se muestran si el navegador ya tenía una configuración legacy. Las altas nuevas utilizan cuenta y contraseña.

## Desarrollo local

Requisito: Node.js 18+.

```bash
npm start
```

Después abre:

```text
http://localhost:8080
```

La aplicación no utiliza un framework pesado ni dependencias de producción en tiempo de ejecución.

## Pruebas

```bash
npm test
```

El workflow de integración ejecuta verificación de JavaScript, pruebas unitarias y Playwright E2E. GitHub Pages se despliega únicamente después de los cambios de la rama configurada para publicación.

Las regresiones cubren planificación, patrones temporales, conflictos, sharing, workers, vistas semanales, autenticación Bearer, sesiones, transición legacy y ciclo de contraseña.

## Arquitectura resumida

La aplicación usa módulos ES6 y una separación progresiva entre dominio, persistencia y controladores. Algunos componentes relevantes son:

```text
js/repository.js                  persistencia local y carga de estado
js/global-scheduler.js            generador académico
js/global-scheduler-worker.js     ejecución del generador fuera del hilo principal
js/automation-scheduler.js        planificación PT/AL
js/support-policy.js              política de extracción PT/AL
js/time-patterns.js               patrones y duración de sesiones
js/class-week-overview.js         composición de la semana de aula
js/combined-schedule*.js          vista combinada
js/backend-service.js             sesión y API GestorEscuela
js/account-auth-service.js        cambio/recuperación de contraseña
js/integration-*.js               cuenta, escenarios y sincronización
js/sharing.js                     paquete exportable/importable
```

La dirección arquitectónica del producto es que GestorEscuela pase a ser la fuente compartida de verdad para datos multiusuario y reglas comunes. La migración completa de IndexedDB al backend pertenece a las fases posteriores y no se fuerza todavía.

## Datos y privacidad

El repositorio solo contiene código y datos ficticios. IndexedDB almacena los datos locales del navegador. Los paquetes JSON exportados y los snapshots remotos pueden contener información del centro y deben tratarse como datos sensibles cuando incluyan información real.

Los tokens Bearer no se exportan. La recuperación de contraseña usa tokens temporales de un solo uso y el backend no revela si un correo existe al solicitar recuperación.

Consulta `PRIVACY.md` y la documentación operativa del backend antes de utilizar datos reales.

## Documentación de producto

`docs/PRODUCT_MODEL_AND_UX.md` contiene el modelo unificado del producto: horario de centro, capas PT/AL, restricciones duras/blandas, explicabilidad, flujo de revisión y evolución por fases.

## Backend

La integración usa GestorEscuela/FastAPI. El backend de producción configurado actualmente es:

```text
https://gestorescuela-production.up.railway.app
```

El usuario no necesita introducir UUID técnicos en el flujo normal: la sesión devuelve sus centros y permisos. El selector muestra el nombre del centro y solo permite elegir membresías incluidas en la cuenta autenticada.

## Despliegue

La rama de integración dispone de CI con unitarios + Playwright y despliegue GitHub Pages. Antes de una futura fusión a `main`, la Fase 0 exige activar rulesets/required checks para impedir fusiones con CI pendiente o fallido.

## Licencia

Consulta `LICENSE` para las condiciones del repositorio.