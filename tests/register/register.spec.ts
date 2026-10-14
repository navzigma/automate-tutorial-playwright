import { test, expect, type Browser } from '@playwright/test';
import { BackOfficePage } from '../pages/back-office.page';
import { RegisterPage, type RegisterBy, type RegisterData } from '../pages/register.page';

// Each case first switches the register mode in the back office, so a back-office account is required:
//   BO_USERNAME=xxx BO_PASSWORD=yyy pnpm exec playwright test tests/register
const BO_USER = {
  username: process.env.BO_USERNAME,
  password: process.env.BO_PASSWORD,
};

// Registering by phone asks for an SMS OTP unless OTP is off. The back office only accepts the whole
// OTP config (provider keys included), so it is kept in the environment as one JSON string.
const BO_OTP_CONFIG = process.env.BO_OTP_CONFIG;

const CASES: { id: string; registerBy: RegisterBy }[] = [
  { id: 'Test_RegisterAuto_001', registerBy: 'username' },
  { id: 'Test_RegisterAuto_002', registerBy: 'phone' },
  { id: 'Test_RegisterAuto_003', registerBy: 'email' },
];

/** Builds a member that has not been registered before. */
function newMember(): RegisterData {
  const stamp = Date.now().toString();

  return {
    username: `VanAuto${stamp}`,
    phone: `08${stamp.slice(-8)}`,
    email: `VanAuto${stamp}@example.com`,
    password: 'Test1234',
  };
}

// The register mode is one site-wide setting, so the cases must not overlap each other.
test.describe.configure({ mode: 'default' });

// Capture the final screen of every test case (pass or fail) and attach it to the report.
test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Register page', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs on one browser only: the register mode is shared by all browsers');
  test.skip(
    !BO_USER.username || !BO_USER.password || !BO_OTP_CONFIG,
    'Set BO_USERNAME, BO_PASSWORD and BO_OTP_CONFIG to run the register tests',
  );

  let authorization: string;

  // A visible back-office window left open slows the register page down enough to time out,
  // so each back-office visit gets its own short-lived window. Logging in happens once only.
  async function inBackOffice(browser: Browser, action: (backOffice: BackOfficePage) => Promise<void>) {
    const context = await browser.newContext();
    try {
      const backOffice = new BackOfficePage(await context.newPage());
      if (authorization) {
        await backOffice.open(authorization);
      } else {
        authorization = await backOffice.login(BO_USER.username!, BO_USER.password!);
      }
      await action(backOffice);
    } finally {
      await context.close();
    }
  }

  test.beforeAll(async ({ browser }) => {
    await inBackOffice(browser, async (backOffice) => {
      const otp = await backOffice.disableOtp(JSON.parse(BO_OTP_CONFIG!));
      expect(otp.ok, `Turn OTP off failed with ${otp.status}: ${otp.body}`).toBeTruthy();

      const email = await backOffice.disableEmailVerification();
      expect(email.ok, `Turn email verification off failed with ${email.status}: ${email.body}`).toBeTruthy();
    });
  });

  for (const { id, registerBy } of CASES) {
    test(`${id}: registers Template 1 by ${registerBy}`, async ({ page, browser }) => {
      await inBackOffice(browser, async (backOffice) => {
        const config = await backOffice.setRegisterBy(registerBy);
        expect(config.ok, `Set register_by=${registerBy} failed with ${config.status}: ${config.body}`).toBeTruthy();
      });

      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await expect(registerPage.identifierInput(registerBy)).toBeVisible();

      await registerPage.register(newMember());

      await expect(registerPage.successModal).toBeVisible({ timeout: 15_000 });
    });
  }
});
