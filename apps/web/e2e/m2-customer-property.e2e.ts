/**
 * M2 E2E — Customer + Property CRUD happy path.
 *
 * Run order note: happy-path.e2e.ts runs alphabetically before this file
 * in the same Playwright invocation (single container per run-e2e.ts run).
 * happy-path already changes the seed owner's password from seedPassword!12345
 * to newStrongPassword!2026 and signs out. This test logs in with the already-
 * changed password.
 *
 * After the CustomerForm edit saves, it calls router.push('/customers') —
 * so step 6 navigates back to the list, then clicks into the detail to verify.
 *
 * PropertyStatusControl uses local React state — the combobox trigger text
 * reflects the selected value. We verify it shows "RESERVED" after selecting.
 * Radix Select triggers are <button> elements (not native <select>), so we
 * check their text content, not .toHaveValue().
 */
import { expect, test } from '@playwright/test';

// Credentials after happy-path has already changed them
const EMAIL = 'owner@atrium.test';
const PASSWORD = 'newStrongPassword!2026';

test('M2: customer + property CRUD happy path', async ({ page }) => {
  // Accept window.confirm dialogs globally for delete operations
  page.on('dialog', (dialog) => dialog.accept());

  // ------------------------------------------------------------------ //
  // 1. Sign in (password already changed by the happy-path test)        //
  // ------------------------------------------------------------------ //
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Should land on home — password change was already done in happy-path
  await expect(page).toHaveURL('/');

  // ------------------------------------------------------------------ //
  // 2. Navigate to Customers, create a new customer                     //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

  await page.getByRole('link', { name: 'New customer' }).click();
  await expect(page).toHaveURL('/customers/new');
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible();

  await page.getByLabel(/full name/i).fill('E2E Customer');
  await page.getByLabel(/^phone/i).fill('+2348012345001');
  await page.getByRole('button', { name: /^save$/i }).click();

  // ------------------------------------------------------------------ //
  // 3. Verify the new customer appears in the list                      //
  // ------------------------------------------------------------------ //
  // CustomerForm.handleFormSubmit calls router.push('/customers') on success
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('link', { name: 'E2E Customer' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 4. Click into the customer detail                                   //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'E2E Customer' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Customer' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 5. Edit the customer — change phone                                 //
  // ------------------------------------------------------------------ //
  // The detail page has an "Edit" link (not a button); click it
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(page.getByRole('heading', { name: 'Edit customer' })).toBeVisible();

  const phoneInput = page.getByLabel(/^phone/i);
  await phoneInput.clear();
  await phoneInput.fill('+2348099999999');
  await page.getByRole('button', { name: /^save$/i }).click();

  // ------------------------------------------------------------------ //
  // 6. Verify the updated phone on the detail page                      //
  // CustomerForm on edit pushes to /customers (list), not detail.       //
  // Navigate back to the customer detail to assert the phone change.    //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL('/customers');
  await page.getByRole('link', { name: 'E2E Customer' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Customer' })).toBeVisible();
  await expect(page.getByText('+2348099999999')).toBeVisible();

  // ------------------------------------------------------------------ //
  // 7. Navigate to Properties, create a new property                   //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();

  await page.getByRole('link', { name: 'New property' }).click();
  await expect(page).toHaveURL('/properties/new');
  await expect(page.getByRole('heading', { name: 'New property' })).toBeVisible();

  await page.getByLabel(/^code/i).fill('E2E-01');
  await page.getByLabel(/^title/i).fill('E2E property');
  await page.getByLabel(/address/i).fill('1 E2E Lane');
  await page.getByLabel(/city/i).fill('Lagos');
  await page.getByLabel(/total price/i).fill('5000000');
  await page.getByRole('button', { name: /^save$/i }).click();

  // ------------------------------------------------------------------ //
  // 8. Verify the new property appears in the list                      //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('link', { name: 'E2E-01' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 9. Open property detail, toggle status AVAILABLE → RESERVED         //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'E2E-01' }).click();
  await expect(page.getByRole('heading', { name: 'E2E property' })).toBeVisible();

  // PropertyStatusControl renders a Radix Select (shadcn) + a Save button.
  // The trigger is a <button role="combobox"> showing the current status.
  // Click the trigger to open the listbox, then click the RESERVED option.
  const statusTrigger = page.getByRole('combobox');
  await expect(statusTrigger).toBeVisible();
  await statusTrigger.click();
  await page.getByRole('option', { name: 'RESERVED' }).click();

  // The Save button is enabled once a different value is selected.
  // Click it to persist the change.
  const saveStatusBtn = page.getByRole('button', { name: /^save$/i });
  await expect(saveStatusBtn).toBeEnabled();
  await saveStatusBtn.click();

  // After save, the combobox trigger still shows RESERVED (local React state).
  // Radix Select triggers display selected text; use text content assertion.
  await expect(statusTrigger).toContainText('RESERVED');

  // ------------------------------------------------------------------ //
  // 10. Delete the customer (no plans — deletion should succeed)        //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page).toHaveURL('/customers');

  await page.getByRole('link', { name: 'E2E Customer' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Customer' })).toBeVisible();

  await page.getByRole('button', { name: /delete customer/i }).click();
  // window.confirm is auto-accepted by the dialog handler above

  // After deletion, CustomerDeleteButton calls router.push('/customers')
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('link', { name: 'E2E Customer' })).not.toBeVisible();

  // ------------------------------------------------------------------ //
  // 11. Delete the property                                             //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page).toHaveURL('/properties');

  await page.getByRole('link', { name: 'E2E-01' }).click();
  await expect(page.getByRole('heading', { name: 'E2E property' })).toBeVisible();

  await page.getByRole('button', { name: /delete property/i }).click();
  // window.confirm is auto-accepted by the dialog handler above

  // After deletion, PropertyDeleteButton calls router.push('/properties')
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('link', { name: 'E2E-01' })).not.toBeVisible();
});
