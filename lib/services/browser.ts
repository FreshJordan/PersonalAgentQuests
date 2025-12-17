import { chromium, Browser, Page } from 'playwright';

export class BrowserService {
  private browser: Browser | null = null;
  public page: Page | null = null;

  public async launch(headless = true): Promise<Page> {
    this.browser = await chromium.launch({ headless });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1024, height: 768 });
    return this.page;
  }

  public async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  public async captureScreenshot(): Promise<string | null> {
    if (!this.page) return null;
    try {
      const buffer = await this.page.screenshot({ type: 'jpeg', quality: 60 });
      return buffer.toString('base64');
    } catch (e) {
      return null;
    }
  }

  public async goto(url: string, timeout = 30000) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  }

  // Add other common actions here to keep Playwright abstracted
}
