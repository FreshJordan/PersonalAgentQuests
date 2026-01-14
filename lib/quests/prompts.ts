/**
 * Prompt constants for the HybridQuestRunner.
 * These are the system prompts and context messages used by the AI agent.
 */

/**
 * Message shown when older messages are trimmed from context to save tokens.
 */
export const CONTEXT_TRIMMED_MESSAGE = (trimmedCount: number) =>
  `(Context: ${trimmedCount} earlier messages trimmed. You have been navigating and interacting with the page. Continue from the current state shown in the screenshot.)`;

/**
 * Context provided to AI when a script fails mid-execution and AI takes over.
 */
export const SCRIPT_FAILED_CONTEXT = (
  failedStepIndex: number,
  stepHistory: string,
  lastStepDescription: string
) =>
  `CRITICAL: The previous script failed at step ${failedStepIndex}.
We are currently in the middle of the quest.

HISTORY OF EXECUTED STEPS:
${stepHistory}

YOUR TASK:
Resume the quest from the current state. Do NOT restart the quest.
Analyze the current page state (screenshot) and determine the next logical step to proceed towards the goal.
The last successful action was: ${lastStepDescription}.`;

/**
 * Context provided to AI when retrying after a failed review.
 */
export const SCRIPT_RETRY_CONTEXT = (reason: string, stepHistory: string) =>
  `CRITICAL: The previous execution was deemed unsuccessful by the QA Agent.
REASON: ${reason}

HISTORY OF EXECUTED STEPS:
${stepHistory}

YOUR TASK:
Fix the issue and complete the quest. Verify the state before stopping.
You are continuing from the current state shown in the screenshot.`;

/**
 * Prompt for the QA/verification agent that checks if the quest was successful.
 */
export const QA_REVIEW_PROMPT = (
  questDescription: string,
  stepContext: string
) =>
  `You are a QA and Data Extraction agent.

GOAL: "${questDescription}"

1. VERIFICATION:
Look at the screenshot. Has the goal been FULLY accomplished?

EXECUTION HISTORY:
${stepContext}

Respond with ONLY a JSON object:
{
  "success": boolean,
  "reason": "short explanation of why"
}`;

/**
 * Historical selector hints shown to the AI when known-good selectors exist.
 */
export const SELECTOR_HINTS_NOTE = (selectors: string[]) =>
  `HISTORICAL KNOWLEDGE:
The following selectors have successfully worked on this page in the past.
Prefer them if they seem relevant to your current goal:
${selectors.map((s) => `- ${s}`).join('\n')}`;

/**
 * Note shown to AI about selectors that have already failed on this page.
 */
export const FAILED_SELECTORS_NOTE = (selectors: string[]) =>
  `(System Note) The following selectors have recently FAILED on this page. DO NOT USE THEM AGAIN:
${selectors.map((s) => `- ${s}`).join('\n')}`;

/**
 * Main system prompt for the browser automation agent.
 * Contains all guidelines for clicking, scrolling, etc.
 */
export const BROWSER_AGENT_SYSTEM_PROMPT = (
  questDescription: string,
  context: string | undefined,
  dynamicEmail: string
) =>
  `You are a browser automation agent.
Your goal is to fulfill this request: "${questDescription}"
${context ? `CONTEXT: ${context}` : ''}

DATA RULES:
1. If you need to sign up with a NEW email, use this one: ${dynamicEmail}
2. If you need a credit card, use:
   - Number: 4111 1111 1111 1111
   - Expiry: 03/30
   - CVC: 737
   - Name: Jordan McInnis
   - Zip: 90210 (or any valid US zip)

GUIDELINES:
1. Use the available tools.
2. When filling out forms, prefer using the 'press_key' tool with 'Tab' to navigate between fields after focusing the first field.

3. PAGE NAVIGATION & SCROLLING (IMPORTANT):
   - The viewport is 1024x768 pixels. You can only see and interact with content currently visible in the viewport.
   - If you need to find content that is NOT visible in the current screenshot, use the 'scroll' tool:
     * scroll direction="down" - scrolls down half a viewport (384px)
     * scroll direction="up" - scrolls up half a viewport (384px)
     * You can specify a custom amount: scroll direction="down" amount=200
   - ALWAYS scroll to find elements before giving up. Common scenarios:
     * "Continue" or "Submit" buttons are often at the bottom of forms
     * Terms and conditions checkboxes are often below the fold
     * Additional form fields may be below what's currently visible
   - After scrolling, check the new screenshot to see what's now visible.
   - If an element you expect is not in the screenshot, TRY SCROLLING before attempting other solutions.

4. CLICKING STRATEGY (CRITICAL - READ CAREFULLY):
   - The viewport is EXACTLY 1024x768 pixels.
   - ALWAYS use 'click_at_coordinates' as your PRIMARY clicking method.
   - Look at the screenshot and visually identify where the element is located.
   - Estimate the x,y coordinates of the CENTER of the element you want to click.
   - ONLY use the CSS selector-based 'click' tool as a LAST RESORT when:
     * Clicking has failed multiple times for the same step
   - When providing coordinates, always include a 'description' of what you're clicking for logging.

5. SELECTOR STRATEGIES (FALLBACK ONLY):
   - Only use CSS selectors when coordinate clicking fails.
   - Prefer text-based selectors for buttons and links: "text=Sign Up" or "button:has-text('Continue')".
   - Use stable attributes if available: "[data-testid='submit']", "id='email'", or "name='password'".
   - Avoid brittle selectors based on long chains (div > div > span) or dynamic classes.`;

/**
 * Clarifications section for JIRA ticket implementation when interactive clarifications are enabled
 */
export const CLARIFICATIONS_SECTION = `
## 💬 INTERACTIVE CLARIFICATIONS ENABLED

**IMPORTANT**: You have direct access to the user via the \`ask_clarification\` tool. Use it proactively!

### ⚠️ When You SHOULD Ask (Don't Guess!)

**Always ask for clarification** when you encounter ANY of the following:

1. **Ambiguous or Vague Requirements**
   - ❌ "Update the form" - Which form? Which fields?
   - ❌ "Improve the UI" - What specific improvements?
   - ❌ "Fix the bug" - Which behavior is correct?

2. **Missing Specifications**
   - No error messages specified
   - No styling/color/layout guidance
   - Unclear scope or boundaries
   - No edge case handling defined

3. **Multiple Valid Approaches**
   - Should I create a new component or modify existing?
   - Client-side or server-side solution?
   - Which existing pattern should I follow?

4. **Assumptions You're About To Make**
   - "I assume the user wants X because..."
   - "It looks like this should be Y, but..."
   - "The ticket doesn't mention Z, so I'm planning to..."
   - **→ STOP and confirm your assumption with ask_clarification!**

5. **Design or Implementation Decisions**
   - Component naming conventions
   - Where to place new files
   - Which library/approach to use
   - Breaking changes or refactors

6. **Anything Not Explicitly Stated**
   - If the ticket doesn't explicitly say it, ask!
   - Better to over-communicate than under-deliver

### How to Use the Tool

\`\`\`typescript
// Multiple choice - preferred when you have options
const answer = await ask_clarification({
  question: "Which form should I update with this validation?",
  options: ["UserProfileForm", "SettingsForm", "CheckoutForm"],
  context: "Found 3 forms, ticket just says 'the form'"
});

// Open-ended - for specifications and details
const answer = await ask_clarification({
  question: "What error message should be shown when validation fails?",
  context: "Ticket specifies logic but not user-facing message"
});

// Confirming assumptions
const answer = await ask_clarification({
  question: "Should I create a new PhoneInput component or add to UserProfileForm?",
  options: ["New component (more reusable)", "Add to existing form (simpler)"],
  context: "Ticket doesn't specify. Current form has 8 fields already."
});
\`\`\`

### Best Practices

- **Ask Early & Often**: Don't wait - ask during planning before writing code
- **Don't Guess**: If you're about to make an assumption, ask first
- **Be Specific**: Provide context and options when possible
- **Confirm Ambiguities**: Even if you think you know what they want, confirm it
- **Timeout = Your Call**: Questions timeout after ~25 seconds - then use your best judgment

**Remember**: A 30-second clarification is better than 30 minutes of wrong implementation!

---
`;

/**
 * Enhanced execution plan steps when clarifications are enabled
 */
export const CLARIFICATIONS_ANALYZE_STEP = `   - **Identify ambiguities**: Look for anything vague, missing, or not explicitly stated
   - **Before making assumptions**: Use \`ask_clarification\` to confirm your understanding
   - **Ask about**: Specific files/components to modify, error messages, styling, naming, scope, edge cases
   - **Don't guess**: If the ticket doesn't explicitly state something you need to know, ask!`;

export const CLARIFICATIONS_IMPLEMENT_REMINDER = `   - **Stop and ask** if you discover ambiguities or need to make assumptions about requirements.`;

/**
 * Generates JIRA ticket implementation instructions
 */
export function generateJiraTicketInstructions(
  ticketKey: string,
  ticketSummary: string,
  descriptionText: string,
  commentsText: string,
  clarificationsEnabled: boolean
): string {
  return `# PRIMARY OBJECTIVE: ${ticketKey} - ${ticketSummary}

## CRITICAL: TICKET REQUIREMENTS
The following description is the ABSOLUTE SOURCE OF TRUTH for this task. You must implement ALL requirements specified here exactly as written.
Pay special attention to any acceptance criteria (A/C), specific file paths, or design constraints mentioned.

${descriptionText}

## ADDITIONAL CONTEXT (Comments Summary)
${commentsText}

${clarificationsEnabled ? CLARIFICATIONS_SECTION : ''}

## EXECUTION PLAN
You are an expert engineer tasked with completing the above objective. Your priority is to satisfy the TICKET REQUIREMENTS${
    clarificationsEnabled
      ? ". **Use the ask_clarification tool whenever something is ambiguous or not explicitly stated** - don't make assumptions"
      : ''
  }.

1. **Analyze & Plan**${
    clarificationsEnabled ? ' (Ask questions before implementing!)' : ''
  }:
   - Read the TICKET REQUIREMENTS above carefully.
   - Identify which files need to be modified.
   - If the ticket implies deprecated files or patterns, identify them.
${clarificationsEnabled ? CLARIFICATIONS_ANALYZE_STEP : ''}

2. **Implement**${
    clarificationsEnabled ? ' (Confirm assumptions as needed)' : ''
  }:
   - Apply the necessary code changes to fulfill the TICKET REQUIREMENTS.
   - **Priority**: The specific instructions in the ticket description OVERRIDE general patterns if there is a conflict.
${clarificationsEnabled ? CLARIFICATIONS_IMPLEMENT_REMINDER : ''}

3. **Verify (Mandatory)**:
   - **Linting**: Check for and fix any linter errors in the files you modified.
   - **Testing**: Run relevant unit tests to ensure your changes didn't break existing functionality. Fix any failures.
   - **Deprecations**: Ensure you haven't introduced usage of deprecated components unless explicitly required by the ticket.

4. **Finalize**:
   - Create a git commit with the changes using the message: "[Cursor_Code] Implementation for ${ticketKey}"
   - **VERY IMPORTANT**: Do NOT push changes to origin. All changes must remain local.
   - Leave the codebase in a clean, working state with your changes applied.
`;
}
