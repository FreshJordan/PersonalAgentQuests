import { BROWSER_TOOLS, AgentEvent } from '../agent/types';
import { ScriptManager } from './ScriptManager';
import {
  QuestStep,
  QuestLog,
  ClickChangeType,
  ClickTargetElement,
} from './types';
import { KnowledgeBase } from './KnowledgeBase';
import { QuestLogManager } from './QuestLogManager';
import {
  CONTEXT_TRIMMED_MESSAGE,
  SCRIPT_FAILED_CONTEXT,
  SCRIPT_RETRY_CONTEXT,
  QA_REVIEW_PROMPT,
  SELECTOR_HINTS_NOTE,
  FAILED_SELECTORS_NOTE,
  BROWSER_AGENT_SYSTEM_PROMPT,
} from './prompts';
import { BedrockService } from '../services/bedrock';
import { BrowserService } from '../services/browser';
import { ValidationService } from '../services/validation';
import { ContextService } from '../services/context';
import { QUEST_RUNNER_MODEL_ID, BROWSER_CONFIG } from '../constants';

// Sliding window size for message history (keeps system prompt + last N messages)
// Trade-off: Higher = more context for AI, but more tokens. Lower = faster/cheaper, but less context.
// 10 messages ≈ 5 AI turns (each turn = assistant + user tool_result)
const MESSAGE_HISTORY_WINDOW = 10;

// Maximum consecutive wait tool uses before failing the mission as stuck
const MAX_CONSECUTIVE_WAITS = 3;

export class HybridQuestRunner {
  private bedrockService: BedrockService;
  private browserService: BrowserService;
  private validationService: ValidationService | null = null; // init after page launch
  private contextService: ContextService;
  private eventCallback: (event: AgentEvent) => void;
  private maxSteps: number;
  private recordedSteps: QuestStep[] = [];
  private scriptStepsExecuted = 0; // Track how many steps came from script replay
  private startTime = 0;
  private modelId: string;

  constructor(eventCallback: (event: AgentEvent) => void, maxSteps = 30) {
    this.eventCallback = eventCallback;
    this.maxSteps = maxSteps;
    this.startTime = Date.now();
    this.bedrockService = new BedrockService();
    this.browserService = new BrowserService();
    this.contextService = new ContextService();
    this.modelId = QUEST_RUNNER_MODEL_ID;
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[Runner] ${message}` });
  }

  /**
   * Determines if a tool is expected to visually change the page.
   * Used to decide whether to include a screenshot in the tool result.
   */
  private toolChangesPage(toolName: string): boolean {
    // Tools that typically change the visible page state
    const pageChangingTools = [
      'navigate',
      'click',
      'click_at_coordinates',
      'type_text',
      'scroll',
      'press_key', // Could scroll or submit forms
    ];
    return pageChangingTools.includes(toolName);
  }

  /**
   * Trims message history to keep only the system prompt (first message) + last N messages.
   * Creates a summary of trimmed messages to maintain context.
   *
   * IMPORTANT: Must preserve tool_use/tool_result pairs - the API requires every tool_result
   * to have a corresponding tool_use in the immediately preceding assistant message.
   */
  private trimMessageHistory(messages: any[]): any[] {
    if (messages.length <= MESSAGE_HISTORY_WINDOW + 1) {
      return messages; // No trimming needed (+1 for system prompt)
    }

    const systemPrompt = messages[0]; // Always keep the system prompt

    // Calculate where to start keeping messages
    // We need to keep messages in pairs (assistant + user with tool_result)
    // to avoid breaking the tool_use/tool_result relationship
    let keepFromIndex = messages.length - MESSAGE_HISTORY_WINDOW;

    // Ensure we start from an assistant message (not a user tool_result)
    // to maintain valid message structure
    while (keepFromIndex > 1 && keepFromIndex < messages.length) {
      const msg = messages[keepFromIndex];
      // If this is a user message with tool_results, we need to also keep the previous assistant message
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some(
          (c: any) => c.type === 'tool_result'
        );
        if (hasToolResult) {
          // Move back to include the assistant message with the corresponding tool_use
          keepFromIndex--;
          continue;
        }
      }
      break;
    }

    // Ensure keepFromIndex doesn't go below 1 (we always keep system prompt at 0)
    keepFromIndex = Math.max(1, keepFromIndex);

    const recentMessages = messages.slice(keepFromIndex);

    // Count how many messages we're trimming
    const trimmedCount = keepFromIndex - 1;

    if (trimmedCount <= 0) {
      return messages; // Nothing to trim
    }

    // Create a summary message for the trimmed history
    const summaryMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: CONTEXT_TRIMMED_MESSAGE(trimmedCount),
        },
      ],
    };

    return [systemPrompt, summaryMessage, ...recentMessages];
  }

  private async captureScreenshot(): Promise<string | null> {
    try {
      const base64 = await this.browserService.captureScreenshot();
      if (base64) {
        this.eventCallback({
          type: 'screenshot',
          image: base64,
        });
      }
      return base64;
    } catch (e) {
      this.log('Failed to capture screenshot');
      return null;
    }
  }

  /**
   * Detects what type of change occurred after an action.
   * Returns 'url' if URL changed, 'dom' if DOM changed, 'none' otherwise.
   */
  private async detectChangeType(
    preUrl: string,
    preFingerprint: string
  ): Promise<ClickChangeType> {
    const page = this.browserService.page;
    if (!page) return 'none';

    // Check URL first (most significant change)
    if (page.url() !== preUrl) {
      return 'url';
    }

    // Check DOM change via fingerprint
    const domChanged = await this.browserService.waitForFingerprintChange(
      preFingerprint,
      3000
    );
    if (domChanged) {
      return 'dom';
    }

    return 'none';
  }

  /**
   * Validates a click during SCRIPT REPLAY only.
   * Verifies the correct element is at coordinates before clicking.
   * Checks if the expected change type matches what actually happened.
   * Throws an error if validation fails after retry, triggering AI handoff.
   */
  private async executeScriptClick(
    clickFn: () => Promise<void>,
    description: string,
    expectedChange?: ClickChangeType,
    expectedElement?: ClickTargetElement,
    coordinates?: { x: number; y: number }
  ): Promise<void> {
    const page = this.browserService.page;
    if (!page) throw new Error('No browser page');

    // Wait for page to be ready before clicking (ignore timeout)
    await page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => undefined);

    // ELEMENT VERIFICATION: Check if the expected element is at the coordinates
    // Uses fallback verification that also checks DOM hierarchy for reliability
    if (expectedElement && coordinates) {
      const verification =
        await this.browserService.verifyElementAtCoordinatesWithFallback(
          coordinates.x,
          coordinates.y,
          expectedElement
        );

      if (!verification.matches) {
        // Wrong element at coordinates - likely a popup or layout change
        throw new Error(
          `Element mismatch at (${coordinates.x}, ${coordinates.y}): ` +
            `Expected ${verification.expected}, but found ${verification.actual}. ` +
            `A popup or layout change may be blocking the target.`
        );
      }

      this.log(`  Verified: ${verification.actual}`);
    }

    // Capture pre-click state
    const preFingerprint =
      await this.browserService.getAccessibilityFingerprint();
    const preUrl = page.url();

    // Execute the click
    await clickFn();

    // Detect what changed
    let actualChange = await this.detectChangeType(preUrl, preFingerprint);

    // Only strictly validate URL changes - DOM changes are timing-sensitive
    // and can vary between runs due to loading states, focus timing, etc.
    if (expectedChange === 'url' && actualChange !== 'url') {
      this.log(`  Retrying click (expected URL change)`);

      // Wait a bit and retry
      await page.waitForTimeout(1000);
      const retryPreUrl = page.url();

      await clickFn();

      // Only check if URL changed (ignore DOM fingerprint for retry)
      await page.waitForTimeout(2000); // Give time for navigation
      if (page.url() === retryPreUrl) {
        // Still no URL change after retry - throw error to trigger AI handoff
        throw new Error(
          `Click validation failed: Expected URL change but page did not navigate after retry.`
        );
      }
      actualChange = 'url';
    }

    // Log result only if there's something notable
    // Suppress verbose validation logs - only warn on significant issues
    if (expectedChange === 'url' && actualChange !== 'url') {
      // This case is handled above with retry and error
    } else if (expectedChange === 'dom' && actualChange === 'none') {
      // Timing variance - don't log, it's usually fine
    }
    // All other cases: proceed silently
  }

  /**
   * Generates a concise, human-readable description for a step/action.
   */
  private getStepDescription(
    type: string,
    params: Record<string, any>
  ): string {
    switch (type) {
      case 'navigate':
        return params.url || 'unknown URL';
      case 'click_at_coordinates':
        return params.description || `(${params.x}, ${params.y})`;
      case 'click':
        if (params.selector?.includes('text=')) {
          return `"${params.selector.replace('text=', '')}"`;
        }
        if (params.selector?.includes('has-text')) {
          const match = params.selector.match(/has-text\('(.+?)'\)/);
          return match ? `"${match[1]}"` : params.selector;
        }
        return params.selector || 'unknown selector';
      case 'type_text':
        const text =
          params.text?.length > 30
            ? `${params.text.slice(0, 30)}...`
            : params.text;
        return params.selector
          ? `"${text}" into ${params.selector}`
          : `"${text}"`;
      case 'scroll':
        return `${params.direction} ${
          params.amount || BROWSER_CONFIG.scrollAmount
        }px`;
      case 'press_key':
        console.log('params.key', params.key);
        return params.key || 'unknown key';
      case 'random_wait':
      case 'wait':
        return `${params.duration || params.min || 500}ms`;
      default:
        return JSON.stringify(params).slice(0, 50);
    }
  }

  private getSelectorHints(url: string): string {
    const selectors = KnowledgeBase.getProvenSelectors(url);
    if (selectors.length === 0) {
      return '';
    }
    return SELECTOR_HINTS_NOTE(selectors);
  }

  private async executeStep(step: QuestStep, retry = true): Promise<boolean> {
    if (!this.browserService.page) {
      return false;
    }

    const finalParams = this.contextService.applySubstitutions(step.params);

    // Log step execution with clean format
    const stepDesc = this.getStepDescription(step.type, finalParams);
    this.log(`[Script]: ${step.type} - ${stepDesc}`);

    try {
      const page = this.browserService.page;

      if (step.type === 'navigate') {
        await page.goto(finalParams.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } else if (step.type === 'type_text') {
        if (!finalParams.selector) {
          // No selector - type into currently focused element
          await page.keyboard.type(finalParams.text);
        } else {
          await page.waitForSelector(finalParams.selector, {
            state: 'visible',
            timeout: 5000,
          });
          await page.fill(finalParams.selector, finalParams.text);
        }
      } else if (step.type === 'click_at_coordinates') {
        await this.executeScriptClick(
          () => page.mouse.click(finalParams.x, finalParams.y),
          `coordinates (${finalParams.x}, ${finalParams.y})`,
          step.expectedChange,
          step.expectedElement,
          { x: finalParams.x, y: finalParams.y }
        );
      } else if (step.type === 'click') {
        await page.waitForSelector(finalParams.selector, {
          state: 'visible',
          timeout: 5000,
        });
        await this.executeScriptClick(
          () => page.click(finalParams.selector),
          `selector ${finalParams.selector}`,
          step.expectedChange
        );
      } else if (step.type === 'scroll') {
        const amount = finalParams.amount || BROWSER_CONFIG.scrollAmount;
        const deltaY = finalParams.direction === 'up' ? -amount : amount;
        await page.mouse.wheel(0, deltaY);
      } else if (step.type === 'press_key') {
        await page.keyboard.press(finalParams.key);
      } else if (step.type === 'wait' || step.type === 'random_wait') {
        const duration = finalParams.duration || 1000;
        await page.waitForTimeout(duration);
      }

      await page.waitForTimeout(2000);
      const newUrl = page.url();
      this.eventCallback({ type: 'url_update', url: newUrl });
      await this.captureScreenshot();

      if (step.validation && this.validationService) {
        const isValid = await this.validationService.validateCondition(
          step.validation
        );
        if (!isValid) {
          throw new Error('Step validation failed');
        }
      }

      return true;
    } catch (e: unknown) {
      if (retry) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log(`Step failed: ${msg}. Waiting 3s and retrying...`);
        await this.browserService.page.waitForTimeout(3000);
        return this.executeStep(step, false);
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`Step failed after retry: ${msg}`);
      return false;
    }
  }

  private saveQuestLog(
    questId: string,
    status: 'success' | 'failed',
    extractedData?: any
  ) {
    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
    // Use tracked script steps count instead of description-based filtering
    const scriptSteps = this.scriptStepsExecuted;
    const aiSteps = this.recordedSteps.length - scriptSteps;

    const log: QuestLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      questId,
      timestamp: new Date().toISOString(),
      durationSeconds,
      status,
      steps: this.recordedSteps,
      stepCount: this.recordedSteps.length,
      aiStepCount: aiSteps,
      scriptStepCount: scriptSteps,
      context: this.contextService.getContext(),
      summary: extractedData,
    };

    QuestLogManager.saveLog(log);
    this.log(
      `Quest log saved. Duration: ${durationSeconds}s, Steps: ${this.recordedSteps.length}`
    );
  }

  public async run(questId: string, questDescription: string) {
    try {
      this.contextService.generateDefaults();
      this.log('Context initialized with dynamic variables:');
      for (const [key, value] of Object.entries(
        this.contextService.getContext()
      )) {
        this.log(`  - ${key}: ${value}`);
      }

      this.log('Launching browser...');
      const avgSteps = QuestLogManager.getAverageSteps(questId);
      if (avgSteps > 0) {
        this.log(`Historical Average Steps: ${avgSteps}`);
      }

      const page = await this.browserService.launch();
      this.validationService = new ValidationService(page);

      const existingScript = ScriptManager.getScript(questId);
      let scriptFailedIndex = -1;

      if (existingScript) {
        this.log(
          `Found existing script with ${existingScript.steps.length} steps. Executing...`
        );

        for (let i = 0; i < existingScript.steps.length; i++) {
          const success = await this.executeStep(existingScript.steps[i]);
          if (!success) {
            scriptFailedIndex = i;
            this.log(`Script failed at step ${i + 1}. Switching to AI mode.`);
            break;
          }
          this.recordedSteps.push(existingScript.steps[i]);
          this.scriptStepsExecuted++; // Track script-executed steps
        }

        if (
          scriptFailedIndex === -1 &&
          existingScript.successCriteria &&
          this.validationService
        ) {
          this.log('Script finished. Verifying final success criteria...');
          for (const criteria of existingScript.successCriteria) {
            const isValid = await this.validationService.validateCondition(
              criteria
            );
            if (!isValid) {
              this.log(
                'Global success criteria failed. Script was incomplete.'
              );
              scriptFailedIndex = existingScript.steps.length;
              break;
            }
          }
        }

        if (scriptFailedIndex === -1) {
          this.log('Script execution finished. Performing AI verification...');
          const review = await this.performAIReview(questDescription);

          if (!review.success) {
            this.log(`Script finished but AI review failed: ${review.reason}`);
            scriptFailedIndex = existingScript.steps.length;
          } else {
            this.log('Quest completed successfully using cached script!');
            this.saveQuestLog(questId, 'success', review.extractedData);
            this.eventCallback({
              type: 'result',
              text: 'Quest completed efficiently using saved script.',
            });
            this.eventCallback({ type: 'done' });
            return;
          }
        }
      } else {
        this.log('No existing script found. Starting fresh with AI.');
      }

      if (scriptFailedIndex !== -1) {
        this.log(
          `Handing over to AI. Context: Script failed at index ${scriptFailedIndex}`
        );
        this.eventCallback({
          type: 'log',
          message: 'Switching to AI mode (Force Takeover)',
        });
      } else {
        this.log('Starting AI Agent execution...');
      }

      const lastStep = this.recordedSteps[this.recordedSteps.length - 1];
      const stepHistory = this.recordedSteps
        .map((s, i) => `${i + 1}. ${s.description} (${s.status})`)
        .join('\n');

      await this.runAI(
        questDescription,
        scriptFailedIndex !== -1
          ? SCRIPT_FAILED_CONTEXT(
              scriptFailedIndex + 1,
              stepHistory,
              lastStep?.description || 'None'
            )
          : undefined
      );

      this.log('Requesting final AI review of mission status...');
      let reviewResult = await this.performAIReview(questDescription);

      if (!reviewResult.success) {
        this.log(
          `AI Review Failed: ${reviewResult.reason}. Attempting to fix (one-time retry)...`
        );

        if (this.recordedSteps.length >= this.maxSteps - 5) {
          this.maxSteps += 10;
          this.log(`Extended step budget to ${this.maxSteps} for fix attempt.`);
        }

        const stepHistoryRetry = this.recordedSteps
          .map((s, i) => `${i + 1}. ${s.description} (${s.status})`)
          .join('\n');

        await this.runAI(
          questDescription,
          SCRIPT_RETRY_CONTEXT(
            reviewResult.reason || 'Unknown',
            stepHistoryRetry
          )
        );

        this.log('Requesting second AI review after fix attempt...');
        reviewResult = await this.performAIReview(questDescription);
      }

      if (reviewResult.success) {
        if (this.recordedSteps.length > 0) {
          const lastRecordedStep =
            this.recordedSteps[this.recordedSteps.length - 1];
          if (
            lastRecordedStep.type !== 'wait' &&
            lastRecordedStep.type !== 'random_wait'
          ) {
            this.log('Appending final wait step to script...');
            this.recordedSteps.push({
              type: 'wait',
              params: { duration: 2000 },
              description: 'Final Wait',
              timestamp: new Date().toISOString(),
              status: 'success',
            });
          }

          this.log('Saving updated script for future runs...');
          ScriptManager.saveScript(questId, {
            id: questId,
            name: questId,
            description: questDescription,
            steps: this.recordedSteps,
            lastUpdated: new Date().toISOString(),
            successCriteria: existingScript?.successCriteria,
          });
        }

        this.saveQuestLog(questId, 'success', reviewResult.extractedData);
        // Emit result after AI review confirms success
        this.eventCallback({
          type: 'result',
          text: 'Quest completed successfully.',
        });
        this.eventCallback({ type: 'done' });
      } else {
        this.log(`AI Review Failed: ${reviewResult.reason}`);
        this.eventCallback({
          type: 'log',
          message: `Step failed: AI Review determined mission incomplete: ${reviewResult.reason}`,
        });
        this.saveQuestLog(questId, 'failed');
        this.eventCallback({
          type: 'error',
          message: `Mission flagged by AI Review: ${reviewResult.reason}`,
        });
      }
    } catch (error: unknown) {
      this.saveQuestLog(questId, 'failed');
      this.log(`Runner Error: ${error}`);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.eventCallback({ type: 'error', message: errorMessage });
    } finally {
      await this.browserService.close();
    }
  }

  private async performAIReview(
    questDescription: string
  ): Promise<{ success: boolean; reason?: string; extractedData?: any }> {
    if (!this.browserService.page) {
      return { success: false, reason: 'No browser page' };
    }

    const screenshotBase64 = await this.captureScreenshot();
    if (!screenshotBase64) {
      return { success: false, reason: 'Failed to capture screenshot' };
    }

    const stepContext = this.recordedSteps
      .map((s) => {
        if (s.type === 'type_text') {
          return `Typed: "${s.params.text}"`;
        }
        if (s.type === 'click') {
          return `Clicked: "${s.description}"`;
        }
        return null;
      })
      .filter(Boolean)
      .join('\n');

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: QA_REVIEW_PROMPT(questDescription, stepContext),
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: screenshotBase64,
            },
          },
        ],
      },
    ];

    try {
      const { content: responseContent, usage } =
        await this.bedrockService.invokeModel(messages, this.modelId, 2000);

      if (usage) {
        this.log(
          `QA Review Token Usage - Input: ${usage.input_tokens}, Output: ${usage.output_tokens}`
        );
        this.eventCallback({
          type: 'token_usage',
          input: usage.input_tokens,
          output: usage.output_tokens,
        });
      }

      const text = responseContent[0].text;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          success: result.success,
          reason: result.reason,
          extractedData: result.data,
        };
      }
      return { success: false, reason: 'Could not parse AI response' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, reason: `AI Error: ${msg}` };
    }
  }

  private async runAI(questDescription: string, context?: string) {
    if (!this.browserService.page) return;

    let failedSelectors: string[] = [];
    let lastUrl = this.browserService.page.url();
    const contextData = this.contextService.getContext();
    let consecutiveWaitCount = 0;

    const messages: any[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: BROWSER_AGENT_SYSTEM_PROMPT(
              questDescription,
              context,
              contextData.dynamicEmail
            ),
          },
        ],
      },
    ];

    const remainingSteps = this.maxSteps - this.recordedSteps.length;

    for (let i = 0; i < remainingSteps; i++) {
      // Optimization: Prune screenshots from historical messages to save tokens
      // We keep only the images in the very last message (the current state)
      for (let j = 0; j < messages.length - 1; j++) {
        const msg = messages[j];
        if (Array.isArray(msg.content)) {
          msg.content.forEach((c: any) => {
            if (c.type === 'tool_result' && Array.isArray(c.content)) {
              c.content.forEach((toolContent: any) => {
                if (toolContent.type === 'image') {
                  delete toolContent.source;
                  toolContent.type = 'text';
                  toolContent.text = '(Screenshot removed to save context)';
                }
              });
            }
          });
        }
      }

      const currentUrl = this.browserService.page.url();

      if (currentUrl !== lastUrl) {
        failedSelectors = [];
        lastUrl = currentUrl;
      }

      const hints = this.getSelectorHints(currentUrl);

      if (hints) {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: `(System Note) ${hints}` }],
        });
      }

      if (failedSelectors.length > 0) {
        const uniqueFailed = Array.from(new Set(failedSelectors));
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: FAILED_SELECTORS_NOTE(uniqueFailed),
            },
          ],
        });
      }

      this.log(`AI Step ${i + 1}: Thinking...`);

      // Apply sliding window to reduce token usage
      const trimmedMessages = this.trimMessageHistory(messages);

      const { content: responseContent, usage } =
        await this.bedrockService.invokeModel(
          trimmedMessages,
          this.modelId,
          3000,
          BROWSER_TOOLS
        );

      if (usage) {
        this.log(
          `AI Token Usage - Input: ${usage.input_tokens}, Output: ${usage.output_tokens}`
        );
        this.eventCallback({
          type: 'token_usage',
          input: usage.input_tokens,
          output: usage.output_tokens,
        });
      }

      messages.push({ role: 'assistant', content: responseContent });

      const toolUses = responseContent.filter(
        (c: any) => c.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        this.log('AI finished quest. Proceeding to verification...');
        await this.captureScreenshot();
        // Don't emit 'result' here - wait for AI review to complete in run()
        break;
      }

      const toolResults = [];
      const page = this.browserService.page;

      for (const toolUse of toolUses) {
        const toolId = toolUse.id || toolUse.tool_use_id;
        const toolName = toolUse.name;
        const toolInput = toolUse.input;

        // Log action with clean format
        const actionDesc = this.getStepDescription(toolName, toolInput);
        this.log(`[AI]: ${toolName} - ${actionDesc}`);

        let resultText = 'Success';

        try {
          if (
            (toolName === 'click' || toolName === 'type_text') &&
            failedSelectors.includes(toolInput.selector)
          ) {
            throw new Error(
              `You have already tried selector "${toolInput.selector}" on this page and it failed. Do not use it again. Pick a different selector.`
            );
          }

          if (toolName === 'navigate') {
            await page.goto(toolInput.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          } else if (toolName === 'type_text') {
            if (!toolInput.selector) {
              // No selector provided - type into currently focused element
              await page.keyboard.type(toolInput.text);
            } else {
              await page.waitForSelector(toolInput.selector, {
                state: 'visible',
                timeout: 5000,
              });
              await page.fill(toolInput.selector, toolInput.text);
            }
          } else if (toolName === 'click_at_coordinates') {
            // Capture element at coordinates BEFORE clicking (for replay verification)
            const elementAtCoords =
              await this.browserService.getElementAtCoordinates(
                toolInput.x,
                toolInput.y
              );
            if (elementAtCoords) {
              (toolInput as any)._targetElement = elementAtCoords;
              this.log(
                `  Target: ${elementAtCoords.tag} "${elementAtCoords.text}"`
              );
            }

            // Capture pre-state for change detection
            const preUrl = page.url();
            const preFingerprint =
              await this.browserService.getAccessibilityFingerprint();

            await page.mouse.click(toolInput.x, toolInput.y);

            // Detect and record change type for script replay
            const changeType = await this.detectChangeType(
              preUrl,
              preFingerprint
            );
            (toolInput as any)._detectedChange = changeType;
          } else if (toolName === 'click') {
            // Capture pre-state for change detection
            const preUrl = page.url();
            const preFingerprint =
              await this.browserService.getAccessibilityFingerprint();

            await page.waitForSelector(toolInput.selector, {
              state: 'visible',
              timeout: 5000,
            });
            await page.click(toolInput.selector);

            // Detect and record change type for script replay
            const changeType = await this.detectChangeType(
              preUrl,
              preFingerprint
            );
            (toolInput as any)._detectedChange = changeType;
          } else if (toolName === 'scroll') {
            const amount = toolInput.amount || BROWSER_CONFIG.scrollAmount;
            const deltaY = toolInput.direction === 'up' ? -amount : amount;
            await page.mouse.wheel(0, deltaY);
          } else if (toolName === 'press_key') {
            await page.keyboard.press(toolInput.key);
          } else if (toolName === 'random_wait') {
            const waitTime = Math.floor(
              Math.random() *
                ((toolInput.max || 2000) - (toolInput.min || 500) + 1) +
                (toolInput.min || 500)
            );
            await page.waitForTimeout(waitTime);
          }

          await page.waitForTimeout(2000);
          const newUrl = page.url();
          this.eventCallback({ type: 'url_update', url: newUrl });

          const recordedParams =
            this.contextService.reverseSubstitutions(toolInput);

          let stepDescription = `AI Action: ${toolName}`;
          if (toolName === 'click_at_coordinates') {
            stepDescription = `AI Action: click at (${toolInput.x}, ${
              toolInput.y
            }) - ${toolInput.description || 'element'}`;
          } else if (toolName === 'click') {
            const selector =
              this.contextService.applySubstitutions(toolInput).selector;
            if (selector.includes('text=')) {
              stepDescription = `AI Action: click "${selector.replace(
                'text=',
                ''
              )}"`;
            } else if (selector.includes('has-text')) {
              const match = selector.match(/has-text\('(.+?)'\)/);
              stepDescription = match
                ? `AI Action: click "${match[1]}"`
                : `AI Action: click element with text`;
            } else {
              stepDescription = `AI Action: click ${selector}`;
            }
          } else if (toolName === 'type_text') {
            const resolvedText =
              this.contextService.applySubstitutions(toolInput).text;
            stepDescription = `AI Action: type "${resolvedText}"`;
          }

          // Build the recorded step
          const recordedStep: QuestStep = {
            type: toolName as any,
            params: recordedParams,
            description: stepDescription,
            timestamp: new Date().toISOString(),
            status: 'success',
          };

          // For click actions, record the detected change type for script replay validation
          if (
            (toolName === 'click' || toolName === 'click_at_coordinates') &&
            (toolInput as any)._detectedChange
          ) {
            recordedStep.expectedChange = (toolInput as any)._detectedChange;
          }

          // For coordinate clicks, record the target element for replay verification
          if (
            toolName === 'click_at_coordinates' &&
            (toolInput as any)._targetElement
          ) {
            recordedStep.expectedElement = (toolInput as any)._targetElement;
          }

          this.recordedSteps.push(recordedStep);

          if (
            failedSelectors.length > 0 &&
            (toolName === 'click' || toolName === 'type_text')
          ) {
            const winningSelector = toolInput.selector;
            this.log(
              `Learning: Found working selector '${winningSelector}' after failures.`
            );
            KnowledgeBase.learn(currentUrl, winningSelector);
            failedSelectors = [];
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          this.log(`[Agent] Tool error (${toolName}): ${errMsg}`);
          resultText = `Error: ${errMsg}`;

          if (toolName === 'click' || toolName === 'type_text') {
            const badSelector = toolInput.selector;
            if (badSelector) {
              failedSelectors.push(badSelector);
            }
          }
        }

        // Store result WITHOUT screenshot - we'll batch one screenshot at the end
        toolResults.push({
          tool_use_id: toolId,
          resultText,
          toolName,
        });

        // Track consecutive wait tool usage for stuck detection
        if (toolName === 'random_wait' || toolName === 'wait') {
          consecutiveWaitCount++;
        } else {
          consecutiveWaitCount = 0;
        }
      }

      // Failsafe: Terminate if AI uses wait tool consecutively (appears stuck)
      if (consecutiveWaitCount >= MAX_CONSECUTIVE_WAITS) {
        const stuckMessage = `Mission failed: AI used wait tool ${MAX_CONSECUTIVE_WAITS} times consecutively. The agent appears to be stuck and unable to make progress.`;
        this.log(stuckMessage);
        this.eventCallback({
          type: 'error',
          message: stuckMessage,
        });
        throw new Error(stuckMessage);
      }

      // BATCHED SCREENSHOT: Capture only ONE screenshot after all tools execute
      // This saves significant tokens when multiple tools are called in one turn
      const screenshotBase64 = await this.captureScreenshot();

      // Build final tool results - only attach screenshot to the LAST tool result
      // This gives the AI the current state without redundant intermediate screenshots
      messages.push({
        role: 'user',
        content: toolResults.map((r, idx) => {
          const isLastTool = idx === toolResults.length - 1;
          const shouldIncludeScreenshot =
            isLastTool && screenshotBase64 && this.toolChangesPage(r.toolName);

          return {
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: [
              { type: 'text', text: r.resultText },
              ...(shouldIncludeScreenshot
                ? [
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: 'image/jpeg',
                        data: screenshotBase64,
                      },
                    },
                  ]
                : []),
            ],
          };
        }),
      });
    }

    if (this.recordedSteps.length >= this.maxSteps) {
      this.log('Max steps reached. Stopping quest.');
      this.eventCallback({
        type: 'result',
        text: 'Quest stopped because the maximum number of steps was reached.',
      });
    }
  }
}
