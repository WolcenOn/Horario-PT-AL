import { generateAutomaticProposal } from './automation-core.js';

self.onmessage = event => {
  const { state, settings } = event.data || {};
  const started = performance.now();
  try {
    const proposal = generateAutomaticProposal(state, settings);
    self.postMessage({
      type:'result',
      proposal,
      computeMs:Math.max(0, performance.now() - started)
    });
  } catch (error) {
    self.postMessage({
      type:'error',
      message:error?.message || 'No se pudo calcular la propuesta PT/AL.'
    });
  }
};
