/**
 * M4 + M5 E2E — Payment recording + deposit-on-create flow (M4) and payment
 * reversal (M5).
 *
 * Run order: happy-path → m2 → m3 → m4-m5. Each later test creates its own
 * customer/property so there is no fixture coupling between files.
 *
 * M4 section (single test):
 *   1. Plan creation with the new "Deposit received today" toggle ON.
 *      → Plan is ACTIVE (not DRAFT) on landing; deposit Payment row exists;
 *        property flips to SOLD; first installment (seq 0) is PAID.
 *   2. Auto-mode (FIFO) ad-hoc payment for ₦187,500 → seq 1 PAID.
 *   3. Manual-override ad-hoc payment for ₦475,000 — verifies the FIFO
 *      pre-fill shows {seq 2: 187,500, seq 3: 187,500, seq 4: 100,000} and
 *      the Unallocated strip reads ₦0 before submit → seq 2 PAID, seq 3 PAID,
 *      seq 4 PARTIAL (₦100,000 paid).
 *   4. Overpay attempt (₦99,999,999) is rejected — no redirect, error
 *      surfaced.
 *
 * Step 14 from the spec (final closing payment → COMPLETED) is deliberately
 * skipped — already covered by the M4 service integration tests
 * (apps/web/server-actions/__tests__/... + packages/db/__tests__/...).
 * Re-running it through the UI for ~24 more form submissions would balloon
 * the e2e runtime for the same assertion.
 *
 * M5 section (three tests):
 *   5. OWNER reverses a payment, plan COMPLETED → ACTIVE.
 *      Uses a fresh M5-specific plan (₦210,000 total, ₦100,000 deposit +
 *      6-month term at ₦20,000 monthly with a ₦10,000 final row). The
 *      deposit toggle is ON so the plan starts ACTIVE. One ₦110,000 payment
 *      FIFO-allocates 5×₦20k + ₦10k, closing every installment → plan
 *      COMPLETED. Reverse that payment → plan ACTIVE.
 *   6. STAFF cannot see the Reverse button.
 *      Same plan detail, logged in as staff@atrium.test (seeded with role STAFF).
 *   7. Cannot reverse twice.
 *      As OWNER: the already-reversed row shows "Reversed" badge; the reversal
 *      row shows "Reversal" badge — neither has a reverse-payment button.
 *
 * Console assertion: we fail each test if any console.error fires during the
 * run. Next.js dev mode is chatty but should not log errors on the paths
 * this test exercises.
 */
import { expect, test } from '@playwright/test';

const OWNER_EMAIL = 'owner@atrium.test';
const OWNER_PASSWORD = 'newStrongPassword!2026';
const STAFF_EMAIL = 'staff@atrium.test';
const STAFF_PASSWORD = 'staffPassword!2026';

// ─────────────────────────────────────────────────────────────────────────── //
// M4: deposit-on-create + ad-hoc payments (auto / manual / overpay)          //
// ─────────────────────────────────────────────────────────────────────────── //

test('M4: deposit-on-create + ad-hoc payments (auto/manual/overpay)', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  // Console.error accumulator — fail at end if anything fired.
  // Filter out "Failed to load resource" 404s for static assets (favicons,
  // source maps, RSC payloads on navigations the browser pre-fetches) which
  // are dev-mode noise unrelated to application errors.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // 1. Sign in                                                          //
  // ------------------------------------------------------------------ //
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(OWNER_EMAIL);
  await page.getByLabel(/password/i).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // ------------------------------------------------------------------ //
  // 2. Create the M4 customer                                           //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('link', { name: 'New customer' }).click();
  await page.getByLabel(/full name/i).fill('M4 Customer');
  await page.getByLabel(/^phone/i).fill('+2348012345004');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('link', { name: 'M4 Customer' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 3. Create an AVAILABLE property                                     //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await page.getByRole('link', { name: 'New property' }).click();
  await page.getByLabel(/^code/i).fill('M4-01');
  await page.getByLabel(/^title/i).fill('M4 property');
  await page.getByLabel(/address/i).fill('1 M4 Lane');
  await page.getByLabel(/city/i).fill('Lagos');
  await page.getByLabel(/total price/i).fill('5000000');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('link', { name: 'M4-01' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 4. Create the plan with the deposit toggle ON                       //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Plans', exact: true }).click();
  await expect(page).toHaveURL('/plans');
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL('/plans/new');

  // Step 1 — pick the M4 customer. Type to filter so we never depend on
  // listbox order when prior tests leave their own customers behind.
  const buyerSearch = page.getByLabel(/search buyers/i);
  await buyerSearch.click();
  await buyerSearch.fill('M4 Customer');
  await page.getByRole('option', { name: /m4 customer/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  // Step 2 — pick the property.
  await expect(page.getByRole('heading', { name: /which property/i })).toBeVisible();
  await page.getByRole('option', { name: /m4-01/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  // Step 3 — payment terms + flip the deposit toggle ON.
  // 5M − 500k = 4.5M = 24 × 187,500 exactly. Clean schedule, every monthly
  // row equal, satisfies the wizard's finalRow > 0n && <= 2×monthly guard.
  await expect(page.getByRole('heading', { name: /payment terms/i })).toBeVisible();
  await page.getByLabel(/down payment today/i).fill('500,000');
  await page.getByLabel(/monthly amount/i).fill('187,500');
  await page.getByLabel(/term \(months/i).fill('24');

  // Toggle "Deposit received today" — this is the Task 9 addition.
  const depositToggle = page.getByLabel(/deposit received today/i);
  await depositToggle.check();
  await expect(depositToggle).toBeChecked();

  // Deposit panel reveals — Method defaults to CASH, leave date empty
  // (server defaults to startDate), skip reference/notes. The helper text
  // under the deposit-date input only renders once the panel is open.
  await expect(
    page.getByText(/defaults to the plan start date if you leave this empty/i),
  ).toBeVisible();

  await page.getByRole('button', { name: /preview schedule/i }).click();

  // Step 4 — review then confirm sale.
  await expect(
    page.getByRole('heading', { name: /show the buyer their schedule/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: /confirm sale/i }).click();

  // ------------------------------------------------------------------ //
  // 5. Land on plan detail; status must be ACTIVE (not DRAFT)           //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+/);
  const planUrl = page.url();
  const planIdMatch = planUrl.match(/\/plans\/([0-9a-f-]+)/);
  expect(planIdMatch).not.toBeNull();
  const planId = planIdMatch![1];

  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
  await expect(page.getByText('M4 Customer · M4-01')).toBeVisible();

  // ------------------------------------------------------------------ //
  // 6. Payments tab: exactly 1 row, ₦500,000                            //
  // ------------------------------------------------------------------ //
  await page.getByRole('tab', { name: 'Payments' }).click();
  // Wait for the payments table to render. Header "Paid date" is on the
  // payments-list table, not the installments one.
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const paymentRows = page.getByRole('tabpanel').filter({ hasText: 'Paid date' }).locator('tbody tr');
  await expect(paymentRows).toHaveCount(1);
  await expect(paymentRows.first()).toContainText('₦500,000');

  // Installments tab: seq 0 row shows PAID.
  await page.getByRole('tab', { name: 'Installments' }).click();
  await expect(page.getByRole('columnheader', { name: /amount due/i })).toBeVisible();
  const installmentRows = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Amount due' })
    .locator('tbody tr');
  await expect(installmentRows).toHaveCount(25);
  // Sequence 0 = first row → ₦500,000 paid, PAID badge.
  await expect(installmentRows.nth(0)).toContainText('PAID');
  await expect(installmentRows.nth(0)).toContainText('₦500,000');

  // ------------------------------------------------------------------ //
  // 7. Property is SOLD                                                 //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await expect(page).toHaveURL(/\/properties/);
  const m4PropertyRow = page.locator('table tbody tr', { hasText: 'M4-01' });
  await expect(m4PropertyRow).toHaveCount(1);
  await expect(m4PropertyRow).toContainText('SOLD');

  // ------------------------------------------------------------------ //
  // 8. Back to plan; click Record payment                               //
  // ------------------------------------------------------------------ //
  await page.goto(`/plans/${planId}`);
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  // The plan-detail header renders a <Link><Button>Record payment</Button></Link>.
  // The link role wins for navigation.
  await page.getByRole('link', { name: /record payment/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}/payments/new$`));

  // ------------------------------------------------------------------ //
  // 9. Auto-mode payment: ₦187,500 (exact next-installment amount), CASH default //
  // ------------------------------------------------------------------ //
  // Use the id directly — the label text "Amount *" plus per-row
  // aria-labels ("Allocation for installment N") would otherwise need
  // a tricky regex to disambiguate.
  await page.locator('#amountNgn').fill('187,500');
  // Method defaults to CASH; the auto radio is the default. Submit.
  await page.getByRole('button', { name: /^record payment$/i }).click();

  // Lands back on plan detail.
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}$`));
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  // Payments tab: 2 rows.
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const paymentRowsAfterAuto = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  await expect(paymentRowsAfterAuto).toHaveCount(2);

  // Installments tab: seq 1 PAID, seq 2 PENDING.
  await page.getByRole('tab', { name: 'Installments' }).click();
  await expect(page.getByRole('columnheader', { name: /amount due/i })).toBeVisible();
  const installmentsAfterAuto = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Amount due' })
    .locator('tbody tr');
  await expect(installmentsAfterAuto.nth(1)).toContainText('PAID');
  await expect(installmentsAfterAuto.nth(2)).toContainText('PENDING');

  // ------------------------------------------------------------------ //
  // 10. Manual-override payment: ₦475,000 → seq 2 (187,500) + seq 3 (187,500) //
  //     + seq 4 (100,000). Verify FIFO pre-fill before submitting.      //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: /record payment/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}/payments/new$`));

  await page.locator('#amountNgn').fill('475,000');

  // Switch to Manual mode. The visible <input type="radio"> is sr-only but
  // the wrapper <label> carries the "Manual override" text.
  await page.getByText(/manual override/i).click();

  // The manual-balance strip appears with Unallocated: ₦0 because the
  // FIFO pre-fill exactly covers the amount (187,500 + 187,500 + 100,000 = 475,000).
  const balanceStrip = page.getByTestId('manual-balance-strip');
  await expect(balanceStrip).toBeVisible();
  await expect(balanceStrip).toContainText(/unallocated:\s*₦0/i);
  await expect(balanceStrip).toContainText(/allocated:\s*₦475,000/i);

  // Sanity-check the per-row pre-fill. After payments #1 (deposit, seq 0)
  // and #2 (auto, seq 1), the non-paid installments shown in the manual
  // editor are seq 2..24, so row 0 = seq 2, row 1 = seq 3, row 2 = seq 4.
  // The pre-filled amount lives in the row's <input> (use toHaveValue, not
  // toContainText — input values do not surface as text content).
  await expect(
    page.getByTestId('allocation-row-0').getByRole('textbox'),
  ).toHaveValue('187,500');
  await expect(
    page.getByTestId('allocation-row-1').getByRole('textbox'),
  ).toHaveValue('187,500');
  await expect(
    page.getByTestId('allocation-row-2').getByRole('textbox'),
  ).toHaveValue('100,000');

  await page.getByRole('button', { name: /^record payment$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}$`));

  // Payments tab: 3 rows.
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const paymentRowsAfterManual = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  await expect(paymentRowsAfterManual).toHaveCount(3);

  // Installments tab: seq 2 PAID, seq 3 PAID, seq 4 PARTIAL with ₦100,000 paid.
  await page.getByRole('tab', { name: 'Installments' }).click();
  await expect(page.getByRole('columnheader', { name: /amount due/i })).toBeVisible();
  const installmentsAfterManual = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Amount due' })
    .locator('tbody tr');
  await expect(installmentsAfterManual.nth(2)).toContainText('PAID');
  await expect(installmentsAfterManual.nth(3)).toContainText('PAID');
  await expect(installmentsAfterManual.nth(4)).toContainText('PARTIAL');
  await expect(installmentsAfterManual.nth(4)).toContainText('₦100,000');

  // Plan still ACTIVE.
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 11. Overpay attempt is rejected — no redirect                        //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: /record payment/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}/payments/new$`));

  await page.locator('#amountNgn').fill('99,999,999');
  await page.getByRole('button', { name: /^record payment$/i }).click();

  // No redirect — still on the record-payment page.
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}/payments/new$`));
  // Some form of "exceeds outstanding" error must surface — toast or inline.
  // The client-side preview already shows "Overpays by ... — server will
  // reject." once the amount exceeds the outstanding sum, so match that
  // user-facing copy.
  await expect(page.getByText(/overpays?.*server will reject/i).first()).toBeVisible();

  // Cancel back to plan detail.
  await page.getByRole('link', { name: /^cancel$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}$`));
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  // ------------------------------------------------------------------ //
  // 12. Console.error sweep                                              //
  // ------------------------------------------------------------------ //
  expect(consoleErrors, `unexpected console.error during run:\n${consoleErrors.join('\n')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────── //
// M5: payment reversal                                                        //
//                                                                             //
// The three M5 tests share a single plan created by M5-A and identified via  //
// a module-level variable. Playwright runs tests in a single worker           //
// (workers: 1 in playwright.config.ts) so sequential execution is guaranteed //
// and the shared variable is safe.                                            //
// ─────────────────────────────────────────────────────────────────────────── //

/**
 * Plan id shared across M5 tests (set by M5-A, consumed by M5-B and M5-C).
 * Module scope is safe here because Playwright runs all tests in this file on
 * the same worker process (workers: 1).
 */
let m5PlanId = '';

test('M5-A: OWNER reverses payment, plan COMPLETED → ACTIVE', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // Sign in as OWNER                                                    //
  // ------------------------------------------------------------------ //
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(OWNER_EMAIL);
  await page.getByLabel(/password/i).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // ------------------------------------------------------------------ //
  // Create M5 customer + property                                       //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('link', { name: 'New customer' }).click();
  await page.getByLabel(/full name/i).fill('M5 Customer');
  await page.getByLabel(/^phone/i).fill('+2348012345005');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('link', { name: 'M5 Customer' })).toBeVisible();

  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  await page.getByRole('link', { name: 'New property' }).click();
  await page.getByLabel(/^code/i).fill('M5-01');
  await page.getByLabel(/^title/i).fill('M5 property');
  await page.getByLabel(/address/i).fill('1 M5 Lane');
  await page.getByLabel(/city/i).fill('Lagos');
  // ₦210,000 total: ₦100,000 deposit (toggle ON → seq 0 PAID, plan ACTIVE)
  // + 6-month term with monthly ₦20,000 and a ₦10,000 final row. One ₦110,000
  // closing payment FIFO-allocates 5×₦20k + ₦10k, closing every installment
  // → plan COMPLETED. Schedule arithmetic:
  //   outstanding = 210,000 − 100,000 = 110,000
  //   5 × 20,000 + finalRow 10,000 = 110,000
  //   term ≥ 6 (wizard guard) ✓
  //   finalRow > 0n ✓ and finalRow ≤ 2 × monthly (40,000) ✓
  await page.getByLabel(/total price/i).fill('210,000');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL('/properties');
  await expect(page.getByRole('link', { name: 'M5-01' })).toBeVisible();

  // ------------------------------------------------------------------ //
  // Create M5 plan: deposit toggle ON, 1-month term                    //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: 'Plans', exact: true }).click();
  await page.getByRole('link', { name: 'New plan' }).click();
  await expect(page).toHaveURL('/plans/new');

  const buyerSearch = page.getByLabel(/search buyers/i);
  await buyerSearch.click();
  await buyerSearch.fill('M5 Customer');
  await page.getByRole('option', { name: /m5 customer/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(page.getByRole('heading', { name: /which property/i })).toBeVisible();
  await page.getByRole('option', { name: /m5-01/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  await expect(page.getByRole('heading', { name: /payment terms/i })).toBeVisible();
  await page.getByLabel(/down payment today/i).fill('100,000');
  await page.getByLabel(/monthly amount/i).fill('20,000');
  await page.getByLabel(/term \(months/i).fill('6');

  const depositToggle = page.getByLabel(/deposit received today/i);
  await depositToggle.check();
  await expect(depositToggle).toBeChecked();
  await expect(
    page.getByText(/defaults to the plan start date if you leave this empty/i),
  ).toBeVisible();

  await page.getByRole('button', { name: /preview schedule/i }).click();

  await expect(
    page.getByRole('heading', { name: /show the buyer their schedule/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: /confirm sale/i }).click();

  // ------------------------------------------------------------------ //
  // Land on plan detail — status ACTIVE                                 //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+/);
  const planUrl = page.url();
  const planIdMatch = planUrl.match(/\/plans\/([0-9a-f-]+)/);
  expect(planIdMatch).not.toBeNull();
  m5PlanId = planIdMatch![1];

  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
  await expect(page.getByText('M5 Customer · M5-01')).toBeVisible();

  // ------------------------------------------------------------------ //
  // Record the single closing payment: ₦110,000 → plan COMPLETED       //
  // ------------------------------------------------------------------ //
  await page.getByRole('link', { name: /record payment/i }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${m5PlanId}/payments/new$`));

  await page.locator('#amountNgn').fill('110,000');
  await page.getByRole('button', { name: /^record payment$/i }).click();

  // Plan transitions to COMPLETED.
  await expect(page).toHaveURL(new RegExp(`/plans/${m5PlanId}$`));
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();

  // ------------------------------------------------------------------ //
  // Payments tab — 2 rows before reversal                               //
  // ------------------------------------------------------------------ //
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const rowsBeforeReversal = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  // Most-recent first: row 0 = ₦110,000 closing payment, row 1 = ₦100,000 deposit.
  await expect(rowsBeforeReversal).toHaveCount(2);
  await expect(rowsBeforeReversal.first()).toContainText('₦110,000');

  // ------------------------------------------------------------------ //
  // Reverse the closing payment (row 0)                                 //
  // ------------------------------------------------------------------ //
  const reverseBtn = rowsBeforeReversal.first().getByTestId('reverse-payment');
  await expect(reverseBtn).toBeVisible();
  await reverseBtn.click();

  // Confirmation dialog is visible.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: /reverse payment/i })).toBeVisible();
  // The dialog warns that COMPLETED → ACTIVE.
  await expect(page.getByText(/the plan will reopen/i)).toBeVisible();

  await page.getByLabel(/reason/i).fill('Test reversal — closing payment');
  await page.getByRole('button', { name: /^reverse$/i }).click();

  // Toast confirms the action.
  await expect(page.getByText('Payment reversed.')).toBeVisible();

  // ------------------------------------------------------------------ //
  // Assert post-reversal state (dialog has closed automatically)        //
  // ------------------------------------------------------------------ //
  // Plan status reverts to ACTIVE.
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  // Payments tab: 3 rows — reversal, reversed original, deposit.
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const rowsAfterReversal = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  await expect(rowsAfterReversal).toHaveCount(3);

  // Row 0 (most-recent): reversal row — "Reversal" badge, negative amount.
  await expect(rowsAfterReversal.nth(0)).toContainText('Reversal');
  await expect(rowsAfterReversal.nth(0)).toContainText('-₦110,000');

  // Row 1: original closing payment — "Reversed" badge.
  await expect(rowsAfterReversal.nth(1)).toContainText('Reversed');
  await expect(rowsAfterReversal.nth(1)).toContainText('₦110,000');

  // ------------------------------------------------------------------ //
  // Reload and re-assert (confirms RSC re-render correctness)           //
  // ------------------------------------------------------------------ //
  await page.reload();
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const rowsAfterReload = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  await expect(rowsAfterReload).toHaveCount(3);
  await expect(rowsAfterReload.nth(0)).toContainText('Reversal');
  await expect(rowsAfterReload.nth(0)).toContainText('-₦110,000');
  await expect(rowsAfterReload.nth(1)).toContainText('Reversed');
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();

  expect(consoleErrors, `unexpected console.error during run:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('M5-B: STAFF cannot see Reverse button', async ({ page }) => {
  // m5PlanId is set by M5-A which runs before this test (workers: 1,
  // sequential execution). If M5-A failed, m5PlanId is '' — skip gracefully.
  if (!m5PlanId) {
    test.skip(true, 'M5-A did not complete — m5PlanId not set');
    return;
  }

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // Sign in as STAFF (seeded by run-e2e.ts via SEED_STAFF_* env vars)  //
  // ------------------------------------------------------------------ //
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(STAFF_EMAIL);
  await page.getByLabel(/password/i).fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // ------------------------------------------------------------------ //
  // Navigate to the M5 plan Payments tab                                //
  // ------------------------------------------------------------------ //
  await page.goto(`/plans/${m5PlanId}`);
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();

  // STAFF does not see a Reverse button on any row (column header is absent
  // and no data-testid="reverse-payment" exists in the DOM).
  await expect(page.getByTestId('reverse-payment')).toHaveCount(0);

  expect(consoleErrors, `unexpected console.error during run:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('M5-C: cannot reverse twice — reversed row and reversal row have no Reverse button', async ({ page }) => {
  if (!m5PlanId) {
    test.skip(true, 'M5-A did not complete — m5PlanId not set');
    return;
  }

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // Sign in as OWNER                                                    //
  // ------------------------------------------------------------------ //
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(OWNER_EMAIL);
  await page.getByLabel(/password/i).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // ------------------------------------------------------------------ //
  // Navigate to the M5 plan Payments tab                                //
  // ------------------------------------------------------------------ //
  await page.goto(`/plans/${m5PlanId}`);
  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByRole('columnheader', { name: /paid date/i })).toBeVisible();
  const rows = page
    .getByRole('tabpanel')
    .filter({ hasText: 'Paid date' })
    .locator('tbody tr');
  // After M5-A: 3 rows — reversal row (0), reversed closing payment (1), deposit (2).
  await expect(rows).toHaveCount(3);

  // Row 0 — the reversal row — has "Reversal" badge and NO Reverse button
  // (isReversalRow = true → canReverse is false).
  await expect(rows.nth(0)).toContainText('Reversal');
  await expect(rows.nth(0).getByTestId('reverse-payment')).toHaveCount(0);

  // Row 1 — the already-reversed closing payment — has "Reversed" badge and
  // NO Reverse button (wasReversed = true → canReverse is false).
  await expect(rows.nth(1)).toContainText('Reversed');
  await expect(rows.nth(1).getByTestId('reverse-payment')).toHaveCount(0);

  // Row 2 — the deposit row — has a Reverse button (it has not been reversed).
  // Asserting presence only; reversing the deposit is outside M5 scope.
  await expect(rows.nth(2).getByTestId('reverse-payment')).toHaveCount(1);

  expect(consoleErrors, `unexpected console.error during run:\n${consoleErrors.join('\n')}`).toEqual([]);
});
