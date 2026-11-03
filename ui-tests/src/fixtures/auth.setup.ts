import { expect, test as setup } from '@playwright/test';
import { captureResponse } from '@src/api/capture';
import { STORAGE_STATE, credentials } from '@src/config/env';
import { LoginPage } from '@src/pages/LoginPage';

setup('log in to the demo account', async ({ page }) => {
  const { username, password } = credentials();
  const login = new LoginPage(page);

  await login.open();
  const response = await captureResponse(page, 'login', () => login.login(username, password));

  expect(response.status(), 'login request').toBe(200);
  await expect(page).toHaveURL(/\/web\/trade/);
  await expect(page.getByTestId('account-type-tag')).toHaveText(/demo/i);

  await page.context().storageState({ path: STORAGE_STATE });
});
