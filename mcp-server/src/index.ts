#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path for communication files
// Use environment variable if provided, otherwise default to PersonalAgentQuests/.agent-questions
const QUESTIONS_DIR = process.env.QUESTION_DIR
  ? path.isAbsolute(process.env.QUESTION_DIR)
    ? process.env.QUESTION_DIR
    : path.resolve(process.cwd(), process.env.QUESTION_DIR)
  : path.resolve(__dirname, '..', '..', '.agent-questions');

interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  context?: string;
  timestamp: number;
}

interface ClarificationAnswer {
  id: string;
  answer: string;
  timestamp: number;
}

/**
 * MCP Server for Personal Agent Quests
 * Provides tools for agents to ask clarifying questions during execution
 */
class ClarificationMCPServer {
  private server: Server;
  private questionCounter = 0;

  constructor() {
    this.server = new Server(
      {
        name: 'personal-agent-quests-clarification',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();

    // Ensure questions directory exists
    if (!fs.existsSync(QUESTIONS_DIR)) {
      fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'ask_clarification',
          description:
            "Ask the user a clarifying question and wait for their response. Use this when requirements are ambiguous or multiple valid approaches exist. Returns the user's answer.",
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The clarifying question to ask the user',
              },
              options: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Optional: Multiple choice options for the user to select from, always include one option allowing the user to defer to AI when they are unsure',
              },
              context: {
                type: 'string',
                description:
                  'Optional: Additional context about why this clarification is needed',
              },
            },
            required: ['question'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'ask_clarification') {
        return await this.handleAskClarification(request.params.arguments);
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  private async handleAskClarification(args: any): Promise<any> {
    const { question, options, context } = args;

    if (!question || typeof question !== 'string') {
      throw new Error('Question is required and must be a string');
    }

    this.questionCounter++;
    const questionId = `q${Date.now()}_${this.questionCounter}`;

    const clarificationQuestion: ClarificationQuestion = {
      id: questionId,
      question,
      options: options || undefined,
      context: context || undefined,
      timestamp: Date.now(),
    };

    // Write question to file for the main app to pick up
    const questionFile = path.join(QUESTIONS_DIR, `${questionId}.json`);
    fs.writeFileSync(
      questionFile,
      JSON.stringify(clarificationQuestion, null, 2)
    );

    console.error(
      `[MCP] Question asked (${questionId}): ${question.substring(0, 50)}...`
    );

    // Wait for answer file to appear
    const answerFile = path.join(QUESTIONS_DIR, `${questionId}_answer.json`);
    const answer = await this.waitForAnswer(answerFile, 300000); // 5 minute timeout

    // Cleanup question file
    try {
      fs.unlinkSync(questionFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return {
      content: [
        {
          type: 'text',
          text: `User's answer: ${answer}`,
        },
      ],
    };
  }

  private async waitForAnswer(
    answerFile: string,
    timeoutMs: number
  ): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    while (Date.now() - startTime < timeoutMs) {
      if (fs.existsSync(answerFile)) {
        try {
          const content = fs.readFileSync(answerFile, 'utf-8');
          const answerData: ClarificationAnswer = JSON.parse(content);

          // Cleanup answer file
          try {
            fs.unlinkSync(answerFile);
          } catch (e) {
            // Ignore cleanup errors
          }

          console.error(`[MCP] Answer received: ${answerData.answer}`);
          return answerData.answer;
        } catch (e) {
          // File might not be fully written yet, wait and retry
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      'Timeout waiting for user answer. User may not be monitoring the session.'
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP] Personal Agent Quests Clarification Server started');
  }
}

// Start the server
const server = new ClarificationMCPServer();
server.start().catch((error) => {
  console.error('[MCP] Failed to start server:', error);
  process.exit(1);
});
