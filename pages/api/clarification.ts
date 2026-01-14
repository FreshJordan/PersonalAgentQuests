import type { NextApiRequest, NextApiResponse } from 'next';
import { MCPManager } from '../../lib/services/mcp-manager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { questionId, answer } = req.body;

  if (!questionId || !answer) {
    return res.status(400).json({ error: 'questionId and answer are required' });
  }

  try {
    // Create MCPManager to submit the answer
    const workspaceRoot = process.cwd();
    const mcpManager = new MCPManager(workspaceRoot);

    await mcpManager.submitAnswer(questionId, answer);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error submitting clarification answer:', error);
    return res.status(500).json({
      error: 'Failed to submit answer',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
