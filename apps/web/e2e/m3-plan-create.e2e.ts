/**
 * M3 E2E — Plan create + cancel happy path.
 *
 * Run order: happy-path → m2 → m3. M2 cleans up its own customer/property,
 * so M3 creates its own fixtures from scratch.
 */
import { expect, test } from '@playwright/test';

const EMAIL = 'owner@atrium.test';
const PASSWORD = 'newStrongPassword!2026';

test('M3: create DRAFT plan with materialized installments, then cancel', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // Create a customer for the plan.
  await page.getByRole('link', { name: 'Customers' }).click();
  await page.getByRole('link', { name: 'New customer' }).click();
  await page.getByLabel(/full name/i).fill('M3 Customer');
  await page.getByLabel(/^phone/i).fill('+2348012345003');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('link', { name: 'M3 Customer' })).toBeVisible();

  // Create an AVAILABLE property.
  await page.getByRole('link', { name: 'Properties' }).click();
  await page.getByRole('link', { name: 'New property' }).click();
  await page.getByLabel(/^code/i).fill('M3-01');
  await page.getByLabel(/^title/i).fill('M3 property');
  await page.getByLabel(/address/i).fill('1 M3 Lane');
  await page.getByLabel(/city/i).fill('Lagos');
  await page.getByLabel(/total price/i).fill('5000000');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('link', { name: 'M3-01' })).toBeVisible();

  // Create the plan.
  await page.getByRole('link', { name: 'Plans' }).click();
  await expect(page).toHaveURL('/plans');
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL('/plans/new');

  // Customer combobox defaults to "Existing" mode; pick our newly-created one.
  await page.getByLabel(/pick customer/i).selectOption({ label: /M3 Customer/ });
  // Property combobox: pick the M3-01 entry.
  await page.getByLabel(/pick available property/i).selectOption({ label: /M3-01/ });

  await page.getByLabel(/total price \(ngn\)/i).fill('5,000,000');
  await page.getByLabel(/deposit \(ngn\)/i).fill('500,000');
  await page.getByLabel(/monthly \(ngn\)/i).fill('200,000');
  await page.getByLabel(/term \(months\)/i).fill('24');

  await page.getByRole('button', { name: /create plan/i }).click();

  // Land on plan detail; status should be DRAFT.
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+/);
  await expect(page.getByText('DRAFT')).toBeVisible();
  await expect(page.getByText('M3 Customer · M3-01')).toBeVisible();

  // Installments tab: 25 rows (seq 0..24). Sequence 0 amount = ₦500,000.
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText('₦500,000');

  // Plan appears in /plans filtered by DRAFT.
  await page.getByRole('link', { name: 'Plans' }).first().click();
  await expect(page).toHaveURL(/\/plans/);
  await page.getByLabel(/status/i).selectOption('DRAFT');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(page.getByRole('link', { name: 'M3 Customer' })).toBeVisible();

  // Cancel the plan from the detail page.
  await page.getByRole('link', { name: 'M3 Customer' }).click();
  await page.getByRole('button', { name: /cancel plan/i }).click();
  await expect(page.getByText('CANCELLED')).toBeVisible();
  // Cancel button disappears for non-DRAFT plans.
  await expect(page.getByRole('button', { name: /cancel plan/i })).toHaveCount(0);
});
