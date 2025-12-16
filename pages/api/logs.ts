import type { NextApiRequest, NextApiResponse } from 'next';
import { QuestLogManager } from '../../lib/quests/QuestLogManager';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const logs = QuestLogManager.getLogs();
    res.status(200).json({ logs });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
