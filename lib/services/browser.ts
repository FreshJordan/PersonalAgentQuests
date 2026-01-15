import { chromium, Browser, Page } from 'playwright';
import { BROWSER_CONFIG } from '../constants';

export class BrowserService {
  private browser: Browser | null = null;
  public page: Page | null = null;

  public async launch(headless = true): Promise<Page> {
    this.browser = await chromium.launch({ headless });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({
      width: BROWSER_CONFIG.viewportWidth,
      height: BROWSER_CONFIG.viewportHeight,
    });
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

  // Aliases for script-creator API compatibility
  public async init(): Promise<Page> {
    return this.launch(true);
  }

  public async navigate(url: string, timeout = 30000) {
    return this.goto(url, timeout);
  }

  public async screenshot(): Promise<string | null> {
    return this.captureScreenshot();
  }

  public async getUrl(): Promise<string> {
    if (!this.page) throw new Error('Browser not initialized');
    return this.page.url();
  }

  public async clickAtCoordinates(x: number, y: number) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.mouse.click(x, y);
  }

  public async typeText(text: string) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.keyboard.type(text);
  }

  public async pressKey(key: string) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.keyboard.press(key);
  }

  public async scroll(
    direction: 'up' | 'down',
    amount = BROWSER_CONFIG.scrollAmount
  ) {
    if (!this.page) throw new Error('Browser not initialized');
    const delta = direction === 'down' ? amount : -amount;
    await this.page.mouse.wheel(0, delta);
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
          // For iframes, use name/title attribute instead of (useless) fallback text
          let text: string;
          if (tag === 'iframe') {
            const iframeName = el.getAttribute('name') || '';
            const iframeTitle = el.getAttribute('title') || '';
            text = iframeTitle || iframeName || 'iframe';
          } else {
            text = (el.textContent || '').trim().slice(0, 50);
          }

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
   * Uses a multi-layered matching approach for reliability:
   * 1. Direct identifier match (data-testid, id, etc.)
   * 2. Text content containment (handles parent/child relationship)
   * 3. Semantic element group matching (handles tag variations)
   * 4. Nearby element search (handles small layout shifts)
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

    // IFRAME SPECIAL HANDLING: Iframes (payment forms) are inherently unreliable
    // for text-based verification since they contain fallback text or cross-origin content
    const isIframeInvolved =
      expected.tag === 'iframe' || actual.tag === 'iframe';
    if (isIframeInvolved) {
      // If either element is an iframe and the other is a form-related element,
      // consider it a match (handles label/input overlay cases)
      const formRelatedTags = [
        'input',
        'label',
        'span',
        'div',
        'iframe',
        'button',
      ];
      if (
        formRelatedTags.includes(actual.tag) &&
        formRelatedTags.includes(expected.tag)
      ) {
        return {
          matches: true,
          actual: `${actual.tag}: "${actual.text}"`,
          expected: `${expected.tag}: "${expected.text}"`,
        };
      }
    }

    // 1. IDENTIFIER MATCH: Strongest signal - data-testid, id, name, role
    if (
      actual.identifier &&
      expected.identifier &&
      actual.identifier === expected.identifier
    ) {
      return {
        matches: true,
        actual: `${actual.tag}: "${actual.text}"`,
        expected: `${expected.tag}: "${expected.text}"`,
      };
    }

    // 2. TEXT CONTAINMENT: Check if expected text is within actual (or vice versa)
    const actualTextLower = actual.text.toLowerCase().replace(/\s+/g, ' ');
    const expectedTextLower = expected.text.toLowerCase().replace(/\s+/g, ' ');

    // Normalize and check for meaningful text overlap
    const textContained =
      actualTextLower.includes(expectedTextLower) ||
      expectedTextLower.includes(actualTextLower);

    // If text is found within the element (even if it's a parent), it's likely correct
    if (textContained && expectedTextLower.length > 3) {
      return {
        matches: true,
        actual: `${actual.tag}: "${actual.text}"`,
        expected: `${expected.tag}: "${expected.text}"`,
      };
    }

    // 3. SEMANTIC TAG GROUPS: Tags in same semantic group are interchangeable
    // e.g., clicking an li or its parent ul/div, or a span inside a button
    const semanticGroups = [
      ['button', 'a', 'span', 'div'], // Clickable elements
      ['li', 'ul', 'ol', 'div', 'nav'], // List structures
      ['input', 'label', 'span', 'div', 'iframe'], // Form elements (iframe for payment forms)
      ['p', 'span', 'div', 'label'], // Text containers
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span'], // Headings
      ['td', 'tr', 'th', 'div'], // Table elements
      ['section', 'article', 'div', 'main'], // Structural elements
    ];

    const tagsInSameGroup = semanticGroups.some(
      (group) => group.includes(actual.tag) && group.includes(expected.tag)
    );

    // 4. FUZZY TEXT MATCH: Extract key words and check overlap
    const extractKeywords = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const actualKeywords = extractKeywords(actual.text);
    const expectedKeywords = extractKeywords(expected.text);

    // Count how many expected keywords appear in actual
    const matchingKeywords = expectedKeywords.filter((kw) =>
      actualKeywords.some((ak) => ak.includes(kw) || kw.includes(ak))
    );

    // If >50% of expected keywords match and tags are semantically related
    const keywordMatchRatio =
      expectedKeywords.length > 0
        ? matchingKeywords.length / expectedKeywords.length
        : 0;

    const semanticMatch = tagsInSameGroup && keywordMatchRatio >= 0.5;

    // Also check if at least half the keywords match regardless of tag
    // (handles cases where a div contains the same content as expected li)
    const strongTextMatch =
      keywordMatchRatio >= 0.5 && expectedKeywords.length >= 2;

    // 5. EXACT TAG + PARTIAL TEXT: Original strict check as fallback
    const tagMatches = actual.tag === expected.tag;
    const textMatches = textContained || actual.text === expected.text;
    const strictMatch = tagMatches && textMatches;

    const matches = strictMatch || semanticMatch || strongTextMatch;

    return {
      matches,
      actual: `${actual.tag}: "${actual.text}"`,
      expected: `${expected.tag}: "${expected.text}"`,
    };
  }

  /**
   * Advanced verification that also checks nearby elements and DOM hierarchy.
   * Useful when coordinates might hit a parent/child or nearby element.
   */
  public async verifyElementAtCoordinatesWithFallback(
    x: number,
    y: number,
    expected: { tag: string; text: string; identifier: string }
  ): Promise<{ matches: boolean; actual: string; expected: string }> {
    // First try exact coordinates
    const directResult = await this.verifyElementAtCoordinates(x, y, expected);
    if (directResult.matches) {
      return directResult;
    }

    // Check if expected element exists anywhere at these coordinates (including children)
    if (!this.page) {
      return directResult;
    }

    try {
      const foundInHierarchy = await this.page.evaluate(
        ({ x, y, expected }) => {
          const topElement = document.elementFromPoint(x, y);
          if (!topElement) return false;

          // Check all descendants for a match
          const checkElement = (el: Element): boolean => {
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim();
            const expectedTextLower = expected.text.toLowerCase();

            // Check if this element matches
            if (
              tag === expected.tag &&
              text.toLowerCase().includes(expectedTextLower)
            ) {
              return true;
            }
            return false;
          };

          // Check the element itself
          if (checkElement(topElement)) return true;

          // Check all descendants
          const descendants = topElement.querySelectorAll('*');
          for (const desc of descendants) {
            if (checkElement(desc)) return true;
          }

          // Check ancestors (up to 3 levels)
          let parent = topElement.parentElement;
          let depth = 0;
          while (parent && depth < 3) {
            if (checkElement(parent)) return true;
            parent = parent.parentElement;
            depth++;
          }

          return false;
        },
        { x, y, expected }
      );

      if (foundInHierarchy) {
        return {
          matches: true,
          actual: `${directResult.actual} (found in hierarchy)`,
          expected: `${expected.tag}: "${expected.text}"`,
        };
      }
    } catch {
      // Ignore errors and return original result
    }

    return directResult;
  }
}
