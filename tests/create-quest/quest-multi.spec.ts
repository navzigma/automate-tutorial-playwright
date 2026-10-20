import os from 'os';
import path from 'path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { BackOfficePage } from '../pages/back-office.page';
import { QuestPage } from '../pages/quest.page';

//   BO_USERNAME=xxx BO_PASSWORD=yyy RULE_PROVIDER='Provider Name' pnpm exec playwright test tests/create-quest/quest-multi.spec.ts
const BO_USER = {
  username: process.env.BO_USERNAME,
  password: process.env.BO_PASSWORD,
};

// The quests are made for the same provider as the rules.
const PROVIDER = process.env.RULE_PROVIDER;
const OLD_QUEST_NAME = `Test Quest ${PROVIDER}`;
const QUEST_NAME = `Test Quest Multi ${PROVIDER}`;

const IMAGES = path.join(os.homedir(), 'Desktop', 'Automate Pic', 'Quest');
const image = (name: string) => path.join(IMAGES, `${name}.png`);

const WIN_AMOUNTS = {
  '#input-minimum_bet': '1',
  '#input-minimum_win': '1',
  '#input-win_time': '100',
  '#input-accumulate_win': '100',
  '#input-win_multiplier': '1',
  '#input-win_multiplier_times': '100',
};

const LANGUAGE = {
  language: 'English',
  title: QUEST_NAME,
  content: OLD_QUEST_NAME,
  desktopThumbnail: image('Play-Quest-thumb-web'),
  mobileThumbnail: image('Play-Quest-thumb-web'),
};

/** Searches the quest list by name and returns the rows whose name matches exactly. */
async function searchQuest(page: Page, name: string): Promise<Locator> {
  await page.locator('#input-quest-name').fill(name);
  const listed = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().includes(QuestPage.QUEST_API),
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await listed;
  return page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
}

/** Sets every active quest with this name to Inactive and returns how many were changed. */
async function inactivateQuest(page: Page, name: string): Promise<number> {
  const quest = new QuestPage(page);
  let changed = 0;
  for (;;) {
    const active = (await searchQuest(page, name)).filter({ hasText: 'Active' }).filter({ hasNotText: 'Inactive' });
    if ((await active.count()) === 0) return changed;

    // The edit form loads in steps and sets the status again on the last one, the member levels,
    // so a status picked before that is put back to Active.
    const loaded = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes('/bo/quest-game-member-level'),
    );
    await active.first().getByRole('button', { name: 'pencil fill' }).click();
    await expect(page).toHaveURL(/\/quest\/management\/edit-/);
    await loaded;
    await expect(page.locator('#input-quest-name')).toHaveValue(name);

    // A mouse click on the hidden radio or its label does not always reach the form,
    // so the click is sent straight to the radio, and checked again a moment later.
    const inactive = page.locator('#input-group-status').getByRole('radio', { name: 'Inactive' });
    await expect(async () => {
      await inactive.dispatchEvent('click');
      await page.waitForTimeout(500);
      await expect(inactive).toBeChecked({ timeout: 0 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(quest.popup).toContainText('Confirm Update Quest');
    const updated = page.waitForResponse(
      (response) => response.request().method() === 'PATCH' && response.url().includes(QuestPage.QUEST_API),
    );
    await quest.popupOkButton.click();
    const response = await updated;
    expect(response.ok(), `Inactivate ${name} failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
    await quest.acknowledgeSuccess('Quest Updated');
    changed++;

    await page.goBack();
  }
}

/**
 * Opens a checkbox dropdown, ticks one box and closes it again. The options load after the
 * field before it is set, and the boxes sit behind zero-size labels, so the click goes straight to the box.
 */
async function pick(group: Locator, checkbox: Locator) {
  const toggle = group.locator('.dropdown-toggle');
  await expect(toggle).toBeEnabled();
  await expect(group.locator('.bv-no-focus-ring input[type=checkbox]').first()).toBeAttached();

  await toggle.click();
  if (!(await checkbox.isChecked())) await checkbox.dispatchEvent('click');
  await expect(checkbox).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toContainText('--- Select');
}

function selectAll(page: Page, group: Locator): Locator {
  return group
    .locator('div.mt-2')
    .filter({ has: page.locator('strong', { hasText: 'Select All' }) })
    .locator('input[type=checkbox]');
}

/** Fills the Add New Quest form for a Play Quest on Category + Provider that counts wins. */
async function fillWinQuest(page: Page) {
  // A quest type picked while the form is still loading is reset to none, so pick it until the form follows.
  const gameType = page.locator('#input-game_type');
  await expect(async () => {
    await page.locator('#input-quest-type').selectOption({ label: 'Play Quests' });
    await expect(gameType).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await gameType.selectOption({ label: 'Category + Provider' });
  // Picking the quest type clears the name, so the name goes in after it.
  await page.locator('#input-quest-name').fill(QUEST_NAME);

  const gameCategory = page.locator('#input-group-game_category');
  await pick(gameCategory, selectAll(page, gameCategory));

  // The list greys out a provider it will not take; the test stops there at once.
  const providerGroup = page.locator('#input-group-game_provider');
  const provider = providerGroup
    .locator('.bv-no-focus-ring > div')
    .filter({ has: page.getByText(PROVIDER!, { exact: true }) })
    .locator('input[type=checkbox]')
    .first();
  await expect(provider, `${PROVIDER} is not in the Quest provider list`).toBeAttached();
  await expect(provider, `${PROVIDER} is disabled in the Quest provider list`).toBeEnabled({ timeout: 1_000 });
  await pick(providerGroup, provider);
  await expect(providerGroup.locator('.dropdown-toggle')).toContainText(PROVIDER!);

  const memberLevel = page.locator('#input-group-member-level');
  await pick(memberLevel, selectAll(page, memberLevel));

  await page.locator('#input-calculate_type').selectOption({ label: 'Win' });
  for (const [field, value] of Object.entries(WIN_AMOUNTS)) {
    await page.locator(field).fill(value);
  }
  await page.locator('#input-promotion_count').selectOption({ label: 'Include' });
  await page.locator('#input-reward_type').selectOption({ label: 'Point' });
  await page.locator('#input-receiving_reward').fill('10');

  const uploads = page.locator('#input-group-upload-image .col-md-4');
  await uploads.filter({ hasText: 'Upload Icon Reward' }).locator('input[type=file]').setInputFiles(image('Diamond'));
  await uploads.filter({ hasText: 'Upload Background Reward' }).locator('input[type=file]').setInputFiles(image('Box-Redeem_open'));
}

test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Quest multi', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs on one browser only: each run creates a quest');
  test.skip(
    !BO_USER.username || !BO_USER.password || !PROVIDER,
    'Set BO_USERNAME, BO_PASSWORD and RULE_PROVIDER to run the quest multi test',
  );

  test('Test_QuestMulti_001: inactivates the old quest and creates a win quest for the provider', async ({ page }) => {
    test.setTimeout(120_000);
    const backOffice = new BackOfficePage(page);
    const quest = new QuestPage(page);

    await backOffice.login(BO_USER.username!, BO_USER.password!);

    // A provider takes one active quest, so the old quest is set Inactive first to free it.
    // QUEST_SKIP_INACTIVATE=1 leaves it alone and starts straight from Add New Quest.
    if (process.env.QUEST_SKIP_INACTIVATE === '1') {
      test.info().annotations.push({ type: 'skipped step', description: `Did not inactivate ${OLD_QUEST_NAME}` });
    } else {
      await backOffice.openMenu('15. Quest', '15.1 Management');
      if ((await inactivateQuest(page, OLD_QUEST_NAME)) === 0) {
        test.info().annotations.push({ type: 'no old quest', description: `No active ${OLD_QUEST_NAME} to inactivate` });
      }
    }

    await backOffice.openMenu('15. Quest', '15.1 Management');
    await quest.openAddForm();
    await fillWinQuest(page);

    const created = await quest.create();
    expect(created.ok(), `Create quest failed with ${created.status()}: ${await created.text()}`).toBeTruthy();
    await quest.acknowledgeSuccess('Add New Quest Success');
    await expect(page).toHaveURL(/\/quest\/management\/edit-/);

    // The steps add the English language twice over.
    for (let round = 1; round <= 2; round++) {
      const saved = await quest.addLanguage(LANGUAGE);
      expect(saved.ok(), `Add language (round ${round}) failed with ${saved.status()}: ${await saved.text()}`).toBeTruthy();
      await quest.acknowledgeSuccess('Add New Language Success');
      await expect(quest.languageModal).toBeHidden();
    }
  });
});
