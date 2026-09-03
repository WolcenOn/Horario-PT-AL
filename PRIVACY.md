# Privacidad y datos

Horario PT / AL está diseñado para funcionar como una aplicación estática en el navegador.

## Dónde se guardan los datos

- Los datos de alumnos, profesionales, grupos y sesiones se almacenan en **IndexedDB** del navegador del dispositivo utilizado.
- Las preferencias sencillas de interfaz se almacenan en **localStorage**.
- La versión actual no incluye backend, cuentas de usuario ni sincronización en la nube.
- Publicar el código en GitHub Pages **no publica automáticamente los datos introducidos en la aplicación**.

## Datos de menores

La aplicación puede utilizarse con información educativa sensible. Antes de introducir datos reales, la organización usuaria debe comprobar que el uso del dispositivo, navegador y copias de seguridad se ajusta a sus políticas internas y a la normativa aplicable.

Se recomienda usar códigos o iniciales cuando no sea necesario mostrar nombres completos, limitar el acceso físico al dispositivo y borrar los datos del navegador cuando deje de utilizarse en un equipo compartido.

## Alcance actual

La Fase 1 es una versión local/offline-first. Autenticación, control de acceso, cifrado de servidor, auditoría y sincronización multiusuario quedan fuera del MVP y deberán abordarse antes de migrar a un entorno centralizado con datos reales.
