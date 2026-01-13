# Game Database Documentation

## Overview

The game database stores all game data for research purposes, including:
- Game metadata (players, roles, difficulty, winner)
- All game actions (votes, mission actions, team proposals, etc.)
- Chat messages (player and system messages)
- Team proposals and votes
- Mission results

## Database Location

The database is stored at: `the-resistance/backend/data/games.db`

It's a SQLite database, so you can view it with any SQLite client.

**Note:** The database file is automatically created when you start the server for the first time. If you see an error about the database not existing, just start your server once and it will be created.

## Installation

First, install the database dependency:

```bash
cd the-resistance/backend
npm install
```

This will install `better-sqlite3` and its TypeScript types.

## Viewing the Database

### Option 1: Using SQLite Command Line

**On Linux/Mac:**
```bash
sqlite3 the-resistance/backend/data/games.db
```

**On Windows (or if sqlite3 is not installed):**
Use the provided Node.js query tool:
```bash
cd the-resistance/backend
node query-db.js
```

Or run a single query:
```bash
node query-db.js "SELECT * FROM games;"
```

The interactive tool supports these commands:
- `.tables` - List all tables
- `.schema` - Show database schema
- `help` - Show example queries
- `exit` - Exit the tool

Then you can run SQL queries:
```sql
-- View all games
SELECT * FROM games;

-- View game with ID 1
SELECT * FROM games WHERE id = 1;

-- View all chat messages for a game
SELECT * FROM chat_messages WHERE game_id = 1;

-- View all actions for a game
SELECT * FROM game_actions WHERE game_id = 1 ORDER BY timestamp;

-- View statistics
SELECT difficulty, COUNT(*) as count FROM games WHERE difficulty IS NOT NULL GROUP BY difficulty;
```

### Option 2: Using a SQLite GUI Tool (Recommended - No SQL Required!)

**Easiest Option: VS Code/Cursor Extension**
1. Open VS Code/Cursor Extensions (Ctrl+Shift+X)
2. Search for "SQLite Viewer" by Florian Klampfer
3. Install it
4. Right-click on `data/games.db` → "Open Database"
5. Browse tables, run queries, and view data visually - no SQL needed!

**Other GUI Options:**
- **DB Browser for SQLite** (https://sqlitebrowser.org/) - Free, cross-platform desktop app
  - Download, install, then File → Open Database → select `data/games.db`
- **DBeaver** (https://dbeaver.io/) - Free, supports many databases
  - More powerful but slightly more complex setup

### Option 3: Using API Endpoints

The server provides REST API endpoints to query the database:

#### Get all games (paginated)
```
GET /api/games?limit=100&offset=0
```

#### Get a specific game by ID
```
GET /api/games/:gameId
```

#### Get a game by room ID
```
GET /api/games/room/:roomId
```

#### Get database statistics
```
GET /api/database/stats
```

Example response:
```json
{
  "totalGames": 42,
  "finishedGames": 40,
  "byDifficulty": [
    { "difficulty": "easy", "count": 15 },
    { "difficulty": "medium", "count": 18 },
    { "difficulty": "hard", "count": 9 }
  ]
}
```

## Database Schema

### `games` table
- `id` - Primary key
- `room_id` - Unique room identifier
- `game_mode` - Game mode (e.g., "avalon_easy", "avalon_medium", "avalon_hard")
- `difficulty` - Difficulty level (easy/medium/hard) or null
- `num_players` - Number of players
- `player_names` - JSON array of player names
- `player_roles` - JSON array of player roles
- `player_is_ai` - JSON array of booleans indicating which players are AI (true) or human (false)
- `winner` - Winner ("agent" or "spy") or null if not finished
- `started_at` - Timestamp when game started
- `ended_at` - Timestamp when game ended (null if still in progress)
- `created_at` - Timestamp when record was created

### `game_actions` table
- `id` - Primary key
- `game_id` - Foreign key to games table
- `action_type` - Type of action (e.g., "game/send-proposal-vote")
- `action_payload` - JSON payload of the action
- `player_index` - Index of player who performed the action (null for system actions)
- `timestamp` - When the action occurred
- `game_phase` - Game phase when action occurred
- `mission_number` - Current mission number

### `chat_messages` table
- `id` - Primary key
- `game_id` - Foreign key to games table
- `message_type` - "player" or "system"
- `player_index` - Index of player who sent the message (null for system messages)
- `content` - Message content
- `timestamp` - When the message was sent

### `teams` table
- `id` - Primary key
- `game_id` - Foreign key to games table
- `mission_number` - Mission number for this team proposal
- `leader_index` - Index of the team leader
- `members` - JSON array of player indices in the team
- `votes` - JSON array of votes ("accept", "reject", or "none")
- `approved` - Boolean indicating if the team was approved
- `timestamp` - When the team was proposed

### `missions` table
- `id` - Primary key
- `game_id` - Foreign key to games table
- `mission_number` - Mission number
- `members` - JSON array of player indices who went on the mission
- `actions` - JSON array of mission actions ("success" or "fail")
- `result` - Mission result ("success" or "fail")
- `timestamp` - When the mission was completed

## Example Queries

### Get all chat messages from a specific game
```sql
SELECT 
  cm.timestamp,
  cm.message_type,
  cm.player_index,
  cm.content,
  g.player_names
FROM chat_messages cm
JOIN games g ON cm.game_id = g.id
WHERE cm.game_id = 1
ORDER BY cm.timestamp;
```

### Get all votes for a game
```sql
SELECT 
  t.mission_number,
  t.leader_index,
  t.members,
  t.votes,
  t.approved,
  t.timestamp
FROM teams t
WHERE t.game_id = 1
ORDER BY t.timestamp;
```

### Get mission results
```sql
SELECT 
  m.mission_number,
  m.members,
  m.actions,
  m.result,
  m.timestamp
FROM missions m
WHERE m.game_id = 1
ORDER BY m.mission_number;
```

### Get games by difficulty
```sql
SELECT 
  id,
  room_id,
  difficulty,
  num_players,
  winner,
  started_at,
  ended_at
FROM games
WHERE difficulty = 'medium'
ORDER BY started_at DESC;
```

### Get AI player information
```sql
-- View which players are AI in a game
SELECT 
  id,
  player_names,
  player_roles,
  player_is_ai
FROM games
WHERE id = 1;
-- Note: player_is_ai is a JSON array like [false, true, false, true, false]
-- where true means that player index is an AI agent
```

### Count AI vs Human players
```sql
-- Count how many AI players are in each game
SELECT 
  id,
  num_players,
  player_is_ai,
  -- Count true values in JSON array (requires JSON parsing)
  (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'true') as ai_count,
  (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'false') as human_count
FROM games
WHERE player_is_ai IS NOT NULL;
```

### Find games with only AI players
```sql
-- Games where all players are AI
SELECT id, room_id, num_players, player_names, player_is_ai
FROM games
WHERE (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'true') = num_players;
```

### Find games with only human players
```sql
-- Games where all players are human
SELECT id, room_id, num_players, player_names, player_is_ai
FROM games
WHERE (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'false') = num_players;
```

## Data Export

To export data for analysis, you can:

1. **Export to CSV** using SQLite:

**On Linux/Mac:**
```bash
sqlite3 -header -csv the-resistance/backend/data/games.db "SELECT * FROM games;" > games.csv
sqlite3 -header -csv the-resistance/backend/data/games.db "SELECT * FROM chat_messages;" > chat_messages.csv
```

**On Windows (using Node.js script):**
Create a simple export script or use the query tool with output redirection:
```bash
node query-db.js "SELECT * FROM games;" > games.csv
```

2. **Export to JSON** using a script or API endpoints

3. **Use Python with sqlite3**:
```python
import sqlite3
import json

conn = sqlite3.connect('the-resistance/backend/data/games.db')
cursor = conn.cursor()

# Get all games
cursor.execute("SELECT * FROM games")
games = cursor.fetchall()

# Convert to JSON
games_json = json.dumps(games, indent=2)
print(games_json)
```

## Notes

- The database is automatically created when the server starts
- Data is saved in real-time as games progress
- The database file persists between server restarts
- All JSON fields can be parsed in your analysis scripts


