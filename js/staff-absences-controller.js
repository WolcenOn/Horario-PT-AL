// One calendar-first workflow for one or many simultaneous staff absences.
import {bulkPut} from './db.js';
import {deleteStaffAbsence,loadState,saveStaffAbsence} from './repository.js';
import {dateNumber,monthShift,normalizeStaffAbsence,validateAbsenceCollection} from './staff-absences.js';
import {createSelectedStaffAbsences} from './absence-flow.js';
import {renderStaffAbsences} from './staff-absences-view.js';
import {buildGestorEscuelaConfiguration} from './gestor-adapter.js';
import {buildJointAbsenceRequest,assessJointAbsenceResult}
  from './joint-absence-coverage.js';
import {toJsonCompatible} from './gestor-serialization.js';
import {
  loadBackendSettings,backendConfigured,pushAcademicConfiguration,
  listDayPlans,createDayPlan,solveAcademicDay
} from './backend-service.js';
import {showToast} from './ui.js';
import {applyViewShell} from './view-shell.js';
import {prepareDraftReview,selectDraftSubstitute,confirmDraftSlot,approveDraftForPrint}
  from './absence-draft-review.js';
import {renderReviewedDayPrint} from './absence-reviewed-print.js';

const root=document.querySelector('#viewRoot');
let month='',filter='all',selectedDay='',working=false,solving=false;
let assessment=null,result=null,jointStatus=null,review={},reviewSnapshot='';
const fingerprint=plan=>JSON.stringify([
  plan?.date,plan?.request,plan?.details,plan?.teacherCapabilities,
  plan?.supportSessions,plan?.roomResources,plan?.localAudit
]);
function resetReview(){
  assessment=null;result=null;jointStatus=null;review={};reviewSnapshot='';
}
async function refreshReview(){
  const scroll=window.scrollY;
  await openCalendar();
  window.scrollTo(0,scroll);
}
const today=()=>{
  const d=new Date();
  return [String(d.getFullYear()).padStart(4,'0'),
    String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')]
    .join('-');
};
function openDay(date){
  if(dateNumber(date)===null)return;
  selectedDay=date;month=date.slice(0,7);filter='all';
  resetReview();
  void openCalendar();
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-view="staffAbsences"],[data-view="operations"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!month){selectedDay=today();month=selectedDay.slice(0,7);}
  void openCalendar();
},true);
document.addEventListener('horario:open-absences',event=>{
  const date=event.detail?.date;
  if(dateNumber(date)!==null)openDay(date);
  else{
    if(!month){selectedDay=today();month=selectedDay.slice(0,7);}
    void openCalendar();
  }
});
document.addEventListener('horario:joint-absences-date',event=>{
  if(dateNumber(event.detail?.date)!==null)openDay(event.detail.date);
});

async function openCalendar(){
  try{
    const state=await loadState();
    const adapter=buildGestorEscuelaConfiguration(state);
    const settings=loadBackendSettings();
    const jointPlan=selectedDay?buildJointAbsenceRequest(state,adapter,selectedDay):null;
    if(result&&fingerprint(jointPlan)!==reviewSnapshot)resetReview();
    const draftReview=result?prepareDraftReview(jointPlan,result,review):null;
    if(result)assessment=draftReview?.assessment||assessment;
    applyViewShell({view:'staffAbsences',title:'Calendario y cobertura de ausencias'});
    renderStaffAbsences(root,{
      state,month,filter,selectedDay,
      joint:{
        plan:jointPlan,adapter,assessment,result,status:jointStatus,draftReview,
        connected:backendConfigured(settings),adapterReady:adapter.report.ready
      },
      onMonth:delta=>{
        try{month=monthShift(month,delta);selectedDay='';resetReview();void openCalendar();}
        catch(error){showToast(error.message,'error');}
      },
      onFilter:value=>{
        filter=['all','pending','resolved'].includes(value)?value:'all';
        void openCalendar();
      },
      onDay:date=>{
        if(!date){selectedDay='';resetReview();void openCalendar();}
        else openDay(date);
      },
      onJoint:date=>{
        if(!selectedDay||selectedDay!==date)openDay(date);
      },
      onCalculate:()=>calculateJoint(),
      onChoose:async(activityId,teacherId)=>{
        if(!result||review.approved)return;
        try{
          review=selectDraftSubstitute(jointPlan,result,review,activityId,teacherId);
          await refreshReview();
        }catch(error){showToast(error.message,'error');await refreshReview();}
      },
      onConfirm:async activityId=>{
        if(!result||review.approved)return;
        try{
          review=confirmDraftSlot(jointPlan,result,review,activityId);
          await refreshReview();
        }catch(error){showToast(error.message,'error');}
      },
      onApprove:async()=>{
        if(!result||review.approved)return;
        try{
          const proposal=approveDraftForPrint(jointPlan,result,review);
          if(!confirm('¿Confirmar esta revisión LOCAL del borrador para imprimir el horario? '+
            'No se aplican sustituciones ni se marcan ausencias como resueltas. '+
            'Comprueba por separado la atención individual de los apoyos PT/AL.'))return;
          review=proposal;
          await refreshReview();
          showToast('Borrador revisado localmente y preparado para imprimir.');
        }catch(error){showToast(error.message,'error');}
      },
      onPrint:()=>{
        if(!result||!review.approved)return;
        try{
          const ready=prepareDraftReview(jointPlan,result,review);
          if(!ready?.approved)throw Error('El borrador ya no es válido.');
          document.querySelector('#absence-print-sheet')?.remove();
          document.body.insertAdjacentHTML('beforeend',
            renderReviewedDayPrint({date:selectedDay,state,adapter,plan:jointPlan,
              review:ready}));
          document.body.classList.add('printing-absences');
          window.addEventListener('afterprint',()=>{
            document.body.classList.remove('printing-absences');
            document.querySelector('#absence-print-sheet')?.remove();
          },{once:true});
          window.print();
        }catch(error){showToast(error.message,'error');}
      },
      onSave:async input=>{
        if(working||solving)return;
        working=true;
        try{
          const values=createSelectedStaffAbsences(input,state);
          // One IndexedDB transaction: either all selected teachers' absences
          // are saved or none are. Never alter the recurring weekly timetable.
          await bulkPut('staffAbsences',values);
          const date=input.fromDate;
          selectedDay=date;month=date.slice(0,7);filter='all';
          resetReview();
          await openCalendar();
          showToast(values.length+' registro(s) de ausencia guardados.');
          if(input.calculate)await calculateJoint();
        }catch(error){showToast(error.message||'No se pudo registrar la ausencia.','error');}
        finally{working=false;}
      },
      onEdit:async(id,changes)=>{
        if(working||solving)return;
        const current=state.staffAbsences.find(row=>row.id===id);
        if(!current)return;
        working=true;
        try{
          const corrected=normalizeStaffAbsence({
            ...current,...changes,status:'pending',resolvedAt:''
          },{professionals:state.professionals});
          validateAbsenceCollection(state.staffAbsences.filter(row=>row.id!==id)
            .concat(corrected),{professionals:state.professionals});
          if(!confirm('¿Guardar la corrección de la ausencia? La revisión del '+
            'borrador quedará anulada y la cobertura volverá a pendiente.'))return;
          await saveStaffAbsence(corrected);
          resetReview();
          await openCalendar();
          showToast('Ausencia corregida. Revisa otra vez la cobertura.');
        }catch(error){showToast(error.message||'No se pudo corregir.','error');}
        finally{working=false;}
      },
      onDelete:async id=>{
        if(working||solving)return;
        const old=state.staffAbsences.find(row=>row.id===id);
        if(!old||!confirm('¿Eliminar este registro de ausencia del calendario local?'))return;
        working=true;
        try{
          await deleteStaffAbsence(id);
          resetReview();
          await openCalendar();
          showToast('Ausencia eliminada del registro.');
        }catch(error){showToast(error.message||'No se pudo eliminar.','error');}
        finally{working=false;}
      }
    });
  }catch(error){
    console.error(error);
    root.innerHTML='<section class="card"><div class="empty-state">'+
      'No se ha podido cargar el calendario de ausencias. Comprueba IndexedDB.'+
      '</div></section>';
  }
}

async function calculateJoint(){
  if(solving)return;
  solving=true;
  try{
    if(dateNumber(selectedDay)===null)throw Error('Selecciona un día del calendario.');
    const state=await loadState();
    const adapter=buildGestorEscuelaConfiguration(state);
    const plan=buildJointAbsenceRequest(state,adapter,selectedDay);
    const settings=loadBackendSettings();
    if(!backendConfigured(settings))
      throw Error('Las ausencias están guardadas. Configura GestorEscuela para calcular cobertura.');
    if(!adapter.report.ready)throw Error(
      'El horario no está preparado para el cálculo: '+adapter.report.errors.slice(0,3).join(' ')
    );
    if(!plan.ready)throw Error('Las ausencias están guardadas: '+plan.errors.join(' '));
    if(!confirm('Las ausencias están guardadas localmente. ¿Sincronizar ahora la '+
      'configuración académica con GestorEscuela y crear o actualizar un BORRADOR '+
      'de sustituciones para el día '+selectedDay+'? No se aplica ninguna '+
      'propuesta ni se cambia el estado de cobertura.'))return;
    resetReview();
    jointStatus={kind:'pending',message:'Calculando las ausencias conjuntas…'};
    await openCalendar();
    await pushAcademicConfiguration(settings,toJsonCompatible(adapter.configuration));
    const plans=await listDayPlans(settings,selectedDay);
    let existing=Array.isArray(plans)?plans[0]:null;
    if(existing&&String(existing.status||'').toUpperCase()==='CONFIRMED')
      throw Error('El plan diario remoto ya está confirmado y no se puede sobrescribir.');
    if(!existing)existing=await createDayPlan(settings,{
      plan_date:selectedDay,source_hash:null,
      notes:'Borrador de sustituciones · Horario PT/AL',
      payload:{source:'horario-pt-al',kind:'absences-draft'}
    });
    result=await solveAcademicDay(settings,existing.id,{
      ...plan.request,expected_version:Number(existing.version)||undefined
    });
    assessment=assessJointAbsenceResult(plan,result);
    review={};reviewSnapshot=fingerprint(plan);
    jointStatus={kind:'ok',message:'Borrador conjunto disponible para revisar, sin aplicar.'};
    showToast('Cálculo conjunto terminado. Revisa las clases y apoyos no cubiertos.');
  }catch(error){
    console.error(error);
    assessment=null;result=null;
    jointStatus={kind:'error',message:error.message||'No se pudo calcular la cobertura.'};
    showToast(jointStatus.message,'error');
  }finally{
    solving=false;
    await openCalendar();
  }
}
