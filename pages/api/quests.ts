import type { NextApiRequest, NextApiResponse } from 'next';
import { QuestDefinitionManager } from '../../lib/quests/QuestDefinitionManager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const quests = QuestDefinitionManager.getAllDefinitions();
      return res.json({ quests });
    } catch (error) {
      console.error('Failed to fetch quests:', error);
      return res.status(500).json({ error: 'Failed to fetch quests' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
