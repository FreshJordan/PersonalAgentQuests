import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { CURSOR_MODEL } from '../constants';

const execAsync = util.promisify(exec);

export interface CursorAgentCallbacks {
  onLog: (message: string) => void;
  onTextDelta: (text: string) => void;
}

export class CursorAgentService {
  private rootDir: string;

  constructor(rootDir?: string) {
    // Run from PersonalAgentQuests directory so .cursormcp can be found
    // The agent can still access parent codebase files via ../
    this.rootDir = rootDir || process.cwd();
  }

  private async findCursorAgent(): Promise<string> {
    try {
      await execAsync('which cursor-agent');
      return 'cursor-agent';
    } catch (e) {
      const home = process.env.HOME;
      const localBinPath = path.join(home || '', '.local/bin/cursor-agent');
      if (home && fs.existsSync(localBinPath)) {
        return localBinPath;
      }
      throw new Error('Cursor CLI not found. Please install it.');
    }
  }

  public async runAgent(
    instructionPath: string,
    callbacks: CursorAgentCallbacks
  ): Promise<string> {
    const cursorCmd = await this.findCursorAgent();

    return new Promise((resolve, reject) => {
      // Path to MCP config
      const mcpConfigPath = path.join(this.rootDir, '.cursor', 'mcp.json');
      callbacks.onLog(`[System] MCP config path: ${mcpConfigPath}`);
      callbacks.onLog(
        `[System] MCP config exists: ${fs.existsSync(mcpConfigPath)}`
      );

      const child = spawn(
        cursorCmd,
        [
          '-p',
          '--force',
          '--approve-mcps',
          '--model',
          CURSOR_MODEL,
          '--output-format',
          'stream-json',
          '--stream-partial-output',
          `Please read and follow the instructions in ${instructionPath}`,
        ],
        {
          cwd: this.rootDir,
          env: process.env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let stdoutBuffer = '';
      let textBuffer = '';
      let fullOutput = '';
      let hasReceivedData = false;
      let mcpServersDetected = false;

      child.on('spawn', () => {
        callbacks.onLog(`[System] Cursor process spawned (PID: ${child.pid})`);
        callbacks.onLog(`[System] Working directory: ${this.rootDir}`);
        callbacks.onLog(
          `[System] Looking for MCP config in: ${this.rootDir}/.cursor/mcp.json`
        );

        // Set a timeout to check if MCP servers were loaded
        setTimeout(() => {
          if (!mcpServersDetected) {
            callbacks.onLog(
              `[MCP Warning] No MCP servers detected after 5 seconds. Check if .cursor/mcp.json exists and MCP server is properly configured.`
            );
          }
        }, 5000);
      });

      child.stdout.on('data', (data) => {
        if (!hasReceivedData) {
          hasReceivedData = true;
        }

        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Handle system initialization events (reduce noise)
            if (event.type === 'system') {
              if (event.subtype === 'init') {
                callbacks.onLog(
                  `[System] Session initialized (ID: ${
                    event.session_id?.substring(0, 8) || 'unknown'
                  }...)`
                );
              }
              continue; // Skip other system events
            }

            // Skip user message echoes (just noise in logs)
            if (event.type === 'user') {
              continue;
            }

            // Log MCP-related events (try multiple event type variations)
            if (
              event.type === 'mcp_server_started' ||
              event.type === 'mcp_started' ||
              event.type === 'mcp'
            ) {
              mcpServersDetected = true;
              callbacks.onLog(
                `[MCP] Server started: ${
                  event.server_name || event.name || 'unknown'
                }`
              );
            } else if (
              event.type === 'mcp_server_failed' ||
              event.type === 'mcp_error'
            ) {
              mcpServersDetected = true;
              callbacks.onLog(
                `[MCP] Server failed: ${
                  event.server_name || event.name || 'unknown'
                } - ${event.error || event.message || 'unknown error'}`
              );
            } else if (
              event.type === 'tools_discovered' ||
              event.type === 'tools_list' ||
              event.type === 'tools'
            ) {
              mcpServersDetected = true;
              const toolNames =
                event.tools?.map((t: any) => t.name).join(', ') || 'none';
              callbacks.onLog(`[MCP] Tools discovered: ${toolNames}`);
              // Check if ask_clarification is in the list
              if (toolNames.includes('ask_clarification')) {
                callbacks.onLog(`[MCP] ✓ ask_clarification tool is available!`);
              }
            }

            if (event.type === 'thinking' && event.subtype === 'started') {
              callbacks.onLog('[Agent] Thinking...');
            } else if (event.type === 'assistant' && event.message?.content) {
              const contentList = event.message.content;
              if (Array.isArray(contentList)) {
                for (const item of contentList) {
                  if (item.type === 'text' && item.text) {
                    textBuffer += item.text;
                    fullOutput += item.text;
                    callbacks.onTextDelta(item.text);
                  }
                }
              }

              if (textBuffer.includes('\n')) {
                const textLines = textBuffer.split('\n');
                for (let i = 0; i < textLines.length - 1; i++) {
                  const msg = textLines[i].trim();
                  if (msg) callbacks.onLog(`[Agent] ${msg}`);
                }
                textBuffer = textLines[textLines.length - 1];
              }
            } else if (event.type === 'tool_call') {
              // Flush pending text
              if (textBuffer.trim()) {
                callbacks.onLog(`[Agent] ${textBuffer.trim()}`);
                textBuffer = '';
              }

              const subtype = event.subtype || 'update';
              if (subtype === 'started') {
                // Try to extract tool name from event
                let toolName = 'unknown tool';
                if (event.tool_call) {
                  const toolKey = Object.keys(event.tool_call)[0];
                  toolName = toolKey || toolName;
                  // Log tool details for MCP tools
                  if (
                    toolName === 'ask_clarification' ||
                    toolName.includes('mcp')
                  ) {
                    callbacks.onLog(
                      `[MCP Tool] ${toolName} called with: ${JSON.stringify(
                        event.tool_call[toolKey]
                      ).substring(0, 200)}`
                    );
                  }
                }
                callbacks.onLog(`[Tool] Executing: ${toolName}...`);
              } else if (subtype === 'completed') {
                // Try to extract tool name
                let toolName = 'unknown tool';
                if (event.tool_call) {
                  toolName = Object.keys(event.tool_call)[0] || toolName;
                }
                callbacks.onLog(`[Tool] Finished: ${toolName}`);
              }
            } else {
              // Log any unrecognized event types for debugging
              // (skip common ones we already handle above)
              const knownTypes = [
                'thinking',
                'assistant',
                'tool_call',
                'system',
                'user',
                'mcp_server_started',
                'mcp_started',
                'mcp',
                'mcp_error',
                'tools_discovered',
                'tools',
                'tools_list',
              ];
              if (!knownTypes.includes(event.type)) {
                callbacks.onLog(
                  `[Debug] Unknown event type: ${event.type} - ${JSON.stringify(
                    event
                  ).substring(0, 150)}`
                );
              }
            }
          } catch (e) {
            const raw = line.trim();
            if (raw) callbacks.onLog(`[Cursor] ${raw}`);
          }
        }
      });

      child.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          // Highlight MCP-related stderr messages
          if (
            output.toLowerCase().includes('mcp') ||
            output.toLowerCase().includes('clarification')
          ) {
            callbacks.onLog(`[MCP Info] ${output}`);
          } else {
            callbacks.onLog(`[Cursor Info] ${output}`);
          }
        }
      });

      child.on('close', (code) => {
        if (textBuffer) callbacks.onLog(`[Agent] ${textBuffer}`);

        if (code === 0) {
          resolve(fullOutput);
        } else {
          reject(new Error(`Cursor agent exited with code ${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }
}
