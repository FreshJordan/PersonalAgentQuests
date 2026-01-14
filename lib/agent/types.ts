// Tool definitions for the LLM (descriptions kept concise to reduce token usage)
export const BROWSER_TOOLS = [
  {
    name: 'navigate',
    description: 'Go to a URL',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'type_text',
    description:
      'Type text. If selector omitted, types into currently focused element.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector (optional if element already focused)',
        },
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'click_at_coordinates',
    description: 'PREFERRED: Click at x,y coordinates (viewport: 1024x768)',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coord (0-1024)' },
        y: { type: 'number', description: 'Y coord (0-768)' },
        description: { type: 'string', description: 'What you are clicking' },
      },
      required: ['x', 'y', 'description'],
    },
  },
  {
    name: 'click',
    description:
      'FALLBACK: Click via CSS selector (use only if coordinates fail)',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page (default: half viewport = 384px)',
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Scroll direction',
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default: 384 = half viewport)',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a key (Enter, Tab, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name' },
      },
      required: ['key'],
    },
  },
  {
    name: 'random_wait',
    description: 'Wait randomly between min-max ms',
    input_schema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Min ms (default: 500)' },
        max: { type: 'number', description: 'Max ms (default: 2000)' },
      },
      required: [],
    },
  },
];

export type Message = {
  role: string;
  content: any[];
};

export type AgentEvent =
  | { type: 'log'; message: string }
  | { type: 'screenshot'; image: string }
  | { type: 'url_update'; url: string } // NEW: update url
  | { type: 'result'; text: string }
  | {
      type: 'ticket_list';
      tickets: { key: string; summary: string; description?: string | null }[];
    } // NEW: ticket selection
  | { type: 'token_usage'; input: number; output: number } // NEW: token usage
  | { type: 'clarification_request'; question: any } // NEW: clarification question
  | { type: 'error'; message: string }
  | { type: 'done' };
