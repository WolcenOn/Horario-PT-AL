import { buildAiCenterConfigurationPrompt } from './ai-config-prompt.js';
import { loadState } from './repository.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');

const observer = new MutationObserver(() => injectAiConfigurationCard());
observer.observe(viewRoot, { childList:true, subtree:true });
injectAiConfigurationCard();

document.addEventListener('click', event => {
  const generateButton = event.target.closest?.('[data-generate-ai-config-prompt]');
  if (generateButton) {
    event.preventDefault();
    void generatePrompt(generateButton);
    return;
  }

  const copyButton = event.target.closest?.('[data-copy-ai-config-prompt]');
  if (copyButton) {
    event.preventDefault();
    void copyPrompt(copyButton);
  }
});

function injectAiConfigurationCard() {
  const wizard = viewRoot.querySelector('.setup-wizard-view');
  if (!wizard || wizard.querySelector('[data-ai-config-assist]')) return;

  const section = document.createElement('section');
  section.className = 'card ai-config-assist-card';
  section.dataset.aiConfigAssist = 'true';
  section.innerHTML = `
    <div class="ai-config-assist-copy">
      <p class="eyebrow">Experimental</p>
      <h2>Preparar configuración con IA</h2>
      <p>Genera un prompt con la estructura, currículo, profesorado, disponibilidades y apoyos ya configurados. <strong>No se envía nada automáticamente a ningún proveedor de IA.</strong></p>
      <p class="muted">El prompt elimina nombres y correos de alumnado y profesorado, usa alias locales y pide una propuesta estructurada que después podrá validarse antes de aplicar cambios.</p>
    </div>
    <div class="button-row ai-config-assist-actions">
      <button class="button button-primary" type="button" data-generate-ai-config-prompt>✨ Generar prompt para IA</button>
    </div>
    <div class="ai-config-prompt-result hidden" data-ai-config-prompt-result>
      <div class="ai-config-prompt-heading">
        <div><strong>Prompt preparado</strong><small>Cópialo en la IA que prefieras. La respuesta todavía no se aplica automáticamente.</small></div>
        <button class="button button-small" type="button" data-copy-ai-config-prompt>Copiar prompt</button>
      </div>
      <textarea class="ai-config-prompt-output" data-ai-config-prompt-output readonly aria-label="Prompt para configurar el centro con IA"></textarea>
    </div>`;
  wizard.append(section);
}

async function generatePrompt(button) {
  button.disabled = true;
  try {
    const state = await loadState();
    const prompt = buildAiCenterConfigurationPrompt(state);
    const section = button.closest('[data-ai-config-assist]');
    const result = section?.querySelector('[data-ai-config-prompt-result]');
    const textarea = section?.querySelector('[data-ai-config-prompt-output]');
    if (!result || !textarea) return;
    textarea.value = prompt;
    result.classList.remove('hidden');
    textarea.focus();
    textarea.setSelectionRange(0, 0);
  } catch (error) {
    showToast(error.message || 'No se pudo preparar el prompt para IA.', 'error');
  } finally {
    button.disabled = false;
  }
}

async function copyPrompt(button) {
  const textarea = button.closest('[data-ai-config-assist]')?.querySelector('[data-ai-config-prompt-output]');
  const prompt = textarea?.value || '';
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    showToast('Prompt copiado.');
  } catch {
    textarea.focus();
    textarea.select();
    showToast('Selecciona y copia el prompt manualmente.');
  }
}
