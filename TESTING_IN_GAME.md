# Testing AI Agents In-Game

Now that your AI agents are created, here's how to test their behavior during an actual game.

## Quick Start

1. **Make sure your server is running** with AI agents enabled
2. **Open the game frontend** in your browser (usually `http://localhost:8080`)
3. **Join the queue** as a real player
4. **Start a game** - the AI agents will automatically join
5. **Watch them play!**

## What to Observe

### 1. Chat Behavior

AI agents will:
- Respond to chat messages (30% probability by default)
- Use medieval/Avalon-themed language
- Make contextually relevant comments
- Act according to their role (Merlin is subtle, evil players are deceptive)

**To test:**
- Type a message in chat
- Wait 1-3 seconds
- AI agents may respond with contextually appropriate messages

### 2. Team Building (When AI is Leader)

When an AI agent is the current leader:
- They will propose a team based on their role knowledge
- Good players (Merlin, Captain) try to select good players
- Evil players may include themselves or other evil players
- Decision happens automatically after ~2 seconds

**To test:**
- Wait until an AI agent becomes leader (rotates each round)
- Watch for the team proposal
- Check if it makes strategic sense for their role

### 3. Team Voting

All AI agents will:
- Vote to approve or reject proposed teams
- Base decisions on their role and game state
- Good players approve teams they think are good
- Evil players may reject good teams or approve teams with evil players

**To test:**
- Propose a team (or wait for AI leader to propose)
- Watch the votes come in automatically
- See if voting patterns make sense

### 4. Mission Voting

AI agents on the mission team will:
- Good players: Always vote SUCCESS
- Evil players: Decide whether to FAIL (sabotage) or SUCCESS (blend in)
- Make strategic decisions based on mission number and game state

**To test:**
- Get a team approved
- Watch mission votes come in
- See if evil AI agents strategically fail missions

### 5. Assassination (End Game)

If the Assassin is an AI agent:
- They must identify Merlin/Captain
- Decision based on voting patterns, chat, and team proposals
- Happens automatically when good team wins 3 missions

**To test:**
- Play until good team wins 3 missions
- Watch the AI assassin choose a target
- See if they correctly identify Merlin/Captain

## Monitoring AI Behavior

### Check Server Logs

Watch your server console for:
```
[LLM Usage] AgentName (merlin) - chat: 150 tokens, $0.0003, 450ms
[LLM Usage] AgentName (spy) - vote_team: 80 tokens, $0.0002, 320ms
[LLM Usage] AgentName (assassin) - propose_team: 200 tokens, $0.0004, 580ms
```

### Check LLM Statistics

In another terminal:
```bash
curl http://localhost:8080/api/llm-stats
```

This shows:
- Total actions taken
- Total cost incurred
- Tokens used
- Per-agent statistics
- Model comparison (if using multiple models)

### Real-Time Monitoring

You can create a simple monitoring script:

```javascript
// monitor-ai.js
const http = require('http');

setInterval(() => {
  http.get('http://localhost:8080/api/llm-stats', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const stats = JSON.parse(data);
      if (stats.enabled) {
        console.log(`\n=== AI Agent Stats ===`);
        console.log(`Active Agents: ${stats.stats.totalAgents}`);
        console.log(`Total Cost: $${stats.stats.global.totalCost.toFixed(4)}`);
        console.log(`Total Tokens: ${stats.stats.global.totalTokens}`);
        console.log(`Total Actions: ${stats.stats.global.totalActions}`);
      }
    });
  });
}, 5000); // Update every 5 seconds
```

Run with: `node monitor-ai.js`

## Testing Scenarios

### Scenario 1: Test Chat Responses

1. Join game with AI agents
2. Type: "I think we should be careful about team selection"
3. Wait 2-3 seconds
4. AI agents may respond with contextually relevant messages
5. Check server logs to see which agent responded and what they said

### Scenario 2: Test Strategic Team Building

1. Wait until an AI agent (Merlin or Captain) is leader
2. They should propose a team without evil players (if they can see them)
3. If an evil AI is leader, they might include themselves
4. Observe the team proposal in the UI

### Scenario 3: Test Voting Patterns

1. Propose a team with mostly good players
2. Good AI agents should approve
3. Evil AI agents might reject (to cause chaos)
4. Watch votes come in automatically

### Scenario 4: Test Mission Sabotage

1. Get a team approved with an evil AI agent on it
2. Watch the mission phase
3. Evil AI should decide whether to fail (based on strategy)
4. Check if they fail at strategic moments

### Scenario 5: Test End Game Assassination

1. Play until good team wins 3 missions
2. If Assassin is an AI agent, watch them choose a target
3. See if they correctly identify Merlin/Captain based on game behavior

## Debugging AI Behavior

### If AI Agents Don't Respond

1. **Check server logs** for errors:
   ```
   [LLM AI Error] AgentName - chat: Rate limit exceeded
   ```

2. **Check if agents are initialized**:
   - Look for: `LLM AI Agent AgentName initialized as merlin (agent team)`
   - If missing, agents may not have received game state

3. **Verify Azure API is working**:
   ```bash
   curl http://localhost:8080/api/llm-stats
   ```
   Should show active agents and usage stats

### If AI Makes Poor Decisions

1. **Check prompts** in `backend/src/promptEngine.ts`
2. **Adjust temperature** in `.env`:
   - Lower (0.3-0.5) = more deterministic
   - Higher (0.7-0.9) = more creative
3. **Review game state** - AI may not have enough context

### If Costs Are Too High

1. **Monitor costs**:
   ```bash
   curl http://localhost:8080/api/llm-stats
   ```

2. **Reduce chat probability** - edit `llmAIAgent.ts`:
   ```typescript
   chatProbability: 0.1  // Instead of 0.3
   ```

3. **Use cheaper model** - set in `.env`:
   ```env
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo  # Instead of gpt-4
   ```

## Tips for Better Testing

1. **Start with fewer agents** (2-3) to observe behavior more clearly
2. **Take notes** on what each agent does and when
3. **Compare different models** by configuring multiple in `.env`
4. **Watch server logs** to see the actual LLM responses
5. **Test different roles** - create agents and see how they behave as different roles

## Example Test Session

```bash
# Terminal 1: Server
cd the-resistance/backend
npm start

# Terminal 2: Create 4 AI agents
cd the-resistance/backend
node test-ai-agent.js 4

# Terminal 3: Monitor stats (optional)
node monitor-ai.js

# Browser: Open http://localhost:8080
# - Join queue as real player
# - Start game
# - Watch AI agents play!
```

## What Success Looks Like

✅ AI agents respond to chat with contextually relevant messages  
✅ AI agents propose strategic teams based on their role  
✅ AI agents vote intelligently on team proposals  
✅ Evil AI agents strategically fail missions  
✅ AI agents use medieval/Avalon-themed language  
✅ Server logs show LLM usage for each action  
✅ Costs are reasonable (under $0.10 per game with GPT-3.5)  

## Next Steps

- Adjust prompts in `promptEngine.ts` based on observed behavior
- Tune chat probability and response delays
- Compare different models using model comparison report
- Analyze cost vs. performance trade-offs





