# Horario PT / AL

Aplicación web para organizar la planificación semanal de **Pedagogía Terapéutica (PT)** y **Audición y Lenguaje (AL)** en un centro educativo.

**Aplicación online:** https://wolcenon.github.io/Horario-PT-AL/

> Funciona completamente en el navegador y guarda los datos localmente mediante IndexedDB.

## Funcionalidades incluidas

- CRUD real de alumnos, profesionales, grupos y sesiones.
- Separación entre **grupo** (quién participa) y **sesión** (cuándo se reúne).
- Calendario semanal con sesiones de duración variable.
- **Drag & drop con ratón o pantalla táctil** para mover sesiones entre días y horas, conservando su duración y ajustando en intervalos de 15 minutos.
- Revalidación automática de conflictos después de mover una sesión y confirmación si el cambio introduce conflictos graves.
- Menú lateral **plegable**, con estado recordado y comportamiento superpuesto en tablet.
- Filtro `TODOS | PT | AL`, manteniendo el servicio no seleccionado atenuado para conservar contexto.
- Cálculo automático de horas PT y AL en minutos.
- Indicadores de objetivo, asignado, pendiente y exceso.
- Detección automática de conflictos por solapamiento real de intervalos.
- Conflictos de alumnado y profesionales.
- Restricciones horarias básicas del alumno.
- Comprobación de disponibilidad del profesional.
- Validación de relaciones PT/AL y referencias.
- Persistencia con **IndexedDB** y preferencias simples con `localStorage`.
- **Exportación e importación del horario completo en JSON** para compartirlo entre dispositivos o usuarios.
- Importación validada antes de sustituir los datos existentes.
- Datos de ejemplo con 20 alumnos, 4 profesionales, 8 grupos y 25 sesiones.
- Diseño orientado a escritorio y tablet, con navegación mediante teclado.

## Ejecutar directamente

La forma más sencilla es abrir la versión publicada:

**https://wolcenon.github.io/Horario-PT-AL/**

No requiere instalación, servidor propio ni cuenta de usuario.

Los datos introducidos se almacenan únicamente en el navegador/dispositivo utilizado. Abrir la aplicación en otro navegador u otro dispositivo crea un almacenamiento independiente.

## Compartir un horario

1. Abre el menú lateral.
2. Pulsa **Exportar / compartir**.
3. Se descargará un archivo `horario-pt-al-AAAA-MM-DD.json` con alumnos, profesionales, grupos y sesiones.
4. Envía ese archivo a la otra persona por el medio que prefieras.
5. En el otro dispositivo, abre la misma aplicación y pulsa **Importar horario**.
6. Selecciona el JSON y confirma la sustitución del horario local.

La importación comprueba IDs duplicados, referencias entre alumnos/grupos/profesionales, tipos PT/AL, días y horarios antes de escribir en IndexedDB. El reemplazo se realiza en una única transacción.

> Si el horario contiene datos reales de menores, trata el archivo JSON como información sensible y compártelo únicamente por canales apropiados para tu centro.

## Desarrollo local

Requisito: Node.js 18+.

```bash
npm start
```

Después abre:

```text
http://localhost:8080
```

La aplicación no tiene dependencias npm de producción. El pequeño servidor incluido se utiliza únicamente para desarrollo local.

## Pruebas

```bash
npm test
```

Las pruebas cubren conversión de minutos, solapamientos, cálculo de horas, detección de conflictos y validación del formato compartible. El workflow de GitHub Pages comprueba además la sintaxis de los módulos principales antes de publicar.

## Arquitectura

La aplicación usa JavaScript ES6 modular sin framework pesado:

- `js/db.js`: infraestructura IndexedDB y reemplazo transaccional de horarios importados.
- `js/repository.js`: operaciones persistentes y reglas de borrado/cascada.
- `js/hours.js`: cálculo puro de horas.
- `js/conflicts.js`: motor puro de conflictos por intervalos.
- `js/alumnos.js`, `js/profesionales.js`, `js/grupos.js`, `js/sesiones.js`: vistas y formularios por dominio.
- `js/calendar.js`: calendario semanal y drag & drop basado en Pointer Events.
- `js/sharing.js`: exportación, validación e importación de horarios JSON.
- `js/alerts.js`: resumen de conflictos.
- `js/app.js`: composición, estado en memoria, navegación y refresco de vistas.
- `js/seed.js`: datos ficticios reproducibles.

La separación permite sustituir en el futuro `repository.js` / `db.js` por una API REST, Supabase o Firebase sin reescribir el núcleo de horas y conflictos.

## Modelo de datos resumido

### Alumno

`id`, `nombre`, `apellidos`, `curso`, `grupoClase`, `tutor`, `horasPTObjetivoMin`, `horasALObjetivoMin`, `observaciones`, `restricciones[]`, `activo`.

### Profesional

`id`, `nombre`, `tipo`, `disponibilidad{día:[intervalos]}`, `maxWeeklyMinutes`, `observaciones`, `activo`.

### Grupo

`id`, `nombre`, `tipo`, `professionalId`, `studentIds[]`, `color`, `niveles`, `maxStudents`, `observaciones`, `activo`.

### Sesión

`id`, `groupId`, `professionalId`, `dia`, `inicio`, `fin`, `aula`, `observaciones`, `excludedStudentIds[]`.

## Reglas de negocio principales

1. La duración se calcula como diferencia entre hora de inicio y fin.
2. Objetivos y asignaciones se procesan internamente en minutos.
3. Las horas asignadas a un alumno se derivan de las sesiones de los grupos en los que participa.
4. Un grupo PT solo puede tener un profesional PT; lo mismo para AL.
5. Una sesión hereda el profesional responsable del grupo.
6. Los solapamientos usan la regla `max(inicios) < min(finales)`.
7. Los conflictos se recalculan tras cada operación o movimiento.
8. El drag & drop conserva la duración de la sesión.
9. Borrar un alumno lo retira de sus grupos.
10. Borrar un grupo elimina sus sesiones asociadas.
11. No se permite borrar un profesional mientras siga asignado a grupos.
12. Una importación valida el archivo completo antes de sustituir el horario local.

## Privacidad

El repositorio contiene únicamente el código y los datos ficticios incluidos en el proyecto. Los datos que una persona introduzca al usar la aplicación se guardan en el navegador mediante IndexedDB y no se suben al repositorio.

Los archivos exportados sí contienen los datos del horario para permitir compartirlos, por lo que deben tratarse de acuerdo con las políticas de privacidad y protección de datos del centro.

Consulta [PRIVACY.md](PRIVACY.md) antes de utilizar datos reales de alumnado.

## Próximas mejoras

- Creación de sesiones arrastrando directamente sobre una franja vacía.
- Panel individual avanzado de alumno y profesional.
- Restricciones avanzadas.
- Dashboard ampliado.
- Informes, impresión y PDF.
- Buscar huecos y optimización automática.
- Versiones y deshacer/rehacer.
- PWA.
- Backend opcional para sincronización multiusuario en tiempo real.

## Despliegue

Cada `push` a `main` ejecuta el workflow de GitHub Actions incluido en `.github/workflows/pages.yml`, valida la aplicación y publica automáticamente el sitio estático en GitHub Pages.

## Licencia

Distribuido bajo licencia **MIT**. Consulta [LICENSE](LICENSE).
