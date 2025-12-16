import fs from 'fs';
import path from 'path';
import { QuestScript, QuestStep } from './types';
import { QUESTS } from './definitions';

const SCRIPTS_DIR = path.join(
  process.cwd(),
  'personal-agent-quests',
  'lib',
  'quests',
  'scripts'
);

// Ensure directory exists
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

export class ScriptManager {
  static getScript(questId: string): QuestScript | null {
    const scriptPath = path.join(SCRIPTS_DIR, `${questId}.json`);
    if (fs.existsSync(scriptPath)) {
      try {
        const data = fs.readFileSync(scriptPath, 'utf-8');
        const script: QuestScript = JSON.parse(data);

        // Check for expiration
        if (script.expiresAt) {
          const now = new Date();
          const expiresAt = new Date(script.expiresAt);
          if (now > expiresAt) {
            console.log(`Script for ${questId} has expired. Deleting...`);
            fs.unlinkSync(scriptPath);
            return null;
          }
        }

        return script;
      } catch (e) {
        console.error(`Failed to read script for ${questId}`, e);
        return null;
      }
    }
    return null;
  }

  static saveScript(questId: string, script: QuestScript): void {
    const scriptPath = path.join(SCRIPTS_DIR, `${questId}.json`);

    // Determine expiration
    const questDef = QUESTS.find((q) => q.id === questId);
    const expirationDays = questDef?.scriptExpirationDays || 14; // Default to 14 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const scriptWithExpiration = {
      ...script,
      expiresAt: expiresAt.toISOString(),
    };

    fs.writeFileSync(scriptPath, JSON.stringify(scriptWithExpiration, null, 2));
  }

  static convertToolActionsToSteps(actions: any[]): QuestStep[] {
    return actions.map((action) => ({
      type: action.name,
      params: action.input,
      description: `Executed ${action.name}`,
      timestamp: new Date().toISOString(),
      status: 'success',
    }));
  }
}
