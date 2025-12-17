import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { AgentEvent } from '../agent/types';
import { exec, spawn } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

interface JiraTicket {
  key: string;
  fields: {
    summary: string;
    description: string | any | null; // Allow any for ADF
    status: {
      name: string;
    };
    comment?: {
      comments: {
        body: string | any;
        author: { displayName: string };
        created: string;
      }[];
    };
  };
}

export class JiraQuestRunner {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private eventCallback: (event: AgentEvent) => void;

  constructor(eventCallback: (event: AgentEvent) => void) {
    this.eventCallback = eventCallback;
    const region = process.env.AWS_REGION || 'eu-west-1';
    const profile = process.env.AWS_PROFILE || 'sso-bedrock';

    this.client = new BedrockRuntimeClient({
      region: region,
      credentials: fromNodeProviderChain({ profile }),
    });

    this.modelId = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[JiraRunner] ${message}` });
  }

  private async fetchJiraTickets(filterPrefix?: string): Promise<JiraTicket[]> {
    const host = process.env.JIRA_HOST;
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;

    if (!host || !email || !token) {
      throw new Error('Missing Jira credentials in .env');
    }

    if (host.includes('your-domain')) {
      throw new Error(
        'Please update JIRA_HOST in .env with your actual Jira URL (e.g., https://mycompany.atlassian.net)'
      );
    }

    this.log(`Fetching tickets from ${host}...`);

    // JQL: assignee = currentUser() AND status not in (Closed, Done)
    let jql = 'assignee = currentUser() AND status not in (Closed, Done)';

    if (filterPrefix && filterPrefix.trim()) {
      const cleanPrefix = filterPrefix
        .trim()
        .toUpperCase()
        .replace(/'/g, "\\'");

      // If the user inputs a project key (e.g. "SHA"), filter by project.
      // If they input a full ID (e.g. "SHA-123"), filter by that specific ID.

      if (/^[A-Z]+$/.test(cleanPrefix)) {
        jql += ` AND project = "${cleanPrefix}"`;
        this.log(`Applying filter: Project = "${cleanPrefix}"`);
      } else if (cleanPrefix.includes('-')) {
        jql += ` AND key = "${cleanPrefix}"`;
        this.log(`Applying filter: Ticket Key = "${cleanPrefix}"`);
      } else {
        // Fallback or partial? JQL doesn't support "key starts with" well.
        // Let's assume project key if ambiguous.
        jql += ` AND project = "${cleanPrefix}"`;
        this.log(`Applying filter: Project = "${cleanPrefix}"`);
      }
    }

    // Using the POST /search/jql endpoint which is the recommended replacement
    const url = `${host}/rest/api/3/search/jql`;

    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql,
          fields: ['summary', 'description', 'status'], // comment not needed here
          maxResults: 20,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.log(`Jira API Error Response: ${errorText}`);
        throw new Error(
          `Jira API Error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      this.log(`Found ${data.issues.length} tickets.`);
      // Log the first ticket to debug description field
      if (data.issues.length > 0) {
        const first = data.issues[0];
        this.log(
          `Debug First Ticket: Key=${first.key}, Summary=${
            first.fields.summary
          }, DescType=${typeof first.fields.description}`
        );
        // Jira Cloud often returns ADF (JSON object) for description, not string.
        // We need to handle that for the preview text.
      }
      return data.issues as JiraTicket[];
    } catch (e: any) {
      throw new Error(`Failed to fetch tickets: ${e.message}`);
    }
  }

  // AI Methods removed as requested

  public async run(filterPrefix?: string) {
    try {
      const tickets = await this.fetchJiraTickets(filterPrefix);

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
          let desc = '';
          if (typeof t.fields.description === 'string') {
            desc = t.fields.description;
          } else if (
            t.fields.description &&
            typeof t.fields.description === 'object'
          ) {
            // Extremely basic ADF to text for preview
            // ADF has content: [ { type: 'paragraph', content: [ { type: 'text', text: '...' } ] } ]
            try {
              // Just look for "text" fields recursively or JSON stringify
              desc = '(Rich Text Description)';
              // Better: extract some text
              if (
                t.fields.description.content &&
                Array.isArray(t.fields.description.content)
              ) {
                desc = t.fields.description.content
                  .map(
                    (p: any) =>
                      p.content?.map((c: any) => c.text || '').join('') || ''
                  )
                  .join(' ');
              }
            } catch (e) {
              desc = '(Complex Description)';
            }
          }

          return {
            key: t.key,
            summary: t.fields.summary,
            description:
              desc.length > 150 ? desc.substring(0, 150) + '...' : desc,
          };
        }),
      });

      // We don't send 'done' yet, as we wait for user selection via a new API call
      // But for this SSE connection, we are done sending the list.
      this.eventCallback({ type: 'done' });
    } catch (e: any) {
      this.log(`Error: ${e.message}`);
      this.eventCallback({ type: 'error', message: e.message });
      this.eventCallback({ type: 'done' });
    }
  }

  public async researchTickets(ticketKeys: string[]) {
    try {
      this.log(`Fetching details for ${ticketKeys.length} tickets...`);

      // We need to fetch full details again for the selected tickets
      // Construct JQL for specific keys
      const host = process.env.JIRA_HOST;
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      const auth = Buffer.from(`${email}:${token}`).toString('base64');

      const jql = `key in (${ticketKeys.join(',')})`;
      const url = `${host}/rest/api/3/search/jql`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql,
          fields: ['summary', 'description', 'status', 'comment'],
          maxResults: ticketKeys.length,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch selected tickets details.`);
      }

      const data = await response.json();
      const tickets = data.issues as JiraTicket[];

      let finalReport = '';

      for (const ticket of tickets) {
        this.log(`Processing ${ticket.key}: ${ticket.fields.summary}`);

        // Flatten description if it's ADF (Atlassian Document Format) or object
        let descriptionText = '';
        if (typeof ticket.fields.description === 'string') {
          descriptionText = ticket.fields.description;
        } else if (ticket.fields.description) {
          // Handle ADF for full analysis
          try {
            if (
              ticket.fields.description.content &&
              Array.isArray(ticket.fields.description.content)
            ) {
              // Recursively extract text from ADF
              const extractText = (node: any): string => {
                if (node.type === 'text') return node.text || '';
                if (node.content && Array.isArray(node.content)) {
                  return node.content.map(extractText).join('');
                }
                return '';
              };

              descriptionText = ticket.fields.description.content
                .map((p: any) => extractText(p))
                .join('\n');
            } else {
              descriptionText = JSON.stringify(ticket.fields.description);
            }
          } catch (e) {
            descriptionText = 'Could not parse description.';
          }
        } else {
          descriptionText = '(No description provided)';
        }

        this.log(
          `Full extracted description length: ${descriptionText.length} chars`
        );

        // Extract comments
        let commentsText = 'No comments found.';
        if (
          ticket.fields.comment &&
          ticket.fields.comment.comments.length > 0
        ) {
          commentsText = ticket.fields.comment.comments
            .map((c) => {
              const author = c.author.displayName;
              const body =
                typeof c.body === 'string' ? c.body : '(Rich text comment)';
              return `[${author}]: ${body}`;
            })
            .join('\n\n');
        }

        finalReport += `## [${ticket.key}] ${ticket.fields.summary}\n\n`;
        finalReport += `### Description\n${descriptionText}\n\n`;
        finalReport += `### Comments\n${commentsText}\n\n`;

        finalReport += `\n---\n\n`;

        this.eventCallback({
          type: 'log',
          message: `Completed processing for ${ticket.key}`,
        });

        // --- NEW: Trigger Cursor CLI ---
        try {
          const instructions = `
# PRIMARY OBJECTIVE: ${ticket.key} - ${ticket.fields.summary}

## CRITICAL: TICKET REQUIREMENTS
The following description is the ABSOLUTE SOURCE OF TRUTH for this task. You must implement ALL requirements specified here exactly as written.
Pay special attention to any acceptance criteria (A/C), specific file paths, or design constraints mentioned.

${descriptionText}

## ADDITIONAL CONTEXT (Comments)
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
   - Do NOT commit changes.
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

          // Check if cursor-agent is installed
          let cursorCmd = 'cursor-agent';
          try {
            await execAsync('which cursor-agent');
          } catch (e) {
            // Check common location ~/.local/bin/cursor-agent
            const home = process.env.HOME;
            const localBinPath = path.join(
              home || '',
              '.local/bin/cursor-agent'
            );
            if (home && fs.existsSync(localBinPath)) {
              cursorCmd = localBinPath;
              this.log(`Found cursor-agent at ${localBinPath}`);
            } else {
              const installMsg =
                'Cursor CLI not found in PATH or ~/.local/bin. Please install it using: curl https://cursor.com/install -fsS | bash';
              this.log(installMsg);
              finalReport += `\n**Error:** ${installMsg}\n`;
              throw new Error(installMsg);
            }
          }

          // Using 'cursor-agent' in headless mode (print mode) with streaming
          // -p: print mode (non-interactive)
          // --force: allow file modifications
          // --model: specify the model to use
          // --output-format stream-json: get real-time JSON events
          // --stream-partial-output: get text deltas
          // --approve-mcps: auto-approve MCP tool calls

          const spawnCwd = path.resolve(process.cwd(), '..');
          this.log(`[System] Spawning cursor-agent in: ${spawnCwd}`);

          await new Promise<void>((resolve, reject) => {
            const child = spawn(
              cursorCmd,
              [
                '-p',
                '--force',
                '--approve-mcps',
                '--model',
                'gemini-3-pro',
                '--output-format',
                'stream-json',
                '--stream-partial-output',
                `Please read and follow the instructions in ${instructionPath}`,
              ],
              {
                cwd: spawnCwd,
                env: { ...process.env },
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
              }
            );

            let stdoutBuffer = '';
            let textBuffer = '';
            let hasReceivedData = false;

            child.on('spawn', () => {
              this.log(`[System] Cursor process spawned (PID: ${child.pid})`);
            });

            child.stdout.on('data', (data) => {
              if (!hasReceivedData) {
                // this.log('[System] Receiving data from Cursor Agent...');
                hasReceivedData = true;
              }

              stdoutBuffer += data.toString();
              const lines = stdoutBuffer.split('\n');
              stdoutBuffer = lines.pop() || ''; // Keep last incomplete line

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const event = JSON.parse(line);

                  if (event.type === 'thinking') {
                    // Log thinking deltas
                    if (event.subtype === 'delta' && event.text) {
                      // We could accumulate this, but for now just show a spinner or simplified log
                      // process.stdout.write('.') // can't do this easily in this context
                    } else if (event.subtype === 'started') {
                      this.log('[Agent] Thinking...');
                    }
                  } else if (
                    event.type === 'assistant' &&
                    event.message?.content
                  ) {
                    // Accumulate text deltas
                    const contentList = event.message.content;
                    if (Array.isArray(contentList)) {
                      for (const item of contentList) {
                        if (item.type === 'text' && item.text) {
                          textBuffer += item.text;
                        }
                      }
                    }

                    if (textBuffer.includes('\n')) {
                      const textLines = textBuffer.split('\n');
                      // Log all complete lines
                      for (let i = 0; i < textLines.length - 1; i++) {
                        const msg = textLines[i].trim();
                        if (msg) {
                          this.log(`[Agent] ${msg}`);
                        }
                      }
                      // Keep the last part
                      textBuffer = textLines[textLines.length - 1];
                    }
                  } else if (event.type === 'tool_call') {
                    // Flush any pending text
                    if (textBuffer.trim()) {
                      this.log(`[Agent] ${textBuffer.trim()}`);
                      textBuffer = '';
                    }

                    // Extract tool name safely
                    let toolName = 'unknown tool';
                    if (event.tool_call) {
                      const keys = Object.keys(event.tool_call);
                      if (keys.length > 0) {
                        toolName = keys[0];
                      }
                    } else if (event.call_id) {
                      toolName = `call_${event.call_id.slice(0, 8)}`;
                    }

                    const subtype = event.subtype || 'update';

                    if (subtype === 'started') {
                      this.log(`[Tool] Executing: ${toolName}...`);
                    } else if (subtype === 'completed') {
                      this.log(`[Tool] Finished: ${toolName}`);
                    }
                  }
                } catch (e) {
                  // Fallback for non-JSON lines
                  const raw = line.trim();
                  if (raw) {
                    this.log(`[Cursor] ${raw}`);
                  }
                }
              }
            });

            child.stderr.on('data', (data) => {
              const output = data.toString();
              // Log all stderr to help debug hanging
              if (output.trim()) {
                this.log(`[Cursor Info] ${output.trim()}`);
              }
            });

            child.on('close', (code) => {
              // Flush remaining text
              if (textBuffer) {
                this.log(`[Agent] ${textBuffer}`);
              }

              if (code === 0) {
                this.log('Cursor Agent completed successfully.');
                resolve();
              } else {
                const errorMsg = `Cursor agent exited with code ${code}`;
                this.log(errorMsg);
                reject(new Error(errorMsg));
              }
            });

            child.on('error', (err) => {
              this.log(`Failed to start cursor-agent: ${err.message}`);
              reject(err);
            });
          });
        } catch (cursorError: any) {
          this.log(`Failed to trigger Cursor CLI: ${cursorError.message}`);
          finalReport += `\n**Warning:** Failed to trigger Cursor CLI automatically.\n`;
        }
        // -------------------------------
      }

      this.eventCallback({ type: 'result', text: finalReport });
      this.eventCallback({ type: 'done' });
    } catch (e: any) {
      this.log(`Processing Error: ${e.message}`);
      this.eventCallback({ type: 'error', message: e.message });
      this.eventCallback({ type: 'done' });
    }
  }
}
