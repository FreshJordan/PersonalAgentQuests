import { QuestLog } from './quests/types';

export async function fetchQuestLogs(): Promise<QuestLog[]> {
  try {
    const res = await fetch('/api/logs');
    if (!res.ok) {
      throw new Error(`Failed to fetch logs: ${res.status}`);
    }
    const data = await res.json();
    return data.logs || [];
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
}

