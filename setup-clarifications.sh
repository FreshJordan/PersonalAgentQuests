#!/bin/bash

# Setup script for Interactive Clarifications feature
# Run this after npm install to enable the clarification feature

echo "🔧 Setting up Interactive Clarifications..."
echo ""

# Navigate to mcp-server directory
cd mcp-server

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing MCP server dependencies..."
  npm install
else
  echo "✅ Dependencies already installed"
fi

# Build the server
echo "🏗️  Building MCP server..."
npm run build

# Check if build succeeded
if [ -f "dist/index.js" ]; then
  echo ""
  echo "✅ MCP server built successfully!"
  echo ""
  echo "📖 Next steps:"
  echo "  1. Start the app: npm run goodMorning"
  echo "  2. Select a JIRA ticket quest"
  echo "  3. Check the '💬 Ask for Clarification' checkbox"
  echo "  4. The agent can now ask you questions during execution!"
  echo ""
  echo "📚 For more details, see: SETUP_CLARIFICATIONS.md"
else
  echo ""
  echo "❌ Build failed. Please check for errors above."
  exit 1
fi
