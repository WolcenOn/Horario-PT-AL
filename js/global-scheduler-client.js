export function generateGlobalProposalAsync(state, settings, options = {}) {
  const WorkerClass = options.WorkerClass ?? globalThis.Worker;
  const workerUrl = options.workerUrl ?? new URL('./global-scheduler-worker.js', import.meta.url);

  if (!WorkerClass) return runFallback(state, settings);

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerUrl, { type:'module', name:'global-scheduler' });
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
      if (message.type === 'error') rejectOnce(new Error(message.message || 'No se pudo calcular la propuesta global.'));
    };
    worker.onerror = event => rejectOnce(new Error(event?.message || 'El motor de cálculo en segundo plano ha fallado.'));
    worker.onmessageerror = () => rejectOnce(new Error('El navegador no pudo leer el resultado del motor de cálculo.'));

    worker.postMessage({ state, settings });
  });
}

async function runFallback(state, settings) {
  const { generateGlobalProposal } = await import('./global-scheduler.js');
  const started = now();
  const proposal = generateGlobalProposal(state, settings);
  return {
    ...proposal,
    computeMs:Math.max(0, now() - started),
    computeThread:'main-fallback'
  };
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
