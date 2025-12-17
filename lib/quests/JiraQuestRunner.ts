import { AgentEvent } from '../agent/types';
import path from 'path';
import fs from 'fs';
import { QuestLogManager } from './QuestLogManager';
import { QuestLog } from './types';
import { JiraService } from '../services/jira';
import { BedrockService } from '../services/bedrock';
import { GitService } from '../services/git';
import { CursorAgentService } from '../services/cursor';

export class JiraQuestRunner {
  private jiraService: JiraService;
  private bedrockService: BedrockService;
  private gitService: GitService;
  private cursorService: CursorAgentService;
  private eventCallback: (event: AgentEvent) => void;

  constructor(eventCallback: (event: AgentEvent) => void) {
    this.eventCallback = eventCallback;
    this.jiraService = new JiraService();
    this.bedrockService = new BedrockService();
    this.gitService = new GitService();
    this.cursorService = new CursorAgentService();
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[JiraRunner] ${message}` });
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
          commentsText = await this.bedrockService.summarizeText(
            rawComments,
            prompt
          );
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
          const branchName = `feature/${ticket.key}`;
          this.log(`Checking out git branch: ${branchName}`);
          await this.gitService.checkoutBranch(branchName);

          const instructions = `
# PRIMARY OBJECTIVE: ${ticket.key} - ${ticket.fields.summary}

## CRITICAL: TICKET REQUIREMENTS
The following description is the ABSOLUTE SOURCE OF TRUTH for this task. You must implement ALL requirements specified here exactly as written.
Pay special attention to any acceptance criteria (A/C), specific file paths, or design constraints mentioned.

${descriptionText}

## ADDITIONAL CONTEXT (Comments Summary)
${commentsText}

## EXECUTION PLAN
You are an expert engineer tasked with completing the above objective. Your priority is to satisfy the TICKET REQUIREMENTS.

1. **Analyze & Plan**:
   - Read the TICKET REQUIREMENTS above carefully.
   - Identify which files need to be modified.
   - If the ticket implies deprecated files or patterns, identify them.

2. **Implement**:
   - Apply the necessary code changes to fulfill the TICKET REQUIREMENTS.
   - **Priority**: The specific instructions in the ticket description OVERRIDE general patterns if there is a conflict.

3. **Verify (Mandatory)**:
   - **Linting**: Check for and fix any linter errors in the files you modified.
   - **Testing**: Run relevant unit tests to ensure your changes didn't break existing functionality. Fix any failures.
   - **Deprecations**: Ensure you haven't introduced usage of deprecated components unless explicitly required by the ticket.

4. **Finalize**:
   - Create a git commit with the changes using the message: "[Cursor_Code] Implementation for ${ticket.key}"
   - **VERY IMPORTANT**: Do NOT push changes to origin. All changes must remain local.
   - Leave the codebase in a clean, working state with your changes applied.
`;
          const instructionFile = `INSTRUCTIONS_${ticket.key}.md`;
          const instructionPath = path.resolve(
            process.cwd(),
            '..',
            instructionFile
          );
          fs.writeFileSync(instructionPath, instructions);

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
        }
      }

      this.eventCallback({ type: 'result', text: finalReport });
      this.eventCallback({ type: 'done' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`Processing Error: ${msg}`);
      this.eventCallback({ type: 'error', message: msg });
      this.eventCallback({ type: 'done' });
    }
  }
}
