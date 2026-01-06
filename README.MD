# Personal Agent Quests

This is a personal playground and quest log, running as a simple React application. Not intended for widespread internal usage at this time. Consider this an advanced POC.

## Getting Started

Since this project is isolated from the main workspace, you need to install dependencies locally within this directory.

### 1. Navigate to this directory

```bash
cd personal-agent-quests
```

### 2. Install dependencies

Install dependencies:

```bash
npm install
```

### 3. Environment Configuration

Create a copy of the example environment file and populate it with your values:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration values as needed.

### 4. Run the "Good Morning" script

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
npm install
npm run goodMorning
```

This will start the development server on [http://localhost:3001](http://localhost:3001).
