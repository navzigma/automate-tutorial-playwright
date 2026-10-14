import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

// Credentials for the happy-path test come from the environment so they stay out of the repo:
//   LOGIN_USERNAME=xxx LOGIN_PASSWORD=yyy pnpm exec playwright test tests/login
const VALID_USER = {
  username: process.env.LOGIN_USERNAME,
  password: process.env.LOGIN_PASSWORD,
};

const INVALID_USER = {
  username: 'TestInvalid',
  password: '123123!',
};

// Capture the final screen of every test case (pass or fail) and attach it to the report.
test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Login page', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe('Form', () => {
    test('shows the login form', async () => {
      await expect(loginPage.usernameInput).toHaveAttribute('placeholder', 'Enter Your Username / Phone / Email');
      await expect(loginPage.passwordInput).toHaveAttribute('placeholder', 'Enter Your Password');
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      await expect(loginPage.submitButton).toBeEnabled();
      await expect(loginPage.registerLink).toHaveAttribute('href', '/en/register');
    });

    test('toggles password visibility', async () => {
      await loginPage.passwordInput.fill('Secret123!');

      await loginPage.togglePasswordButton.click();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
      await expect(loginPage.passwordInput).toHaveValue('Secret123!');

      await loginPage.togglePasswordButton.click();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });

    test('sign up link goes to the register page', async ({ page }) => {
      await loginPage.registerLink.click();

      await expect(page).toHaveURL(/\/en\/register/);
    });
  });

  test.describe('Validation', () => {
    test('requires username and password', async ({ page }) => {
      await loginPage.submitButton.click();

      await expect(loginPage.usernameRequiredError).toBeVisible();
      await expect(loginPage.passwordRequiredError).toBeVisible();
      await expect(page).toHaveURL(LoginPage.URL);
    });

    test('requires password when only username is filled', async () => {
      await loginPage.usernameInput.fill('someuser');
      await loginPage.submitButton.click();

      await expect(loginPage.passwordRequiredError).toBeVisible();
      await expect(loginPage.usernameRequiredError).toBeHidden();
    });
  });

  test.describe('Authentication', () => {
    test('rejects invalid credentials', async ({ page }) => {
      const response = await loginPage.login(INVALID_USER.username, INVALID_USER.password);

      expect(response.status()).toBe(400);
      await expect(loginPage.incorrectInfoAlert).toBeVisible();

      await loginPage.alertOkButton.click();
      await expect(loginPage.incorrectInfoAlert).toBeHidden();
      await expect(page).toHaveURL(LoginPage.URL);
    });

    test('logs in with valid credentials', async ({ page }) => {
      test.skip(!VALID_USER.username || !VALID_USER.password, 'Set LOGIN_USERNAME and LOGIN_PASSWORD to run this test');

      const response = await loginPage.login(VALID_USER.username!, VALID_USER.password!);

      expect(response.ok()).toBeTruthy();
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
});
