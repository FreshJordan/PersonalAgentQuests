// Tool definitions for the LLM
export const BROWSER_TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate the browser to a specific URL',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (e.g., https://www.google.com)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into an input field',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description:
            "CSS selector for the input element (e.g., 'textarea[name=q]')",
        },
        iframe_selector: {
          type: 'string',
          description:
            'Optional: CSS selector for the iframe containing the element (e.g., \'iframe[title="secure-payment"]\')',
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'click',
    description: 'Click an element on the page',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        iframe_selector: {
          type: 'string',
          description:
            'Optional: CSS selector for the iframe containing the element',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a specific key (like Enter)',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: "Key to press (e.g., 'Enter')",
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'random_wait',
    description:
      'Wait for a random amount of time (useful for simulating human behavior)',
    input_schema: {
      type: 'object',
      properties: {
        min: {
          type: 'number',
          description: 'Minimum wait time in milliseconds (default: 500)',
        },
        max: {
          type: 'number',
          description: 'Maximum wait time in milliseconds (default: 2000)',
        },
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
  | { type: 'error'; message: string }
  | { type: 'done' };
