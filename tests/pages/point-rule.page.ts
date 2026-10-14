import { type Locator, type Page, type Response } from '@playwright/test';

export interface PointRuleData {
  gameCategory: string;
  status: 'Active' | 'Inactive';
  /** Turnover a member needs for 1 point. */
  turnover: string;
}

export class PointRulePage {
  static readonly URL = 'https://dev-manage.nonprod-lux.com/point/rule';
  static readonly RULE_API = '/bo/point-rule';
  static readonly GAME_CATEGORY_API = '/bo/info/game-category-provider?provider_id=';

  readonly addRuleButton: Locator;
  readonly providerSelect: Locator;
  readonly gameCategorySelect: Locator;
  readonly pointStatusSelect: Locator;
  readonly turnoverInput: Locator;
  readonly saveButton: Locator;
  readonly confirmButton: Locator;

  constructor(readonly page: Page) {
    this.addRuleButton = page.getByRole('button', { name: 'Add Rule' });
    // Each field's wrapper carries the same id as the field itself, hence the tag in front.
    this.providerSelect = page.locator('select#input-provider');
    this.gameCategorySelect = page.locator('select#input-game-category');
    this.pointStatusSelect = page.locator('select#input-point-status');
    this.turnoverInput = page.locator('input#input-point-turnover');
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.confirmButton = page.getByRole('dialog').getByRole('button', { name: 'OK' });
  }

  async goto() {
    await this.page.goto(PointRulePage.URL, { waitUntil: 'domcontentloaded' });
  }

  /** Opens the add form, picks the provider and returns the game categories that provider has. */
  async startRule(provider: string): Promise<string[]> {
    await this.addRuleButton.click();

    const categories = this.page.waitForResponse((response) => response.url().includes(PointRulePage.GAME_CATEGORY_API));
    await this.providerSelect.selectOption({ label: provider });

    const body: { game_category_name: string }[] = await (await categories).json();
    return body.map((category) => category.game_category_name);
  }

  async fill(rule: PointRuleData) {
    await this.gameCategorySelect.selectOption({ label: rule.gameCategory });
    await this.pointStatusSelect.selectOption({ label: rule.status });
    await this.turnoverInput.fill(rule.turnover);
  }

  /** Saves the form, confirms the popup and returns the create-rule API response. */
  async save(): Promise<Response> {
    await this.saveButton.click();

    const created = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(PointRulePage.RULE_API),
    );
    await this.confirmButton.click();
    return created;
  }

  /** The row of one rule in the rule list. */
  ruleRow(provider: string, gameCategory: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name: provider, exact: true }) })
      .filter({ has: this.page.getByRole('cell', { name: gameCategory, exact: true }) });
  }
}
