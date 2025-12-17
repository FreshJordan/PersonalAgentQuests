import fs from 'fs';
import path from 'path';

type SelectorData = {
  [url: string]: string[];
};

export class KnowledgeBase {
  private static getFilePath(): string {
    // Determine the base path based on environment or fallback to process.cwd()
    // In a Next.js API route, process.cwd() is usually the project root.
    const cwd = process.cwd();
    const baseDir = cwd.endsWith('personal-agent-quests')
      ? cwd
      : path.join(cwd, 'personal-agent-quests');

    return path.join(baseDir, 'data', 'selector-knowledge.json');
  }

  private static load(): SelectorData {
    const fp = this.getFilePath();
    if (!fs.existsSync(fp)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch (e) {
      console.error('Failed to load knowledge base:', e);
      return {};
    }
  }

  public static getProvenSelectors(url: string): string[] {
    const data = this.load();
    // Simple exact match for now, could be improved with regex/partial matching
    // We strip query params to match the page broadly
    const cleanUrl = url.split('?')[0];
    return data[cleanUrl] || [];
  }

  public static learn(url: string, selector: string) {
    if (!selector) return;

    const data = this.load();
    const cleanUrl = url.split('?')[0];

    if (!data[cleanUrl]) {
      data[cleanUrl] = [];
    }

    // Avoid duplicates
    if (!data[cleanUrl].includes(selector)) {
      data[cleanUrl].push(selector);

      // Ensure directory exists
      const dir = path.dirname(this.getFilePath());
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      try {
        fs.writeFileSync(this.getFilePath(), JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to save knowledge base:', e);
      }
    }
  }
}
