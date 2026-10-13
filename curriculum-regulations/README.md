# Normativa curricular versionada

Esta carpeta mantiene las distribuciones horarias legales separadas del motor,
de la interfaz y de los datos propios de cada colegio.

El catálogo comienza vacío: ninguna tabla de horas se presentará como oficial
hasta verificar su fuente y el anexo legal correspondiente.

## Cómo añadir una nueva legislación o revisión

1. Comprobar los cursos, materias, horas semanales y disposiciones transitorias
   con el anexo oficial del territorio, y registrar su URL HTTPS.
2. Crear un archivo inmutable nuevo:
   curriculum-regulations/profiles/<profileId>/<version>.json
   (por ejemplo, profiles/es-ejemplo-primaria/2026.1.json).
3. Incorporar al catálogo JSON una entrada con los mismos profileId, version,
   territory, legalReference y academicYear del archivo.
4. Revisar cuidadosamente los datos con la norma y ejecutar las pruebas.
5. El usuario carga la versión desde Planificación académica, revisa y aplica
   explícitamente la copia de horas al centro. Nunca se aplica sola.

Campos de cada archivo JSON:
- profileId: identificador ASCII con letras minúsculas, números y guiones.
- version: año más número de revisión, como 2026.1.
- territory: nombre exacto de la comunidad o administración.
- legalReference: norma y anexo comprobados.
- academicYear: curso de referencia, por ejemplo 2026/27.
- effectiveFrom: inicio de aplicación en formato AAAA-MM-DD.
- sourceUrl: URL HTTPS oficial verificable.
- profileName: nombre legible.
- weeklyHours: objeto con curso -> materia -> horas semanales numéricas
  en incrementos de 0.25 horas. El código guarda minutos exactos.

Ejemplo estructural NO oficial (las horas son ficticias):

{
  "profileId": "es-ejemplo-primaria",
  "version": "2026.1",
  "territory": "Andalucía",
  "legalReference": "Norma y anexo de ejemplo, NO verificados",
  "academicYear": "2026/27",
  "effectiveFrom": "2026-09-01",
  "sourceUrl": "https://example.org/fuente-no-oficial",
  "profileName": "Ejemplo de estructura, no datos legales",
  "weeklyHours": {"1º": {"Matemáticas": 4.5}}
}

## Garantías de evolución

Cada revisión se incorpora como archivo nuevo: conservar las versiones
anteriores permite saber de dónde salió el horario histórico.

IndexedDB conserva una COPIA de los minutos efectivamente aplicados y
la procedencia del perfil, incluidos identificador y versión.
Modificar archivos del catálogo no altera los proyectos ya existentes.

Si un colegio ajusta manualmente la carga o la referencia normativa, la
configuración se marca como personalizada y conserva la procedencia.

Ni consultar el catálogo ni aplicar una revisión modifica directamente
horarios de aula, sesiones PT/AL, alumnado o backend.

Se mantienen las importaciones manuales sin ID o versión de catálogo.
