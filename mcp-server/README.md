# Personal Agent Quests - Clarification MCP Server

This MCP server provides interactive clarification tools that allow Cursor CLI agents to ask questions during JIRA ticket implementation.

## What It Does

Exposes an `ask_clarification` tool that:
- Allows agents to pause execution and ask for user input
- Supports multiple choice or free-form answers
- Provides context about why clarification is needed
- Waits for user response before continuing

## Setup

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Build the Server

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### 3. Test the Server (Optional)

You can test the MCP server directly with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## How It Works

### Architecture

```
┌─────────────────────┐
│   Cursor CLI        │
│   (Agent)           │
└──────────┬──────────┘
           │ MCP Protocol
           ▼
┌─────────────────────┐      File System      ┌──────────────────┐
│  MCP Server         │◄──────────────────────►│  .agent-questions│
│  (This Server)      │                        │  Directory       │
└──────────┬──────────┘                        └─────────┬────────┘
           │                                             │
           │ Events                                      │ File Watch
           ▼                                             ▼
┌─────────────────────┐                        ┌──────────────────┐
│  JiraQuestRunner    │                        │  MCPManager      │
│  (Quest Logic)      │◄───────────────────────┤  (Integration)   │
└──────────┬──────────┘                        └──────────────────┘
           │
           │ SSE
           ▼
┌─────────────────────┐
│  UI Component       │
│  (Modal)            │
└─────────────────────┘
```

### Flow

1. **Agent asks question:**
   - Calls `ask_clarification` tool with question and options
   - MCP server writes question to `.agent-questions/{id}.json`
   - Agent waits (blocks execution)

2. **Question detected:**
   - MCPManager watches directory, detects new file
   - Emits event to JiraQuestRunner
   - Runner sends SSE event to UI

3. **User responds:**
   - UI shows modal with question
   - User types answer or selects option
   - Answer sent to API endpoint

4. **Answer delivered:**
   - API writes answer to `.agent-questions/{id}_answer.json`
   - MCP server detects answer file
   - Returns answer to agent
   - Agent continues execution

## Tool Definition

### `ask_clarification`

**Description:** Ask the user a clarifying question and wait for their response.

**Parameters:**
- `question` (required): The clarifying question
- `options` (optional): Array of multiple choice options
- `context` (optional): Additional context about why clarification is needed

**Returns:** User's answer as text

**Example Usage (in agent):**

```typescript
// Multiple choice
const answer = await ask_clarification({
  question: "Should this component be added to the existing form or create a new one?",
  options: [
    "Add to existing UserProfileForm",
    "Create new component"
  ],
  context: "Ticket doesn't specify which form to update"
});

// Free-form answer
const answer = await ask_clarification({
  question: "What should the error message say when validation fails?",
  context: "No error message specified in acceptance criteria"
});
```

## File Protocol

### Question File Format
`.agent-questions/q{timestamp}_{counter}.json`

```json
{
  "id": "q1234567890_1",
  "question": "Should we create a new component?",
  "options": ["Yes", "No"],
  "context": "Multiple approaches are valid",
  "timestamp": 1234567890
}
```

### Answer File Format
`.agent-questions/q{timestamp}_{counter}_answer.json`

```json
{
  "id": "q1234567890_1",
  "answer": "Yes",
  "timestamp": 1234567890
}
```

## Configuration

Edit `lib/constants.ts` to configure:

```typescript
export const CLARIFICATION_CONFIG = {
  enabled: false, // Toggle at runtime via UI
  mcpServerPath: './PersonalAgentQuests/mcp-server/dist/index.js',
  questionsDir: '.agent-questions',
  defaultTimeout: 300000, // 5 minutes
};
```

## Troubleshooting

### Server doesn't start
- Ensure TypeScript is compiled: `npm run build`
- Check Node.js version: >=18.0.0
- Verify MCP SDK is installed: `npm install`

### Questions not detected
- Check `.agent-questions/` directory exists
- Ensure file permissions allow read/write
- Check console for MCP Manager logs

### Agent times out
- Default timeout is 5 minutes
- User must respond within timeout window
- Check UI is showing clarification modal

## Development

### Watch mode
```bash
npm run dev
```

### Testing locally
```bash
# Terminal 1: Start server
node dist/index.js

# Terminal 2: Send test message
echo '{"question": "Test?", "options": ["A", "B"]}' > .agent-questions/test.json
```

## Integration with Cursor

The MCP server is automatically started when:
1. User enables "Ask for Clarification" checkbox
2. Quest supports clarifications (`supportsClarifications: true`)
3. Quest execution begins

The server is registered with Cursor CLI via the `--approve-mcps` flag, which auto-approves MCP servers running on stdio.
