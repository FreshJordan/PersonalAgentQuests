import fs from 'fs';
import path from 'path';
import { QuestDefinition } from './types';

const getProjectRoot = () => {
  const cwd = process.cwd();
  if (cwd.endsWith('personal-agent-quests')) {
    return cwd;
  }
  return path.join(cwd, 'personal-agent-quests');
};

const DEFINITIONS_FILE = path.join(
  getProjectRoot(),
  'data',
  'quest-definitions.json'
);

interface SavedDefinitions {
  quests: QuestDefinition[];
  lastUpdated: string;
}

/**
 * Manages quest definitions stored in quest-definitions.json.
 * This is the single source of truth for all quest definitions.
 */
export class QuestDefinitionManager {
  /**
   * Get all quest definitions from the JSON file
   */
  static getAllDefinitions(): QuestDefinition[] {
    try {
      if (fs.existsSync(DEFINITIONS_FILE)) {
        const data = fs.readFileSync(DEFINITIONS_FILE, 'utf-8');
        const parsed: SavedDefinitions = JSON.parse(data);
        return parsed.quests || [];
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to read quest definitions:', e);
    }
    return [];
  }

  /**
   * Save a new quest definition (or update existing)
   */
  static saveDefinition(definition: QuestDefinition): void {
    // Ensure data directory exists
    const dataDir = path.dirname(DEFINITIONS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const existing = this.getAllDefinitions();

    // Check if this definition already exists
    const existingIndex = existing.findIndex((q) => q.id === definition.id);

    if (existingIndex >= 0) {
      // Update existing
      existing[existingIndex] = definition;
    } else {
      // Add new
      existing.push(definition);
    }

    const toSave: SavedDefinitions = {
      quests: existing,
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(DEFINITIONS_FILE, JSON.stringify(toSave, null, 2));
  }

  /**
   * Delete a quest definition
   */
  static deleteDefinition(questId: string): boolean {
    const existing = this.getAllDefinitions();
    const filtered = existing.filter((q) => q.id !== questId);

    if (filtered.length === existing.length) {
      return false; // Nothing was deleted
    }

    const toSave: SavedDefinitions = {
      quests: filtered,
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(DEFINITIONS_FILE, JSON.stringify(toSave, null, 2));
    return true;
  }

  /**
   * Check if a quest definition exists
   */
  static definitionExists(questId: string): boolean {
    return this.getAllDefinitions().some((q) => q.id === questId);
  }

  /**
   * Get a specific quest definition by ID
   */
  static getDefinition(questId: string): QuestDefinition | null {
    return this.getAllDefinitions().find((q) => q.id === questId) || null;
  }
}
