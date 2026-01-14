# Personal Agent Quests

This is a personal playground and quest log, running as a simple React application. Not intended for widespread internal usage at this time. Consider this an advanced POC.

## Features

- **JIRA Ticket Research** - Automated ticket implementation with Cursor CLI
- **Interactive Clarifications** 🆕 - Agent can pause and ask questions during execution
  - Enable via checkbox when selecting tickets
  - Agent asks about ambiguous requirements
  - Provide answers in real-time via modal
  - Requires MCP server setup (see step 3 below)
  - 📋 [Debugging Guide](./DEBUGGING_CLARIFICATIONS.md) - Comprehensive troubleshooting
- **Browser Automation** - Script recording and AI-powered fallback
- **Follow-up Conversations** - Iterative improvements after implementation

## Getting Started

Since this project is isolated from the main workspace, you need to install dependencies locally within this directory.

### 1. Navigate to this directory

```bash
cd PersonalAgentQuests
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build MCP Server (Optional - For Interactive Clarifications)

If you want to enable the interactive clarification feature where the agent can ask you questions during execution:

```bash
./setup-clarifications.sh
```

Or manually:

```bash
cd mcp-server
npm install
npm run build
cd ..
```

A `.cursor/mcp.json` configuration file in this directory automatically registers the MCP server with Cursor CLI. Once built, the clarification feature will be available when you check the "💬 Ask for Clarification" checkbox during JIRA ticket research.

**Test the MCP Server:**

```bash
node test-mcp.js
```

This will verify the MCP server is working and can list its tools. You should see: `✅ Tools available: ask_clarification`

**Note:** This step is **optional**. Skip it if you don't need the clarification feature. The app will work fine without it.

### 4. Environment Configuration

Create a copy of the example environment file and populate it with your values:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration values as needed.

### 5. Run the "Good Morning" script

#### Prerequisites

If you don't have it already, make sure you are part of the bedrock user group for AWS. If not, request access in `#access-now`.

#### AWS CLI Setup

1. Install AWS CLI:

   ```bash
   brew install awscli
   ```

2. Create AWS config directory:

   ```bash
   mkdir -p ~/.aws
   touch ~/.aws/config
   ```

3. Configure AWS SSO profile:

   ```bash
   echo "[profile sso-bedrock]
   sso_start_url = https://hfsso.awsapps.com/start
   sso_region = eu-west-1
   sso_account_id = 951719175506
   sso_role_name = bedrock-user
   region = eu-west-1" > ~/.aws/config
   ```

4. Login to AWS:

   ```bash
   aws sso login --profile sso-bedrock
   ```

#### Cursor CLI Setup

1. Install Cursor CLI:

   ```bash
   curl https://cursor.com/install -fsS | bash
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

2. Login to the Cursor CLI:

   ```bash
   cursor-agent login
   ```

#### Run the Application

```bash
npx playwright install
npm run goodMorning
```

This will start the development server on [http://localhost:3001](http://localhost:3001).

## Using Interactive Clarifications

Once the MCP server is built (step 3), you can use interactive clarifications:

1. Navigate to [http://localhost:3001](http://localhost:3001)
2. Select **"Jira Ticket Research"** quest
3. Enter a ticket filter (optional)
4. When tickets appear, check the **"💬 Ask for Clarification"** checkbox
5. Select a ticket and click **"Research Selected"**
6. If the agent encounters ambiguity, a modal will appear with a question
7. Answer the question and the agent will continue with your guidance

See [SETUP_CLARIFICATIONS.md](./SETUP_CLARIFICATIONS.md) for detailed usage examples and troubleshooting.
