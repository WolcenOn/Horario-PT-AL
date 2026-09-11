import { test, expect } from '@playwright/test';

test('los motores global y PT/AL calculan en Web Workers reales del navegador', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  const result = await page.evaluate(async () => {
    const [{ generateGlobalProposalAsync }, { generateAutomaticProposalAsync }] = await Promise.all([
      import('./js/global-scheduler-client.js'),
      import('./js/automation-scheduler-client.js')
    ]);

    const emptyState = {
      students:[],
      professionals:[],
      groups:[],
      sessions:[],
      classSchedules:[],
      schoolSettings:null,
      automationSettings:{ id:'automation', courseRules:{} },
      centerPlanningSettings:{ id:'centerPlanning', mode:'ptal' }
    };

    const [globalProposal, automaticProposal] = await Promise.all([
      generateGlobalProposalAsync(emptyState, emptyState.centerPlanningSettings),
      generateAutomaticProposalAsync(emptyState, emptyState.automationSettings)
    ]);

    return {
      globalThread:globalProposal.computeThread,
      automaticThread:automaticProposal.computeThread,
      globalComputeMs:globalProposal.computeMs,
      automaticComputeMs:automaticProposal.computeMs
    };
  });

  expect(result.globalThread).toBe('worker');
  expect(result.automaticThread).toBe('worker');
  expect(result.globalComputeMs).toBeGreaterThanOrEqual(0);
  expect(result.automaticComputeMs).toBeGreaterThanOrEqual(0);
});
