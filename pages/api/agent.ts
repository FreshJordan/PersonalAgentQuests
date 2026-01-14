import type { NextApiRequest, NextApiResponse } from 'next';
import { HybridQuestRunner } from '../../lib/quests/HybridQuestRunner';
import { JiraQuestRunner } from '../../lib/quests/JiraQuestRunner';
import { FACTOR75_LOGIN_QUEST_ID } from '../../lib/quests/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    query,
    questId,
    userInput,
    selectedTickets,
    followUpMessage,
    clarificationsEnabled,
  } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (res.flush) {
      res.flush();
    }
  };

  const eventHandler = (event: any) => {
    if (event.type === 'log') {
      sendEvent('log', { message: event.message });
    } else if (event.type === 'screenshot') {
      sendEvent('screenshot', { image: event.image });
    } else if (event.type === 'url_update') {
      sendEvent('url_update', { url: event.url });
    } else if (event.type === 'ticket_list') {
      sendEvent('ticket_list', { tickets: event.tickets });
    } else if (event.type === 'token_usage') {
      sendEvent('token_usage', {
        input: event.input,
        output: event.output,
      });
    } else if (event.type === 'clarification_request') {
      sendEvent('clarification_request', { question: event.question });
    } else if (event.type === 'result') {
      sendEvent('result', { text: event.text });
    } else if (event.type === 'error') {
      sendEvent('error', { message: event.message });
    } else if (event.type === 'done') {
      sendEvent('done', {});
      res.end();
    }
  };

  if (questId === 'jira-ticket-research') {
    const runner = new JiraQuestRunner(
      eventHandler,
      clarificationsEnabled || false
    );
    if (followUpMessage && selectedTickets) {
      await runner.handleFollowUp(followUpMessage, selectedTickets);
    } else if (selectedTickets) {
      await runner.researchTickets(selectedTickets);
    } else {
      await runner.run(userInput);
    }
    return;
  }

  // Use the ID constant for Factor75, but in a real app this would come from params
  const runner = new HybridQuestRunner(eventHandler, 100); // Increased max steps to 60 for long funnels

  await runner.run(questId || FACTOR75_LOGIN_QUEST_ID, query);
}
