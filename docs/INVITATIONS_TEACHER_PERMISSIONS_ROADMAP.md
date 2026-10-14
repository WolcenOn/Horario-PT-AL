# Invitaciones, verificación de correo y acceso docente

## Recorrido previsto

1. **Dirección** mantiene en la ficha docente un correo institucional y
   solicita el alta para una cuenta con rol **DOCENTE**.
2. Antes de emitir la invitación, el servidor valida que la dirección no se
   encuentre vinculada a otra identidad docente de ese centro y que
   la petición proceda de una sesión ADMIN autorizada.
3. El backend genera un token criptográficamente aleatorio, guarda
   exclusivamente su huella/hash y su caducidad (por ejemplo 48 h) y
   **envía el enlace únicamente al buzón** mediante un proveedor de correo
   institucional. No expone el token al navegador de Dirección ni a los logs.
4. El docente abre el enlace, el backend comprueba la firma/huella,
   caducidad, centro, rol, destinatario y ausencia de reutilización.
   Entonces establece una contraseña nueva: **no se envía ninguna
   contraseña por correo**. Tras canjear el token, el backend marca
   expresamente el correo como verificado.
5. Se crea un vínculo controlado `school_id + user_id ↔ professional_id`
   entre la cuenta y la ficha docente. No basta con compartir nombre o
   correo en IndexedDB para crear el vínculo.
6. Con la sesión iniciada, el docente entra directamente en **Mi horario**,
   no en el gestor de centro. Solo visualiza sus clases y las sustituciones
   que le afectan; no descarga el proyecto completo, listas de alumnado,
   horarios de otros profesionales, configuración del solver ni borradores.
7. Recuperar contraseña utiliza el buzón **verificado de la cuenta** y
   otro token temporal de un solo uso. Un cambio del correo en la ficha
   local no actualiza el correo verificado de la cuenta. Cambiar este
   último exige reverificación.
8. Dirección puede ver invitaciones pendientes, caducadas, canjeadas y
   revocar acceso; cada acción requiere autorización del servidor y debe
   quedar auditada. No convertir «enlace enviado» en «correo verificado».

## Matriz de permisos

| Rol | Configura el centro | Calcula/aplica borradores | Ve horarios | Gestiona usuarios |
| --- | --- | --- | --- | --- |
| ADMIN — Dirección | Sí | Sí (con controles de aprobación) | Del centro | Sí |
| PLANNER — Coordinación | Según operación autorizada | Sí, sujeto a aprobación | Del centro | No |
| VIEWER — Consulta general | Lectura de configuración del centro | No | Del centro | No |
| DOCENTE — Mi horario **previsto** | No | No | **Solo el suyo publicado** | No |

**Advertencia crucial:** `VIEWER` actualmente permite consultar
configuración y planes completos. **No se le puede asignar el significado de
«docente».** En el estado actual, `DOCENTE` no está habilitado en la API.
Al implementarlo se debe crear un endpoint independiente de horario
publicado, comprobar en el servidor el vínculo cuenta↔docente y mantener
denegados los endpoints generales `ViewerDep`. Un filtro de interfaz o
una copia completa de IndexedDB **no son controles de acceso**.

## Base implementada en las ramas de integración

- GestorEscuela ya tiene cuentas, sesiones Bearer, invitaciones de un solo
  uso y recuperación de contraseña. Sin embargo, **las invitaciones actuales
  devuelven un token a la sesión de Dirección**: aceptar ese token no
  demuestra necesariamente que la persona controla el buzón. Tampoco hay
  actualmente un vínculo seguro cuenta↔perfil docente.
- Se incorpora `GET /schools/{school_id}/access-overview`, **solo ADMIN
  autenticado con Bearer**, que devuelve exclusivamente los miembros del
  centro y estados resumidos de sus invitaciones. **Nunca expone tokens,
  contraseñas o hashes**, y ninguna cuenta/invitación se presenta como
  correo verificado.
- «Cuenta y sincronización» muestra un panel **Usuarios y permisos**:
  nivel propio para todos los usuarios conectados; tabla de miembros e
  invitaciones solo para Dirección, cuando el backend compatible está
  disponible. No genera invitaciones ni modifica permisos todavía.
- El backend nuevo **permanece sin desplegar**. Si la instalación remota
  es antigua, la interfaz explica que el listado no está disponible.

## Infraestructura futura

El dominio propio no es imprescindible para ensayar rutas y permisos,
pero antes del envío real habrá que configurar remitente y reputación
(DNS, SPF, DKIM y DMARC), HTTPS, redirecciones de enlace, límites de
solicitudes, caducidad, revocación, mensajes que no revelen si existe
la cuenta, supervisión de entregas y política de datos del centro.
No almacenar tokens en IndexedDB, correos de soporte/PT/AL o trazas
legibles de logs.

El backend no debe **marcar ningún email como verificado** hasta
haber entregado el enlace a ese buzón y recibido la prueba válida
de posesión mediante canje del token.
