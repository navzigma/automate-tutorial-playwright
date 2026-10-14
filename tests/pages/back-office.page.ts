import { expect, type Locator, type Page } from '@playwright/test';
import { type RegisterBy } from './register.page';

export class BackOfficePage {
  static readonly LOGIN_URL = 'https://dev-manage.nonprod-lux.com/account/login';
  static readonly REGISTER_CONFIG_API = 'https://dev-apiapi-bgapi.nonprod-lux.com/bo/register-config';
  static readonly OTP_CONFIG_API = 'https://dev-apiapi-api.nonprod-lux.com/bo/otp-config';

  static readonly EMAIL_CONFIG_API = 'https://dev-apiapi-bgapi.nonprod-lux.com/bo/email-config';

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(readonly page: Page) {
    this.usernameInput = page.getByPlaceholder('Enter Username');
    this.passwordInput = page.getByPlaceholder('Enter Password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }

  /** The `Bearer ...` value the back office sends to its API once logged in. */
  private authorization = '';

  /** Opens the back office with a token from an earlier `login`, without logging in again. */
  async open(authorization: string) {
    await this.page.goto(BackOfficePage.LOGIN_URL, { waitUntil: 'domcontentloaded' });
    this.authorization = authorization;
  }

  /** Logs in through the UI and returns the token the back office then sends to its API. */
  async login(username: string, password: string): Promise<string> {
    await this.page.goto(BackOfficePage.LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    const authorizedRequest = this.page.waitForRequest(
      (request) => request.url().includes('/bo/') && /^Bearer /.test(request.headers()['authorization'] ?? ''),
    );
    await this.loginButton.click();
    this.authorization = (await authorizedRequest).headers()['authorization'];
    return this.authorization;
  }

  /** Opens a page from the left menu, e.g. `openMenu('6. Point', '6.3 Point Rule')`. */
  async openMenu(group: string, item: string) {
    // Straight after login the menu handles every click twice and folds the group back at once.
    // It behaves after a fresh load, so wait for the login to land and load the page again first.
    await expect(this.page).not.toHaveURL(BackOfficePage.LOGIN_URL);
    await this.page.reload({ waitUntil: 'domcontentloaded' });

    // Group links carry icon glyphs in their name, so the group is found by its label instead.
    const groupLink = this.page.getByRole('link').filter({ has: this.page.getByText(group, { exact: true }) });
    const itemLink = this.page.getByRole('link', { name: item, exact: true });

    // Now and then the menu still misbehaves: the group folds back at once, or opens without its items.
    // Only a fresh load cures that, so the page is loaded again until the click on the item lands.
    let href: string | null = null;
    await expect(async () => {
      await groupLink.click();
      try {
        href = await itemLink.getAttribute('href', { timeout: 2_000 });
        await itemLink.click({ timeout: 2_000 });
      } catch (error) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        throw error;
      }
    }).toPass();
    await expect(this.page).toHaveURL(new URL(href!, this.page.url()).href);
  }

  /** Switches the site-wide register mode. */
  async setRegisterBy(registerBy: RegisterBy) {
    return this.send('PATCH', BackOfficePage.REGISTER_CONFIG_API, {
      register_by: registerBy,
      auto_delete_system_status: 'false',
      auto_delete_inactive_days: '180',
    });
  }

  /**
   * Turns phone OTP off. The endpoint takes the whole OTP config, provider keys included,
   * so the caller supplies that config and only `otp_status` is forced here.
   */
  async disableOtp(otpConfig: Record<string, unknown>) {
    return this.send('POST', BackOfficePage.OTP_CONFIG_API, { ...otpConfig, otp_status: false });
  }

  /** Turns email OTP verification off. */
  async disableEmailVerification() {
    return this.send('POST', BackOfficePage.EMAIL_CONFIG_API, { email_verification: 'false' });
  }

  /** Calls the back-office API from a back-office page so it looks like the back office's own call. */
  private async send(method: string, url: string, body: unknown) {
    return this.page.evaluate(
      async ({ method, url, authorization, body }) => {
        const response = await fetch(url, {
          method,
          headers: {
            authorization,
            'content-type': 'application/json;charset=UTF-8',
            languagecode: 'en',
          },
          body: JSON.stringify(body),
        });

        return { ok: response.ok, status: response.status, body: await response.text() };
      },
      { method, url, authorization: this.authorization, body },
    );
  }
}
