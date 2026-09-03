import { bulkPut, getAll, put, resetDatabase } from './db.js';

const weekdayAvailability = (inicio = '08:45', fin = '14:15') => ({
  lunes: [{ inicio, fin }], martes: [{ inicio, fin }], miercoles: [{ inicio, fin }], jueves: [{ inicio, fin }], viernes: [{ inicio, fin }]
});

export function demoData() {
  const students = [
    { id:'alu_001', nombre:'Lucía', apellidos:'García López', curso:'4º', grupoClase:'4ºA', tutor:'Marta Ruiz', horasPTObjetivoMin:135, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_002', nombre:'Daniel', apellidos:'Santos Pérez', curso:'4º', grupoClase:'4ºA', tutor:'Marta Ruiz', horasPTObjetivoMin:180, horasALObjetivoMin:0, observaciones:'Pendiente de completar PT.', restricciones:[], activo:true },
    { id:'alu_003', nombre:'Paula', apellidos:'Martín Vega', curso:'3º', grupoClase:'3ºB', tutor:'Javier Díaz', horasPTObjetivoMin:180, horasALObjetivoMin:0, observaciones:'Caso preparado con exceso de PT.', restricciones:[], activo:true },
    { id:'alu_004', nombre:'Mario', apellidos:'Navarro Gil', curso:'4º', grupoClase:'4ºA', tutor:'Marta Ruiz', horasPTObjetivoMin:135, horasALObjetivoMin:135, observaciones:'', restricciones:[{ dia:'martes', inicio:'10:00', fin:'11:00', tipo:'no-salir', motivo:'Matemáticas' }], activo:true },
    { id:'alu_005', nombre:'Elena', apellidos:'Campos León', curso:'5º', grupoClase:'5ºA', tutor:'Isabel Mora', horasPTObjetivoMin:135, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_006', nombre:'Hugo', apellidos:'Romero Calvo', curso:'2º', grupoClase:'2ºA', tutor:'Raquel Ortiz', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_007', nombre:'Sara', apellidos:'Molina Serra', curso:'2º', grupoClase:'2ºA', tutor:'Raquel Ortiz', horasPTObjetivoMin:0, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_008', nombre:'Álvaro', apellidos:'Prieto Cano', curso:'1º', grupoClase:'1ºB', tutor:'Laura Soler', horasPTObjetivoMin:135, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_009', nombre:'Nora', apellidos:'Iglesias Soto', curso:'1º', grupoClase:'1ºB', tutor:'Laura Soler', horasPTObjetivoMin:0, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_010', nombre:'Leo', apellidos:'Vidal Cruz', curso:'6º', grupoClase:'6ºA', tutor:'Pablo Nieto', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_011', nombre:'Claudia', apellidos:'Ramos Sanz', curso:'6º', grupoClase:'6ºA', tutor:'Pablo Nieto', horasPTObjetivoMin:135, horasALObjetivoMin:135, observaciones:'', restricciones:[], activo:true },
    { id:'alu_012', nombre:'Bruno', apellidos:'Ortega Moya', curso:'5º', grupoClase:'5ºB', tutor:'Sonia Pardo', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_013', nombre:'Irene', apellidos:'Costa Rey', curso:'5º', grupoClase:'5ºB', tutor:'Sonia Pardo', horasPTObjetivoMin:0, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_014', nombre:'Marcos', apellidos:'Fuentes Lara', curso:'3º', grupoClase:'3ºA', tutor:'Carlos Gil', horasPTObjetivoMin:225, horasALObjetivoMin:90, observaciones:'', restricciones:[], activo:true },
    { id:'alu_015', nombre:'Aitana', apellidos:'Roca Ferrer', curso:'3º', grupoClase:'3ºA', tutor:'Carlos Gil', horasPTObjetivoMin:225, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_016', nombre:'Samuel', apellidos:'Herrera Paz', curso:'2º', grupoClase:'2ºB', tutor:'Eva Marín', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_017', nombre:'Vera', apellidos:'Domingo Roig', curso:'2º', grupoClase:'2ºB', tutor:'Eva Marín', horasPTObjetivoMin:0, horasALObjetivoMin:90, observaciones:'', restricciones:[], activo:true },
    { id:'alu_018', nombre:'Adrián', apellidos:'Blasco Ríos', curso:'1º', grupoClase:'1ºA', tutor:'Noelia Peña', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true },
    { id:'alu_019', nombre:'Mireia', apellidos:'Luna Pastor', curso:'1º', grupoClase:'1ºA', tutor:'Noelia Peña', horasPTObjetivoMin:0, horasALObjetivoMin:90, observaciones:'', restricciones:[], activo:true },
    { id:'alu_020', nombre:'Óscar', apellidos:'Pons Miralles', curso:'6º', grupoClase:'6ºB', tutor:'Andrés Rubio', horasPTObjetivoMin:135, horasALObjetivoMin:0, observaciones:'', restricciones:[], activo:true }
  ];

  const professionals = [
    { id:'prof_pt_ana', nombre:'Ana Torres', tipo:'PT', disponibilidad:weekdayAvailability('08:45','14:15'), maxWeeklyMinutes:1500, observaciones:'', activo:true },
    { id:'prof_pt_maria', nombre:'María López', tipo:'PT', disponibilidad:weekdayAvailability('09:00','14:00'), maxWeeklyMinutes:1380, observaciones:'', activo:true },
    { id:'prof_al_carmen', nombre:'Carmen Ruiz', tipo:'AL', disponibilidad:weekdayAvailability('09:00','14:00'), maxWeeklyMinutes:1320, observaciones:'', activo:true },
    { id:'prof_al_pablo', nombre:'Pablo Serra', tipo:'AL', disponibilidad:weekdayAvailability('08:45','13:45'), maxWeeklyMinutes:1260, observaciones:'', activo:true }
  ];

  const groups = [
    { id:'grp_pt_1', nombre:'PT 4ºA', tipo:'PT', professionalId:'prof_pt_ana', studentIds:['alu_001','alu_002','alu_004'], color:'#dceef5', niveles:'4º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_pt_2', nombre:'PT 3º', tipo:'PT', professionalId:'prof_pt_ana', studentIds:['alu_003','alu_014','alu_015'], color:'#dceef5', niveles:'3º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_pt_3', nombre:'PT 5º', tipo:'PT', professionalId:'prof_pt_maria', studentIds:['alu_005','alu_012'], color:'#dceef5', niveles:'5º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_pt_4', nombre:'PT inicial', tipo:'PT', professionalId:'prof_pt_maria', studentIds:['alu_006','alu_008','alu_016','alu_018'], color:'#dceef5', niveles:'1º-2º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_al_1', nombre:'AL 4º-5º', tipo:'AL', professionalId:'prof_al_carmen', studentIds:['alu_001','alu_004','alu_005','alu_011'], color:'#ece7f7', niveles:'4º-6º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_al_2', nombre:'AL 1º-2º', tipo:'AL', professionalId:'prof_al_carmen', studentIds:['alu_007','alu_008','alu_009'], color:'#ece7f7', niveles:'1º-2º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_al_3', nombre:'AL 3º', tipo:'AL', professionalId:'prof_al_pablo', studentIds:['alu_014','alu_017','alu_019'], color:'#ece7f7', niveles:'2º-3º', observaciones:'', maxStudents:4, activo:true },
    { id:'grp_pt_5', nombre:'PT 6º', tipo:'PT', professionalId:'prof_pt_maria', studentIds:['alu_010','alu_011','alu_020'], color:'#dceef5', niveles:'6º', observaciones:'', maxStudents:4, activo:true }
  ];

  const sessions = [
    { id:'ses_01', groupId:'grp_pt_1', professionalId:'prof_pt_ana', dia:'lunes', inicio:'09:00', fin:'09:45', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_02', groupId:'grp_pt_1', professionalId:'prof_pt_ana', dia:'martes', inicio:'10:30', fin:'11:15', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_03', groupId:'grp_pt_1', professionalId:'prof_pt_ana', dia:'viernes', inicio:'09:45', fin:'10:30', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_04', groupId:'grp_pt_2', professionalId:'prof_pt_ana', dia:'lunes', inicio:'10:00', fin:'10:45', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_05', groupId:'grp_pt_2', professionalId:'prof_pt_ana', dia:'miercoles', inicio:'09:45', fin:'10:30', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_06', groupId:'grp_pt_2', professionalId:'prof_pt_ana', dia:'miercoles', inicio:'10:15', fin:'11:00', aula:'Aula PT 2', observaciones:'Conflicto profesional intencionado.' },
    { id:'ses_07', groupId:'grp_pt_3', professionalId:'prof_pt_maria', dia:'martes', inicio:'09:00', fin:'09:45', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_08', groupId:'grp_pt_3', professionalId:'prof_pt_maria', dia:'jueves', inicio:'12:30', fin:'13:15', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_09', groupId:'grp_pt_4', professionalId:'prof_pt_maria', dia:'lunes', inicio:'11:45', fin:'12:30', aula:'Aula apoyo', observaciones:'' },
    { id:'ses_10', groupId:'grp_pt_4', professionalId:'prof_pt_maria', dia:'jueves', inicio:'10:45', fin:'11:30', aula:'Aula apoyo', observaciones:'Coincide con restricción de Mario solo si se incorpora al grupo.' },
    { id:'ses_11', groupId:'grp_pt_5', professionalId:'prof_pt_maria', dia:'miercoles', inicio:'11:45', fin:'12:30', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_12', groupId:'grp_pt_5', professionalId:'prof_pt_maria', dia:'viernes', inicio:'12:30', fin:'13:15', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_13', groupId:'grp_al_1', professionalId:'prof_al_carmen', dia:'martes', inicio:'11:00', fin:'11:45', aula:'Aula AL', observaciones:'Genera solapamiento de Lucía y Mario con PT 4ºA.' },
    { id:'ses_14', groupId:'grp_al_1', professionalId:'prof_al_carmen', dia:'jueves', inicio:'09:45', fin:'10:30', aula:'Aula AL', observaciones:'' },
    { id:'ses_15', groupId:'grp_al_2', professionalId:'prof_al_carmen', dia:'lunes', inicio:'09:45', fin:'10:30', aula:'Aula AL', observaciones:'' },
    { id:'ses_16', groupId:'grp_al_2', professionalId:'prof_al_carmen', dia:'miercoles', inicio:'12:30', fin:'13:15', aula:'Aula AL', observaciones:'' },
    { id:'ses_17', groupId:'grp_al_3', professionalId:'prof_al_pablo', dia:'martes', inicio:'09:45', fin:'10:30', aula:'Aula AL 2', observaciones:'' },
    { id:'ses_18', groupId:'grp_al_3', professionalId:'prof_al_pablo', dia:'jueves', inicio:'11:45', fin:'12:30', aula:'Aula AL 2', observaciones:'' },
    { id:'ses_19', groupId:'grp_pt_4', professionalId:'prof_pt_maria', dia:'martes', inicio:'12:30', fin:'13:15', aula:'Aula apoyo', observaciones:'' },
    { id:'ses_20', groupId:'grp_pt_5', professionalId:'prof_pt_maria', dia:'lunes', inicio:'13:15', fin:'14:00', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_21', groupId:'grp_al_1', professionalId:'prof_al_carmen', dia:'viernes', inicio:'11:45', fin:'12:30', aula:'Aula AL', observaciones:'' },
    { id:'ses_22', groupId:'grp_al_2', professionalId:'prof_al_carmen', dia:'viernes', inicio:'09:00', fin:'09:45', aula:'Aula AL', observaciones:'' },
    { id:'ses_23', groupId:'grp_pt_2', professionalId:'prof_pt_ana', dia:'jueves', inicio:'11:45', fin:'12:30', aula:'Aula PT 1', observaciones:'' },
    { id:'ses_24', groupId:'grp_pt_3', professionalId:'prof_pt_maria', dia:'viernes', inicio:'10:30', fin:'11:15', aula:'Aula PT 2', observaciones:'' },
    { id:'ses_25', groupId:'grp_pt_2', professionalId:'prof_pt_ana', dia:'viernes', inicio:'13:30', fin:'14:15', aula:'Aula PT 1', observaciones:'Hace que Paula supere su objetivo.' }
  ];

  return { students, professionals, groups, sessions };
}

export async function ensureSeedData() {
  const students = await getAll('students');
  if (students.length) return false;
  await loadDemoData();
  return true;
}

export async function loadDemoData() {
  const data = demoData();
  await resetDatabase();
  await bulkPut('students', data.students);
  await bulkPut('professionals', data.professionals);
  await bulkPut('groups', data.groups);
  await bulkPut('sessions', data.sessions);
  await put('settings', { id:'app', seeded:true, version:1 });
}
