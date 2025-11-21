# Azure LLM AI Agent Integration Guide

This guide explains how to integrate Microsoft Azure OpenAI/LLM APIs to power AI agents in your The Resistance/Avalon multiplayer game.

## Overview

The LLM AI agent system allows you to create intelligent AI players that:
- Join games automatically via the queue system
- Respond to chat messages with context-aware, medieval-themed responses
- Make strategic decisions (voting, team selection, mission actions)
- Use different Azure LLM models per agent for research comparison
- Track usage, costs, and model performance

## Architecture

### Core Components

1. **AzureLLMClient** (`backend/src/azureLLMClient.ts`)
   - Handles Azure OpenAI API communication
   - Implements rate limiting and cost tracking
   - Manages retries and error handling

2. **PromptEngine** (`backend/src/promptEngine.ts`)
   - Generates context-aware prompts for different game situations
   - Provides role-based, medieval-themed prompts
   - Handles chat, voting, and decision-making scenarios

3. **LLMAIAgent** (`backend/src/llmAIAgent.ts`)
   - Individual AI agent that receives game events via Socket.io
   - Makes LLM-powered decisions through Redux actions
   - Handles fallback behavior when LLM is unavailable

4. **AIAgentManager** (`backend/src/aiAgentManager.ts`)
   - Manages multiple AI agents with different model configurations
   - Routes game actions to appropriate agents
   - Tracks usage statistics across all agents

## Installation

### 1. Install Dependencies

```bash
cd the-resistance/backend
npm install axios
```

The `axios` package is already added to `package.json` for making HTTP requests to Azure APIs.

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory (or set environment variables):

```bash
# Enable LLM agents
USE_LLM_AGENTS=true

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Rate Limits (adjust based on your Azure plan)
AZURE_OPENAI_RPM=60
AZURE_OPENAI_TPM=60000
AZURE_OPENAI_RPD=10000
```

### 3. Get Azure OpenAI Credentials

1. Create an Azure OpenAI resource in the Azure Portal
2. Deploy a model (e.g., GPT-3.5-turbo, GPT-4)
3. Get your endpoint URL and API key
4. Configure rate limits based on your tier

## Configuration

### Single Model Setup

For testing with one model, use the default configuration:

```env
USE_LLM_AGENTS=true
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo
```

### Multiple Model Comparison

To compare different models (e.g., GPT-3.5 vs GPT-4):

```env
USE_LLM_AGENTS=true
LLM_MODELS=gpt35,gpt4

# GPT-3.5 Configuration
LLM_MODEL_GPT35_ENDPOINT=https://resource1.openai.azure.com
LLM_MODEL_GPT35_API_KEY=key1
LLM_MODEL_GPT35_DEPLOYMENT=gpt-35-turbo
LLM_MODEL_GPT35_WEIGHT=1.0

# GPT-4 Configuration
LLM_MODEL_GPT4_ENDPOINT=https://resource2.openai.azure.com
LLM_MODEL_GPT4_API_KEY=key2
LLM_MODEL_GPT4_DEPLOYMENT=gpt-4
LLM_MODEL_GPT4_WEIGHT=0.5  # Use GPT-4 less frequently (more expensive)
```

### Model Distribution Strategies

- **round-robin**: Cycle through models evenly
- **random**: Randomly select a model for each agent
- **weighted**: Select based on weight values (higher = more frequent)

Set via `LLM_MODEL_DISTRIBUTION` environment variable.

## Integration Steps

### Step 1: Enable LLM Agents

Set `USE_LLM_AGENTS=true` in your environment variables.

### Step 2: Start the Server

```bash
cd the-resistance/backend
npm start
```

The server will automatically:
- Initialize the AI Agent Manager
- Load model configurations
- Create AI agents when they join the queue

### Step 3: Create AI Agents

AI agents can be created programmatically:

```typescript
// In your server code
const aiSocket = await server.createAIAgent();
```

Or you can modify the queue system to automatically add AI agents when needed.

## How It Works

### Event Flow

1. **Game Action Occurs** (e.g., role assigned, vote requested)
2. **Server** routes action to appropriate room/lobby
3. **AIAgentManager** intercepts game actions and routes to LLM agents
4. **LLMAIAgent** receives action and generates prompt
5. **AzureLLMClient** makes API request
6. **Response Parsed** and Redux action sent back to game
7. **Game Processes** the action as if from a human player

### Action Handling

AI agents listen for Redux actions:
- `game/hydrate` - Initialize with game state
- `game/new-player-chat-message` - Respond to chat
- `game/update-team-members` - Propose team (if leader)
- `game/send-proposal-vote` - Vote on team proposal
- `game/send-mission-action` - Vote success/fail on mission
- `game/update-assassin-choice` - Choose assassination target

### Prompt Engineering

The system uses role-based, context-aware prompts:

#### Chat Prompts
- Include game state (mission, results, current phase)
- Include chat history (last 10 messages)
- Role-specific instructions (Merlin must hide, evil must deceive)
- Medieval Avalon theme

#### Decision Prompts
- Team proposals: Strategic selection based on role knowledge
- Voting: Context-aware approval/rejection
- Mission votes: Evil players decide when to fail
- Assassination: Identify Merlin/Captain based on game behavior

## Rate Limits and Cost Management

### Rate Limiting

The system implements multiple rate limit checks:

1. **Per-Minute Limits**: Tracks requests in the last 60 seconds
2. **Per-Day Limits**: Tracks daily request and token counts
3. **Token Limits**: Monitors token usage to stay within quotas

### Cost Tracking

Costs are estimated based on Azure pricing:
- GPT-4: ~$0.03/1K input tokens, $0.06/1K output tokens
- GPT-3.5-turbo: ~$0.0015/1K input, $0.002/1K output

The system tracks:
- Total cost per agent
- Cost per action type
- Model comparison costs

### Staying Within $500 Credit

**Recommendations:**

1. **Use GPT-3.5-turbo for most agents** (10x cheaper)
2. **Set conservative rate limits**:
   ```env
   AZURE_OPENAI_RPM=30  # Lower requests per minute
   AZURE_OPENAI_TPM=30000  # Lower tokens per minute
   ```
3. **Limit max tokens per request**:
   ```env
   AZURE_OPENAI_MAX_TOKENS=200  # Shorter responses
   ```
4. **Monitor usage** via the stats API (see below)

### Cost Estimation

For a typical game:
- ~50 actions per game (votes, proposals, chat)
- ~200 tokens per action average
- GPT-3.5: ~$0.01 per game
- GPT-4: ~$0.10 per game

With $500 credit:
- GPT-3.5: ~50,000 games
- GPT-4: ~5,000 games

## Error Handling

### Automatic Fallbacks

When LLM requests fail:
1. **Timeout**: Retries up to 3 times with exponential backoff
2. **Rate Limit (429)**: Waits and retries
3. **API Error**: Falls back to simple rule-based behavior
4. **Network Error**: Uses cached fallback responses

### Fallback Behavior

- **Chat**: Random medieval-themed responses
- **Voting**: Simple probability-based decisions
- **Team Selection**: First N players
- **Assassination**: Random target

### Error Logging

All errors are logged to console. Check server logs for patterns.

## Usage Statistics and Research

### Get Agent Statistics

Access via Server:

```typescript
const stats = server.getLLMAgentStats();
console.log(stats.global.totalCost);
console.log(stats.global.models);
```

### Model Comparison Report

```typescript
const report = server.getModelComparisonReport();
// Shows cost, tokens, actions per model
// Useful for research analysis
```

### Logging Model Usage

Each agent logs:
- Model used
- Tokens consumed
- Cost per action
- Latency

Access via:
```typescript
const agent = aiAgentManager.agents.get(socketId);
const usage = agent.getUsageStats();
```

## Prompt Engineering Examples

### Chat Response (Medieval Theme)

**System Prompt:**
```
You are Merlin, the wise wizard of Camelot. You can see the evil players (except Mordred), but must remain hidden. You guide the forces of good subtly, without revealing your identity. You speak in a wise, mystical manner befitting a medieval wizard.
```

**Context:**
- Game state (mission, results, phase)
- Chat history
- Visible players (if applicable)

**Output:** Short, medieval-themed chat message

### Team Proposal (Strategic)

**System Prompt:**
```
You are Percival, a loyal knight. You can see Merlin and Morgana, but cannot tell which is which...
```

**Context:**
- Available players
- Mission requirements
- Previous mission results
- Voting patterns

**Output:** JSON array of player indices

## Troubleshooting

### Agents Not Responding

1. Check `USE_LLM_AGENTS=true` in environment
2. Verify Azure credentials are correct
3. Check rate limits aren't exceeded
4. Review server console logs

### High Costs

1. Reduce `AI_CHAT_PROBABILITY` (in code, default 0.3)
2. Lower `AZURE_OPENAI_MAX_TOKENS`
3. Use GPT-3.5 instead of GPT-4
4. Set stricter rate limits

### Slow Responses

1. Check Azure API latency
2. Reduce response delay (default 2000ms)
3. Check network connectivity
4. Monitor token usage (longer prompts = slower)

### Model Comparison Not Working

1. Verify all model configs in environment
2. Check `LLM_MODELS` includes all model names
3. Ensure each model has unique endpoint/API key
4. Check model distribution strategy

## Best Practices

1. **Start Small**: Test with 1-2 agents first
2. **Monitor Costs**: Check usage stats regularly
3. **Use Appropriate Models**: GPT-3.5 for most, GPT-4 for critical decisions
4. **Set Rate Limits**: Match your Azure plan limits
5. **Log Everything**: Enable usage logging for research
6. **Test Fallbacks**: Ensure game continues if LLM fails
7. **Tune Prompts**: Adjust prompts based on agent behavior

## API Reference

### Server Methods

```typescript
// Create an AI agent
server.createAIAgent(): Promise<Socket | null>

// Get LLM agent statistics
server.getLLMAgentStats()

// Get model comparison report
server.getModelComparisonReport()
```

### LLMAIAgent Methods

```typescript
// Handle game actions
agent.handleAction(action: AnyAction)

// Update game state
agent.updateGameState(gameState: GameState)

// Initialize with role
agent.initialize(role: Role, team: 'agent' | 'spy', visiblePlayers: VisiblePlayer[])

// Get usage stats
agent.getUsageStats()
```

### AzureLLMClient Methods

```typescript
// Make LLM request
client.makeRequest(messages, options)

// Check rate limits
client.canMakeRequest(estimatedTokens)

// Get usage stats
client.getUsageStats()
```

## Example: Complete Setup

```env
# .env file
USE_LLM_AGENTS=true

# Single model
AZURE_OPENAI_ENDPOINT=https://myresource.openai.azure.com
AZURE_OPENAI_API_KEY=abc123...
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo
AZURE_OPENAI_RPM=60
AZURE_OPENAI_TPM=60000
```

Start server:
```bash
npm start
```

Create AI agents programmatically or modify queue system to auto-add them!

## Research Analysis

The system logs detailed usage data for research:

- **Per-Agent Stats**: Model, tokens, cost, latency
- **Per-Action Stats**: Cost and tokens by action type
- **Model Comparison**: Side-by-side performance
- **Cost Analysis**: Total and per-model costs

Access via:
```typescript
const stats = server.getLLMAgentStats();
const report = server.getModelComparisonReport();
```

Export to CSV/JSON for further analysis.

## Support

For issues:
1. Check server console logs
2. Verify Azure credentials and quotas
3. Review rate limit settings
4. Test with single model first
5. Check network connectivity to Azure



