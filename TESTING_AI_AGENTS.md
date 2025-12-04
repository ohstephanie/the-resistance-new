# Testing AI Agents

This guide shows you how to test creating and using AI agents in your game.

## Prerequisites

1. **Enable LLM Agents**: Set environment variables:
   ```bash
   USE_LLM_AGENTS=true
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your_api_key_here
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo
   ```

2. **Start the Server**:
   ```bash
   cd the-resistance/backend
   npm start
   ```

## Method 1: Using the API Endpoint

### Create a Single AI Agent

```bash
curl -X POST http://localhost:8080/api/create-ai-agent
```

### Create Multiple AI Agents

Use the test script:

```bash
cd the-resistance/backend
node test-ai-agent.js 5  # Creates 5 AI agents
```

Or use curl in a loop:

```bash
for i in {1..5}; do
  curl -X POST http://localhost:8080/api/create-ai-agent
  sleep 0.5
done
```

### Check Statistics

```bash
# General statistics
curl http://localhost:8080/api/statistics

# LLM agent statistics
curl http://localhost:8080/api/llm-stats
```

## Method 2: Using the Test Script

A test script is provided at `backend/test-ai-agent.js`:

```bash
cd the-resistance/backend
node test-ai-agent.js [number]
```

Examples:
- `node test-ai-agent.js` - Creates 1 AI agent
- `node test-ai-agent.js 3` - Creates 3 AI agents
- `node test-ai-agent.js 5` - Creates 5 AI agents

The script will:
1. Check server connection
2. Create the specified number of AI agents
3. Show current queue size
4. Display LLM statistics if available

## Method 3: Programmatic Creation

You can also create AI agents programmatically in your code:

```typescript
// In your server code
const aiSocket = await server.createAIAgent();
if (aiSocket) {
  console.log(`AI agent created: ${aiSocket.id}`);
}
```

## Method 4: Auto-Fill Queue (Modify Queue Manager)

You can modify the queue system to automatically add AI agents when the queue is low. Add this to `backend/src/queue.ts`:

```typescript
// In QueueManager class
private checkAndStartGame() {
  if (this.queue.length >= GameMinPlayers) {
    // ... existing code ...
  } else if (this.queue.length > 0 && this.queue.length < GameMinPlayers) {
    // Auto-fill with AI agents if enabled
    const server = (this as any).server; // You'll need to pass server reference
    if (server && server.useLLMAgents) {
      const needed = GameMinPlayers - this.queue.length;
      for (let i = 0; i < needed; i++) {
        server.createAIAgent();
      }
    }
  }
}
```

## Testing the Full Flow

1. **Start the server** with LLM agents enabled
2. **Create AI agents** using one of the methods above
3. **Join the queue** with a real player (via the frontend)
4. **Start a game** - AI agents should automatically join
5. **Observe AI behavior**:
   - AI agents will respond to chat messages
   - AI agents will vote on team proposals
   - AI agents will make mission decisions
   - AI agents will propose teams when they're the leader

## Monitoring AI Agent Behavior

### Check LLM Statistics

```bash
curl http://localhost:8080/api/llm-stats
```

This returns:
- Total agents active
- Total cost incurred
- Total tokens used
- Per-model statistics
- Per-agent statistics

### View Server Logs

AI agents log their actions to the console:
- `[LLM Usage]` - Shows token usage and costs per action
- `[LLM AI Error]` - Shows any errors
- Agent initialization messages

### Test Different Models

To test with different models, configure multiple models:

```env
USE_LLM_AGENTS=true
LLM_MODELS=gpt35,gpt4

LLM_MODEL_GPT35_ENDPOINT=https://resource1.openai.azure.com
LLM_MODEL_GPT35_API_KEY=key1
LLM_MODEL_GPT35_DEPLOYMENT=gpt-35-turbo

LLM_MODEL_GPT4_ENDPOINT=https://resource2.openai.azure.com
LLM_MODEL_GPT4_API_KEY=key2
LLM_MODEL_GPT4_DEPLOYMENT=gpt-4
```

Agents will be assigned models based on the distribution strategy (round-robin, random, or weighted).

## Troubleshooting

### AI Agents Not Created

- Check `USE_LLM_AGENTS=true` is set
- Verify Azure credentials are correct
- Check server logs for errors
- Ensure `axios` is installed: `npm install`

### AI Agents Not Responding

- Check that agents received game state (look for initialization logs)
- Verify Azure API is accessible
- Check rate limits aren't exceeded
- Look for error messages in logs

### High Costs

- Use GPT-3.5-turbo instead of GPT-4
- Reduce `AZURE_OPENAI_MAX_TOKENS`
- Lower chat probability in code
- Monitor via `/api/llm-stats`

## Example Test Session

```bash
# Terminal 1: Start server
cd the-resistance/backend
npm start

# Terminal 2: Create 4 AI agents
cd the-resistance/backend
node test-ai-agent.js 4

# Terminal 3: Check stats
curl http://localhost:8080/api/statistics
curl http://localhost:8080/api/llm-stats

# Then join the game via frontend with 1 real player
# Game should start with 5 players total (1 human + 4 AI)
```

## Next Steps

- Monitor AI agent behavior in games
- Compare different models using model comparison report
- Adjust prompts in `promptEngine.ts` based on observed behavior
- Tune cost/performance by adjusting rate limits and model selection




