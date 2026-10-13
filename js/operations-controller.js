import {
  createDayPlan,listDayPlans,loadBackendSettings,pushAcademicConfiguration,solveAcademicDay,
  backendConfigured
} from './backend-service.js';
import {buildGestorEscuelaConfiguration} from './gestor-adapter.js';
import {toJsonCompatible} from './gestor-serialization.js';
import {renderOperationsView} from './operations-view.js';
import {loadState} from './repository.js';
import {buildJointAbsenceRequest,assessJointAbsenceResult}
  from './joint-absence-coverage.js';
import {dateNumber} from './staff-absences.js';
import {showToast} from './ui.js';
import {applyViewShell} from './view-shell.js';

const viewRoot=document.querySelector('#viewRoot');
let operationStatus=null;
let latestResult=null;
let jointDate=localDateISO(new Date());
let jointStatus=null;
let jointAssessment=null;
let jointResult=null;
let jointBusy=false;

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-view="operations"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openOperations();
},true);

// Calendar -> Operations is a local navigation only. Never calculate or
// synchronize merely by selecting a date.
document.addEventListener('horario:joint-absences-date',event=>{
  const date=event.detail?.date;
  if(dateNumber(date)===null)return;
  jointDate=date;
  jointStatus=null;jointResult=null;jointAssessment=null;
  void openOperations();
});

async function openOperations(){
  try{
    const state=await loadState();
    const settings=loadBackendSettings();
    const adapter=buildGestorEscuelaConfiguration(state);
    const jointPlan=buildJointAbsenceRequest(state,adapter,jointDate);
    applyViewShell({view:'operations',title:'Operativa diaria'});
    renderOperationsView(viewRoot,{
      state,settings,adapter,status:operationStatus,result:latestResult,
      jointDate,jointPlan,jointStatus,jointResult,jointAssessment,
      onSolve:async request=>solveAbsence({state,settings,adapter,request}),
      onJointDate:async date=>{
        if(dateNumber(date)===null){showToast('Selecciona una fecha válida.','error');return;}
        jointDate=date;
        jointResult=null;jointAssessment=null;jointStatus=null;
        await openOperations();
      },
      onJointSolve:async()=>solveJointAbsences(jointPlan)
    });
  }catch(error){
    console.error(error);
    viewRoot.innerHTML='<section class="card"><div class="empty-state">'+
      '<strong>No se pudo abrir Operativa diaria</strong>'+
      escapeText(error.message||'Error inesperado.')+'</div></section>';
  }
}

async function loadOrCreatePlan(settings,date){
  const existing=await listDayPlans(settings,date);
  const plan=Array.isArray(existing)?existing[0]:null;
  if(plan){
    if(String(plan.status||'').toUpperCase()==='CONFIRMED')
      throw Error('El plan diario está confirmado. No se puede sobrescribir sin reabrirlo.');
    return plan;
  }
  return createDayPlan(settings,{
    plan_date:date,source_hash:null,
    notes:'Borrador de sustituciones · Horario PT/AL',
    payload:{source:'horario-pt-al',kind:'absences-draft'}
  });
}

async function solveJointAbsences(snapshot){
  if(jointBusy)return;
  jointBusy=true;
  try{
    // The input and mapping are rebuilt just before the request, to refuse
    // stale calendar snapshots rather than solve a changed set of absences.
    const state=await loadState();
    const settings=loadBackendSettings();
    const adapter=buildGestorEscuelaConfiguration(state);
    const latest=buildJointAbsenceRequest(state,adapter,jointDate);
    if(!backendConfigured(settings)||!adapter.report.ready)
      throw Error('Configura primero la conexión y corrige los problemas de preparación.');
    if(!latest.ready)throw Error(latest.errors.join(' '));
    if(!snapshot||!snapshot.ready||
       JSON.stringify(latest.request)!==JSON.stringify(snapshot.request)||
       JSON.stringify(latest.details)!==JSON.stringify(snapshot.details)||
       JSON.stringify(latest.teacherCapabilities)!==
         JSON.stringify(snapshot.teacherCapabilities)||
       JSON.stringify(latest.supportSessions)!==
         JSON.stringify(snapshot.supportSessions)||
       JSON.stringify(latest.roomResources)!==
         JSON.stringify(snapshot.roomResources)||
       JSON.stringify(latest.localAudit)!==
         JSON.stringify(snapshot.localAudit))
      throw Error('Las ausencias o el horario han cambiado. Revisa de nuevo la fecha antes de calcular.');
    if(!confirm('¿Calcular conjuntamente estas ausencias? Esta acción sincroniza la '+
      'configuración académica con GestorEscuela y guarda un BORRADOR del plan diario '+
      'remoto. No se aplica ninguna sustitución ni se marcan ausencias como resueltas.'))
      return;
    jointResult=null;jointAssessment=null;
    jointStatus={kind:'pending',message:'Enviando las ausencias juntas al optimizador…'};
    await openOperations();
    await pushAcademicConfiguration(settings,toJsonCompatible(adapter.configuration));
    const plan=await loadOrCreatePlan(settings,jointDate);
    const result=await solveAcademicDay(settings,plan.id,{
      ...latest.request,
      expected_version:Number(plan.version)||undefined
    });
    jointResult=result;
    jointAssessment=assessJointAbsenceResult(latest,result);
    jointStatus={kind:'ok',message:'Borrador conjunto calculado. '+
      'Revisa sustituciones de clases y PT/AL; los apoyos omitidos por '+
      'un motor antiguo figuran sin verificar. Nada se ha aplicado.'};
    showToast('Propuesta conjunta disponible para revisión, sin aplicar.');
  }catch(error){
    console.error(error);
    jointResult=null;jointAssessment=null;
    jointStatus={kind:'error',message:error.message||'No se pudo calcular la cobertura.'};
    showToast(jointStatus.message,'error');
  }finally{
    jointBusy=false;
    await openOperations();
  }
}

// Legacy one-teacher workflow stays backwards compatible.
async function solveAbsence({settings,adapter,request}){
  operationStatus={kind:'pending',message:'Sincronizando horario y preparando el plan diario…'};
  latestResult=null;
  await openOperations();
  try{
    if(!request.date)throw Error('Selecciona la fecha de la ausencia.');
    const teacherId=adapter.report.mappings.teachers?.[request.professionalId];
    if(!teacherId)throw Error('No se pudo traducir el docente seleccionado al backend.');
    if(!request.slotIds?.length)throw Error('Selecciona al menos una franja.');
    await pushAcademicConfiguration(settings,toJsonCompatible(adapter.configuration));
    const plan=await loadOrCreatePlan(settings,request.date);
    operationStatus={kind:'pending',message:'GestorEscuela está buscando la mejor cobertura global…'};
    await openOperations();
    latestResult=await solveAcademicDay(settings,plan.id,{
      absences:[{teacher_id:teacherId,slot_ids:request.slotIds}],
      locked_substitutions:[],expected_version:Number(plan.version)||undefined
    });
    const solution=latestResult?.payload?.solution||{};
    const substitutions=solution.substitutions?.length||0;
    const uncovered=solution.uncovered?.length||0;
    operationStatus={kind:'ok',message:substitutions+
      ' sustitución(es) propuesta(s) y '+uncovered+' necesidad(es) sin cubrir.'};
    showToast('GestorEscuela ha calculado la propuesta de sustituciones.');
  }catch(error){
    console.error(error);
    operationStatus={kind:'error',message:error.message||'No se pudo calcular la sustitución.'};
    showToast(operationStatus.message,'error');
  }
  await openOperations();
}

function localDateISO(date){
  return String(date.getFullYear()).padStart(4,'0')+'-'+
    String(date.getMonth()+1).padStart(2,'0')+'-'+
    String(date.getDate()).padStart(2,'0');
}
function escapeText(value){
  return String(value||'').replace(/[&<>"']/g,
    x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
}
