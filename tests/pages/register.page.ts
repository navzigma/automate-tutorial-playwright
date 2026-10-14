import { expect, type Locator, type Page } from '@playwright/test';

export type RegisterBy = 'username' | 'phone' | 'email';

export type RegisterData = {
  username: string;
  phone: string;
  email: string;
  password: string;
};

export class RegisterPage {
  static readonly URL = 'https://dev-th.nonprod-lux.com/en/register';

  readonly usernameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly isAdultCheckbox: Locator;
  readonly submitButton: Locator;

  readonly successModal: Locator;

  constructor(readonly page: Page) {
    this.usernameInput = page.getByTestId('register-username-input');
    this.phoneInput = page.getByTestId('register-phone-input');
    this.emailInput = page.getByTestId('register-email-input');
    this.passwordInput = page.getByTestId('register-password-input');
    this.confirmPasswordInput = page.getByTestId('register-confirm-password-input');
    this.isAdultCheckbox = page.getByTestId('register-is-adult-checkbox');
    this.submitButton = page.getByTestId('register-submit-button');

    // The title is "Register Success" or "Congratulations" depending on the site's profile settings.
    this.successModal = page
      .locator('.swal2-popup')
      .filter({ hasText: /Register Success|successfully registered/i });
  }

  /** The input a member identifies with for the given register mode. */
  identifierInput(registerBy: RegisterBy): Locator {
    return {
      username: this.usernameInput,
      phone: this.phoneInput,
      email: this.emailInput,
    }[registerBy];
  }

  async goto() {
    // A promotion popup shows up shortly after load and covers the form; close it whenever it appears.
    await this.page.addLocatorHandler(
      this.page.getByRole('dialog').getByTestId('close-button'),
      async (closeButton) => {
        await closeButton.click();
      },
    );

    // In a visible browser the site also asks to send notifications, on top of the form.
    await this.page.addLocatorHandler(
      this.page.getByText('No Thank', { exact: true }),
      async (noThanksButton) => {
        await noThanksButton.click();
      },
    );

    await this.page.goto(RegisterPage.URL);
    await expect(this.passwordInput).toBeVisible();
  }

  /** Fills every field the current register mode shows, accepts the terms and submits. */
  async register(data: RegisterData) {
    // Which of these fields are shown depends on the back-office register config.
    const optionalFields: [Locator, string][] = [
      [this.usernameInput, data.username],
      [this.phoneInput, data.phone],
      [this.emailInput, data.email],
      [this.confirmPasswordInput, data.password],
    ];

    // The form is rendered again while the page is still loading its config, which wipes anything typed
    // before that, so keep filling until the values stay.
    await expect(async () => {
      await this.passwordInput.fill(data.password);
      for (const [input, value] of optionalFields) {
        if (await input.isVisible()) {
          await input.fill(value);
        }
      }
      await this.isAdultCheckbox.check();

      await this.page.waitForTimeout(1_000);
      await expect(this.passwordInput).toHaveValue(data.password, { timeout: 2_000 });
      await expect(this.isAdultCheckbox).toBeChecked({ timeout: 2_000 });
      await expect(this.submitButton).toBeEnabled({ timeout: 2_000 });
    }).toPass();

    await this.submitButton.click();
  }
}
