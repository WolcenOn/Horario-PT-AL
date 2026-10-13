import {bulkPut} from './db.js';
import {deleteStaffAbsence,loadState,saveStaffAbsence} from './repository.js';
import {
  changeAbsenceCoverage,createStaffAbsences,monthShift
} from './staff-absences.js';
import {renderStaffAbsences} from './staff-absences-view.js';
import {showToast} from './ui.js';
import {applyViewShell} from './view-shell.js';

const root=document.querySelector('#viewRoot');
let month='';
let filter='all';
let selectedDay='';
let working=false;
const localMonth=()=>{
  const now=new Date();
  return String(now.getFullYear()).padStart(4,'0')+'-'+
    String(now.getMonth()+1).padStart(2,'0');
};

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-view="staffAbsences"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!month)month=localMonth();
  void openCalendar();
},true);

async function openCalendar(){
  try{
    const state=await loadState();
    applyViewShell({view:'staffAbsences',title:'Calendario de ausencias'});
    renderStaffAbsences(root,{
      state,month,filter,selectedDay,
      onMonth:delta=>{
        try{month=monthShift(month,delta);selectedDay='';void openCalendar();}
        catch(error){showToast(error.message,'error');}
      },
      onFilter:value=>{
        filter=['all','pending','resolved'].includes(value)?value:'all';
        void openCalendar();
      },
      onDay:date=>{selectedDay=date;void openCalendar();},
      onSave:async input=>{
        if(working)return;
        working=true;
        try{
          const values=createStaffAbsences(input,state.staffAbsences,state.professionals);
          await bulkPut('staffAbsences',values);
          month=values[0].fromDate.slice(0,7);
          selectedDay='';
          filter='all';
          await openCalendar();
          showToast(values.length+' ausencia(s) registradas, pendientes de cobertura.');
        }catch(error){showToast(error.message||'No se pudo registrar la ausencia.','error');}
        finally{working=false;}
      },
      onStatus:async(id,status)=>{
        if(working)return;
        const old=state.staffAbsences.find(row=>row.id===id);
        if(!old)return;
        if(status==='resolved'&&!confirm(
          '¿Has comprobado personalmente que la cobertura de esta ausencia está resuelta? '+
          'El motor no la ha verificado. El cambio solo actualiza el registro local.'
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
        if(working)return;
        const old=state.staffAbsences.find(row=>row.id===id);
        if(!old||!confirm('¿Eliminar este registro de ausencia del calendario local?'))return;
        working=true;
        try{
          await deleteStaffAbsence(id);
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
