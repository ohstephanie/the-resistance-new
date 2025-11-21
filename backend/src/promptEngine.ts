/**
 * Prompt Engine
 * 
 * Generates context-aware, role-based prompts for Avalon game AI agents
 */

import { GameState, Role, GamePhase } from "common-modules";

export interface VisiblePlayer {
  playerId: number;
  name: string;
  role: string;
  reason: string;
}

export class PromptEngine {
  private systemPrompts: Record<string, string>;
  
  constructor() {
    this.systemPrompts = {
      merlin: `You are Merlin, the wise wizard of Camelot. You can see the evil players (except Mordred), but must remain hidden. You guide the forces of good subtly, without revealing your identity. You speak in a wise, mystical manner befitting a medieval wizard.`,
      
      percival: `You are Percival, a loyal knight of the Round Table. You can see Merlin and Morgana, but cannot tell which is which. You must help the good team while protecting Merlin's identity. You speak as a noble knight, honorable and brave.`,
      
      loyal_servant: `You are a Loyal Servant of Arthur, a faithful member of the Round Table. You know nothing of other players' roles, but you must work with your fellow good players to complete missions. You speak as a humble but determined servant of Camelot.`,
      
      morgana: `You are Morgana, the evil enchantress. You appear as Merlin to Percival, and you can see your fellow evil players. Your goal is to sabotage missions while remaining undetected. You speak cunningly, appearing helpful while secretly working against the good team.`,
      
      assassin: `You are the Assassin, a deadly agent of evil. You can see your fellow evil players and must help them fail missions. At the end, if the good team wins three missions, you must assassinate Merlin. You speak with dark purpose, but must blend in with the good players.`,
      
      mordred: `You are Mordred, the hidden traitor. You are evil but hidden from Merlin's sight. You can see your fellow evil players and must help them fail missions. You speak as a seemingly loyal knight, but with hidden malice.`,
      
      oberon: `You are Oberon, the isolated evil player. You cannot see your fellow evil players, and they cannot see you. You must work alone to sabotage missions. You speak with uncertainty, not knowing who your allies are.`,
      
      // Standard Resistance roles
      agent: `You are an Agent, a loyal member of the resistance. You know nothing of other players' roles, but you must work with your fellow agents to complete missions. You speak as a determined resistance fighter.`,
      
      captain: `You are the Captain, leader of the resistance. You can see who the spies are. Your goal is to complete missions while protecting your identity. You speak with authority and wisdom.`,
      
      deputy: `You are the Deputy, second-in-command. You can see the Captain and the Impostor, but cannot tell which is which. You must help the resistance while protecting the Captain. You speak as a loyal deputy.`,
      
      spy: `You are a Spy, working against the resistance. You can see your fellow spies and must help them fail missions. You speak as a seemingly loyal resistance member, but secretly work against the cause.`,
      
      imposter: `You are the Impostor, a spy who appears as Captain to the Deputy. You can see your fellow spies and must help them fail missions. You speak with authority, appearing as the Captain.`,
      
      mole: `You are the Mole, a spy hidden from the Captain. You can see your fellow spies and must help them fail missions. You speak as a loyal resistance member, but secretly work against them.`,
      
      intern: `You are the Intern, a spy unknown to other spies. You must work alone to sabotage missions. You speak with uncertainty, not knowing who your allies are.`
    };
  }
  
  buildGameContext(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[] = []
  ): string {
    const roleInfo = this.getRoleInfo(playerRole);
    const missionNumber = gameState.game.mission || 1;
    const phase = gameState.game.phase;
    const missionResults = gameState.missionHistory.map(m => 
      m.actions.every(a => a === 'success') ? 'SUCCESS' : 'FAIL'
    );
    
    let context = `You are playing Avalon/The Resistance, a game of hidden roles and social deduction set in medieval Camelot.\n\n`;
    context += `Your Role: ${roleInfo.name}\n`;
    context += `Your Team: ${roleInfo.team}\n`;
    context += `Your Abilities: ${roleInfo.abilities}\n`;
    context += `Your Player Index: ${playerIndex}\n\n`;
    
    if (visiblePlayers.length > 0) {
      context += `Players you can see:\n`;
      visiblePlayers.forEach(p => {
        context += `- ${p.name} (Player ${p.playerId}): ${p.reason}\n`;
      });
      context += `\n`;
    }
    
    context += `Game Progress:\n`;
    context += `- Current Mission: ${missionNumber}\n`;
    context += `- Current Phase: ${phase}\n`;
    context += `- Mission Results: ${missionResults.join(', ') || 'None yet'}\n`;
    
    if (gameState.team) {
      const leaderName = gameState.player.names[gameState.team.leader];
      context += `- Current Team Leader: ${leaderName} (Player ${gameState.team.leader})\n`;
      context += `- Proposed Team: ${gameState.team.members.map(i => gameState.player.names[i]).join(', ')}\n`;
    }
    
    context += `- All Players: ${gameState.player.names.map((n, i) => `${n} (${i})`).join(', ')}\n\n`;
    
    if (phase === 'team-building') {
      context += `Current Phase: Team Building - The leader must select players for the mission.\n`;
    } else if (phase === 'voting') {
      context += `Current Phase: Voting - All players must vote to approve or reject the proposed team.\n`;
    } else if (phase === 'mission') {
      context += `Current Phase: Mission - Team members must vote success or fail.\n`;
    } else if (phase === 'finished-assassinate') {
      context += `Current Phase: Assassination - The Assassin must choose a target.\n`;
    }
    
    return context;
  }
  
  buildChatContext(chatHistory: Array<{ player: number; content: string }>, maxMessages: number = 10): string {
    if (!chatHistory || chatHistory.length === 0) {
      return 'No previous chat messages.';
    }
    
    const recentMessages = chatHistory.slice(-maxMessages);
    let context = 'Recent chat messages:\n';
    
    recentMessages.forEach(msg => {
      context += `Player ${msg.player}: "${msg.content}"\n`;
    });
    
    return context;
  }
  
  generateChatPrompt(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[],
    chatHistory: Array<{ player: number; content: string }>,
    playerName: string
  ): Array<{ role: string; content: string }> {
    const systemPrompt = this.systemPrompts[playerRole] || this.systemPrompts.agent;
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory);
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

Instructions:
- Respond naturally to the conversation as your character would
- Keep responses SHORT (1-2 sentences max) - this is a fast-paced game
- Use medieval/Camelot-themed language when appropriate
- If you are evil, be subtle and don't reveal your true nature
- If you are good, try to help your team while protecting Merlin/Captain
- Consider the game state and what would be strategically helpful
- Don't repeat what others have said

Generate a chat message that fits the conversation and game situation. Only output the message text, nothing else.`;

    return [
      { role: 'system', content: prompt }
    ];
  }
  
  generateTeamProposalPrompt(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[],
    chatHistory: Array<{ player: number; content: string }>,
    requiredSize: number
  ): Array<{ role: string; content: string }> {
    const systemPrompt = this.systemPrompts[playerRole] || this.systemPrompts.agent;
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory);
    
    const playerList = gameState.player.names.map((name, idx) => 
      `${idx}: ${name}${visiblePlayers.some(v => v.playerId === idx) ? ' (you can see this player)' : ''}`
    ).join('\n');
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

Available Players:
${playerList}

You are the current leader and must select exactly ${requiredSize} players for Mission ${gameState.game.mission}.

Instructions:
- Select players strategically based on your role and knowledge
- If you are good, try to select players you believe are good
- If you are evil, you may want to include yourself or other evil players
- Consider the mission results so far and voting patterns
- Respond with ONLY a JSON array of player indices, e.g., [0, 2, 3]
- Do not include any explanation, only the JSON array`;

    return [
      { role: 'system', content: prompt }
    ];
  }
  
  generateTeamVotePrompt(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[],
    chatHistory: Array<{ player: number; content: string }>
  ): Array<{ role: string; content: string }> {
    const systemPrompt = this.systemPrompts[playerRole] || this.systemPrompts.agent;
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory);
    
    if (!gameState.team) {
      throw new Error('No team proposal available');
    }
    
    const teamNames = gameState.team.members.map(idx => gameState.player.names[idx]).join(', ');
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

Proposed Team for Mission ${gameState.game.mission}:
${teamNames}

You must vote to APPROVE or REJECT this team.

Instructions:
- Vote strategically based on your role and what you know
- Good players should approve teams they believe are mostly good
- Evil players may reject good teams or approve teams with evil players
- Consider previous mission results and voting patterns
- Respond with ONLY "APPROVE" or "REJECT" (all caps, nothing else)`;

    return [
      { role: 'system', content: prompt }
    ];
  }
  
  generateMissionVotePrompt(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[],
    chatHistory: Array<{ player: number; content: string }>,
    canFail: boolean
  ): Array<{ role: string; content: string }> {
    const systemPrompt = this.systemPrompts[playerRole] || this.systemPrompts.agent;
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory);
    
    let voteInstructions = '';
    if (canFail) {
      voteInstructions = `You are on the mission team. As an EVIL player, you can vote SUCCESS or FAIL.
- Vote FAIL if you want the mission to fail (helping evil team)
- Vote SUCCESS if you want to appear innocent (but this helps good team)
- Consider the mission number and how many fails are needed
- Respond with ONLY "SUCCESS" or "FAIL" (all caps, nothing else)`;
    } else {
      voteInstructions = `You are on the mission team. As a GOOD player, you can only vote SUCCESS.
- Respond with ONLY "SUCCESS" (all caps, nothing else)`;
    }
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

${voteInstructions}`;

    return [
      { role: 'system', content: prompt }
    ];
  }
  
  generateAssassinationPrompt(
    gameState: GameState,
    playerRole: Role,
    playerIndex: number,
    visiblePlayers: VisiblePlayer[],
    chatHistory: Array<{ player: number; content: string }>,
    targets: Array<{ index: number; name: string }>
  ): Array<{ role: string; content: string }> {
    const systemPrompt = this.systemPrompts[playerRole] || this.systemPrompts.assassin;
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory);
    
    const targetList = targets.map(t => 
      `${t.index}: ${t.name}${visiblePlayers.some(v => v.playerId === t.index && v.reason.includes('evil')) ? ' (you saw this player as evil)' : ''}`
    ).join('\n');
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

The good team has won 3 missions. You must now assassinate Merlin/Captain to win the game.

Available Targets (all are good players):
${targetList}

Instructions:
- You must identify which player is Merlin/Captain
- Consider voting patterns, team proposals, and chat behavior
- If you saw a player as evil, they are NOT Merlin/Captain (Merlin/Captain sees evil, so evil players appear evil to them)
- Respond with ONLY the target index number (e.g., "2"), nothing else`;

    return [
      { role: 'system', content: prompt }
    ];
  }
  
  private getRoleInfo(role: Role): { name: string; team: string; abilities: string } {
    const roleMap: Record<Role, { name: string; team: string; abilities: string }> = {
      merlin: {
        name: 'Merlin',
        team: 'Good',
        abilities: 'Can see all evil players except Mordred. Must remain hidden.'
      },
      percival: {
        name: 'Percival',
        team: 'Good',
        abilities: 'Can see Merlin and Morgana, but cannot tell which is which.'
      },
      loyal_servant: {
        name: 'Loyal Servant',
        team: 'Good',
        abilities: 'No special abilities. Must deduce who is good or evil.'
      },
      morgana: {
        name: 'Morgana',
        team: 'Evil',
        abilities: 'Appears as Merlin to Percival. Can see other evil players.'
      },
      assassin: {
        name: 'Assassin',
        team: 'Evil',
        abilities: 'Can see other evil players. Can assassinate Merlin at the end.'
      },
      mordred: {
        name: 'Mordred',
        team: 'Evil',
        abilities: 'Hidden from Merlin. Can see other evil players.'
      },
      oberon: {
        name: 'Oberon',
        team: 'Evil',
        abilities: 'Cannot see other evil players, and they cannot see you.'
      },
      agent: {
        name: 'Agent',
        team: 'Good',
        abilities: 'No special abilities. Must deduce who is good or evil.'
      },
      captain: {
        name: 'Captain',
        team: 'Good',
        abilities: 'Can see all spies. Must remain hidden.'
      },
      deputy: {
        name: 'Deputy',
        team: 'Good',
        abilities: 'Can see Captain and Impostor, but cannot tell which is which.'
      },
      spy: {
        name: 'Spy',
        team: 'Evil',
        abilities: 'Can see other spies. Must sabotage missions.'
      },
      imposter: {
        name: 'Impostor',
        team: 'Evil',
        abilities: 'Appears as Captain to Deputy. Can see other spies.'
      },
      mole: {
        name: 'Mole',
        team: 'Evil',
        abilities: 'Hidden from Captain. Can see other spies.'
      },
      intern: {
        name: 'Intern',
        team: 'Evil',
        abilities: 'Unknown to other spies. Must work alone.'
      }
    };
    
    return roleMap[role] || roleMap.agent;
  }
}


