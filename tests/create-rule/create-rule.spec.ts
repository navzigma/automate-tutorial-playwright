import { test, expect, type Response } from '@playwright/test';
import { BackOfficePage } from '../pages/back-office.page';
import { PointRulePage } from '../pages/point-rule.page';
import { RateRulePage, type RateRuleKind } from '../pages/rate-rule.page';
import { ReferralRulePage } from '../pages/referral-rule.page';

//   BO_USERNAME=xxx BO_PASSWORD=yyy RULE_PROVIDER='Provider Name' pnpm exec playwright test tests/create-rule
const BO_USER = {
  username: process.env.BO_USERNAME,
  password: process.env.BO_PASSWORD,
};

// All four rules are created for the same provider. The back office has no way to delete a rule,
// so a rule is created on the first run only: later runs find it already there and pass on that.
const PROVIDER = process.env.RULE_PROVIDER;

const POINT_RULE = { status: 'Active', turnover: '50' } as const;

const RATE_RULE = {
  memberLevelRate: '1',
  turnoverTier: { minAmount: '1', maxAmount: '999999999', rate: '1' },
};

// The rate goes to every referral level the referral config leaves open.
const REFERRAL_RULE = { calculateType: 'Turnover', levelRate: '10' } as const;

const RATE_RULE_CASES: { id: string; kind: RateRuleKind; menu: [string, string] }[] = [
  { id: 'Test_CreateRule_002', kind: 'rebate', menu: ['9. Rebate', '9.3 Rebate Rule'] },
  { id: 'Test_CreateRule_003', kind: 'cashback', menu: ['10. Cashback', '10.3 Cashback Rule'] },
];

/** True when the back office refused to create a rule because that rule already exists. */
async function isDuplicate(response: Response): Promise<boolean> {
  // dev answers 422 and stg 400 for the same duplicate.
  return [400, 422].includes(response.status()) && /duplicate/i.test(await response.text());
}

/** Notes in the report that a rule was already there, so nothing was created this run. */
function noteExistingRule(rule: string) {
  test.info().annotations.push({ type: 'existing rule', description: `${rule} already exists, nothing was created` });
}

// The cases follow each other on one provider, so keep them in order.
test.describe.configure({ mode: 'default' });

// Capture the final screen of every test case (pass or fail) and attach it to the report.
test.use({ screenshot: { mode: 'on', fullPage: true } });

test.describe('Create rule', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs on one browser only: a rule can be created once per provider');
  test.skip(
    !BO_USER.username || !BO_USER.password || !PROVIDER,
    'Set BO_USERNAME, BO_PASSWORD and RULE_PROVIDER to run the create rule tests',
  );

  let backOffice: BackOfficePage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);

    backOffice = new BackOfficePage(page);
    await backOffice.login(BO_USER.username!, BO_USER.password!);
  });

  test('Test_CreateRule_001: creates a point rule for every game category of the provider', async ({ page }) => {
    const pointRule = new PointRulePage(page);

    await backOffice.openMenu('6. Point', '6.3 Point Rule');
    const gameCategories = await pointRule.startRule(PROVIDER!);
    expect(gameCategories, `${PROVIDER} has no game category`).not.toHaveLength(0);

    const created: string[] = [];
    for (const [index, gameCategory] of gameCategories.entries()) {
      if (index > 0) {
        await pointRule.goto();
        await pointRule.startRule(PROVIDER!);
      }

      await pointRule.fill({ gameCategory, ...POINT_RULE });
      const response = await pointRule.save();
      if (await isDuplicate(response)) {
        noteExistingRule(`${PROVIDER} ${gameCategory} point rule`);
        continue;
      }

      expect(response.ok(), `Create ${gameCategory} point rule failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
      created.push(gameCategory);
    }

    await pointRule.goto();
    for (const gameCategory of gameCategories) {
      // Two providers can share one name, and then each has its own row.
      const row = pointRule.ruleRow(PROVIDER!, gameCategory).first();
      await expect(row).toBeVisible();

      // A rule from an earlier run keeps whatever values it was given since.
      if (created.includes(gameCategory)) {
        await expect(row).toContainText('50.00');
        await expect(row).toContainText('Active');
      }
    }
  });

  for (const { id, kind, menu } of RATE_RULE_CASES) {
    test(`${id}: creates a ${kind} rule for the provider`, async ({ page }) => {
      const rateRule = new RateRulePage(page, kind);

      await backOffice.openMenu(...menu);
      await rateRule.search();
      await rateRule.openAddForm();

      let created = await rateRule.addProvider(PROVIDER!);
      if (created) {
        await rateRule.checkMemberStatuses();
        await rateRule.setRateForAllMemberLevels(RATE_RULE.memberLevelRate);
        await rateRule.setTurnoverTier(RATE_RULE.turnoverTier);

        const response = await rateRule.save();
        created = !(await isDuplicate(response));
        if (created) {
          expect(response.ok(), `Create ${kind} rule failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
        }
      }
      if (!created) noteExistingRule(`${PROVIDER} ${kind} rule`);

      await rateRule.goto();
      await rateRule.search();
      const row = rateRule.ruleRows(PROVIDER!).first();
      await expect(row).toBeVisible();

      // A rule from an earlier run keeps whatever values it was given since.
      if (created) {
        await expect(row).toContainText('Active');
        await expect(row).toContainText(`${RATE_RULE.memberLevelRate}%`);
      }
    });
  }

  test('Test_CreateRule_004: creates a referral rule for the provider', async ({ page }) => {
    const referralRule = new ReferralRulePage(page);

    await backOffice.openMenu('12. Referral', '12.3 Referral Rule');
    await referralRule.search();
    await referralRule.openAddForm();

    let levels: number[] = [];
    let created = await referralRule.addProvider(PROVIDER!);
    if (created) {
      await referralRule.setCalculateTypeForAllRows(REFERRAL_RULE.calculateType);
      levels = await referralRule.setRateForAllLevels(REFERRAL_RULE.levelRate);
      expect(levels, 'No referral level takes a rate').not.toHaveLength(0);

      const response = await referralRule.save();
      created = !(await isDuplicate(response));
      if (created) {
        expect(response.ok(), `Create referral rule failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
      }
    }
    if (!created) noteExistingRule(`${PROVIDER} referral rule`);

    await referralRule.goto();
    await referralRule.search(PROVIDER!);
    const row = referralRule.ruleRows(PROVIDER!).first();
    await expect(row).toBeVisible();

    // A rule from an earlier run keeps whatever values it was given since.
    if (created) {
      await expect(row).toContainText(REFERRAL_RULE.calculateType);
      await expect(row).toContainText('Active');
      for (const level of levels) {
        await expect(referralRule.levelCell(row, level)).toHaveText(`${REFERRAL_RULE.levelRate}%`);
      }
    }
  });
});
