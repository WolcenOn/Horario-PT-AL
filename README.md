# Planificador del centro

Aplicación web para construir, revisar y operar el horario de un centro educativo combinando **horario académico ordinario + apoyos PT + apoyos AL**.

**Aplicación publicada:** https://wolcenon.github.io/Horario-PT-AL/

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