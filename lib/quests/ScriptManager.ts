import fs from 'fs';
import path from 'path';
import { QuestScript, QuestStep } from './types';
import { QuestDefinitionManager } from './QuestDefinitionManager';

const getProjectRoot = () => {
  const cwd = process.cwd();
  if (cwd.endsWith('personal-agent-quests')) {
    return cwd;
  }
  return path.join(cwd, 'personal-agent-quests');
};

const SCRIPTS_DIR = path.join(getProjectRoot(), 'data', 'scripts');

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
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
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
