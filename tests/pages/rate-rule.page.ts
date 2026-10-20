import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { BO_BASE_URL } from './bo-env';

/** Rebate and cashback rules share one form; only the wording and the URL differ. */
export type RateRuleKind = 'rebate' | 'cashback';

export interface TurnoverTier {
  minAmount: string;
  maxAmount: string;
  rate: string;
}

export class RateRulePage {
  static readonly MEMBER_STATUSES = ['New Member', 'Updated Member', 'Verified Member'];

  readonly url: string;
  readonly ruleApi: string;

  readonly searchButton: Locator;
  readonly addNewRuleButton: Locator;
  readonly addProviderButton: Locator;
  readonly providerModal: Locator;
  readonly memberLevelCells: Locator;
  readonly minAmountInput: Locator;
  readonly maxAmountInput: Locator;
  readonly rateInput: Locator;
  readonly saveButton: Locator;
  readonly popup: Locator;
  readonly confirmButton: Locator;

  constructor(
    readonly page: Page,
    readonly kind: RateRuleKind,
  ) {
    this.url = `${BO_BASE_URL}/${kind}/rule`;
    this.ruleApi = `/bo/${kind}-rule`;

    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.addNewRuleButton = page.getByRole('button', { name: 'Add New Rule' });
    this.addProviderButton = page.getByRole('button', { name: 'Add Provider' });
    this.providerModal = page.locator('#modal-add-rule-providers');
    this.memberLevelCells = page.locator('#member-table td');
    this.minAmountInput = page.getByPlaceholder('Enter Min Amount');
    this.maxAmountInput = page.getByPlaceholder('Enter Max Amount');
    this.rateInput = page.getByPlaceholder(kind === 'rebate' ? 'Enter Rebate Rate' : 'Enter Cashback Rate');
    // The provider modal has a Save button too, so this one is scoped to the page footer by exact name.
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.popup = page.locator('.swal2-popup');
    this.confirmButton = this.popup.getByRole('button', { name: 'OK' });
  }

  async goto() {
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded' });
  }

  /** The rule list stays empty until Search is clicked. */
  async search() {
    await this.searchButton.click();
    await expect(this.page.getByRole('row').nth(1)).toBeVisible();
  }

  async openAddForm() {
    await this.addNewRuleButton.click();
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

  async checkMemberStatuses(statuses: string[] = RateRulePage.MEMBER_STATUSES) {
    for (const status of statuses) {
      await this.tick(this.page.getByRole('checkbox', { name: status, exact: true }));
    }
  }

  /** Ticks every member level and gives each the same rate. */
  async setRateForAllMemberLevels(rate: string) {
    await expect(this.memberLevelCells.first()).toBeVisible();

    for (const cell of await this.memberLevelCells.all()) {
      await this.tick(cell.getByRole('checkbox'));
      await cell.getByRole('textbox').fill(rate);
    }
  }

  async setTurnoverTier(tier: TurnoverTier) {
    await this.minAmountInput.fill(tier.minAmount);
    await this.maxAmountInput.fill(tier.maxAmount);
    await this.rateInput.fill(tier.rate);
  }

  /** Saves the form, confirms the popup and returns the create-rule API response. */
  async save(): Promise<Response> {
    await this.saveButton.click();
    await expect(this.popup).toContainText(`Confirm add new ${this.kind} rule`);

    const created = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(this.ruleApi),
    );
    await this.confirmButton.click();
    return created;
  }

  /**
   * The custom checkboxes sit behind their own styling, and the sticky Save bar covers some of them,
   * so a mouse click never reaches them: the click is sent straight to the checkbox instead.
   */
  private async tick(checkbox: Locator) {
    if (!(await checkbox.isChecked())) await checkbox.dispatchEvent('click');
    await expect(checkbox).toBeChecked();
  }

  /** The rows of one provider in the rule list, one per game category. */
  ruleRows(provider: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: provider, exact: true }) });
  }
}
