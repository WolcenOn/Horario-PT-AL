// One calendar-first workflow for one or many simultaneous staff absences.
import {bulkPut} from './db.js';
import {deleteStaffAbsence,loadState,saveStaffAbsence} from './repository.js';
import {changeAbsenceCoverage,dateNumber,monthShift} from './staff-absences.js';
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

const root=document.querySelector('#viewRoot');
let month='',filter='all',selectedDay='',working=false,solving=false;
let assessment=null,result=null,jointStatus=null;
const today=()=>{
  const d=new Date();
  return [String(d.getFullYear()).padStart(4,'0'),
    String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')]
    .join('-');
};
function openDay(date){
  if(dateNumber(date)===null)return;
  selectedDay=date;month=date.slice(0,7);filter='all';
  assessment=null;result=null;jointStatus=null;
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
    applyViewShell({view:'staffAbsences',title:'Calendario y cobertura de ausencias'});
    renderStaffAbsences(root,{
      state,month,filter,selectedDay,
      joint:{
        plan:jointPlan,adapter,assessment,result,status:jointStatus,
        connected:backendConfigured(settings),adapterReady:adapter.report.ready
      },
      onMonth:delta=>{
        try{month=monthShift(month,delta);selectedDay='';assessment=null;
          result=null;jointStatus=null;void openCalendar();}
        catch(error){showToast(error.message,'error');}
      },
      onFilter:value=>{
        filter=['all','pending','resolved'].includes(value)?value:'all';
        void openCalendar();
      },
      onDay:date=>{
        if(!date){selectedDay='';assessment=null;result=null;jointStatus=null;void openCalendar();}
        else openDay(date);
      },
      onJoint:date=>{
        if(!selectedDay||selectedDay!==date)openDay(date);
      },
      onCalculate:()=>calculateJoint(),
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
          assessment=null;result=null;jointStatus=null;
          await openCalendar();
          showToast(values.length+' registro(s) de ausencia guardados.');
          if(input.calculate)await calculateJoint();
        }catch(error){showToast(error.message||'No se pudo registrar la ausencia.','error');}
        finally{working=false;}
      },
      onStatus:async(id,status)=>{
        if(working||solving)return;
        const old=state.staffAbsences.find(row=>row.id===id);
        if(!old)return;
        if(status==='resolved'&&!confirm(
          '¿Has comprobado personalmente que la cobertura de esta ausencia está resuelta? '+
          'El motor no la ha verificado. Solo se actualiza el registro local.'
        ))return;
        if(status==='pending'&&!confirm('¿Volver a dejar pendiente esta ausencia?'))return;
        working=true;
        try{
          await saveStaffAbsence(changeAbsenceCoverage(old,status));
          await openCalendar();
          showToast(status==='resolved'?'Cobertura declarada resuelta manualmente.':
            'Ausencia reabierta, pendiente de cobertura.');
        }catch(error){showToast(error.message||'No se pudo actualizar.','error');}
        finally{working=false;}
      },
      onDelete:async id=>{
        if(working||solving)return;
        const old=state.staffAbsences.find(row=>row.id===id);
        if(!old||!confirm('¿Eliminar este registro de ausencia del calendario local?'))return;
        working=true;
        try{
          await deleteStaffAbsence(id);
          assessment=null;result=null;jointStatus=null;
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
    assessment=null;result=null;
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
