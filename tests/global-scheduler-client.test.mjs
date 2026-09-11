import test from 'node:test';
import assert from 'node:assert/strict';

import { generateGlobalProposalAsync } from '../js/global-scheduler-client.js';

test('delega el cálculo global en un worker y termina el worker al recibir el resultado', async () => {
  const calls = [];
  class FakeWorker {
    constructor(url, options) {
      calls.push({ kind:'construct', url:String(url), options });
      FakeWorker.instance = this;
    }
    postMessage(payload) {
      calls.push({ kind:'post', payload });
      queueMicrotask(() => this.onmessage?.({
        data:{ type:'result', proposal:{ ok:true, stats:{ classes:2, blocks:7 } }, computeMs:321 }
      }));
    }
    terminate() {
      calls.push({ kind:'terminate' });
    }
  }

  const state = { students:[], classSchedules:[] };
  const settings = { mode:'global' };
  const proposal = await generateGlobalProposalAsync(state, settings, {
    WorkerClass:FakeWorker,
    workerUrl:'worker-test.js'
  });

  assert.equal(calls[0].kind, 'construct');
  assert.equal(calls[0].url, 'worker-test.js');
  assert.deepEqual(calls[0].options, { type:'module', name:'global-scheduler' });
  assert.deepEqual(calls[1], { kind:'post', payload:{ state, settings } });
  assert.equal(calls.at(-1).kind, 'terminate');
  assert.equal(proposal.ok, true);
  assert.equal(proposal.computeMs, 321);
  assert.equal(proposal.computeThread, 'worker');
});

test('propaga un error del worker sin dejarlo activo', async () => {
  let terminated = false;
  class FailingWorker {
    postMessage() {
      queueMicrotask(() => this.onmessage?.({ data:{ type:'error', message:'fallo controlado' } }));
    }
    terminate() {
      terminated = true;
    }
  }

  await assert.rejects(
    generateGlobalProposalAsync({}, {}, { WorkerClass:FailingWorker, workerUrl:'worker-test.js' }),
    /fallo controlado/
  );
  assert.equal(terminated, true);
});
