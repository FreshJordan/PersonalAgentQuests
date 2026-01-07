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
    this.rootDir = rootDir || path.resolve(process.cwd(), '..');
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

  public async runAgent(instructionPath: string, callbacks: CursorAgentCallbacks): Promise<string> {
    const cursorCmd = await this.findCursorAgent();

    return new Promise((resolve, reject) => {
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
          env: { ...process.env },
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let stdoutBuffer = '';
      let textBuffer = '';
      let fullOutput = '';
      let hasReceivedData = false;

      child.on('spawn', () => {
        callbacks.onLog(`[System] Cursor process spawned (PID: ${child.pid})`);
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
                 // Try to guess tool name
                 let toolName = 'unknown tool';
                 if (event.tool_call) toolName = Object.keys(event.tool_call)[0] || toolName;
                 callbacks.onLog(`[Tool] Executing: ${toolName}...`);
              } else if (subtype === 'completed') {
                 // Try to guess tool name
                 let toolName = 'unknown tool';
                 if (event.tool_call) toolName = Object.keys(event.tool_call)[0] || toolName;
                 callbacks.onLog(`[Tool] Finished: ${toolName}`);
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
        if (output) callbacks.onLog(`[Cursor Info] ${output}`);
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

