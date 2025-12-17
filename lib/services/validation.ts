import { StepValidation } from '../quests/types';
import { Page } from 'playwright';

export class ValidationService {
  constructor(private page: Page | null) {}

  public async validateCondition(validation: StepValidation): Promise<boolean> {
    if (!this.page) return false;
    const timeout = validation.timeout || 5000;

    try {
      switch (validation.type) {
        case 'url_contains':
          await this.page.waitForURL((url) => url.toString().includes(validation.value), { timeout });
          break;
        case 'element_visible':
          await this.page.waitForSelector(validation.value, { state: 'visible', timeout });
          break;
        case 'element_hidden':
          await this.page.waitForSelector(validation.value, { state: 'hidden', timeout });
          break;
        case 'text_present':
          await this.page.waitForSelector(`text=${validation.value}`, { timeout });
          break;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
}

