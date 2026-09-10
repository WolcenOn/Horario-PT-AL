const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

export function applyViewShell({
  view,
  title,
  showSummary = false,
  showServiceFilter = false,
  showPrimaryAction = false,
  showPrintActions = false
}) {
  if (pageTitle && title) pageTitle.textContent = title;
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  summaryStrip?.classList.toggle('hidden', !showSummary);
  serviceFilter?.classList.toggle('hidden', !showServiceFilter);
  primaryAction?.classList.toggle('hidden', !showPrimaryAction);
  printActions?.classList.toggle('hidden', !showPrintActions);
}
