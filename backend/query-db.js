#!/usr/bin/env node

/**
 * Simple SQLite query tool using better-sqlite3
 * Usage: node query-db.js [query]
 *   If no query provided, opens interactive mode
 */

const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

// Database path matches what's used in database.ts
// From dist/ folder: ../../data/games.db
// From backend/ folder: ../data/games.db
const dbPath = path.join(__dirname, '..', 'data', 'games.db');

// Check if database exists
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  console.error('The database will be created when you start the server.');
  process.exit(1);
}

const db = new Database(dbPath);

// Enable better output formatting
db.pragma('journal_mode = WAL');

// If query provided as argument, execute it and exit
if (process.argv.length > 2) {
  const query = process.argv.slice(2).join(' ');
  try {
    const stmt = db.prepare(query);
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      const results = stmt.all();
      if (results.length === 0) {
        console.log('(no results)');
      } else {
        console.table(results);
      }
    } else {
      const result = stmt.run();
      console.log(`Query executed. Rows affected: ${result.changes}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
  process.exit(0);
}

// Interactive mode
console.log('SQLite Query Tool (using better-sqlite3)');
console.log(`Database: ${dbPath}`);
console.log('Enter SQL queries (or "exit" to quit, "help" for examples)\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'sqlite> '
});

rl.prompt();

rl.on('line', (line) => {
  const input = line.trim();
  
  if (input === 'exit' || input === 'quit' || input === '.exit' || input === '.quit') {
    db.close();
    rl.close();
    return;
  }
  
  if (input === 'help' || input === '.help') {
    console.log('\nExample queries:');
    console.log('  SELECT * FROM games;');
    console.log('  SELECT * FROM games WHERE id = 1;');
    console.log('  SELECT * FROM chat_messages WHERE game_id = 1;');
    console.log('  SELECT * FROM game_actions WHERE game_id = 1 ORDER BY timestamp;');
    console.log('  SELECT difficulty, COUNT(*) as count FROM games WHERE difficulty IS NOT NULL GROUP BY difficulty;');
    console.log('  .tables  - List all tables');
    console.log('  .schema  - Show database schema');
    console.log('  exit     - Exit the tool\n');
    rl.prompt();
    return;
  }
  
  if (input === '.tables') {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    console.log('\nTables:');
    tables.forEach(t => console.log(`  - ${t.name}`));
    console.log();
    rl.prompt();
    return;
  }
  
  if (input === '.schema') {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    tables.forEach(table => {
      const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(table.name);
      console.log(`\n${schema.sql};`);
    });
    console.log();
    rl.prompt();
    return;
  }
  
  if (!input) {
    rl.prompt();
    return;
  }
  
  try {
    const stmt = db.prepare(input);
    if (input.trim().toUpperCase().startsWith('SELECT')) {
      const results = stmt.all();
      if (results.length === 0) {
        console.log('(no results)');
      } else {
        console.table(results);
      }
    } else {
      const result = stmt.run();
      console.log(`Query executed. Rows affected: ${result.changes}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log();
  rl.prompt();
}).on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});

