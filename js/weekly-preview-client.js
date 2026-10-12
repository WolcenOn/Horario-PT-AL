// Non-destructive preview orchestration, including a safe fallback when
// *optional* automatically formed groups make an otherwise valid plan fail.
import { buildWeeklyPreviewRequest } from './weekly-preview-adapter.js';

export async function requestWeeklyPreviewWithFallback(state, backend, sendPreview) {
  let {payload,warnings,autoGroups}=buildWeeklyPreviewRequest(state);
  let result=await sendPreview(backend,payload);
  if (result?.preview_only!==true) throw new Error(
    'GestorEscuela no ha confirmado que el resultado sea una vista previa; no se aplicará.'
  );
  let groupingFallback=false;
  if(result.status==='infeasible'&&autoGroups>0) {
    const alternative=buildWeeklyPreviewRequest(
      state,state.centerPlanningSettings,{autoFormGroups:false}
    );
    const fallback=await sendPreview(backend,alternative.payload);
    if (fallback?.preview_only!==true) throw new Error(
      'La alternativa individual no está identificada como vista previa.'
    );
    warnings=[
      ...alternative.warnings,
      'Las agrupaciones propuestas no encajaron; se ha vuelto a calcular con sesiones individuales. El resultado mostrado corresponde a esta alternativa.'
    ];
    payload=alternative.payload;
    result=fallback;
    groupingFallback=true;
  }
  return {payload,result,warnings,groupingFallback};
}
