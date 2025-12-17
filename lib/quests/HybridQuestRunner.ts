import { BROWSER_TOOLS, AgentEvent } from '../agent/types';
import { ScriptManager } from './ScriptManager';
import { QuestStep, QuestLog } from './types';
import { KnowledgeBase } from './KnowledgeBase';
import { QuestLogManager } from './QuestLogManager';
import { QUESTS } from './definitions';
import { BedrockService } from '../services/bedrock';
import { BrowserService } from '../services/browser';
import { ValidationService } from '../services/validation';
import { ContextService } from '../services/context';

export class HybridQuestRunner {
  private bedrockService: BedrockService;
  private browserService: BrowserService;
  private validationService: ValidationService | null = null; // init after page launch
  private contextService: ContextService;
  private eventCallback: (event: AgentEvent) => void;
  private maxSteps: number;
  private recordedSteps: QuestStep[] = [];
  private startTime = 0;
  private modelId: string;

  constructor(eventCallback: (event: AgentEvent) => void, maxSteps = 30) {
    this.eventCallback = eventCallback;
    this.maxSteps = maxSteps;
    this.startTime = Date.now();
    this.bedrockService = new BedrockService();
    this.browserService = new BrowserService();
    this.contextService = new ContextService();
    this.modelId = 'eu.anthropic.claude-sonnet-4-20250514-v1:0'; // Legacy model ID from original file
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[Runner] ${message}` });
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

  private getSelectorHints(url: string): string {
    const selectors = KnowledgeBase.getProvenSelectors(url);
    if (selectors.length === 0) {
      return '';
    }

    return `
    HISTORICAL KNOWLEDGE:
    The following selectors have successfully worked on this page in the past.
    Prefer them if they seem relevant to your current goal:
    ${selectors.map((s) => `- ${s}`).join('\n')}
    `;
  }

  private async executeStep(step: QuestStep, retry = true): Promise<boolean> {
    if (!this.browserService.page) {
      return false;
    }

    const finalParams = this.contextService.applySubstitutions(step.params);

    this.log(
      `Executing cached step: ${step.type} ${JSON.stringify(finalParams)}`
    );

    try {
      const page = this.browserService.page;

      if (step.type === 'navigate') {
        await page.goto(finalParams.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } else if (step.type === 'type_text') {
        if (finalParams.iframe_selector) {
          const frame = page.frameLocator(finalParams.iframe_selector);
          const locator = frame.locator(finalParams.selector);
          await locator.waitFor({ state: 'visible', timeout: 5000 });
          await locator.fill(finalParams.text);
        } else {
          await page.waitForSelector(finalParams.selector, {
            state: 'visible',
            timeout: 5000,
          });
          await page.fill(finalParams.selector, finalParams.text);
        }
      } else if (step.type === 'click') {
        if (finalParams.iframe_selector) {
          const frame = page.frameLocator(finalParams.iframe_selector);
          const locator = frame.locator(finalParams.selector);
          await locator.waitFor({ state: 'visible', timeout: 5000 });
          await locator.click();
        } else {
          await page.waitForSelector(finalParams.selector, {
            state: 'visible',
            timeout: 5000,
          });
          await page.click(finalParams.selector);
        }
      } else if (step.type === 'press_key') {
        await page.keyboard.press(finalParams.key);
      } else if (step.type === 'wait' || step.type === 'random_wait') {
        const duration = finalParams.duration || 1000;
        await page.waitForTimeout(duration);
      }

      await page.waitForTimeout(1000);
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
        this.log(`Step failed: ${msg}. Waiting 2s and retrying...`);
        await this.browserService.page.waitForTimeout(2000);
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
    const aiSteps = this.recordedSteps.filter((s) =>
      s.description?.startsWith('AI Action')
    ).length;
    const scriptSteps = this.recordedSteps.length - aiSteps;

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
          const review = await this.performAIReview(questId, questDescription);

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
          ? `CRITICAL: The previous script failed at step ${
              scriptFailedIndex + 1
            }.
             We are currently in the middle of the quest.

             HISTORY OF EXECUTED STEPS:
             ${stepHistory}

             YOUR TASK:
             Resume the quest from the current state. Do NOT restart the quest.
             Analyze the current page state (screenshot) and determine the next logical step to proceed towards the goal.
             The last successful action was: ${
               lastStep?.description || 'None'
             }.`
          : undefined
      );

      this.log('Requesting final AI review of mission status...');
      let reviewResult = await this.performAIReview(questId, questDescription);

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
          `CRITICAL: The previous execution was deemed unsuccessful by the QA Agent.
             REASON: ${reviewResult.reason}

             HISTORY OF EXECUTED STEPS:
             ${stepHistoryRetry}

             YOUR TASK:
             Fix the issue and complete the quest. Verify the state before stopping.
             You are continuing from the current state shown in the screenshot.`
        );

        this.log('Requesting second AI review after fix attempt...');
        reviewResult = await this.performAIReview(questId, questDescription);
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
    questId: string,
    questDescription: string
  ): Promise<{ success: boolean; reason?: string; extractedData?: any }> {
    if (!this.browserService.page) {
      return { success: false, reason: 'No browser page' };
    }

    const screenshotBase64 = await this.captureScreenshot();
    if (!screenshotBase64) {
      return { success: false, reason: 'Failed to capture screenshot' };
    }

    const questDef = QUESTS.find((q) => q.id === questId);
    const expectedOutput = questDef?.expectedOutput || [];

    const stepContext = this.recordedSteps
      .map((s) => {
        if (s.type === 'type_text') return `Typed: "${s.params.text}"`;
        if (s.type === 'click') return `Clicked: "${s.description}"`;
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
            text: `You are a QA and Data Extraction agent.

            GOAL: "${questDescription}"

            1. VERIFICATION:
            Look at the screenshot. Has the goal been FULLY accomplished?
            - If it's a signup flow, are we on a "Welcome" or "Success" page?
            - If there are error messages, validation errors, or we are still on a form, it is NOT successful.

            2. DATA EXTRACTION:
            Extract the following fields based on the execution history and the final screen:
            ${JSON.stringify(expectedOutput, null, 2)}

            EXECUTION HISTORY:
            ${stepContext}

            Respond with ONLY a JSON object:
            {
              "success": boolean,
              "reason": "short explanation of why",
              "data": { ...extracted fields... }
            }`,
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
    const contextData = this.contextService.getContext();

    const messages: any[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a browser automation agent.
            Your goal is to fulfill this request: "${questDescription}"
            ${context ? `CONTEXT: ${context}` : ''}

            DATA RULES:
            1. If you need to sign up with a NEW email, use this one: ${
              contextData.dynamicEmail
            }
            2. If you need a credit card, use:
               - Number: 4111 1111 1111 1111
               - Expiry: 03/30
               - CVC: 737
               - Name: Jordan McInnis
               - Zip: 90210 (or any valid US zip)

            GUIDELINES:
            1. Use the available tools.
            2. Handle captchas if seen.
            3. Log your actions.
            4. When filling out forms, prefer using the 'press_key' tool with 'Tab' to navigate between fields after focusing the first field.
            5. IFRAMES:
               - The credit card fields (Number, Expiry, CVC) are inside iframes.
               - You MUST use the 'iframe_selector' parameter when interacting with these.
               - Look for iframes with titles like 'Secure Credit Card Frame...'.
            6. SELECTOR STRATEGIES (IMPORTANT):
               - Highest preference to the following exceptions: elements with "downshift"
               - Prefer text-based selectors for buttons and links: "text=Sign Up" or "button:has-text('Continue')".
               - Use stable attributes if available: "[data-testid='submit']", "id='email'", or "name='password'".
               - Avoid brittle selectors based on long chains (div > div > span) or dynamic classes.
               - For complex elements, use ":has(...)" to target a parent based on child content.
            `,
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
      const hints = this.getSelectorHints(currentUrl);

      if (hints) {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: `(System Note) ${hints}` }],
        });
      }

      this.log(`AI Step ${i + 1}: Thinking...`);

      const { content: responseContent, usage } =
        await this.bedrockService.invokeModel(
          messages,
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
        this.log('AI finished quest.');
        await this.captureScreenshot();

        const textBlock = responseContent.find((c: any) => c.type === 'text');
        this.eventCallback({
          type: 'result',
          text: textBlock?.text || 'Quest Completed via AI',
        });
        break;
      }

      const toolResults = [];
      const page = this.browserService.page;

      for (const toolUse of toolUses) {
        const toolId = toolUse.id || toolUse.tool_use_id;
        const toolName = toolUse.name;
        const toolInput = toolUse.input;

        this.log(`AI Executing: ${toolName} ${JSON.stringify(toolInput)}`);

        let resultText = 'Success';

        try {
          if (toolName === 'navigate') {
            await page.goto(toolInput.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          } else if (toolName === 'type_text') {
            if (toolInput.iframe_selector) {
              const frame = page.frameLocator(toolInput.iframe_selector);
              const locator = frame.locator(toolInput.selector);
              await locator.waitFor({ state: 'visible', timeout: 5000 });
              await locator.fill(toolInput.text);
            } else {
              await page.waitForSelector(toolInput.selector, {
                state: 'visible',
                timeout: 5000,
              });
              await page.fill(toolInput.selector, toolInput.text);
            }
          } else if (toolName === 'click') {
            if (toolInput.iframe_selector) {
              const frame = page.frameLocator(toolInput.iframe_selector);
              const locator = frame.locator(toolInput.selector);
              await locator.waitFor({ state: 'visible', timeout: 5000 });
              await locator.click();
            } else {
              await page.waitForSelector(toolInput.selector, {
                state: 'visible',
                timeout: 5000,
              });
              await page.click(toolInput.selector);
            }
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
          if (toolName === 'click') {
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

          this.recordedSteps.push({
            type: toolName as any,
            params: recordedParams,
            description: stepDescription,
            timestamp: new Date().toISOString(),
            status: 'success',
          });

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
          // console.error(`[Agent] Tool error (${toolName}):`, errMsg); // Removed console.error
          this.log(`[Agent] Tool error (${toolName}): ${errMsg}`); // Log instead
          resultText = `Error: ${errMsg}`;

          if (toolName === 'click' || toolName === 'type_text') {
            const badSelector = toolInput.selector;
            if (badSelector) {
              failedSelectors.push(badSelector);
            }
          }
        }

        const screenshotBase64 = await this.captureScreenshot();

        toolResults.push({
          tool_use_id: toolId,
          content: [
            { type: 'text', text: resultText },
            ...(screenshotBase64
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
        });
      }

      messages.push({
        role: 'user',
        content: toolResults.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
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
