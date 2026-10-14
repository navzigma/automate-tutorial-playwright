import { expect, type Locator, type Page, type Response } from '@playwright/test';

export class LoginPage {
  static readonly URL = 'https://dev-th.nonprod-lux.com/en/login';
  static readonly AUTH_API = '**/pb/authentication';

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly togglePasswordButton: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;

  readonly usernameRequiredError: Locator;
  readonly passwordRequiredError: Locator;
  readonly incorrectInfoAlert: Locator;
  readonly alertOkButton: Locator;

  constructor(readonly page: Page) {
    this.usernameInput = page.getByTestId('login-username-input');
    this.passwordInput = page.getByTestId('login-password-input');
    this.togglePasswordButton = page.getByTestId('login-toggle-password-button');
    this.submitButton = page.getByTestId('login-submit-button');
    this.registerLink = page.getByTestId('login-register-link');

    this.usernameRequiredError = page.getByText('Username / Phone / Email is required.');
    this.passwordRequiredError = page.getByText('Password is required.');
    this.incorrectInfoAlert = page.getByText('Incorrect Information');
    this.alertOkButton = page.getByRole('button', { name: 'OK' });
  }

  async goto() {
    // A promotion popup shows up shortly after load and covers the form; close it whenever it appears.
    await this.page.addLocatorHandler(
      this.page.getByRole('dialog').getByTestId('close-button'),
      async (closeButton) => {
        await closeButton.click();
      },
    );

    await this.page.goto(LoginPage.URL, { waitUntil: 'domcontentloaded' });
    await expect(this.usernameInput).toBeVisible();
  }

  /** Fills the form, submits it and returns the authentication API response. */
  async login(username: string, password: string): Promise<Response> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    const authResponse = this.page.waitForResponse(LoginPage.AUTH_API);
    await this.submitButton.click();
    return authResponse;
  }
}
