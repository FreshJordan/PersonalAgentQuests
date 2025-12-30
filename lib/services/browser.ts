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

  /**
   * Gets a comprehensive fingerprint of the current page state.
   * Detects: URL changes, title changes, visible text changes, focus changes, and input value changes.
   * Used ONLY for script validation, never sent to AI.
   */
  public async getAccessibilityFingerprint(): Promise<string> {
    if (!this.page) return '';
    try {
      const url = this.page.url();
      const title = await this.page.title();
      const visibleText = await this.page.innerText('body').catch(() => '');

      // Get focused element and form state via page.evaluate
      const dynamicState = await this.page.evaluate(() => {
        // Track focused element (using stable attributes only, not classNames which are often generated)
        const activeEl = document.activeElement;
        let focusedElement = 'none';
        if (activeEl && activeEl !== document.body) {
          const tag = activeEl.tagName.toLowerCase();
          const id = activeEl.id ? `#${activeEl.id}` : '';
          const name = activeEl.getAttribute('name')
            ? `[name="${activeEl.getAttribute('name')}"]`
            : '';
          const testId = activeEl.getAttribute('data-testid')
            ? `[data-testid="${activeEl.getAttribute('data-testid')}"]`
            : '';
          focusedElement = `${tag}${id}${name}${testId}`;
        }

        // Track input values (form state)
        const inputs = document.querySelectorAll(
          'input, textarea, select'
        ) as NodeListOf<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >;
        const inputStates: string[] = [];
        inputs.forEach((input, idx) => {
          const identifier = input.id || input.name || `idx${idx}`;
          if (input.type === 'checkbox' || input.type === 'radio') {
            inputStates.push(
              `${identifier}:${(input as HTMLInputElement).checked}`
            );
          } else {
            // Hash long values to keep fingerprint manageable
            const val = input.value || '';
            inputStates.push(
              `${identifier}:${val.length > 20 ? val.length : val}`
            );
          }
        });

        // Track selected options in dropdowns
        const selects = document.querySelectorAll(
          'select'
        ) as NodeListOf<HTMLSelectElement>;
        selects.forEach((select) => {
          const identifier = select.id || select.name || 'select';
          inputStates.push(`${identifier}:${select.value}`);
        });

        return {
          focusedElement,
          inputState: inputStates.join(','),
        };
      });

      // Combine all signals into fingerprint
      return this.hashString(
        `${url}|${title}|${dynamicState.focusedElement}|${dynamicState.inputState}|${visibleText}`
      );
    } catch {
      return '';
    }
  }

  /**
   * Simple fast hash for string comparison only.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Polls for accessibility tree changes within a timeout.
   * Returns true if the fingerprint changed, false if timeout reached.
   */
  public async waitForFingerprintChange(
    previousFingerprint: string,
    timeout: number
  ): Promise<boolean> {
    if (!this.page) return false;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const current = await this.getAccessibilityFingerprint();
      if (current !== previousFingerprint) return true;
      await this.page.waitForTimeout(200);
    }
    return false;
  }

  /**
   * Captures identifying information about the element at given coordinates.
   * Used to record what element the AI clicked, for replay validation.
   * Uses stable attributes only (id, name, data-testid, aria-label, role) - NOT className which is often generated.
   */
  public async getElementAtCoordinates(
    x: number,
    y: number
  ): Promise<{ tag: string; text: string; identifier: string } | null> {
    if (!this.page) return null;
    try {
      return await this.page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return null;

          const tag = el.tagName.toLowerCase();
          // Get visible text (truncated for storage)
          const text = (el.textContent || '').trim().slice(0, 50);

          // Build identifier from STABLE attributes only (not className which is often generated)
          const id = el.id ? `#${el.id}` : '';
          const name = el.getAttribute('name')
            ? `[name="${el.getAttribute('name')}"]`
            : '';
          const testId = el.getAttribute('data-testid')
            ? `[data-testid="${el.getAttribute('data-testid')}"]`
            : '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const role = el.getAttribute('role')
            ? `[role="${el.getAttribute('role')}"]`
            : '';

          return {
            tag,
            text: text || ariaLabel || tag,
            identifier: `${tag}${id}${name}${testId}${role}`,
          };
        },
        { x, y }
      );
    } catch {
      return null;
    }
  }

  /**
   * Checks if the element at coordinates matches the expected element.
   * Returns true if they match (same tag and similar text), false otherwise.
   */
  public async verifyElementAtCoordinates(
    x: number,
    y: number,
    expected: { tag: string; text: string; identifier: string }
  ): Promise<{ matches: boolean; actual: string; expected: string }> {
    const actual = await this.getElementAtCoordinates(x, y);
    if (!actual) {
      return {
        matches: false,
        actual: 'no element found',
        expected: `${expected.tag}: "${expected.text}"`,
      };
    }

    // Check if tags match
    const tagMatches = actual.tag === expected.tag;

    // Check if text is similar (contains expected text or vice versa)
    const actualTextLower = actual.text.toLowerCase();
    const expectedTextLower = expected.text.toLowerCase();
    const textMatches =
      actualTextLower.includes(expectedTextLower) ||
      expectedTextLower.includes(actualTextLower) ||
      actual.text === expected.text;

    // Consider it a match if tag matches AND (text matches OR identifier matches)
    const matches =
      tagMatches && (textMatches || actual.identifier === expected.identifier);

    return {
      matches,
      actual: `${actual.tag}: "${actual.text}"`,
      expected: `${expected.tag}: "${expected.text}"`,
    };
  }
}
