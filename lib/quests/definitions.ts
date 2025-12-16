export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scriptExpirationDays?: number; // How many days scripts for this quest should last
  expectedOutput?: string[]; // Fields to extract from the completed quest
}

export const QUESTS: QuestDefinition[] = [
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
    expectedOutput: [
      'email',
      'password',
      'plan_name',
      'plan_price',
      'delivery_address',
      'meals_per_week',
    ],
  },
  {
    id: 'google-search-dogs',
    name: 'Google Search: Dogs',
    description: 'Simple test quest to search Google for dogs.',
    instructions: 'Navigate to google.com and search for "dogs"',
    scriptExpirationDays: 15,
  },
];
