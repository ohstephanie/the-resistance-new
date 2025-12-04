/**
 * Simple monitoring script for AI agents
 * 
 * Usage: node monitor-ai.js
 * 
 * Shows real-time statistics about AI agents every 5 seconds
 */

const http = require('http');

const port = process.env.PORT || 8080;
const updateInterval = 5000; // 5 seconds

function getStats() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/api/llm-stats`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function formatCost(cost) {
  return `$${cost.toFixed(4)}`;
}

function formatNumber(num) {
  return num.toLocaleString();
}

async function updateDisplay() {
  try {
    const stats = await getStats();
    
    // Clear console (works on most terminals)
    process.stdout.write('\x1B[2J\x1B[0f');
    
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║           AI Agent Monitor - Real-Time Stats          ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    
    if (!stats.enabled) {
      console.log('❌ LLM Agents are not enabled');
      console.log(`   ${stats.message || 'Set USE_LLM_AGENTS=true to enable'}`);
      console.log('');
      console.log('Press Ctrl+C to exit');
      return;
    }
    
    console.log(`✅ LLM Agents: ENABLED`);
    console.log(`📊 Active Agents: ${stats.stats.totalAgents}`);
    console.log('');
    
    // Global stats
    console.log('📈 Global Statistics:');
    console.log(`   Total Cost:     ${formatCost(stats.stats.global.totalCost)}`);
    console.log(`   Total Tokens:   ${formatNumber(stats.stats.global.totalTokens)}`);
    console.log(`   Total Actions:  ${formatNumber(stats.stats.global.totalActions)}`);
    console.log('');
    
    // Per-agent stats
    if (stats.stats.agents.length > 0) {
      console.log('🤖 Agent Details:');
      stats.stats.agents.forEach((agent, index) => {
        console.log(`   ${index + 1}. ${agent.name} (${agent.role || 'unknown'})`);
        console.log(`      Model: ${agent.model}`);
        console.log(`      Actions: ${agent.stats.player.totalActions} | Cost: ${formatCost(agent.stats.player.totalCost)} | Tokens: ${formatNumber(agent.stats.player.totalTokens)}`);
      });
      console.log('');
    }
    
    // Model comparison
    if (stats.modelComparison && stats.modelComparison.models.length > 0) {
      console.log('🔬 Model Comparison:');
      stats.modelComparison.models.forEach(model => {
        console.log(`   ${model.model}:`);
        console.log(`      Agents: ${model.agents} | Cost: ${formatCost(model.totalCost)} | Actions: ${formatNumber(model.totalActions)}`);
        console.log(`      Avg Cost/Action: ${formatCost(model.avgCostPerAction)} | Avg Tokens/Action: ${Math.round(model.avgTokensPerAction)}`);
      });
      console.log('');
    }
    
    console.log(`⏱️  Last updated: ${new Date().toLocaleTimeString()}`);
    console.log('Press Ctrl+C to exit');
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error.message);
    console.log('Make sure the server is running on port', port);
  }
}

// Initial display
updateDisplay();

// Update every interval
setInterval(updateDisplay, updateInterval);




