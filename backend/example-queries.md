# Example Database Queries

## How to Use

**Important:** You cannot run SQL directly in PowerShell. You must use the query tool:

```bash
cd the-resistance/backend
node query-db.js "YOUR SQL QUERY HERE"
```

Or for interactive mode:
```bash
node query-db.js
# Then type your queries at the prompt
```

## View Recent Games
```sql
SELECT id, room_id, game_mode, difficulty, num_players, winner, started_at, ended_at 
FROM games 
ORDER BY started_at DESC 
LIMIT 10;
```

## View All Game Details for a Specific Game
```sql
SELECT * FROM games WHERE id = 1;
```

## View Chat Messages from a Game
```sql
SELECT timestamp, message_type, player_index, content 
FROM chat_messages 
WHERE game_id = 1 
ORDER BY timestamp;
```

## View All Actions from a Game
```sql
SELECT timestamp, action_type, player_index, action_payload 
FROM game_actions 
WHERE game_id = 1 
ORDER BY timestamp;
```

## View Team Proposals and Votes
```sql
SELECT mission_number, leader_index, members, votes, approved, timestamp 
FROM teams 
WHERE game_id = 1 
ORDER BY timestamp;
```

## View Mission Results
```sql
SELECT mission_number, members, actions, result, timestamp 
FROM missions 
WHERE game_id = 1 
ORDER BY mission_number;
```

## Get Full Game Data (All Tables)
```sql
-- Games
SELECT * FROM games WHERE id = 1;

-- Actions
SELECT * FROM game_actions WHERE game_id = 1 ORDER BY timestamp;

-- Chat
SELECT * FROM chat_messages WHERE game_id = 1 ORDER BY timestamp;

-- Teams
SELECT * FROM teams WHERE game_id = 1 ORDER BY timestamp;

-- Missions
SELECT * FROM missions WHERE game_id = 1 ORDER BY mission_number;
```

## Statistics
```sql
-- Total games
SELECT COUNT(*) as total_games FROM games;

-- Games by difficulty
SELECT difficulty, COUNT(*) as count 
FROM games 
WHERE difficulty IS NOT NULL 
GROUP BY difficulty;

-- Win rate by difficulty
SELECT 
  difficulty,
  COUNT(*) as total_games,
  SUM(CASE WHEN winner = 'agent' THEN 1 ELSE 0 END) as agent_wins,
  SUM(CASE WHEN winner = 'spy' THEN 1 ELSE 0 END) as spy_wins
FROM games 
WHERE difficulty IS NOT NULL AND ended_at IS NOT NULL
GROUP BY difficulty;
```

## Find Games by Room ID
```sql
SELECT * FROM games WHERE room_id = 'YOUR_ROOM_ID';
```

## Check Which Players Are AI
```sql
-- View player names, roles, and AI status
SELECT 
  id,
  player_names,
  player_roles,
  player_is_ai
FROM games
WHERE id = 1;
-- player_is_ai is a JSON array: [false, true, false] means player 0 is human, player 1 is AI, player 2 is human
```

## Count AI Players in Games
```sql
-- Count AI players per game
SELECT 
  id,
  num_players,
  (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'true') as ai_count,
  (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'false') as human_count
FROM games
WHERE player_is_ai IS NOT NULL;
```

## Find Mixed Games (AI + Human)
```sql
-- Games with both AI and human players
SELECT id, room_id, num_players, player_names, player_is_ai
FROM games
WHERE (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'true') > 0
  AND (SELECT COUNT(*) FROM json_each(player_is_ai) WHERE value = 'false') > 0;
```

