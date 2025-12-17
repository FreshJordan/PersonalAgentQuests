export interface StepValidation {
  type: 'url_contains' | 'element_visible' | 'element_hidden' | 'text_present';
  value: string;
  timeout?: number; // ms to wait for this condition
}

export interface QuestStep {
  type:
    | 'navigate'
    | 'click'
    | 'type_text'
    | 'press_key'
    | 'wait'
    | 'random_wait';
  params: any;
  description?: string; // Human readable description of what this step does
  timestamp?: string; // When this step was executed/recorded
  status?: 'success' | 'failed'; // Status of the step execution
  validation?: StepValidation; // Optional validation to verify this specific step worked
}

export interface QuestScript {
  id: string;
  name: string;
  description: string;
  steps: QuestStep[];
  lastUpdated: string;
  expiresAt?: string; // Optional expiration date for the script
  successCriteria?: StepValidation[]; // Global validation to verify the quest actually finished
}

export interface QuestLog {
  id: string;
  questId: string;
  timestamp: string;
  durationSeconds: number;
  status: 'success' | 'failed';
  steps: QuestStep[];
  stepCount: number;
  aiStepCount: number;
  scriptStepCount: number;
  context?: Record<string, string>; // Store the dynamic values used
  summary?: any; // New optional field for extracted data
}

export const FACTOR75_LOGIN_QUEST_ID = 'factor75-login';
