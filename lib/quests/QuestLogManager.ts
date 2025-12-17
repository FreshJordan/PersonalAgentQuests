import fs from 'fs';
import path from 'path';
import { QuestStep, QuestLog } from './types';

export class QuestLogManager {
  private static getLogDir(): string {
    const cwd = process.cwd();
    const baseDir = cwd.endsWith('personal-agent-quests')
      ? cwd
      : path.join(cwd, 'personal-agent-quests');

    const dir = path.join(baseDir, 'data', 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public static saveLog(log: QuestLog): void {
    const dir = this.getLogDir();
    const filename = `${log.timestamp.replace(/[:.]/g, '-')}-${
      log.questId
    }.json`;
    const filepath = path.join(dir, filename);

    // Simple summary generation logic
    let summary: any = {};
    const relevantSteps = log.steps.filter(
      (s) => s.type === 'click' || s.type === 'type_text'
    );

    const selections: string[] = [];

    for (const s of relevantSteps) {
      if (s.type === 'click') {
        let desc = s.description
          ?.replace('AI Action: click ', '')
          .replace(/"/g, '');
        // Clean up common selector patterns if description is raw selector
        if (desc?.includes('[data-testid=')) {
          // extract testid value
          const match = desc.match(/\[data-testid='(.+?)'\]/);
          if (match) desc = match[1];
        }

        if (
          desc &&
          !desc.includes('Continue') &&
          !desc.includes('Next') &&
          !desc.includes('Sign Up')
        ) {
          selections.push(`Clicked: ${desc}`);
        }
      } else if (
        s.type === 'type_text' &&
        s.params.text &&
        !s.params.text.includes('@')
      ) {
        selections.push(`Typed: ${s.params.text}`);
      }
    }

    summary = {
      selections: selections,
      email: log.steps.find(
        (s) =>
          // Check for common email formats in the parameters or description
          (s.params.text &&
            (s.params.text.includes('@hellofresh.ca') ||
              s.params.text.includes('@'))) ||
          (s.description &&
            (s.description.includes('@hellofresh.ca') ||
              s.description.includes('@')))
      )?.params.text,
    };

    // Append summary to the log object before saving
    // If summary is already provided (e.g. from AI extraction), use it.
    if (!log.summary) {
      log.summary = summary;
    }

    fs.writeFileSync(filepath, JSON.stringify(log, null, 2));
  }

  public static getLogs(): QuestLog[] {
    const dir = this.getLogDir();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        } catch (e) {
          return null;
        }
      })
      .filter((l): l is QuestLog => l !== null)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  public static getAverageSteps(questId: string): number {
    const logs = this.getLogs().filter(
      (l) => l.questId === questId && l.status === 'success'
    );
    if (logs.length === 0) return 0;

    const totalSteps = logs.reduce((sum, log) => sum + log.stepCount, 0);
    return Math.round(totalSteps / logs.length);
  }
}
