export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scriptExpirationDays?: number; // How many days scripts for this quest should last
  hideBrowser?: boolean; // Whether to hide the browser session in the UI
  inputConfig?: {
    label: string;
    placeholder?: string;
    description?: string;
  };
}

export const QUESTS: QuestDefinition[] = [
  {
    id: 'hello-fresh-registration',
    name: 'Hello Fresh Registration',
    description:
      'Navigates to Hello Fresh staging, attempts to register with dynamic data, and completes the funnel.',
    instructions: `
1. Navigate to https://www-staging.hellofresh.com/plans
2. Continue through the signup funnel, only selecting required information. If required to select something, choose randomly.
4. When you get to the page asking for email/login details, enter a new email in accordance with new email rules, using 'password' as the password.
5. Enter random delivery address information, ignore validation unless it prevents you from progressing to the next step.
5. Enter credit card details in accordance with credit card details provided in the system prompt. Progress to next step, doing anything else required.
6. Once the account is created and there is some format of a 'welcome' message, this task is complete.
    `.trim(),
  },
  {
    id: 'hello-fresh-de-registration',
    name: 'Hello Fresh Germany Registration',
    description: 'Navigates to Hello Fresh Germany staging',
    instructions: `
1. Navigate to https://www-staging.hellofresh.de/plans
2. Continue through the signup funnel, only selecting required information. If required to select something, choose randomly.
4. When you get to the page asking for email/login details, enter a new email in accordance with new email rules, using 'password' as the password.
5. Enter random delivery address information, ignore validation unless it prevents you from progressing to the next step.
5. Enter credit card details in accordance with credit card details provided in the system prompt. Progress to next step, doing anything else required.
6. Once the account is created and there is some format of a 'welcome' message, this task is complete.
    `.trim(),
  },
  {
    id: 'factor75-login',
    name: 'Factor75 Signup Flow',
    description:
      'Navigates to Factor75 staging, attempts to sign up with dynamic data, and completes the funnel.',
    instructions: `
1. Navigate to https://www-staging.factor75.com/plans
2. Select a random plan from the list. Prefer clicking text over other elements. Log what you select.
3. Continue through the funnel selecting random options for the meal plan. Log what you select. All optional steps should be skipped, only fill out required information.
4. Repeat until you reach a page asking for email/login details.
5. Enter a new email in accordance with new email rules.
6. Enter password: 'password'
7. Enter a delivery address in the state of new york.
8. Enter credit card details in accordance with credit card details provided in the system prompt. Progress to next step, doing anything else required.
9. Once the account is created and there is some format of a 'welcome' message, this task is complete.
10. Task complete.
    `.trim(),
  },
  {
    id: 'jira-ticket-research',
    name: 'Jira Ticket Research',
    description:
      'Fetches tickets assigned to the user from Jira, researches them in the codebase, and generates a getting started guide.',
    instructions:
      'Fetch all open tickets assigned to me. For each ticket, search the codebase for relevant files and generate a summary of how to start.',
    hideBrowser: true,
    inputConfig: {
      label: 'Ticket Filter (Optional)',
      placeholder: 'SHA or SHA-123',
      description:
        'Filter by Project Key (e.g. "SHA") or specific Ticket ID (e.g. "SHA-123")',
    },
  },
];
