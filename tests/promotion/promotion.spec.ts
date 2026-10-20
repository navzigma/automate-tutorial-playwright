import os from 'os';
import path from 'path';
import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import { BackOfficePage } from '../pages/back-office.page';

//   BO_USERNAME=xxx BO_PASSWORD=yyy RULE_PROVIDER='Provider Name' GAME_CAT_PRO='Slots,LiveCasino' pnpm exec playwright test tests/promotion
const BO_USER = {
  username: process.env.BO_USERNAME,
  password: process.env.BO_PASSWORD,
};

const PROVIDER = process.env.RULE_PROVIDER;
const PROMOTION_NAME = `Test Promotion ${PROVIDER}`;
// One or more game categories, comma separated.
const GAME_CATEGORIES = (process.env.GAME_CAT_PRO ?? '')
  .split(',')
  .map((category) => category.trim())
  .filter(Boolean);

const IMAGE = path.join(os.homedir(), 'Desktop', 'Automate Pic', 'Promotion', 'Promotion.png');

const TIER = {
  'Enter Start Amount': '1',
  'Enter End Amount': '999999',
  'Enter Percent(%)': '10',
  'Enter Maximum Bonus': '999999',
  'Enter Fix Withdraw': '999999',
};

/** Today as the date pickers show it, e.g. 16/10/2026. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

const popup = (page: Page) => page.locator('.swal2-popup');

/** Clicks OK on the confirm popup and returns the API response that follows. */
async function confirm(page: Page, title: string, method: string, api: string): Promise<Response> {
  await expect(popup(page)).toContainText(title);
  const response = page.waitForResponse((r) => r.request().method() === method && r.url().includes(api));
  await popup(page).getByRole('button', { name: 'OK' }).click();
  const result = await response;
  expect(result.ok(), `${title} failed with ${result.status()}: ${await result.text()}`).toBeTruthy();
  return result;
}

/** Clicks OK on the Success popup carrying the given message. */
async function acknowledgeSuccess(page: Page, message: string) {
  await expect(popup(page)).toContainText('Success');
  await expect(popup(page)).toContainText(message);
  await popup(page).getByRole('button', { name: 'OK' }).click();
  await expect(popup(page)).toBeHidden();
}

/** Opens `5. Promotion`, a menu link without sub-items. */
async function openPromotionMenu(page: Page) {
  // Straight after login the menu misbehaves until the page is loaded again.
  await expect(page).not.toHaveURL(BackOfficePage.LOGIN_URL);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link').filter({ has: page.getByText('5. Promotion', { exact: true }) }).click();
  await expect(page).toHaveURL(/\/promotion$/);
}

/**
 * Opens a checkbox dropdown, ticks the boxes and closes it again. The boxes sit behind
 * zero-size labels, so the click goes straight to each box.
 */
async function pick(group: Locator, boxes: Locator[]) {
  // The options load after the form shows; Select All on an empty list does not stay ticked.
  await expect(group.locator('input[type=checkbox]').nth(1)).toBeAttached();

  const toggle = group.locator('.dropdown-toggle').first();
  await toggle.click();
  for (const box of boxes) {
    await expect(async () => {
      if (!(await box.isChecked())) await box.dispatchEvent('click');
      await expect(box).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
  await toggle.click();
}

function selectAll(page: Page, group: Locator): Locator {
  return group
    .locator('div.mt-2')
    .filter({ has: page.locator('strong', { hasText: 'Select All' }) })
    .locator('input[type=checkbox]');
}

async function pickToday(page: Page, group: Locator) {
  await group.locator('input').click();
  await page.locator('.mx-datepicker-main:visible td.today').click();
  await expect(group.locator('input')).toHaveValue(today());
}

/** Picks a radio and makes sure the form keeps it; the edit form can reset it while it loads. */
async function pickRadio(page: Page, radio: Locator) {
  await expect(async () => {
    await radio.dispatchEvent('click');
    await page.waitForTimeout(500);
    await expect(radio).toBeChecked({ timeout: 0 });
  }).toPass({ timeout: 15_000 });
}

test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Promotion', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs on one browser only: each run creates a promotion');
  test.skip(
    !BO_USER.username || !BO_USER.password || !PROVIDER || GAME_CATEGORIES.length === 0,
    'Set BO_USERNAME, BO_PASSWORD, RULE_PROVIDER and GAME_CAT_PRO to run the promotion test',
  );

  test('Test_Promotion_001: creates a special time deposit promotion with a tier and an English language', async ({ page }) => {
    test.setTimeout(120_000);
    await new BackOfficePage(page).login(BO_USER.username!, BO_USER.password!);
    await openPromotionMenu(page);

    await test.step('Add New Promotion', async () => {
      await page.getByRole('button', { name: 'Add New Promotion' }).click();
      await expect(page).toHaveURL(/\/promotion\/add-promotion$/);

      await page.locator('#input-promotion-title').fill(PROMOTION_NAME);
      await page.locator('#input-promotion-type').selectOption({ label: 'Special Time Deposit' });
      await page.locator('#input-condition-type').selectOption({ label: 'Pre Bonus' });

      for (const id of ['member-level', 'member-tag']) {
        const group = page.locator(`#input-group-${id}`);
        await pick(group, [selectAll(page, group)]);
      }

      const gameCategory = page.locator('#input-group-game-category');
      const categoryBoxes = GAME_CATEGORIES.map((category) =>
        gameCategory
          .locator('.bv-no-focus-ring > div')
          .filter({ hasText: new RegExp(`^\\s*${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
          .locator('input[type=checkbox]'),
      );
      for (const [index, box] of categoryBoxes.entries()) {
        await expect(box, `Game category ${GAME_CATEGORIES[index]} is not in the list`).toBeAttached();
      }
      await pick(gameCategory, categoryBoxes);

      await pickToday(page, page.locator('#input-group-promotion-start'));
      await pickToday(page, page.locator('#input-group-promotion-end'));

      const effectInDay = page.locator('#input-group-effect-in-day');
      await pick(effectInDay, [selectAll(page, effectInDay)]);

      await page.locator('#input-limit').fill('10');
      await page.locator('#input-limit-total').fill('10');
      await page.locator('#input-minimum-deposit').fill('1');
      // Any currency will do: take the first one offered.
      await page.locator('#input-currency').selectOption({ index: 1 });
      await page.locator('#input-limit-with-time-during').fill('10');
      await page.locator('#input-limit-with-time').fill('10');

      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await confirm(page, 'Confirm create promotion', 'POST', '/bo/promotion-info');
      await acknowledgeSuccess(page, 'Promotion created successfully.');
      await expect(page).toHaveURL(/\/promotion\/edit-/);
    });

    await test.step('Add Tier', async () => {
      // The table ids change on every load, so the tier table is found by its headers.
      const tierTable = page.locator('table').filter({ has: page.locator('th', { hasText: 'Start Amount' }) }).first();
      // A tier added before the edit page has loaded is dropped, and Add Tier then stays disabled.
      // Straight after Create the tier table can also hang on its spinner. So the page is loaded
      // afresh, and Add Tier waits for the tiers and then the promotion itself, which comes last.
      const loaded = Promise.all([
        page.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes('/bo/bonus-info?')),
        page.waitForResponse((r) => r.request().method() === 'GET' && /\/bo\/promotion-info\/[0-9a-f-]{36}/.test(r.url())),
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await loaded;
      await expect(tierTable.locator('.b-table-busy-slot')).toHaveCount(0);

      // Only the table's own rows: an expanded tier holds a table of its own.
      const row = tierTable.locator(':scope > tbody > tr').filter({ has: page.getByPlaceholder('Enter Start Amount') }).first();
      await page.getByRole('button', { name: 'Add Tier' }).click();
      await expect(row).toBeVisible();
      for (const [placeholder, value] of Object.entries(TIER)) {
        await row.getByPlaceholder(placeholder, { exact: true }).fill(value);
      }
      await row
        .locator('select')
        .filter({ has: page.locator('option', { hasText: 'Money + Free Spins' }) })
        .selectOption({ label: 'Money' });

      await row.getByRole('button', { name: 'check circle fill' }).click();
      await confirm(page, 'Confirm Bonus Payout Create Tier', 'POST', '/bo/bonus-info');
      await acknowledgeSuccess(page, 'Bonus tier created.');
      await expect(tierTable.locator('tbody')).toContainText('999,999.00');
    });

    await test.step('Add Language', async () => {
      const modal = page.locator('#modal-add-bonus-language');
      await page.getByRole('button', { name: 'Add Language' }).click();
      await expect(modal).toBeVisible();

      await modal.locator('#input-language').selectOption({ label: 'English' });
      await modal.locator('#input-title').fill(PROMOTION_NAME);
      await modal.locator('.ck-editor__editable').click();
      await page.keyboard.type(PROMOTION_NAME);
      for (const label of ['Desktop Thumbnail', 'Mobile Thumbnail']) {
        await modal
          .locator('label.font-weight-bold', { hasText: label })
          .locator('xpath=following::input[@type="file"][1]')
          .setInputFiles(IMAGE);
      }

      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await confirm(page, 'Confirm create promotion', 'POST', '/bo/promotion-article');
      await acknowledgeSuccess(page, 'Bonus Languages Created.');
      await expect(modal).toBeHidden();
    });

    await test.step('Display and update', async () => {
      await pickRadio(page, page.locator('#input-group-display').getByRole('radio', { name: 'Yes' }));
      await pickRadio(page, page.locator('#input-group-internal-display').getByRole('radio', { name: 'Yes' }));

      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await confirm(page, 'Confirm update promotion', 'PATCH', '/bo/promotion-info');
      await acknowledgeSuccess(page, 'Promotion updated successfully.');
    });
  });
});
