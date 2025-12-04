# Quick Start: Azure LLM AI Agents

## 5-Minute Setup

### 1. Install Dependencies

```bash
cd the-resistance/backend
npm install
```

This installs `axios` (already in package.json) for Azure API calls.

### 2. Configure Azure

Set environment variables (create `.env` file or export them):

```bash
USE_LLM_AGENTS=true
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

### 3. Start Server

```bash
npm start
```

### 4. Create AI Agents

AI agents can be created programmatically. Add this to your server code or create an API endpoint:

```typescript
// In backend/src/index.ts or similar
app.post('/api/create-ai-agent', async (req, res) => {
  const aiSocket = await server.createAIAgent();
  if (aiSocket) {
    res.json({ success: true, socketId: aiSocket.id });
  } else {
    res.json({ success: false, error: 'Failed to create AI agent' });
  }
});
```

Or modify the queue system to automatically add AI agents when the queue is low.

## What You Get

✅ **Intelligent AI Players** powered by Azure LLMs  
✅ **Context-Aware Chat** with medieval Avalon theme  
✅ **Strategic Decision-Making** for voting and team selection  
✅ **Multiple Model Support** for research comparison  
✅ **Cost Tracking** to stay within $500 credit  
✅ **Rate Limiting** to avoid API errors  
✅ **Error Handling** with automatic fallbacks  

## Key Files

- `backend/src/azureLLMClient.ts` - Azure API client
- `backend/src/promptEngine.ts` - Prompt generation
- `backend/src/llmAIAgent.ts` - Individual AI agent
- `backend/src/aiAgentManager.ts` - Multi-agent manager
- `LLM_AI_INTEGRATION.md` - Full documentation

## Cost Management

**Recommended Settings for $500 Credit:**

```env
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo  # Cheaper model
AZURE_OPENAI_MAX_TOKENS=200  # Shorter responses
AZURE_OPENAI_RPM=30  # Lower rate limit
```

**Estimated Costs:**
- GPT-3.5: ~$0.01 per game
- GPT-4: ~$0.10 per game

## Next Steps

1. Read `LLM_AI_INTEGRATION.md` for full details
2. Test with a single AI agent first
3. Monitor costs via `server.getLLMAgentStats()`
4. Compare models by configuring multiple in environment variables

## Troubleshooting

**Agents not working?**
- Check `USE_LLM_AGENTS=true`
- Verify Azure credentials
- Check server console logs

**High costs?**
- Use GPT-3.5 instead of GPT-4
- Lower `AZURE_OPENAI_MAX_TOKENS`
- Reduce chat probability in code

**Need help?**
- See `LLM_AI_INTEGRATION.md` for detailed docs
- Check server logs for specific issues




