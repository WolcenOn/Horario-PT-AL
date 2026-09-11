import test from 'node:test';
import assert from 'node:assert/strict';

import { generateAutomaticProposalAsync } from '../js/automation-scheduler-client.js';

test('delega el cálculo PT/AL en un worker y termina el worker al recibir el resultado', async () => {
  const calls = [];
  class FakeWorker {
    constructor(url, options) {
      calls.push({ kind:'construct', url:String(url), options });
    }
    postMessage(payload) {
      calls.push({ kind:'post', payload });
      queueMicrotask(() => this.onmessage?.({
        data:{ type:'result', proposal:{ ok:true, moved:[{ id:'session-1' }] }, computeMs:87 }
      }));
    }
    terminate() {
      calls.push({ kind:'terminate' });
    }
  }

  const state = { students:[], sessions:[] };
  const settings = { id:'automation', courseRules:{} };
  const proposal = await generateAutomaticProposalAsync(state, settings, {
    WorkerClass:FakeWorker,
    workerUrl:'automation-worker-test.js'
  });

  assert.equal(calls[0].kind, 'construct');
  assert.equal(calls[0].url, 'automation-worker-test.js');
  assert.deepEqual(calls[0].options, { type:'module', name:'automation-scheduler' });
  assert.deepEqual(calls[1], { kind:'post', payload:{ state, settings } });
  assert.equal(calls.at(-1).kind, 'terminate');
  assert.equal(proposal.ok, true);
  assert.equal(proposal.computeMs, 87);
  assert.equal(proposal.computeThread, 'worker');
});

test('propaga un error del worker PT/AL sin dejarlo activo', async () => {
  let terminated = false;
  class FailingWorker {
    postMessage() {
      queueMicrotask(() => this.onmessage?.({ data:{ type:'error', message:'fallo PT/AL controlado' } }));
    }
    terminate() {
      terminated = true;
    }
  }

  await assert.rejects(
    generateAutomaticProposalAsync({}, {}, { WorkerClass:FailingWorker, workerUrl:'automation-worker-test.js' }),
    /fallo PT\/AL controlado/
  );
  assert.equal(terminated, true);
});
