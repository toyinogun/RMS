/**
 * M6 E2E — Users Management
 *
 * Run order: happy-path → (m2 → m3 → m4-m5) → m6-users-management
 * OWNER password is `newStrongPassword!2026` (set by happy-path).
 *
 * Test 1 (primary, sequential phases):
 *   OWNER creates STAFF via /users/new → captures temp password → new STAFF
 *   onboards (mustChangePassword) → STAFF lands at / with no Users nav →
 *   OWNER deactivates STAFF → deactivated STAFF cannot sign in →
 *   OWNER reactivates → STAFF signs in successfully.
 *
 * Test 2: Seeded STAFF cannot navigate to /users directly (redirected to /).
 *
 * Test 3: OWNER creates ADMIN via /users/new (dogfooding) → ADMIN onboards →
 *   ADMIN cannot navigate to /users directly (redirected to /).
 *
 * Console assertion: each test fails if any unfiltered console.error fires.
 */
import { expect, test, type Page } from '@playwright/test';

const OWNER_EMAIL = 'owner@atrium.test';
const OWNER_PASSWORD = 'newStrongPassword!2026';
const STAFF_SEED_EMAIL = 'staff@atrium.test';
const STAFF_SEED_PASSWORD = 'staffPassword!2026';

// ─────────────────────────────────────────────────────────────────────────── //
// Helpers                                                                     //
// ─────────────────────────────────────────────────────────────────────────── //

/** Sign in via the /login page. Caller asserts destination URL. */
async function signIn(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

/** Sign out using the nav button (works on wide and narrow viewports). */
async function signOut(page: Page) {
  // The sign-out button exists twice (md: wide / compact), grab the first visible one.
  await page.getByRole('button', { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Onboard a user that has mustChangePassword set: fill current + new password. */
async function onboard(
  page: Page,
  currentPassword: string,
  newPassword: string,
) {
  await expect(page).toHaveURL(/\/onboarding\/change-password$/);
  await expect(page.getByRole('heading', { name: /set a new password/i })).toBeVisible();

  await page.getByLabel(/current password/i).fill(currentPassword);
  // Use the exact label text to avoid ambiguity with "Confirm new password".
  await page.getByLabel('New password (min 12 chars)').fill(newPassword);
  await page.getByLabel(/confirm new password/i).fill(newPassword);
  await page.getByRole('button', { name: /update password/i }).click();

  await expect(page).toHaveURL('/');
}

// ─────────────────────────────────────────────────────────────────────────── //
// Test 1 — OWNER creates STAFF, onboarding, deactivate/reactivate cycle       //
// ─────────────────────────────────────────────────────────────────────────── //

test('M6: OWNER creates STAFF, onboarding, deactivate/reactivate cycle', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // Phase 1: OWNER signs in and creates a new STAFF via /users/new     //
  // ------------------------------------------------------------------ //
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page).toHaveURL('/');

  const staffEmail = `m6-staff-${Date.now()}@atrium.test`;
  const staffNewPassword = 'newStaffPassword!2026';

  await page.goto('/users/new');
  await page.getByLabel(/name/i).fill('M6 Staff Test');
  await page.getByLabel(/email/i).fill(staffEmail);
  // Role selector — select STAFF (default, but be explicit)
  await page.getByLabel(/role/i).selectOption('STAFF');
  await page.getByRole('button', { name: /create user/i }).click();

  // ------------------------------------------------------------------ //
  // Phase 2: Temp password panel renders — capture the password        //
  // ------------------------------------------------------------------ //
  // The panel renders an h2 "User created" heading on success.
  // We scope to the green-bordered panel to avoid matching the Sonner
  // toast section (which also carries aria-live="polite").
  const panel = page.locator('[aria-live="polite"]').filter({ hasText: 'User created' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(staffEmail);

  // The password renders in a .font-mono element inside the panel.
  const tempPasswordEl = panel.locator('.font-mono');
  await expect(tempPasswordEl).toBeVisible();
  const tempPassword = (await tempPasswordEl.textContent()) ?? '';
  expect(tempPassword.length).toBeGreaterThanOrEqual(12);

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Phase 3: New STAFF signs in with temp password → onboarding        //
  // ------------------------------------------------------------------ //
  await signIn(page, staffEmail, tempPassword);
  await onboard(page, tempPassword, staffNewPassword);

  // ------------------------------------------------------------------ //
  // Phase 4: STAFF lands at / — Users nav must NOT be visible          //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeHidden();

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Phase 5: OWNER signs in, navigates to /users, sees the new STAFF  //
  // ------------------------------------------------------------------ //
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page).toHaveURL('/');

  await page.goto('/users');
  // The users table must contain the new STAFF row with Active badge.
  const staffRow = page.locator('table tbody tr', { hasText: staffEmail });
  await expect(staffRow).toBeVisible();
  await expect(staffRow).toContainText('Active');

  // ------------------------------------------------------------------ //
  // Phase 6: OWNER deactivates the new STAFF                           //
  // ------------------------------------------------------------------ //
  await staffRow.getByRole('button', { name: /deactivate/i }).click();

  // Shadcn Dialog appears — confirm inside the dialog.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /deactivate/i })).toBeVisible();
  await dialog.getByRole('button', { name: /confirm/i }).click();

  // Dialog closes automatically on success.
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // Row badge must flip to "Deactivated" and show Re-activate button.
  await expect(staffRow).toContainText('Deactivated');
  await expect(staffRow.getByRole('button', { name: /re-activate/i })).toBeVisible();
  await expect(staffRow.getByRole('button', { name: /deactivate/i })).toBeHidden();

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Phase 7: Deactivated STAFF cannot sign in                          //
  // ------------------------------------------------------------------ //
  await signIn(page, staffEmail, staffNewPassword);
  // Must NOT be redirected away — stays on login with error.
  // Scope to <p role="alert"> in the form — getByRole('alert') alone also
  // matches Next.js's empty route announcer (#__next-route-announcer__).
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('p[role="alert"]')).toContainText(/deactivated/i);

  // ------------------------------------------------------------------ //
  // Phase 8: OWNER reactivates the STAFF                               //
  // ------------------------------------------------------------------ //
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page).toHaveURL('/');

  await page.goto('/users');
  const staffRowAgain = page.locator('table tbody tr', { hasText: staffEmail });
  await expect(staffRowAgain).toBeVisible();
  await staffRowAgain.getByRole('button', { name: /re-activate/i }).click();

  const reactivateDialog = page.getByRole('dialog');
  await expect(reactivateDialog).toBeVisible();
  await expect(reactivateDialog.getByRole('heading', { name: /re-activate/i })).toBeVisible();
  await reactivateDialog.getByRole('button', { name: /confirm/i }).click();

  await expect(reactivateDialog).toBeHidden({ timeout: 10_000 });

  // Row badge must flip back to "Active".
  await expect(staffRowAgain).toContainText('Active');
  await expect(staffRowAgain.getByRole('button', { name: /deactivate/i })).toBeVisible();

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Phase 9: Reactivated STAFF can sign in successfully                //
  // ------------------------------------------------------------------ //
  await signIn(page, staffEmail, staffNewPassword);
  await expect(page).toHaveURL('/');

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Console.error sweep                                                 //
  // ------------------------------------------------------------------ //
  expect(consoleErrors, `unexpected console.error:\n${consoleErrors.join('\n')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────── //
// Test 2 — Seeded STAFF cannot reach /users (redirected to /)                //
// ─────────────────────────────────────────────────────────────────────────── //

test('M6: STAFF cannot reach /users — redirected to /', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  await signIn(page, STAFF_SEED_EMAIL, STAFF_SEED_PASSWORD);
  await expect(page).toHaveURL('/');

  // Attempt to navigate to /users directly.
  await page.goto('/users');
  await expect(page).toHaveURL('/');

  expect(consoleErrors, `unexpected console.error:\n${consoleErrors.join('\n')}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────── //
// Test 3 — OWNER creates ADMIN; ADMIN cannot reach /users                     //
// ─────────────────────────────────────────────────────────────────────────── //

test('M6: OWNER creates ADMIN via UI; ADMIN cannot reach /users', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource.*404/i.test(text)) return;
    consoleErrors.push(text);
  });

  // ------------------------------------------------------------------ //
  // OWNER creates an ADMIN via /users/new                               //
  // ------------------------------------------------------------------ //
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page).toHaveURL('/');

  const adminEmail = `m6-admin-${Date.now()}@atrium.test`;
  const adminNewPassword = 'newAdminPassword!2026';

  await page.goto('/users/new');
  await page.getByLabel(/name/i).fill('M6 Admin Test');
  await page.getByLabel(/email/i).fill(adminEmail);
  await page.getByLabel(/role/i).selectOption('ADMIN');
  await page.getByRole('button', { name: /create user/i }).click();

  // Capture temp password from the panel.
  // Filter by heading text to avoid Sonner's aria-live section.
  const panel = page.locator('[aria-live="polite"]').filter({ hasText: 'User created' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(adminEmail);

  const tempPasswordEl = panel.locator('.font-mono');
  await expect(tempPasswordEl).toBeVisible();
  const adminTempPassword = (await tempPasswordEl.textContent()) ?? '';
  expect(adminTempPassword.length).toBeGreaterThanOrEqual(12);

  await signOut(page);

  // ------------------------------------------------------------------ //
  // ADMIN signs in with temp password → onboarding                     //
  // ------------------------------------------------------------------ //
  await signIn(page, adminEmail, adminTempPassword);
  await onboard(page, adminTempPassword, adminNewPassword);

  // ------------------------------------------------------------------ //
  // ADMIN cannot navigate to /users — redirected to /                  //
  // ------------------------------------------------------------------ //
  await expect(page).toHaveURL('/');

  // Verify Users nav link is not visible for ADMIN.
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeHidden();

  await page.goto('/users');
  await expect(page).toHaveURL('/');

  await signOut(page);

  // ------------------------------------------------------------------ //
  // Console.error sweep                                                 //
  // ------------------------------------------------------------------ //
  expect(consoleErrors, `unexpected console.error:\n${consoleErrors.join('\n')}`).toEqual([]);
});
