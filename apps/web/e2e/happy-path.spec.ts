import { expect, test } from '@playwright/test';

test('seed owner logs in, is forced to change password, lands on home', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/email/i).fill('owner@atrium.test');
  await page.getByLabel(/password/i).fill('seedPassword!12345');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/onboarding\/change-password$/);
  await expect(page.getByRole('heading', { name: /set a new password/i })).toBeVisible();

  await page.getByLabel(/current password/i).fill('seedPassword!12345');
  await page.getByLabel(/^new password/i).fill('newStrongPassword!2026');
  await page.getByLabel(/confirm new password/i).fill('newStrongPassword!2026');
  await page.getByRole('button', { name: /update password/i }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /welcome to solutio/i })).toBeVisible();
  await expect(page.getByRole('main').getByText('owner@atrium.test')).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});
