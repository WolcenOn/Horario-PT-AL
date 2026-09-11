export function generateAutomaticProposalAsync(state, settings, options = {}) {
  const WorkerClass = options.WorkerClass ?? globalThis.Worker;
  const workerUrl = options.workerUrl ?? new URL('./automation-scheduler-worker.js', import.meta.url);

  if (!WorkerClass) return runFallback(state, settings);

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerUrl, { type:'module', name:'automation-scheduler' });
    let settled = false;

    const finish = callback => value => {
      if (settled) return;
      settled = true;
      worker.terminate?.();
      callback(value);
    };

    const resolveOnce = finish(resolve);
    const rejectOnce = finish(reject);

    worker.onmessage = event => {
      const message = event.data || {};
      if (message.type === 'result') {
        resolveOnce({
          ...message.proposal,
          computeMs:Number(message.computeMs) || 0,
          computeThread:'worker'
        });
        return;
      }
      if (message.type === 'error') rejectOnce(new Error(message.message || 'No se pudo calcular la propuesta PT/AL.'));
    };
    worker.onerror = event => rejectOnce(new Error(event?.message || 'El motor PT/AL en segundo plano ha fallado.'));
    worker.onmessageerror = () => rejectOnce(new Error('El navegador no pudo leer el resultado del motor PT/AL.'));

    worker.postMessage({ state, settings });
  });
}

async function runFallback(state, settings) {
  const { generateAutomaticProposal } = await import('./automation-core.js');
  const started = now();
  const proposal = generateAutomaticProposal(state, settings);
  return {
    ...proposal,
    computeMs:Math.max(0, now() - started),
    computeThread:'main-fallback'
  };
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
