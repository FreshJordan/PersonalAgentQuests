import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { chromium, Browser, Page } from 'playwright';
import { BROWSER_TOOLS, Message, AgentEvent } from '../agent/types';
import { ScriptManager } from './ScriptManager';
import { QuestScript, QuestStep, StepValidation } from './types';
import { KnowledgeBase } from './KnowledgeBase';
import { QuestLogManager, QuestLog } from './QuestLogManager';
import { QUESTS } from './definitions';

type QuestContext = Record<string, string>;

export class HybridQuestRunner {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private eventCallback: (event: AgentEvent) => void;
  private maxSteps: number;
  private recordedSteps: QuestStep[] = [];
  private currentContext: QuestContext = {};

  private startTime: number = 0;

  constructor(eventCallback: (event: AgentEvent) => void, maxSteps = 30) {
    this.eventCallback = eventCallback;
    this.maxSteps = maxSteps;
    this.startTime = Date.now();

    const region = process.env.AWS_REGION || 'eu-west-1';
    const profile = process.env.AWS_PROFILE || 'sso-bedrock';

    this.client = new BedrockRuntimeClient({
      region: region,
      credentials: fromNodeProviderChain({ profile }),
    });

    this.modelId = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  }

  private generateContext(): QuestContext {
    const date = new Date();
    const shortMonth = date
      .toLocaleString('default', { month: 'short' })
      .toLowerCase();
    const day = date.getDate();
    const shortDate = `${shortMonth}${day}`;
    const randomNum = Math.floor(Math.random() * 100) + 1;
    const dynamicEmail = `jordan.mcinnis+${shortDate}${randomNum}@hellofresh.ca`;

    return {
      dynamicEmail,
      // Add other dynamic values here in the future
      // e.g., dynamicName: 'John Doe',
    };
  }

  private log(message: string) {
    this.eventCallback({ type: 'log', message: `[Runner] ${message}` });
  }

  private async captureScreenshot() {
    if (!this.page) return;
    try {
      const buffer = await this.page.screenshot({
        type: 'jpeg',
        quality: 60,
      });
      this.eventCallback({
        type: 'screenshot',
        image: buffer.toString('base64'),
      });
      return buffer.toString('base64');
    } catch (e) {
      this.log('Failed to capture screenshot');
      return null;
    }
  }

  // Helper to substitute placeholders like {{key}} with values from context
  private applyContextSubstitutions(params: any): any {
    if (!this.currentContext) return params;
    const newParams = { ...params };

    for (const [key, value] of Object.entries(this.currentContext)) {
      const placeholder = `{{${key}}}`;
      // Iterate over string properties in params to find and replace
      for (const paramKey in newParams) {
        if (
          typeof newParams[paramKey] === 'string' &&
          newParams[paramKey].includes(placeholder)
        ) {
          newParams[paramKey] = newParams[paramKey].replace(placeholder, value);
          this.log(`Substituted ${key}: ${value}`);
        }
      }
    }
    return newParams;
  }

  // Helper to reverse substitute values with placeholders like {{key}} for recording
  private applyReverseContextSubstitutions(params: any): any {
    if (!this.currentContext) return params;
    const newParams = { ...params };

    for (const [key, value] of Object.entries(this.currentContext)) {
      const placeholder = `{{${key}}}`;
      // Iterate over string properties in params to find and replace
      for (const paramKey in newParams) {
        if (
          typeof newParams[paramKey] === 'string' &&
          newParams[paramKey].includes(value)
        ) {
          newParams[paramKey] = newParams[paramKey].replace(value, placeholder);
          this.log(`Recorded step with dynamic ${key} placeholder`);
        }
      }
    }
    return newParams;
  }

  // Helper validation function
  private async validateCondition(
    validation: StepValidation
  ): Promise<boolean> {
    if (!this.page) return false;
    const timeout = validation.timeout || 5000;

    try {
      if (validation.type === 'url_contains') {
        await this.page.waitForURL(
          (url) => url.toString().includes(validation.value),
          {
            timeout,
          }
        );
      } else if (validation.type === 'element_visible') {
        await this.page.waitForSelector(validation.value, {
          state: 'visible',
          timeout,
        });
      } else if (validation.type === 'element_hidden') {
        await this.page.waitForSelector(validation.value, {
          state: 'hidden',
          timeout,
        });
      } else if (validation.type === 'text_present') {
        // Playwright text locator
        await this.page.waitForSelector(`text=${validation.value}`, {
          timeout,
        });
      }
      this.log(`Validation passed: ${validation.type} "${validation.value}"`);
      return true;
    } catch (e) {
      this.log(`Validation failed: ${validation.type} "${validation.value}"`);
      return false;
    }
  }

  // 1. Add this method to helper get hints
  private getSelectorHints(url: string): string {
    const selectors = KnowledgeBase.getProvenSelectors(url);
    if (selectors.length === 0) return '';

    return `
    HISTORICAL KNOWLEDGE:
    The following selectors have successfully worked on this page in the past.
    Prefer them if they seem relevant to your current goal:
    ${selectors.map((s) => `- ${s}`).join('\n')}
    `;
  }

  private async executeStep(step: QuestStep, retry = true): Promise<boolean> {
    if (!this.page) return false;

    // Apply substitution to params dynamically based on context keys
    const finalParams = this.applyContextSubstitutions(step.params);

    this.log(
      `Executing cached step: ${step.type} ${JSON.stringify(finalParams)}`
    );

    try {
      if (step.type === 'navigate') {
        await this.page.goto(finalParams.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } else if (step.type === 'type_text') {
        if (finalParams.iframe_selector) {
          const frame = this.page.frameLocator(finalParams.iframe_selector);
          const locator = frame.locator(finalParams.selector);
          await locator.waitFor({ state: 'visible', timeout: 5000 });
          await locator.fill(finalParams.text);
        } else {
          await this.page.waitForSelector(finalParams.selector, {
            state: 'visible',
            timeout: 5000,
          });
          await this.page.fill(finalParams.selector, finalParams.text);
        }
      } else if (step.type === 'click') {
        if (finalParams.iframe_selector) {
          const frame = this.page.frameLocator(finalParams.iframe_selector);
          const locator = frame.locator(finalParams.selector);
          await locator.waitFor({ state: 'visible', timeout: 5000 });
          await locator.click();
        } else {
          await this.page.waitForSelector(finalParams.selector, {
            state: 'visible',
            timeout: 5000,
          });
          await this.page.click(finalParams.selector);
        }
      } else if (step.type === 'press_key') {
        await this.page.keyboard.press(finalParams.key);
      } else if (step.type === 'wait' || step.type === 'random_wait') {
        const duration = finalParams.duration || 1000;
        await this.page.waitForTimeout(duration);
      }

      await this.page.waitForTimeout(1000); // Small wait after action
      const newUrl = this.page.url();
      this.eventCallback({ type: 'url_update', url: newUrl });
      await this.captureScreenshot();

      // AFTER successful execution:
      if (step.validation) {
        const isValid = await this.validateCondition(step.validation);
        if (!isValid) {
          throw new Error('Step validation failed');
        }
      }

      return true;
    } catch (e: any) {
      if (retry) {
        this.log(`Step failed: ${e.message}. Waiting 2s and retrying...`);
        await this.page.waitForTimeout(2000);
        return this.executeStep(step, false);
      }
      this.log(`Step failed after retry: ${e.message}`);
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
    // Correctly count script steps: total steps - AI steps
    // Note: recordedSteps contains ALL steps (script + AI) for the final log
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
      context: this.currentContext, // Save context
      summary: extractedData, // Store extracted data as summary
    };

    QuestLogManager.saveLog(log);
    this.log(
      `Quest log saved. Duration: ${durationSeconds}s, Steps: ${this.recordedSteps.length}`
    );
  }

  public async run(questId: string, questDescription: string) {
    try {
      this.currentContext = this.generateContext();
      this.log('Context initialized with dynamic variables:');
      for (const [key, value] of Object.entries(this.currentContext)) {
        this.log(`  - ${key}: ${value}`);
      }

      this.log('Launching browser...');
      const avgSteps = QuestLogManager.getAverageSteps(questId);
      if (avgSteps > 0) {
        this.log(`Historical Average Steps: ${avgSteps}`);
      }

      this.browser = await chromium.launch({ headless: true });
      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: 1280, height: 800 });

      // 1. Try to load existing script
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
          // Record successful steps so we keep them
          this.recordedSteps.push(existingScript.steps[i]);
        }

        // If we made it here, all steps executed and validated successfully.
        // Now check global success criteria.
        if (scriptFailedIndex === -1 && existingScript.successCriteria) {
          this.log('Script finished. Verifying final success criteria...');
          for (const criteria of existingScript.successCriteria) {
            const isValid = await this.validateCondition(criteria);
            if (!isValid) {
              this.log(
                'Global success criteria failed. Script was incomplete.'
              );
              scriptFailedIndex = existingScript.steps.length; // Force AI to pick up at the end
              break;
            }
          }
        }

        if (scriptFailedIndex === -1) {
          this.log('Quest completed successfully using cached script!');
          this.saveQuestLog(questId, 'success');
          this.eventCallback({
            type: 'result',
            text: 'Quest completed efficiently using saved script.',
          });
          this.eventCallback({ type: 'done' });
          return;
        }
      } else {
        this.log('No existing script found. Starting fresh with AI.');
      }

      // 2. Fallback to AI
      // If scriptFailedIndex is set, we need to prune the recorded steps
      // to remove the failed step and any subsequent ones (which haven't run yet).
      // However, we've only pushed successful steps to this.recordedSteps so far.
      // But if scriptFailedIndex points to the *end* (global validation failed),
      // we keep all steps and just ask AI to finish.

      // If script failed in the middle (scriptFailedIndex < recordedSteps.length)
      // that logic is slightly off because we only push *successful* steps.
      // If executeStep fails, we DON'T push it.
      // So this.recordedSteps contains [0...i-1].
      // scriptFailedIndex is i.
      // So we are good to go. The recorded steps are only the valid ones up to the crash.

      this.log(
        `Handing over to AI. Context: Script failed at index ${scriptFailedIndex}`
      );

      // Force status update to AI Takeover
      this.eventCallback({
        type: 'log',
        message: 'Switching to AI mode (Force Takeover)',
      });

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

      // 3. Save updated script
      // We overwrite the old script with the new sequence (Valid Old Steps + New AI Steps)
      if (this.recordedSteps.length > 0) {
        this.log('Saving updated script for future runs...');
        ScriptManager.saveScript(questId, {
          id: questId,
          name: questId, // TODO: generate better name
          description: questDescription,
          steps: this.recordedSteps,
          lastUpdated: new Date().toISOString(),
          successCriteria: existingScript?.successCriteria, // Preserve success criteria
        });
      }

      // 4. Final AI Review
      this.log('Requesting final AI review of mission status...');
      const reviewResult = await this.performAIReview(
        questId,
        questDescription
      );

      if (reviewResult.success) {
        this.saveQuestLog(questId, 'success', reviewResult.extractedData);
        this.eventCallback({ type: 'done' });
      } else {
        this.log(`AI Review Failed: ${reviewResult.reason}`);
        this.eventCallback({
          type: 'log',
          message: `Step failed: AI Review determined mission incomplete: ${reviewResult.reason}`,
        });
        // We mark as failed in log, but in UI 'Step failed' triggers 'possible_issues'
        this.saveQuestLog(questId, 'failed');
        this.eventCallback({
          type: 'error',
          message: `Mission flagged by AI Review: ${reviewResult.reason}`,
        });
      }
    } catch (error) {
      this.saveQuestLog(questId, 'failed');
      console.error('Runner Error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.eventCallback({ type: 'error', message: errorMessage });
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  private async performAIReview(
    questId: string,
    questDescription: string
  ): Promise<{ success: boolean; reason?: string; extractedData?: any }> {
    if (!this.page) return { success: false, reason: 'No browser page' };

    const screenshotBase64 = await this.captureScreenshot();
    if (!screenshotBase64)
      return { success: false, reason: 'Failed to capture screenshot' };

    const questDef = QUESTS.find((q) => q.id === questId);
    const expectedOutput = questDef?.expectedOutput || [];

    // Gather context from recorded steps to help the AI extract data
    const stepContext = this.recordedSteps
      .map((s) => {
        if (s.type === 'type_text') return `Typed: "${s.params.text}"`;
        if (s.type === 'click') return `Clicked: "${s.description}"`;
        return null;
      })
      .filter(Boolean)
      .join('\n');

    const messages: Message[] = [
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
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        messages: messages,
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(payload)),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const text = responseBody.content[0].text;

      // Extract JSON from response
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
    } catch (e: any) {
      return { success: false, reason: `AI Error: ${e.message}` };
    }
  }

  private async runAI(questDescription: string, context?: string) {
    if (!this.page || !this.currentContext) return;

    // Track failed attempts for the current logical step
    let failedSelectors: string[] = [];

    const messages: Message[] = [
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
              this.currentContext['dynamicEmail']
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

    // Allow AI to run for remaining steps
    const remainingSteps = this.maxSteps - this.recordedSteps.length;

    for (let i = 0; i < remainingSteps; i++) {
      // --- CHANGE START: Inject Hints ---
      const currentUrl = this.page.url();
      const hints = this.getSelectorHints(currentUrl);

      // We push a ephemeral system note with hints if we have them
      if (hints) {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: `(System Note) ${hints}` }],
        });
      }
      // --- CHANGE END ---

      this.log(`AI Step ${i + 1}: Thinking...`);

      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 3000,
        messages: messages,
        tools: BROWSER_TOOLS,
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(JSON.stringify(payload)),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (responseBody.error) {
        throw new Error(JSON.stringify(responseBody.error));
      }

      const responseContent = responseBody.content;
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
      for (const toolUse of toolUses) {
        const toolId = toolUse.id || toolUse.tool_use_id;
        const toolName = toolUse.name;
        const toolInput = toolUse.input;

        this.log(`AI Executing: ${toolName} ${JSON.stringify(toolInput)}`);

        let resultText = 'Success';

        try {
          if (toolName === 'navigate') {
            await this.page.goto(toolInput.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          } else if (toolName === 'type_text') {
            if (toolInput.iframe_selector) {
              const frame = this.page.frameLocator(toolInput.iframe_selector);
              const locator = frame.locator(toolInput.selector);
              await locator.waitFor({ state: 'visible', timeout: 5000 });
              await locator.fill(toolInput.text);
            } else {
              await this.page.waitForSelector(toolInput.selector, {
                state: 'visible',
                timeout: 5000,
              });
              await this.page.fill(toolInput.selector, toolInput.text);
            }
          } else if (toolName === 'click') {
            if (toolInput.iframe_selector) {
              const frame = this.page.frameLocator(toolInput.iframe_selector);
              const locator = frame.locator(toolInput.selector);
              await locator.waitFor({ state: 'visible', timeout: 5000 });
              await locator.click();
            } else {
              await this.page.waitForSelector(toolInput.selector, {
                state: 'visible',
                timeout: 5000,
              });
              await this.page.click(toolInput.selector);
            }
          } else if (toolName === 'press_key') {
            await this.page.keyboard.press(toolInput.key);
          } else if (toolName === 'random_wait') {
            const waitTime = Math.floor(
              Math.random() *
                ((toolInput.max || 2000) - (toolInput.min || 500) + 1) +
                (toolInput.min || 500)
            );
            await this.page.waitForTimeout(waitTime);
          }

          await this.page.waitForTimeout(2000);
          const newUrl = this.page.url();
          this.eventCallback({ type: 'url_update', url: newUrl });

          // Apply reverse substitution for recording
          // This now dynamically checks all context values against all string params
          const recordedParams =
            this.applyReverseContextSubstitutions(toolInput);

          // Record this successful AI step
          let stepDescription = `AI Action: ${toolName}`;
          if (toolName === 'click') {
            // Try to make a human readable description
            // Resolve placeholders in selector for description if present
            const selector = this.applyContextSubstitutions(toolInput).selector;
            if (selector.includes('text=')) {
              stepDescription = `AI Action: click "${selector.replace(
                'text=',
                ''
              )}"`;
            } else if (selector.includes('has-text')) {
              const match = selector.match(/has-text\('(.+?)'\)/);
              if (match) {
                stepDescription = `AI Action: click "${match[1]}"`;
              } else {
                stepDescription = `AI Action: click element with text`;
              }
            } else {
              stepDescription = `AI Action: click ${selector}`;
            }
          } else if (toolName === 'type_text') {
            // Resolve placeholders in text for description
            const resolvedText = this.applyContextSubstitutions(toolInput).text;
            // Also update the recordedParams with resolved text for storage
            recordedParams.text = resolvedText;
            stepDescription = `AI Action: type "${resolvedText}"`;
          }

          this.recordedSteps.push({
            type: toolName as any,
            params: recordedParams,
            description: stepDescription,
            timestamp: new Date().toISOString(),
            status: 'success',
          });

          // --- CHANGE START: Learning Logic ---
          // If we succeeded and we had previous failures in this loop, it means we found a fix.
          if (
            failedSelectors.length > 0 &&
            (toolName === 'click' || toolName === 'type_text')
          ) {
            const winningSelector = toolInput.selector; // or iframe_selector
            this.log(
              `Learning: Found working selector '${winningSelector}' after failures.`
            );
            KnowledgeBase.learn(currentUrl, winningSelector);
            failedSelectors = []; // Reset
          }
          // --- CHANGE END ---
        } catch (e: any) {
          const errMsg = e.message || String(e);
          console.error(`[Agent] Tool error (${toolName}):`, errMsg);
          resultText = `Error: ${errMsg}`;

          // --- CHANGE START: Failure Tracking ---
          if (toolName === 'click' || toolName === 'type_text') {
            const badSelector = toolInput.selector;
            if (badSelector) failedSelectors.push(badSelector);
          }
          // --- CHANGE END ---
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
