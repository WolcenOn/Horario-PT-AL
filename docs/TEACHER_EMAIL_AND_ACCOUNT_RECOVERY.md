# Correo profesional y recuperación de cuentas

## Estado actual de las ramas de integración

- El correo opcional de **Profesorado** es un contacto local para los avisos
  de horarios y sustituciones. Se guarda en IndexedDB y en las copias JSON
  del centro; no se envía al motor de cobertura.
- El acceso a **GestorEscuela** utiliza otra identidad: una cuenta remota
  autenticada mediante correo y contraseña, creada al registrar un centro
  o al aceptar una invitación autorizada. Actualmente el perfil docente local
  **no está vinculado** a esa cuenta remota.
- La rama de integración del backend ya contiene
  `POST /auth/password/reset-request` y
  `POST /auth/password/reset-confirm`. El primer extremo responde de
  forma genérica para no revelar si existe la cuenta. El servidor solo
  genera token para cuentas activas, lo almacena cifrado mediante hash,
  lo limita en tiempo, invalida anteriores y revoca sesiones tras
  completar el cambio. El envío por correo requiere configuración del
  proveedor `RESEND_API_KEY` y `EMAIL_FROM`.
- Esta funcionalidad en ramas de integración **no equivale a desplegar el
  backend** ni garantiza que exista un servicio de correo operativo.

## Condiciones para reutilizar un correo

1. La persona debe tener una cuenta de acceso autorizada para el centro.
   Registrar `nombre@centro.es` en «Profesorado» no crea dicha cuenta.
2. El buzón debe quedar realmente verificado durante el alta o un flujo
   seguro de verificación en el servidor. **Una dirección editable localmente
   o un enlace de invitación visto por el administrador no demuestran**
   que su titular controle el buzón.
3. La identidad del docente debe asociarse de forma explícita, verificada
   y autorizada a la cuenta remota. No enlazar por coincidencia de nombre.
   Avisar si hay varios perfiles locales con el mismo correo: una dirección
   de equipo no debe convertirse automáticamente en identidad personal.
4. Solo la identidad remota debe decidir si procede una recuperación. La
   recuperación no debe consultar IndexedDB para autorizar al solicitante.
5. La modificación local de un correo **no cambia la cuenta remota**
   ni redirige los enlaces de recuperación; cuando exista edición de correo
   de cuenta, debe exigir revalidación del nuevo buzón.
6. Para restablecer, el servidor debe generar un token aleatorio, temporal,
   de un solo uso, enviarlo al buzón confirmado y revocar sesiones
   anteriores. Nunca incluir contraseñas, tokens, secretos, motivos de baja
   ni identificadores de alumnado en los correos informativos.

## Incremento de interfaz

En «Profesorado» se visualiza el estado **solo local** del contacto:
sin correo, formato no válido, compartido o «contacto disponible; cuenta no
vinculada». Ninguno de esos estados constituye verificación o habilita
recuperación de contraseñas. El formulario explica que el correo podría
servir para una cuenta personal **después** de su activación y verificación.
La pantalla «Acceso al centro» aclara que recuperar contraseña requiere
una cuenta de GestorEscuela existente y entrega de correo configurada.

**Pendiente**: invitaciones realmente entregadas al buzón, comprobación
de propiedad del correo, asociación autorizada perfil ↔ cuenta y edición
de email de cuenta con reverificación. No activar estos pasos de forma
automática ni en el frontend sin garantías del backend.
