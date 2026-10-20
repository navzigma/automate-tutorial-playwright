import { expect, type Locator, type Page, type Response } from '@playwright/test';

export interface PlayQuest {
  name: string;
  provider: string;
  calculateType: string;
  minimumBet: string;
  betTimes: string;
  accumulateBet: string;
  promotionCount: string;
  rewardType: string;
  receivingReward: string;
  iconReward: string;
  backgroundReward: string;
}

export interface QuestLanguage {
  language: string;
  title: string;
  content: string;
  desktopThumbnail: string;
  mobileThumbnail: string;
}

export class QuestPage {
  static readonly QUEST_API = '/bo/quest-management';
  static readonly ARTICLE_API = '/bo/quest-articles';

  readonly addNewQuestButton: Locator;
  readonly questNameInput: Locator;
  readonly questTypeSelect: Locator;
  readonly gameTypeSelect: Locator;
  readonly gameCategoryGroup: Locator;
  readonly providerGroup: Locator;
  readonly memberLevelGroup: Locator;
  readonly uploadCells: Locator;
  readonly createButton: Locator;
  readonly addLanguageButton: Locator;
  readonly languageModal: Locator;
  readonly popup: Locator;
  readonly popupOkButton: Locator;

  constructor(readonly page: Page) {
    this.addNewQuestButton = page.getByRole('button', { name: 'Add New Quest' });
    this.questNameInput = page.locator('#input-quest-name');
    this.questTypeSelect = page.locator('#input-quest-type');
    this.gameTypeSelect = page.locator('#input-game_type');
    this.gameCategoryGroup = page.locator('#input-group-game_category');
    this.providerGroup = page.locator('#input-group-game_provider');
    this.memberLevelGroup = page.locator('#input-group-member-level');
    this.uploadCells = page.locator('#input-group-upload-image .col-md-4');
    this.createButton = page.getByRole('button', { name: 'Create', exact: true });
    this.addLanguageButton = page.getByRole('button', { name: 'Add Language' });
    this.languageModal = page.locator('#modal-add-language-setting');
    this.popup = page.locator('.swal2-popup');
    this.popupOkButton = this.popup.getByRole('button', { name: 'OK' });
  }

  async openAddForm() {
    await this.addNewQuestButton.click();
    await expect(this.page).toHaveURL(/\/quest\/management\/add-new-quest$/);
  }

  /** Fills the whole Add New Quest form for a Play Quest on Category + Provider. */
  async fill(quest: PlayQuest) {
    await this.questTypeSelect.selectOption({ label: 'Play Quests' });
    await this.gameTypeSelect.selectOption({ label: 'Category + Provider' });
    // Picking the quest type clears the name, so the name goes in after it.
    await this.questNameInput.fill(quest.name);

    await this.pick(this.gameCategoryGroup, this.selectAllCheckbox(this.gameCategoryGroup));
    await this.pickProvider(quest.provider);
    await this.pick(this.memberLevelGroup, this.selectAllCheckbox(this.memberLevelGroup));

    await this.page.locator('#input-calculate_type').selectOption({ label: quest.calculateType });
    await this.page.locator('#input-minimum_bet').fill(quest.minimumBet);
    await this.page.locator('#input-bet_time').fill(quest.betTimes);
    await this.page.locator('#input-accumulate_bet').fill(quest.accumulateBet);
    await this.page.locator('#input-promotion_count').selectOption({ label: quest.promotionCount });
    await this.page.locator('#input-reward_type').selectOption({ label: quest.rewardType });
    await this.page.locator('#input-receiving_reward').fill(quest.receivingReward);

    await this.uploadCells.filter({ hasText: 'Upload Icon Reward' }).locator('input[type=file]').setInputFiles(quest.iconReward);
    await this.uploadCells.filter({ hasText: 'Upload Background Reward' }).locator('input[type=file]').setInputFiles(quest.backgroundReward);
  }

  /**
   * Ticks the provider. The list greys out a provider it will not take,
   * and the test is to stop there at once rather than create a quest without it.
   */
  private async pickProvider(provider: string) {
    const row = this.providerGroup
      .locator('.bv-no-focus-ring > div')
      .filter({ has: this.page.getByText(provider, { exact: true }) });
    const checkbox = row.locator('input[type=checkbox]').first();
    await expect(checkbox, `${provider} is not in the Quest provider list`).toBeAttached();
    await expect(checkbox, `${provider} is disabled in the Quest provider list`).toBeEnabled({ timeout: 1_000 });

    await this.pick(this.providerGroup, checkbox);
    await expect(this.providerGroup.locator('.dropdown-toggle')).toContainText(provider);
  }

  /** Creates the quest, confirms and returns the create-quest API response. The Success popup is left open. */
  async create(): Promise<Response> {
    await this.createButton.click();
    await expect(this.popup).toContainText('Confirm Add New Quest');

    const created = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(QuestPage.QUEST_API),
    );
    await this.popupOkButton.click();
    return created;
  }

  /** Clicks OK on a Success popup carrying the given message. */
  async acknowledgeSuccess(message: string) {
    await expect(this.popup).toContainText('Success');
    await expect(this.popup).toContainText(message);
    await this.popupOkButton.click();
    await expect(this.popup).toBeHidden();
  }

  /** Adds one language to the quest from its edit page. The Success popup is left open. */
  async addLanguage(language: QuestLanguage): Promise<Response> {
    await this.addLanguageButton.click();
    await expect(this.languageModal).toBeVisible();

    await this.languageModal.locator('#input-language').selectOption({ label: language.language });
    await this.languageModal.locator('#input-title').fill(language.title);
    await this.languageModal.locator('.ck-editor__editable').click();
    await this.page.keyboard.type(language.content);
    await this.imageInput('Desktop Thumbnail').setInputFiles(language.desktopThumbnail);
    await this.imageInput('Mobile Thumbnail').setInputFiles(language.mobileThumbnail);

    await this.languageModal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.popup).toContainText('Confirm Add New Language');

    const saved = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(QuestPage.ARTICLE_API),
    );
    await this.popupOkButton.click();
    return saved;
  }

  /** The rows of the language table on the quest edit page. */
  languageRows(language: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: language, exact: true }) });
  }

  /** Each image field of the language modal is a bold label followed by its file input. */
  private imageInput(label: string): Locator {
    return this.languageModal
      .locator('label.font-weight-bold', { hasText: label })
      .locator('xpath=following::input[@type="file"][1]');
  }

  private selectAllCheckbox(group: Locator): Locator {
    return group
      .locator('div.mt-2')
      .filter({ has: this.page.locator('strong', { hasText: 'Select All' }) })
      .locator('input[type=checkbox]');
  }

  /**
   * Opens a checkbox dropdown, ticks one box and closes it again. The boxes sit behind
   * zero-size custom labels, so the click is sent straight to the checkbox.
   */
  private async pick(group: Locator, checkbox: Locator) {
    const toggle = group.locator('.dropdown-toggle');
    // The options load after the field before it is set; Select All on an empty list selects nothing.
    await expect(toggle).toBeEnabled();
    await expect(group.locator('.bv-no-focus-ring input[type=checkbox]').first()).toBeAttached();

    await toggle.click();
    if (!(await checkbox.isChecked())) await checkbox.dispatchEvent('click');
    await expect(checkbox).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toContainText('--- Select');
  }
}
