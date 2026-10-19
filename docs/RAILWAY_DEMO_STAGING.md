# Preparar la demo ficticia con una cuenta en Railway staging

Objetivo: validar registro, sesión Bearer, sincronización y cálculo de ausencias
sin modificar el backend de producción ni los horarios almacenados en IndexedDB.

**Estado:** instrucciones y protección de UI disponibles; la creación real de
servicios Railway y el despliegue requieren intervención y autorización del
propietario. No se ha provisionado ningún recurso ni se ha creado ninguna cuenta.

## 0. Dónde estamos

- App web de pruebas: https://wolcenon.github.io/Horario-PT-AL/
- Frontend editable: rama `integracion-gestor-escuela`.
- Backend editable: `WolcenOn/GestorEscuela`,
  rama `integracion-horario-pt-al`; no modificar `main`.
- El backend preconfigurado
  `https://gestorescuela-production.up.railway.app` es **producción**.
  **No** registrar allí el centro ficticio.
- `js/seed.js` carga la demo localmente mediante `loadDemoData()`.
  No crea ningún usuario ni un centro remoto.
- No habilitar `ALLOW_LEGACY_ROLE_BOOTSTRAP` para saltarse el inicio de sesión.
- No usar correos o datos de alumnado real. No compartir secretos con el chat.

## 1. Crear un entorno vacío de Railway

1. Abrir el proyecto que aloja GestorEscuela.
2. Desde el selector superior de entornos, pulsar `+ New Environment`.
3. Nombrarlo `staging` y elegir **Empty Environment**. Elegimos vacío,
   para no copiar accidentalmente la URL de PostgreSQL de producción,
   ni variables o credenciales reales.
4. En staging, pulsar `+ New` → `Database` → `PostgreSQL`.
   Esperar a que su servicio aparezca en el canvas.
5. Añadir un servicio desde GitHub para `WolcenOn/GestorEscuela`;
   seleccionar exclusivamente la rama `integracion-horario-pt-al`.
   Antes de ponerlo en marcha, revisar `Settings → Source`,
   la rama y la opción de autodespliegue. Se recomienda **Disable
   Autodeploy** en staging durante el arranque controlado.
6. Comprobar que se está editando `staging` (no `production`) antes
   de guardar variables, activar recursos o hacer clic en Deploy.

> Los proyectos/planes Railway pueden cobrar por el servicio API y
> PostgreSQL incluso siendo ficticios. Revisar el coste del plan.

## 2. Variables del backend en staging

En el servicio API del entorno **staging**, abrir `Variables` e introducir:

| Variable | Valor en staging |
| --- | --- |
| `DATABASE_URL` | Referencia a `DATABASE_URL` **del PostgreSQL de staging**, p. ej. `${{Postgres.DATABASE_URL}}` (ajustar nombre real del servicio) |
| `CORS_ORIGINS` | `https://wolcenon.github.io` |
| `ALLOW_LEGACY_ROLE_BOOTSTRAP` | `false` |
| `AUTH_SESSION_TTL_HOURS` | `12` |
| `AUTH_SESSION_IDLE_MINUTES` | `120` |
| `AUTH_LOGIN_MAX_FAILURES` | `5` |
| `PASSWORD_RESET_TTL_MINUTES` | `30` |
| `PASSWORD_RESET_FRONTEND_URL` | `https://wolcenon.github.io/Horario-PT-AL/` |
| `ENABLE_HSTS` | `true` |

El backend normaliza automáticamente `postgresql://` a
`postgresql+psycopg://`. No insertar una URL de producción ni pegarla
en el repositorio.

Todavía **no** configurar envío real: mantener `RESEND_API_KEY` ausente
y `EMAIL_FROM` ausente hasta verificar el dominio de envío en Resend.
Mientras tanto el formulario de recuperación da una respuesta neutra pero
**no** envía el correo. Las cuentas de prueba deben usar una contraseña
que se conozca o un restablecimiento administrativo auditado.

## 3. Revisar y, solo con autorización, desplegar staging

- `railway.json` define el predespliegue
  `PYTHONPATH=src python -m gestor_escuela.deploy`: espera la base
  de datos de **staging** y aplica migraciones Alembic.
- Arranca `python -m uvicorn gestor_escuela.web:app --host 0.0.0.0 --port $PORT`.
- Antes de desplegar, revisar que `DATABASE_URL` referencia al
  PostgreSQL recién creado; no desplegar si hay duda.
- Autorizar el despliegue del servicio *solo* en staging.
- Generar su dominio público temporal desde
  `Settings → Networking`. No es necesario conectar `wolcendev.tech`
  ni configurar DNS en este paso.
- Visitar `https://<dominio-staging>/health`; debe responder correctamente.
  **El healthcheck no demuestra por sí solo que la BD esté aislada**:
  comprobar también la referencia de `DATABASE_URL` en el panel.

## 4. Crear el centro de prueba desde la aplicación

1. Cargar la demo desde la propia web si no está cargada.
2. Abrir `Cuenta y sincronización`.
3. En `Preparar el centro ficticio en Railway`, pegar la **URL pública
   de staging** y pulsar `Guardar URL de pruebas`.
4. Si existía una configuración legacy, confirmar que se abandona esa
   conexión **solo del navegador**; el horario local no se borra.
5. Antes de enviar formularios, comprobar que el campo
   `Servidor de destino` del registro indica *staging*, no producción.
6. Crear una cuenta ficticia ADMIN con un correo que **tú controles**,
   nombre no real y contraseña robusta. La cuenta existe únicamente
   en la base de datos de staging.
7. La aplicación seleccionará el centro de la membresía autenticada;
   el token permanecerá en `sessionStorage`.
8. En `Sincronización operativa`, revisar el informe del adaptador:
   si hay errores, corregir los datos ficticios. Si está preparado,
   **confirmar conscientemente** la sincronización de configuración.
   Esa operación **sustituye** la configuración académica remota del
   centro de staging; no modifica IndexedDB.
9. Ir a `Ausencias y sustituciones`, registrar ausencias ficticias,
   confirmar el cálculo y revisar su borrador. No aplica cambios reales
   ni confirma coberturas automáticamente.

## 5. Seguridad y comprobaciones

- No duplicar la demo cargándola en el navegador para intentar resolver un 401:
  el registro de usuarios no depende de `loadDemoData()`.
- Un `Actor ID` o el `School ID` de la demo no son credenciales.
- En cada alta comprobar dominio de la API, entorno y centro seleccionado.
- No mezclar PostgreSQL de staging y production; no compartir `DATABASE_URL`.
- No activar invitaciones de docentes reales: los roles actuales no
  garantizan acceso exclusivo al horario propio y la verificación del
  buzón todavía no está terminada.
- El prototipo de cuenta/contraseña no acredita aún posesión del email.
  La verificación real del correo y la recuperación llegarán después de
  configurar Resend para `wolcendev.tech`.
- Nunca facilitar contraseñas, `RESEND_API_KEY`, tokens, variables privadas
  o URI de PostgreSQL en capturas ni conversaciones.

## 6. Estado y siguiente paso

Hasta que exista el dominio público de staging y se verifique su conexión
aislada a PostgreSQL, **no se ha completado el entorno de pruebas**.
Una vez listo, se podrá crear la cuenta desde la web y probar el cálculo
en el entorno aislado. No se necesitan exportaciones JSON para usar la demo.
