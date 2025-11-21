/**
 * Test script to create AI agents
 * 
 * Usage:
 *   node test-ai-agent.js [number]
 * 
 * Example:
 *   node test-ai-agent.js 3  # Creates 3 AI agents
 */

const http = require('http');

const numAgents = parseInt(process.argv[2]) || 1;
const port = process.env.PORT || 8080;

console.log(`Creating ${numAgents} AI agent(s)...`);

let created = 0;
let failed = 0;

function createAgent(index) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/create-ai-agent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            console.log(`✓ AI Agent ${index + 1} created: ${response.socketId}`);
            created++;
            resolve(response);
          } else {
            console.error(`✗ AI Agent ${index + 1} failed: ${response.error}`);
            failed++;
            reject(new Error(response.error));
          }
        } catch (error) {
          console.error(`✗ AI Agent ${index + 1} failed to parse response:`, error);
          failed++;
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`✗ AI Agent ${index + 1} request failed:`, error.message);
      failed++;
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function createAllAgents() {
  const promises = [];
  
  for (let i = 0; i < numAgents; i++) {
    // Add small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
    promises.push(createAgent(i));
  }
  
  try {
    await Promise.all(promises);
    console.log(`\n✓ Successfully created ${created} AI agent(s)`);
    if (failed > 0) {
      console.log(`✗ Failed to create ${failed} AI agent(s)`);
    }
  } catch (error) {
    console.error('\nError creating agents:', error);
  }
}

// Check server stats
function getStats() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/statistics',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const stats = JSON.parse(data);
          resolve(stats);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Checking server connection...');
  
  try {
    const stats = await getStats();
    console.log(`Server is running. Current queue size: ${stats.queueSize}`);
    console.log('');
    
    await createAllAgents();
    
    // Check stats again
    console.log('\nChecking updated statistics...');
    const newStats = await getStats();
    console.log(`Queue size: ${newStats.queueSize}`);
    console.log(`Active games: ${newStats.games}`);
    
    // Get LLM stats if available
    try {
      const llmStatsReq = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/llm-stats',
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const llmStats = JSON.parse(data);
            if (llmStats.enabled) {
              console.log('\nLLM Agent Statistics:');
              console.log(`  Total agents: ${llmStats.stats.totalAgents}`);
              console.log(`  Total cost: $${llmStats.stats.global.totalCost.toFixed(4)}`);
              console.log(`  Total tokens: ${llmStats.stats.global.totalTokens}`);
            }
          } catch (e) {
            // Ignore LLM stats errors
          }
        });
      });
      llmStatsReq.on('error', () => {});
      llmStatsReq.end();
    } catch (e) {
      // Ignore
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Make sure the server is running on port', port);
    process.exit(1);
  }
}

main();



