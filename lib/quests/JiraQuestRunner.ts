import { AgentEvent } from '../agent/types';
import path from 'path';
import fs from 'fs';
import { QuestLogManager } from './QuestLogManager';
import { QuestLog } from './types';
import { JiraService } from '../services/jira';
import { BedrockService } from '../services/bedrock';
import { GitService } from '../services/git';
import { CursorAgentService } from '../services/cursor';
import { MCPManager, ClarificationQuestion } from '../services/mcp-manager';
import { generateJiraTicketInstructions } from './prompts';

// Context optimization: Keep last N exchanges (user + assistant pairs)
const MAX_CONVERSATION_HISTORY = 10;

export class JiraQuestRunner {
  private jiraService: JiraService;
  private bedrockService: BedrockService;
  private gitService: GitService;
  private cursorService: CursorAgentService;
  private eventCallback: (event: AgentEvent) => void;
  private conversationHistory: Array<{ role: string; content: any }> = [];
  private currentTicketContext = '';
  private mcpManager: MCPManager | null = null;
  private clarificationsEnabled = false;

  constructor(
    eventCallback: (event: AgentEvent) => void,
    clarificationsEnabled = false
  ) {
    this.eventCallback = eventCallback;
    this.clarificationsEnabled = clarificationsEnabled;
    this.jiraService = new JiraService();
    this.bedrockService = new BedrockService();
    this.gitService = new GitService();
    this.cursorService = new CursorAgentService();

    // Initialize MCP Manager if clarifications enabled
    if (clarificationsEnabled) {
      // Use PersonalAgentQuests directory as root (where .agent-questions will be created)
      const workspaceRoot = process.cwd();
      this.mcpManager = new MCPManager(workspaceRoot);

      // Listen for clarification questions
      this.mcpManager.onQuestion((question) => {
        this.handleClarificationQuestion(question);
      });
    }
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[JiraRunner] ${message}` });
  }

  /**
   * Handles a clarification question from the MCP server
   */
  private handleClarificationQuestion(question: ClarificationQuestion) {
    this.log(`Clarification question received: ${question.id}`);

    // Send question to UI via event
    this.eventCallback({
      type: 'clarification_request',
      question,
    });
  }

  /**
   * Submits an answer to a clarification question
   */
  public async submitClarificationAnswer(
    questionId: string,
    answer: string
  ): Promise<void> {
    if (!this.mcpManager) {
      throw new Error('MCP Manager not initialized');
    }

    this.log(`Submitting answer for question ${questionId}`);
    await this.mcpManager.submitAnswer(questionId, answer);
  }

  /**
   * Trims conversation history to manage context size.
   * Keeps only the most recent exchanges to prevent unbounded growth.
   */
  private trimConversationHistory() {
    const maxMessages = MAX_CONVERSATION_HISTORY * 2; // user + assistant pairs

    if (this.conversationHistory.length <= maxMessages) {
      return;
    }

    const toRemove = this.conversationHistory.length - maxMessages;
    this.conversationHistory.splice(0, toRemove);

    this.log(
      `Context optimization: Trimmed ${toRemove} old messages (${
        toRemove / 2
      } exchanges)`
    );

    // Add summary message to maintain context continuity
    this.conversationHistory.unshift({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[Note: Earlier conversation trimmed - ${
            toRemove / 2
          } previous exchanges removed to optimize context size]`,
        },
      ],
    });
  }

  /**
   * Builds optimized context string for Cursor CLI instruction files.
   * Truncates very long messages and provides size estimates.
   */
  private buildOptimizedContextForCursor(): string {
    const context = this.conversationHistory
      .map((msg, index) => {
        const role = msg.role === 'assistant' ? 'Assistant' : 'User';
        let text =
          Array.isArray(msg.content) && msg.content[0]?.text
            ? msg.content[0].text
            : JSON.stringify(msg.content);

        // Truncate very long messages to prevent excessive context
        if (text.length > 3000) {
          text =
            text.substring(0, 3000) +
            '\n\n[...content truncated for context optimization...]';
        }

        return `## ${role} (message ${index + 1}):\n${text}`;
      })
      .join('\n\n---\n\n');

    const estimatedTokens = Math.round(context.length / 4); // Rough estimate: 1 token ≈ 4 chars
    this.log(
      `Context size: ~${Math.round(
        context.length / 1000
      )}KB, ~${estimatedTokens} tokens`
    );

    return context;
  }

  public async run(filterPrefix?: string) {
    try {
      this.log(`Fetching tickets...`);
      // JQL: assignee = currentUser() AND status not in (Closed, Done)
      let jql = 'assignee = currentUser() AND status not in (Closed, Done)';

      if (filterPrefix && filterPrefix.trim()) {
        const cleanPrefix = filterPrefix
          .trim()
          .toUpperCase()
          .replace(/'/g, "\\'");
        if (/^[A-Z]+$/.test(cleanPrefix)) {
          jql += ` AND project = "${cleanPrefix}"`;
        } else if (cleanPrefix.includes('-')) {
          jql += ` AND key = "${cleanPrefix}"`;
        } else {
          jql += ` AND project = "${cleanPrefix}"`;
        }
      }

      const tickets = await this.jiraService.searchTickets(jql);

      if (tickets.length === 0) {
        this.eventCallback({
          type: 'result',
          text: 'No active tickets found assigned to you.',
        });
        this.eventCallback({ type: 'done' });
        return;
      }

      this.log(`Found ${tickets.length} tickets. Sending list to UI...`);

      // Send structured list to UI for selection
      this.eventCallback({
        type: 'ticket_list',
        tickets: tickets.map((t) => {
          const desc = this.jiraService.parseDescription(t.fields.description);
          return {
            key: t.key,
            summary: t.fields.summary,
            description:
              desc.length > 150 ? desc.substring(0, 150) + '...' : desc,
          };
        }),
      });

      this.eventCallback({ type: 'done' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`Error: ${msg}`);
      this.eventCallback({ type: 'error', message: msg });
      this.eventCallback({ type: 'done' });
    }
  }

  public async researchTickets(ticketKeys: string[]) {
    try {
      this.log(`Fetching details for ${ticketKeys.length} tickets...`);
      const jql = `key in (${ticketKeys.join(',')})`;
      const tickets = await this.jiraService.searchTickets(jql, [
        'summary',
        'description',
        'status',
        'comment',
      ]);

      let finalReport = '';

      for (const ticket of tickets) {
        this.log(`Processing ${ticket.key}: ${ticket.fields.summary}`);

        const descriptionText = this.jiraService.parseDescription(
          ticket.fields.description
        );

        // Extract comments
        let commentsText = 'No comments found.';
        if (
          ticket.fields.comment &&
          ticket.fields.comment.comments.length > 0
        ) {
          const rawComments = ticket.fields.comment.comments
            .map((c) => {
              const author = c.author.displayName;
              const body = this.jiraService.parseDescription(c.body); // Reuse parse logic
              return `[${author}]: ${body}`;
            })
            .join('\n\n');

          this.log('Summarizing comments with AI...');
          const prompt = `
            You are a helpful assistant. Please summarize the following Jira ticket comments into a concise summary of the conversation, highlighting key decisions, blockers, or clarifications.
            Format the output as a bulleted list.
          `;
          const summaryResult = await this.bedrockService.summarizeText(
            rawComments,
            prompt
          );
          commentsText = summaryResult.text;

          if (summaryResult.usage) {
            this.log(
              `Summarization Token Usage - Input: ${summaryResult.usage.input_tokens}, Output: ${summaryResult.usage.output_tokens}`
            );
            this.eventCallback({
              type: 'token_usage',
              input: summaryResult.usage.input_tokens,
              output: summaryResult.usage.output_tokens,
            });
          }
        }

        finalReport += `## [${ticket.key}] ${ticket.fields.summary}\n\n`;
        finalReport += `### Description\n${descriptionText}\n\n`;
        finalReport += `### Comments Summary\n${commentsText}\n\n`;
        finalReport += `\n---\n\n`;

        this.eventCallback({
          type: 'log',
          message: `Completed processing for ${ticket.key}`,
        });

        // --- Trigger Cursor CLI ---
        try {
          // Start watching for clarifications if enabled
          // Note: MCP server is automatically started by Cursor CLI via .cursormcp config
          if (this.mcpManager) {
            this.log('Starting clarification watcher...');
            this.mcpManager.startWatching();
          }

          const branchName = `feature/${ticket.key}`;
          this.log(`Checking out git branch: ${branchName}`);
          await this.gitService.checkoutBranch(branchName);

          this.log(
            `Clarifications ${
              this.clarificationsEnabled ? 'ENABLED ✓' : 'disabled'
            }`
          );

          const instructions = generateJiraTicketInstructions(
            ticket.key,
            ticket.fields.summary,
            descriptionText,
            commentsText,
            this.clarificationsEnabled
          );

          // Log first 500 chars of instructions for debugging
          this.log(
            `Generated instructions (first 500 chars): ${instructions.substring(
              0,
              500
            )}...`
          );

          const instructionFile = `INSTRUCTIONS_${ticket.key}.md`;
          const instructionPath = path.resolve(
            process.cwd(),
            '..',
            instructionFile
          );
          fs.writeFileSync(instructionPath, instructions);

          this.log(
            `Instructions written to: ${instructionPath} (${Math.round(
              instructions.length / 1024
            )}KB)`
          );
          this.log(`Triggering Cursor Headless CLI with ${instructionFile}...`);

          const fullOutput = await this.cursorService.runAgent(
            instructionPath,
            {
              onLog: (msg) => this.log(msg),
              onTextDelta: (_text) => {
                // We could stream text here if needed, but we rely on logs mostly
              },
            }
          );

          this.log('Cursor Agent completed successfully.');
          finalReport += `\n### Cursor Agent Output Summary\n${fullOutput.trim()}\n`;

          const diffStat = await this.gitService.getDiffStat();
          if (diffStat) {
            finalReport += `\n### Cursor Agent Changes\n\`\`\`\n${diffStat.trim()}\n\`\`\`\n`;
          } else {
            finalReport += `\n### Cursor Agent Changes\nNo changes detected or commit failed.\n`;
          }

          // Log mission completion
          const questLog: QuestLog = {
            id: `log-${Date.now()}`,
            questId: 'jira-ticket-research',
            timestamp: new Date().toISOString(),
            durationSeconds: 0,
            status: 'success',
            steps: [],
            stepCount: 0,
            aiStepCount: 0,
            scriptStepCount: 0,
            summary: {
              report: finalReport,
              tickets: ticketKeys,
            },
          };
          QuestLogManager.saveLog(questLog);
        } catch (cursorError: unknown) {
          const errorMsg =
            cursorError instanceof Error
              ? cursorError.message
              : String(cursorError);
          this.log(`Failed to trigger Cursor CLI: ${errorMsg}`);
          finalReport += `\n**Warning:** Failed to trigger Cursor CLI automatically.\n`;
        } finally {
          // Cleanup MCP watcher
          if (this.mcpManager) {
            this.log('Stopping clarification watcher...');
            this.mcpManager.stopWatching();
          }
        }
      }

      // Store context for follow-up questions
      this.currentTicketContext = finalReport;
      this.conversationHistory = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: finalReport }],
        },
      ];

      this.eventCallback({ type: 'result', text: finalReport });
      this.eventCallback({ type: 'done' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`Processing Error: ${msg}`);
      this.eventCallback({ type: 'error', message: msg });
      this.eventCallback({ type: 'done' });
    }
  }

  public async handleFollowUp(followUpMessage: string, ticketKeys: string[]) {
    try {
      this.log(`Processing follow-up message via Cursor CLI...`);

      // Trim conversation history to manage context size
      this.trimConversationHistory();

      // Build optimized context from previous report and conversation
      const conversationContext = this.buildOptimizedContextForCursor();

      // Create instruction file for Cursor CLI
      const instructions = `# Follow-up Request for JIRA Tickets: ${ticketKeys.join(
        ', '
      )}

## CONTEXT
You are helping with JIRA ticket research and implementation. Below is the conversation history so far.

${conversationContext}

---

## USER'S FOLLOW-UP QUESTION/REQUEST
${followUpMessage}

---

## YOUR TASK
Respond to the user's follow-up question or request. Use the context from the previous conversation to provide a helpful, actionable response.

Guidelines:
- If they're asking questions, provide clear answers based on the ticket context and codebase
- If they're proposing changes, acknowledge them and provide implementation guidance
- If they want to modify instructions or code, provide specific suggestions
- Search the codebase when needed to give accurate information
- Be concise but thorough
- Format your response using markdown for readability

Remember: You have access to the full codebase and can search for files, read code, and provide specific implementation details.
`;

      const instructionFile = `FOLLOWUP_${ticketKeys[0]}_${Date.now()}.md`;
      const instructionPath = path.resolve(
        process.cwd(),
        '..',
        instructionFile
      );
      fs.writeFileSync(instructionPath, instructions);

      this.log(`Triggering Cursor CLI for follow-up...`);

      // Use Cursor CLI to process the follow-up
      const fullOutput = await this.cursorService.runAgent(instructionPath, {
        onLog: (msg) => this.log(msg),
        onTextDelta: (text) => {
          // Stream partial text back to UI if needed
          this.eventCallback({
            type: 'log',
            message: `[Agent] ${text}`,
          });
        },
      });

      // Clean up instruction file
      try {
        fs.unlinkSync(instructionPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      this.log('Cursor CLI follow-up completed.');

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: [{ type: 'text', text: followUpMessage }],
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: [{ type: 'text', text: fullOutput }],
      });

      this.eventCallback({ type: 'result', text: fullOutput });
      this.eventCallback({ type: 'done' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`Follow-up Error: ${msg}`);
      this.eventCallback({ type: 'error', message: msg });
      this.eventCallback({ type: 'done' });
    }
  }
}
