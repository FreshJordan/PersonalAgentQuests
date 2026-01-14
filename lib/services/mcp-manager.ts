import * as fs from 'fs';
import * as path from 'path';
import { CLARIFICATION_CONFIG } from '../constants';

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  context?: string;
  timestamp: number;
}

export interface ClarificationAnswer {
  id: string;
  answer: string;
  timestamp: number;
}

/**
 * Manages clarification questions via file-system communication with MCP server.
 * Note: The MCP server itself is spawned and managed by Cursor CLI via .cursormcp config.
 */
export class MCPManager {
  private questionsDir: string;
  private fileWatcher: fs.FSWatcher | null = null;
  private onQuestionCallback?: (question: ClarificationQuestion) => void;

  constructor(workspaceRoot: string) {
    this.questionsDir = path.join(
      workspaceRoot,
      CLARIFICATION_CONFIG.questionsDir
    );

    // Ensure questions directory exists and is clean
    if (fs.existsSync(this.questionsDir)) {
      this.cleanupQuestionFiles();
    } else {
      fs.mkdirSync(this.questionsDir, { recursive: true });
    }
  }

  /**
   * Starts watching for clarification questions
   * Note: The MCP server is started automatically by Cursor CLI
   */
  public startWatching(): void {
    console.log(`[MCPManager] Watching for questions in: ${this.questionsDir}`);
    this.startWatchingQuestions();
  }

  /**
   * Stops watching and cleans up
   */
  public stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Cleanup any remaining question files
    this.cleanupQuestionFiles();
  }

  /**
   * Registers a callback for when new questions are detected
   */
  public onQuestion(callback: (question: ClarificationQuestion) => void): void {
    this.onQuestionCallback = callback;
  }

  /**
   * Submits an answer to a clarification question
   */
  public async submitAnswer(questionId: string, answer: string): Promise<void> {
    const answerFile = path.join(
      this.questionsDir,
      `${questionId}_answer.json`
    );

    const answerData: ClarificationAnswer = {
      id: questionId,
      answer,
      timestamp: Date.now(),
    };

    fs.writeFileSync(answerFile, JSON.stringify(answerData, null, 2));
  }

  /**
   * Watches the questions directory for new question files
   */
  private startWatchingQuestions(): void {
    this.fileWatcher = fs.watch(this.questionsDir, (eventType, filename) => {
      console.log(
        `[MCPManager] File event: ${eventType} for ${filename || 'unknown'}`
      );

      if (
        eventType === 'rename' &&
        filename &&
        filename.endsWith('.json') &&
        !filename.includes('_answer')
      ) {
        // New question file created
        const questionPath = path.join(this.questionsDir, filename);
        console.log(`[MCPManager] Detected question file: ${questionPath}`);

        // Small delay to ensure file is fully written
        setTimeout(() => {
          if (fs.existsSync(questionPath)) {
            try {
              const content = fs.readFileSync(questionPath, 'utf-8');
              const question: ClarificationQuestion = JSON.parse(content);
              console.log(`[MCPManager] Parsed question: ${question.question}`);

              if (this.onQuestionCallback) {
                console.log(
                  `[MCPManager] Calling onQuestion callback with question ID: ${question.id}`
                );
                this.onQuestionCallback(question);
              } else {
                console.log(
                  `[MCPManager] WARNING: No onQuestion callback registered!`
                );
              }
            } catch (error) {
              console.log(`[MCPManager] Error parsing question file: ${error}`);
            }
          } else {
            console.log(
              `[MCPManager] Question file no longer exists: ${questionPath}`
            );
          }
        }, 100);
      }
    });
  }

  /**
   * Cleans up any leftover question or answer files
   */
  private cleanupQuestionFiles(): void {
    if (!fs.existsSync(this.questionsDir)) {
      return;
    }

    const files = fs.readdirSync(this.questionsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(this.questionsDir, file));
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }
}
