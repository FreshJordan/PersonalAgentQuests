# Personal Agent Quests

This is a personal playground and quest log, running as a simple React application.

## Getting Started

Since this project is isolated from the main workspace, you need to install dependencies locally within this directory.

1.  Navigate to this directory:

    ```bash
    cd personal-agent-quests
    ```

2.  Install dependencies (using npm to avoid modifying the root yarn.lock):

    ```bash
    npm install
    ```

3.  Run the "Good Morning" script:
    If you don't have it already, make sure you are part of the bedrock user group for AWS. If not you request in #access-now
    Open your terminal
    Enter: brew install --cask claude-code
    Enter: brew install awscli
    Enter: mkdir -p ~/.aws
    Enter: touch ~/.aws/config
    The enter this:
    echo "[profile sso-bedrock]
    sso_start_url = https://hfsso.awsapps.com/start
    sso_region = eu-west-1
    sso_account_id = 951719175506
    sso_role_name = bedrock-user
    region = eu-west-1" > ~/.aws/config

    Install cursor cli
    curl https://cursor.com/install -fsS | bash
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
    source ~/.zshrc

    Login to the AI Tools:
    cursor-agent login
    aws sso login --profile sso-bedrock

    Now Run the app
    `bash
    npm install
    npx playwright install
    npm run goodMorning
    `

This will start the development server on [http://localhost:3001](http://localhost:3001).
