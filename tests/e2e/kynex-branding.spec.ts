import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test('homepage shows the Kynex brand mark in the sidebar', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });

  try {
    const page = await getStableWindow(app);
    await expect(page.getByTestId('main-layout')).toBeVisible();
    const mark = page.getByTestId('sidebar-brand-mark');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute('alt', 'Kynex');
    await expect(mark).toHaveAttribute('src', /kynex-mark/);
    await expect(page.getByText('Kynex', { exact: true })).toBeVisible();
  } finally {
    await closeElectronApp(app);
  }
});

test('legacy setup route redirects to the homepage', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });

  try {
    const page = await getStableWindow(app);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/setup');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('main-layout')).toBeVisible();
    await expect(page.getByTestId('setup-page')).toHaveCount(0);
  } finally {
    await closeElectronApp(app);
  }
});
