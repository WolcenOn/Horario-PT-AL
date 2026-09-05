import { normalizeSchoolSettings, stageLabel, validateSchoolSettings } from './education.js';
import { escapeHtml } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

export function openRecessSettingsForm(settings, { onSave }) {
  const current = normalizeSchoolSettings(settings);
  showModal({
    title:'Configurar recreos',
    submitLabel:'Guardar recreos',
    bodyHtml:`
      <div class="recess-settings-intro">
        <strong>Franjas de recreo del centro</strong>
        <span>Se aplican de lunes a viernes. Déjalas vacías si una etapa no debe tener recreo definido.</span>
      </div>
      <div class="recess-settings-grid">
        ${stageFields('infantil', current.recesses.infantil)}
        ${stageFields('primaria', current.recesses.primaria)}
      </div>
      <div class="warning-box recess-hint">Cuando una sesión PT/AL coincida con el recreo de alguno de sus alumnos, el calendario lo mostrará como <strong>RECREO</strong> en la referencia de aula y durante el arrastre.</div>`,
    onSubmit: async (data, form, message) => {
      try {
        const value = validateSchoolSettings({
          id:'school',
          recesses:{
            infantil:{ inicio:data.get('infantilInicio') || '', fin:data.get('infantilFin') || '' },
            primaria:{ inicio:data.get('primariaInicio') || '', fin:data.get('primariaFin') || '' }
          }
        });
        await onSave(value);
        return true;
      } catch (error) {
        setModalMessage(message, escapeHtml(error.message || 'Revisa las franjas de recreo.'));
        return false;
      }
    }
  });
}

function stageFields(stage, recess) {
  const label = stageLabel(stage);
  return `<fieldset class="recess-stage-card">
    <legend>${label}</legend>
    <div class="duration-pair">
      <div class="form-field"><label for="${stage}Inicio">Inicio</label><input id="${stage}Inicio" name="${stage}Inicio" type="time" value="${escapeHtml(recess.inicio || '')}"></div>
      <div class="form-field"><label for="${stage}Fin">Fin</label><input id="${stage}Fin" name="${stage}Fin" type="time" value="${escapeHtml(recess.fin || '')}"></div>
    </div>
  </fieldset>`;
}
