export function showModal({ title, bodyHtml, submitLabel = 'Guardar', onSubmit, onOpen }) {
  const root = document.querySelector('#modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal-header">
          <h2 id="modalTitle">${title}</h2>
          <button class="icon-button" type="button" data-close-modal aria-label="Cerrar">✕</button>
        </header>
        <form id="modalForm" novalidate>
          <div class="modal-body"><div id="modalMessage"></div>${bodyHtml}</div>
          <footer class="modal-footer">
            <button class="button" type="button" data-close-modal>Cancelar</button>
            <button class="button button-primary" type="submit">${submitLabel}</button>
          </footer>
        </form>
      </section>
    </div>`;

  const form = root.querySelector('#modalForm');
  const close = () => { root.innerHTML = ''; };
  root.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', close));
  root.querySelector('[data-modal-backdrop]').addEventListener('click', event => {
    if (event.target.matches('[data-modal-backdrop]')) close();
  });
  document.addEventListener('keydown', function escHandler(event) {
    if (event.key === 'Escape' && root.innerHTML) {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = root.querySelector('#modalMessage');
    message.innerHTML = '';
    try {
      const shouldClose = await onSubmit(new FormData(form), form, message);
      if (shouldClose !== false) close();
    } catch (error) {
      message.innerHTML = `<div class="form-error">${escapeForUi(error.message || 'No se pudo guardar.')}</div>`;
    }
  });
  onOpen?.(form);
  setTimeout(() => root.querySelector('input, select, textarea, button')?.focus(), 0);
}

export function showToast(message, type = 'success') {
  const root = document.querySelector('#toastRoot');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

export function setModalMessage(container, html, kind = 'error') {
  container.innerHTML = `<div class="${kind === 'warning' ? 'warning-box' : 'form-error'}">${html}</div>`;
}

function escapeForUi(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
}
