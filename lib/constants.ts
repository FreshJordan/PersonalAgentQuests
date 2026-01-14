/**
 * Central configuration for AI models used throughout the application.
 * Update these constants to change the models used across all services.
 */

/**
 * Model ID for Cursor CLI agent operations
 */
export const CURSOR_MODEL = 'claude-4.5-sonnet';

/**
 * Default Bedrock model ID for Claude Sonnet
 * Used by BedrockService and API endpoints
 */
export const BEDROCK_MODEL_ID = 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Model ID for HybridQuestRunner
 * Can be overridden per quest if needed
 */
export const QUEST_RUNNER_MODEL_ID =
  'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Clarification feature configuration
 * Note: MCP server is managed by Cursor CLI via .cursormcp config file
 */
export const CLARIFICATION_CONFIG = {
  questionsDir: '.agent-questions', // Directory for question/answer file exchange
  defaultTimeout: 300000, // 5 minutes for user to respond
};
