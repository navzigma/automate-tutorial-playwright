import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { BackOfficePage } from '../pages/back-office.page';
import { QuestPage } from '../pages/quest.page';

//   BO_USERNAME=xxx BO_PASSWORD=yyy RULE_PROVIDER='Provider Name' pnpm exec playwright test tests/create-quest
const BO_USER = {
  username: process.env.BO_USERNAME,
  password: process.env.BO_PASSWORD,
};

// The quest is made for the same provider as the rules.
const PROVIDER = process.env.RULE_PROVIDER;
const QUEST_NAME = `Test Quest ${PROVIDER}`;

const IMAGES = path.join(os.homedir(), 'Desktop', 'Automate Pic', 'Quest');
const image = (name: string) => path.join(IMAGES, `${name}.png`);

test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Create quest', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs on one browser only: each run creates a quest');
  test.skip(
    !BO_USER.username || !BO_USER.password || !PROVIDER,
    'Set BO_USERNAME, BO_PASSWORD and RULE_PROVIDER to run the create quest test',
  );

  test('Test_CreateQuest_001: creates a play quest with an English language for the provider', async ({ page }) => {
    test.setTimeout(120_000);
    const backOffice = new BackOfficePage(page);
    const quest = new QuestPage(page);

    await backOffice.login(BO_USER.username!, BO_USER.password!);
    await backOffice.openMenu('15. Quest', '15.1 Management');
    await quest.openAddForm();

    await quest.fill({
      name: QUEST_NAME,
      provider: PROVIDER!,
      calculateType: 'Turnover',
      minimumBet: '1',
      betTimes: '2',
      accumulateBet: '10',
      promotionCount: 'Include',
      rewardType: 'Point',
      receivingReward: '10',
      iconReward: image('Diamond'),
      backgroundReward: image('Box-Redeem_open'),
    });

    const created = await quest.create();
    expect(created.ok(), `Create quest failed with ${created.status()}: ${await created.text()}`).toBeTruthy();
    await quest.acknowledgeSuccess('Add New Quest Success');
    await expect(page).toHaveURL(/\/quest\/management\/edit-/);

    const saved = await quest.addLanguage({
      language: 'English',
      title: QUEST_NAME,
      content: QUEST_NAME,
      desktopThumbnail: image('Play-Quest-thumb-web'),
      mobileThumbnail: image('Play-Quest-thumb-web'),
    });
    expect(saved.ok(), `Add language failed with ${saved.status()}: ${await saved.text()}`).toBeTruthy();
    await quest.acknowledgeSuccess('Add New Language Success');

    await expect(quest.languageModal).toBeHidden();
    await expect(quest.languageRows('English')).toHaveCount(1);
  });
});
