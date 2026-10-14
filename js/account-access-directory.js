import {escapeHtml as esc} from './utils.js';

export const ACCOUNT_ROLE_DESCRIPTIONS=Object.freeze({
  ADMIN:{
    name:'Dirección / administración',
    access:'Gestiona cuentas e invitaciones, configuración del centro y planes.'
  },
  PLANNER:{
    name:'Coordinación / planificación',
    access:'Prepara y resuelve planes del centro, pero no administra usuarios.'
  },
  VIEWER:{
    name:'Consulta general del centro',
    access:'Lee configuraciones y planes del centro. NO es adecuado para el acceso limitado de docentes.'
  },
  TEACHER:{
    name:'Docente (previsto)',
    access:'Únicamente su propio horario publicado. Aún no habilitado: requiere una cuenta vinculada a su ficha y un endpoint específico.'
  }
});
export function roleDescription(role){
  return ACCOUNT_ROLE_DESCRIPTIONS[role]||
    {name:'Rol desconocido',access:'Permisos no verificados: consultar con dirección.'};
}
const invitationStatus=status=>({
  accepted:'Invitación canjeada, correo no verificado',
  pending:'Pendiente de aceptación',
  expired:'Caducada'
})[status]||'Estado no reconocido';

export function renderSchoolAccessDirectory(overview,role,{loading=false,error=''}={}){
  const known=roleDescription(role);
  const isAdmin=role==='ADMIN';
  const permissions='<div class="integration-note" data-current-account-permissions>'+
    '<strong>Permisos de tu cuenta: '+esc(known.name)+'</strong>'+
    '<span>'+esc(known.access)+'</span></div>';
  const matrix='<details class="integration-details"><summary>Ver niveles de acceso</summary>'+
    '<ul class="integration-access-roles">'+
    Object.entries(ACCOUNT_ROLE_DESCRIPTIONS).map(([code,info])=>
      '<li><strong>'+esc(info.name)+'</strong> ('+esc(code)+'): '+
      esc(info.access)+'</li>').join('')+
    '</ul></details>';
  if(!isAdmin)return '<section class="card" data-access-permissions>'+
    '<div class="card-header"><div><h2>Usuarios y permisos</h2>'+
    '<small>Consulta tu nivel de acceso al centro.</small></div></div>'+
    '<div class="card-body">'+permissions+matrix+
    '<p class="field-hint">La lista de otros usuarios solo está disponible para Dirección.</p>'+
    '</div></section>';
  const members=Array.isArray(overview?.members)?overview.members:[];
  const invitations=Array.isArray(overview?.invitations)?overview.invitations:[];
  const status=loading?'Cargando usuarios y permisos…':error?esc(error):overview?
    'Listado de acceso del centro activo.':'Listado todavía no disponible.';
  return '<section class="card" data-access-permissions>'+
    '<div class="card-header"><div><h2>Usuarios y permisos</h2>'+
    '<small>Dirección puede consultar quién tiene acceso al centro.</small></div></div>'+
    '<div class="card-body">'+permissions+matrix+
    '<p>Las invitaciones existentes no acreditan por sí solas la propiedad '+
    'del correo. No se emiten ni envían enlaces desde esta pantalla.</p>'+
    (error?'<p class="integration-status is-error" data-access-overview-error>'+status+
      ' El listado requiere el backend de integración actualizado.</p>':
      !overview?'<p data-access-overview-state>'+status+'</p>':
      '<div class="table-wrap"><table data-access-users>'+
      '<thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>'+
      (members.length?members.map(item=>'<tr>'+
        '<td>'+esc(item.name||'—')+'</td><td>'+esc(item.email||'—')+'</td>'+
        '<td>'+esc(roleDescription(item.role).name)+'</td>'+
        '<td>'+esc(item.access_status==='account_active'?
          'Cuenta activa; correo no verificado en este registro':
          'Sin contraseña de acceso activa')+'</td></tr>').join(''):
        '<tr><td colspan="4">No hay personas registradas.</td></tr>')+
      '</tbody></table></div>'+
      '<h3>Invitaciones existentes</h3>'+
      '<div class="table-wrap"><table data-access-invitations>'+
      '<thead><tr><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>'+
      (invitations.length?invitations.map(item=>'<tr><td>'+
        esc(item.email||'—')+'</td><td>'+esc(roleDescription(item.role).name)+
        '</td><td>'+esc(invitationStatus(item.status))+'</td></tr>').join(''):
        '<tr><td colspan="3">Sin invitaciones.</td></tr>')+
      '</tbody></table></div>')+
    '<p class="field-hint">Rol Docente: pendiente de un acceso limitado '+
    'a su propio horario y verificación del buzón. No utilizar VIEWER '+
    'para simular este permiso.</p>'+
    '</div></section>';
}
