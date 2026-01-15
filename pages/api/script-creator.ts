import type { NextApiRequest, NextApiResponse } from 'next';
import { BrowserService } from '../../lib/services/browser';
import { ScriptManager } from '../../lib/quests/ScriptManager';
import { QuestDefinitionManager } from '../../lib/quests/QuestDefinitionManager';
import { QuestScript } from '../../lib/quests/types';
import { QuestDefinition } from '../../lib/quests/types';

// Keep browser instance for the recording session
let browserService: BrowserService | null = null;

interface ActionRequest {
  action:
    | 'start'
    | 'stop'
    | 'click'
    | 'type_text'
    | 'press_key'
    | 'scroll'
    | 'wait'
    | 'navigate'
    | 'save';
  url?: string;
  x?: number;
  y?: number;
  description?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down';
  duration?: number;
  script?: QuestScript;
  definition?: QuestDefinition;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as ActionRequest;

  try {
    switch (body.action) {
      case 'start': {
        if (!body.url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        // Close any existing session
        if (browserService) {
          await browserService.close();
          browserService = null;
        }

        // Start new browser session
        browserService = new BrowserService();
        await browserService.init();
        await browserService.navigate(body.url);

        // Small delay for page load
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const screenshot = await browserService.screenshot();
        const currentUrl = await browserService.getUrl();

        return res.json({
          success: true,
          screenshot,
          url: currentUrl,
        });
      }

      case 'stop': {
        if (browserService) {
          await browserService.close();
          browserService = null;
        }
        return res.json({ success: true });
      }

      case 'click': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        const { x, y } = body;
        if (x === undefined || y === undefined) {
          return res
            .status(400)
            .json({ error: 'x and y coordinates required' });
        }

        // Get element info before click (for recording purposes)
        const elementInfo = await browserService.getElementAtCoordinates(x, y);
        const urlBefore = await browserService.getUrl();

        // Perform the click
        await browserService.clickAtCoordinates(x, y);

        // Wait for any navigation or DOM changes
        await new Promise((resolve) => setTimeout(resolve, 500));

        const urlAfter = await browserService.getUrl();
        const screenshot = await browserService.screenshot();

        // Determine what changed
        let detectedChange: 'url' | 'dom' | 'none' = 'none';
        if (urlBefore !== urlAfter) {
          detectedChange = 'url';
        } else {
          // Could add more sophisticated DOM change detection here
          detectedChange = 'dom';
        }

        return res.json({
          success: true,
          screenshot,
          url: urlAfter,
          targetElement: elementInfo,
          detectedChange,
          expectedChange: detectedChange,
          expectedElement: elementInfo,
        });
      }

      case 'type_text': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        if (!body.text) {
          return res.status(400).json({ error: 'Text is required' });
        }

        await browserService.typeText(body.text);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const screenshot = await browserService.screenshot();
        const url = await browserService.getUrl();

        return res.json({ success: true, screenshot, url });
      }

      case 'press_key': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        if (!body.key) {
          return res.status(400).json({ error: 'Key is required' });
        }

        await browserService.pressKey(body.key);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const screenshot = await browserService.screenshot();
        const url = await browserService.getUrl();

        return res.json({ success: true, screenshot, url });
      }

      case 'scroll': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        const direction = body.direction || 'down';
        await browserService.scroll(direction);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const screenshot = await browserService.screenshot();
        const url = await browserService.getUrl();

        return res.json({ success: true, screenshot, url });
      }

      case 'wait': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        const duration = body.duration || 1000;
        await new Promise((resolve) => setTimeout(resolve, duration));

        const screenshot = await browserService.screenshot();
        const url = await browserService.getUrl();

        return res.json({ success: true, screenshot, url });
      }

      case 'navigate': {
        if (!browserService) {
          return res.status(400).json({ error: 'No active browser session' });
        }

        if (!body.url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        await browserService.navigate(body.url);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const screenshot = await browserService.screenshot();
        const url = await browserService.getUrl();

        return res.json({ success: true, screenshot, url });
      }

      case 'save': {
        if (!body.definition) {
          return res
            .status(400)
            .json({ error: 'Quest definition is required' });
        }

        // Save the quest definition
        QuestDefinitionManager.saveDefinition(body.definition);

        // If a script is provided, save it directly
        // Note: The HybridQuestRunner automatically adds 2-second waits between steps during execution
        if (body.script && body.script.steps.length > 0) {
          ScriptManager.saveScript(body.script.id, body.script);
        }

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Script creator API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
