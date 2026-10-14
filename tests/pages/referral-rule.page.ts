import { expect, type Locator, type Page, type Response } from '@playwright/test';

export type ReferralCalculateType = 'Turnover' | 'Cashback';

export class ReferralRulePage {
  static readonly URL = 'https://dev-manage.nonprod-lux.com/affiliate/rule';
  static readonly RULE_API = '/bo/affiliate-rule';
  static readonly CONFIG_API = '/bo/affiliate-config';
  /** Where the Level 1 column sits in a row of the rule list. */
  static readonly FIRST_LEVEL_COLUMN = 5;

  readonly providerFilter: Locator;
  readonly searchButton: Locator;
  readonly addNewRuleButton: Locator;
  readonly addProviderButton: Locator;
  readonly providerModal: Locator;
  readonly calculateTypeSelects: Locator;
  readonly levelInputs: Locator;
  readonly saveButton: Locator;
  readonly popup: Locator;
  readonly confirmButton: Locator;

  constructor(readonly page: Page) {
    this.providerFilter = page.getByRole('group', { name: 'Provider' }).getByRole('combobox');
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.addNewRuleButton = page.getByRole('button', { name: 'Add New Rule' });
    this.addProviderButton = page.getByRole('button', { name: 'Add Provider' });
    this.providerModal = page.locator('#modal-add-rule-providers');
    // Every provider row has a status select as well: only the calculate type one offers Turnover.
    this.calculateTypeSelects = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Turnover' }) });
    this.levelInputs = page.getByRole('row', { name: /^Level \d/ }).getByRole('spinbutton');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.popup = page.locator('.swal2-popup');
    this.confirmButton = this.popup.getByRole('button', { name: 'OK' });
  }

  async goto() {
    await this.page.goto(ReferralRulePage.URL, { waitUntil: 'domcontentloaded' });
  }

  /** The rule list stays empty until Search is clicked. Narrowed to one provider, its rules fit on the first page. */
  async search(provider?: string) {
    if (provider) await this.providerFilter.selectOption({ label: provider });
    await this.searchButton.click();
    await expect(this.page.getByRole('row').nth(1)).toBeVisible();
  }

  async openAddForm() {
    // The referral config decides which levels can take a rate, so the form is not ready before it lands.
    const config = this.page.waitForResponse((response) => response.url().includes(ReferralRulePage.CONFIG_API));
    await this.addNewRuleButton.click();
    await config;
    await expect(this.addProviderButton).toBeVisible();
  }

  /** The card of one provider in the Add Provider modal. Its checkbox is disabled once the provider has a rule. */
  providerCard(provider: string): Locator {
    return this.providerModal
      .locator('.card-providers')
      .filter({ has: this.page.getByRole('heading', { name: provider, exact: true }) });
  }

  /**
   * Adds every game category of the provider to the rule through the Add Provider modal.
   * Returns false, leaving the modal open, when the provider cannot be picked because it already has a rule.
   */
  async addProvider(provider: string): Promise<boolean> {
    await this.addProviderButton.click();

    // The modal's own search finds nothing for a name with brackets in it, so the card is picked from the full list.
    const checkboxes = this.providerCard(provider).getByRole('checkbox');
    await expect(checkboxes.first(), `${provider} is not in the Add Provider modal`).toBeAttached();

    // Several providers can share one name: the first one still without a rule is taken.
    // A card can show as free for a moment before the modal learns it has a rule, hence the retry.
    const checkbox = checkboxes.and(this.page.locator(':enabled')).first();
    let free = false;
    await expect(async () => {
      free = (await checkbox.count()) > 0;
      if (free) await this.tick(checkbox);
    }).toPass();
    if (!free) return false;

    await this.providerModal.getByRole('button', { name: 'Save' }).click();

    await expect(this.popup).toContainText('Confirm add Provider');
    await this.confirmButton.click();
    await expect(this.popup).toContainText('Add Provider Success');
    await this.confirmButton.click();
    await expect(this.providerModal).toBeHidden();
    return true;
  }

  /** Gives every game category added to the rule the same calculate type. Save does nothing while one is unset. */
  async setCalculateTypeForAllRows(calculateType: ReferralCalculateType) {
    await expect(this.calculateTypeSelects.first()).toBeVisible();

    for (const select of await this.calculateTypeSelects.all()) {
      await select.selectOption({ label: calculateType });
    }
  }

  /**
   * Gives the same rate to every referral level that takes one and returns those levels, counted from 1.
   * Levels switched off in the referral config stay disabled and keep 0.
   */
  async setRateForAllLevels(rate: string): Promise<number[]> {
    await expect(this.levelInputs.first()).toBeVisible();

    const levels: number[] = [];
    for (const [index, input] of (await this.levelInputs.all()).entries()) {
      if (await input.isDisabled()) continue;

      await input.fill(rate);
      levels.push(index + 1);
    }
    return levels;
  }

  /** Saves the form, confirms the popup and returns the create-rule API response. */
  async save(): Promise<Response> {
    await this.saveButton.click();
    await expect(this.popup).toContainText('Confirm Add New Referral Rule');

    const created = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(ReferralRulePage.RULE_API),
    );
    await this.confirmButton.click();
    return created;
  }

  /** The custom checkboxes sit behind their own styling, so the click is sent straight to the checkbox. */
  private async tick(checkbox: Locator) {
    if (!(await checkbox.isChecked())) await checkbox.dispatchEvent('click');
    await expect(checkbox).toBeChecked();
  }

  /** The rows of one provider in the rule list, one per game category. */
  ruleRows(provider: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: provider, exact: true }) });
  }

  /** The rate cell of one level, counted from 1, in a row of the rule list. */
  levelCell(row: Locator, level: number): Locator {
    return row.getByRole('cell').nth(ReferralRulePage.FIRST_LEVEL_COLUMN + level - 1);
  }
}
