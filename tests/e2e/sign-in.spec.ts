import { SESSION, expect, test } from './fixtures/registry';

test.describe('signing in', () => {
  test('an unknown visitor is sent to the sign in screen', async ({ page, registry }) => {
    void registry;
    await page.goto('/register');

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Slipgauge registry' })).toBeVisible();
  });

  test('the address that was asked for is kept and returned to', async ({ page, registry }) => {
    void registry;
    await page.goto('/recalls');
    await expect(page).toHaveURL(/next=%2Frecalls/);

    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/recalls/);
  });

  test('the shell shows who is signed in', async ({ page, registry }) => {
    void registry;
    await page.goto('/sign-in');
    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(SESSION.displayName)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('a rejected password says so without saying which half was wrong', async ({
    page,
    registry,
  }) => {
    await registry.on('**/api/auth/token', {
      type: 'https://errors.slipgauge.internal/registry/unauthenticated',
      title: 'UNAUTHENTICATED',
      status: 401,
      detail: 'the username or password was not accepted',
      code: 'registry/unauthenticated',
      timestamp: new Date().toISOString(),
    }, 401);

    await page.goto('/sign-in');
    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'That username and password were not accepted.',
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('the password field is emptied after a refusal', async ({ page, registry }) => {
    await registry.on('**/api/auth/token', { detail: 'no' }, 401);

    await page.goto('/sign-in');
    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByLabel('Username')).toHaveValue('h.whitcombe');
  });

  test('signing out clears the session and blocks the register again', async ({
    page,
    registry,
  }) => {
    void registry;
    await page.goto('/sign-in');
    await page.getByLabel('Username').fill('h.whitcombe');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(SESSION.displayName)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto('/register');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
