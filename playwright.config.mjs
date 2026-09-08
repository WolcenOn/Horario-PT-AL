import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  expect:{ timeout:5_000 },
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI ? 1 : 0,
  reporter:process.env.CI ? [['line'], ['html', { open:'never' }]] : 'list',
  use:{
    baseURL:'http://127.0.0.1:8080',
    trace:'on-first-retry',
    screenshot:'only-on-failure'
  },
  webServer:{
    command:'npm run start',
    url:'http://127.0.0.1:8080',
    reuseExistingServer:!process.env.CI,
    timeout:20_000
  },
  projects:[
    {
      name:'desktop-chromium',
      use:{ ...devices['Desktop Chrome'], viewport:{ width:1440, height:900 } }
    },
    {
      name:'compact-desktop-chromium',
      use:{ ...devices['Desktop Chrome'], viewport:{ width:1024, height:768 } }
    }
  ]
});
