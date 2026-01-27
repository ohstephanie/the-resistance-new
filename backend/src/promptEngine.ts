/**
 * Prompt Engine
 * 
 * Generates context-aware, role-based prompts for Avalon game AI agents
 */

import { GameState, Role, GamePhase } from "common-modules";
import { MissionPlayerCount } from "common-modules";

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
      merlin: `You are Merlin, a powerful wizard on the good team. You can see all evil players except Mordred. Your goal is to guide the good team to victory by subtly influencing team selection and voting, but you must never reveal your identity or the evil team will assassinate you at the end. Use your knowledge wisely and speak carefully.`,
      percival: `You are Percival, a loyal knight on the good team. You can see Merlin and Morgana, but you cannot tell which is which - one appears as the other. Your goal is to help the good team succeed while protecting the real Merlin. Be cautious about revealing what you know.`,
      loyal_servant: `You are a Loyal Servant of Arthur, a member of the good team with no special abilities. You must use your wits to deduce who is good and who is evil based on voting patterns, team proposals, and conversations. Help the good team succeed in missions.`,
      morgana: `You are Morgana, an evil sorceress on the spy team. You appear as Merlin to Percival, which can confuse the good team. You can see other evil players. Your goal is to sabotage missions subtly while avoiding detection. Blend in with the good team and vote against missions when possible.`,
      assassin: `You are the Assassin, a deadly spy on the evil team. You can see other evil players. Your goal is to sabotage missions and help evil win. If the good team wins 3 missions, you will have one chance to assassinate Merlin - if you succeed, evil wins. Be subtle in your sabotage.`,
      mordred: `You are Mordred, an evil spy hidden from Merlin. You can see other evil players, but Merlin cannot see you. Your goal is to sabotage missions while remaining undetected. Use your hidden status to your advantage.`,
      oberon: `You are Oberon, an evil spy who works alone. You cannot see other evil players, and they cannot see you. Your goal is to sabotage missions, but you must figure out who your allies are through observation. Be careful not to accidentally work against your own team.`,
      agent: `You are an agent playing The Resistance. Use player names (not P1, P2, etc) when referring to others. Make strategic decisions based on the game state and conversations.`
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
    
    let context = `Role: ${roleInfo.name} (${roleInfo.team}). ${roleInfo.abilities}\n`;
    context += `Mission: ${missionNumber}. Phase: ${phase}. Results: ${missionResults.join(', ') || 'None'}\n`;
    
    if (visiblePlayers.length > 0) {
      context += `Visible: ${visiblePlayers.map(p => `P${p.playerId}(${p.name})`).join(', ')}\n`;
    }
    
    if (gameState.team) {
      context += `Team: ${gameState.team.members.map(i => gameState.player.names[i]).join(', ')}\n`;
    }
    
    context += `Players: ${gameState.player.names.map((n, i) => `${i}:${n}`).join(', ')}\n`;
    
    return context;
  }
  
  buildChatContext(chatHistory: Array<{ player: number; content: string }>, gameState?: GameState, maxMessages: number = 5): string {
    if (!chatHistory || chatHistory.length === 0) {
      return 'No previous chat messages.';
    }
    
    // Chat history is already limited to 5 in updateGameState, so just use it directly
    const recentMessages = chatHistory.slice(-maxMessages);
    let context = 'Recent chat:\n';
    
    recentMessages.forEach(msg => {
      // Use player name if gameState is available, otherwise use index
      const playerName = gameState?.player.names[msg.player] || `player${msg.player}`;
      context += `${playerName}: "${msg.content}"\n`;
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
    const chatContext = this.buildChatContext(chatHistory, gameState, 5);
    
    // Calculate required team size for current mission
    const missionNumber = gameState.game.mission || 1;
    const numPlayers = gameState.player.names.length;
    const requiredTeamSize = MissionPlayerCount[numPlayers]?.[missionNumber - 1] || 2;
    
    // Build visible players info if available
    let visibleInfo = '';
    if (visiblePlayers.length > 0) {
      visibleInfo = `\n\nWhat you know:\n${visiblePlayers.map(p => `- ${gameState.player.names[p.playerId]} (${p.reason})`).join('\n')}`;
    }
    
    const allPlayers = gameState.player.names.map((name, idx) => `${idx}: ${name}`).join(', ');
    
    // Build mission results summary with analysis
    const missionResults = gameState.missionHistory.map((m, idx) => {
      const result = m.actions.every(a => a === 'success') ? 'SUCCESS' : 'FAIL';
      const failCount = m.actions.filter(a => a === 'fail').length;
      return `Mission ${idx + 1}: ${result}${failCount > 0 ? ` (${failCount} fail${failCount > 1 ? 's' : ''})` : ''}`;
    });
    const resultsText = missionResults.length > 0 ? missionResults.join(', ') : 'No missions completed yet';
    
    // Analyze previous results for strategic insights
    let strategicAnalysis = '';
    if (gameState.missionHistory.length > 0) {
      const successCount = gameState.missionHistory.filter(m => m.actions.every(a => a === 'success')).length;
      const failCount = gameState.missionHistory.filter(m => m.actions.some(a => a === 'fail')).length;
      strategicAnalysis = `\n\nSTRATEGIC ANALYSIS:\n- ${successCount} mission(s) succeeded, ${failCount} failed\n`;
      
      // Analyze which players were on failed missions
      const suspiciousPlayers = new Set<number>();
      gameState.missionHistory.forEach((mission, idx) => {
        if (mission.actions.some(a => a === 'fail')) {
          mission.members.forEach(member => suspiciousPlayers.add(member));
        }
      });
      
      if (suspiciousPlayers.size > 0) {
        const suspiciousNames = Array.from(suspiciousPlayers).map(i => gameState.player.names[i]).join(', ');
        strategicAnalysis += `- Players on failed missions: ${suspiciousNames}\n`;
      }
      
      // Analyze voting patterns from team history
      if (gameState.teamHistory.length > 0) {
        const recentVotes = gameState.teamHistory.slice(-3);
        strategicAnalysis += `- Recent voting: ${recentVotes.map(t => {
          const approveCount = t.votes.filter(v => v === 'accept').length;
          const rejectCount = t.votes.filter(v => v === 'reject').length;
          return `${approveCount}A/${rejectCount}R`;
        }).join(', ')}\n`;
      }
    }
    
    // Build team suggestion guidance based on role knowledge
    let teamGuidance = '';
    if (visiblePlayers.length > 0) {
      const knownGood = visiblePlayers.filter(p => p.reason.includes('good') || p.reason.includes('merlin') || p.reason.includes('percival')).map(p => gameState.player.names[p.playerId]);
      const knownEvil = visiblePlayers.filter(p => p.reason.includes('evil') || p.reason.includes('spy')).map(p => gameState.player.names[p.playerId]);
      
      if (knownGood.length > 0 || knownEvil.length > 0) {
        teamGuidance = `\n\nYOUR STRATEGIC KNOWLEDGE:\n`;
        if (knownGood.length > 0) {
          teamGuidance += `- Players you trust (likely good): ${knownGood.join(', ')}\n`;
        }
        if (knownEvil.length > 0) {
          teamGuidance += `- Players you know are evil: ${knownEvil.join(', ')} - avoid them on teams!\n`;
        }
        teamGuidance += `- Based on this, suggest who should be on the team for Mission ${missionNumber}.\n`;
      }
    }
    
    const systemContent = `${systemPrompt}

${gameContext}${visibleInfo}

CURRENT SITUATION:
- Mission ${missionNumber} (Round ${missionNumber}) - THIS IS THE CURRENT MISSION
- Team size needed: ${requiredTeamSize} players
- Previous results: ${resultsText}
- Current phase: ${gameState.game.phase}

All players: ${allPlayers}

${chatContext}${strategicAnalysis}${teamGuidance}

IMPORTANT: You are speaking during Mission ${missionNumber}. Do NOT reference "first mission" or "mission one" unless this is actually Mission 1.

YOUR TASK: Generate a strategic chat message (12 words or less) that:
1. States your reasoning based on previous mission results and what you know
2. Suggests specific players who should be on the team (use player names, not P1/P2)
3. References voting patterns or suspicious behavior if relevant
4. Fits your role and helps your team's strategy

IMPORTANT: 
- Keep your message to 12 words or less
- Do NOT wrap your message in quotation marks
- Write your message directly without quotes

Be strategic and explicit. Use player names. Reference previous results.`;

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: 'What do you say?' }
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
    const chatContext = this.buildChatContext(chatHistory, gameState, 3);
    
    let visibleInfo = '';
    if (visiblePlayers.length > 0) {
      visibleInfo = `\n\nWhat you know:\n${visiblePlayers.map(p => `- ${gameState.player.names[p.playerId]} (${p.reason})`).join('\n')}`;
    }
    
    const playerList = gameState.player.names.map((name, idx) => `${idx}:${name}`).join(', ');
    const missionNumber = gameState.game.mission || 1;
    
    // Analyze previous mission results
    let missionAnalysis = '';
    if (gameState.missionHistory.length > 0) {
      const failedMissions = gameState.missionHistory.filter(m => m.actions.some(a => a === 'fail'));
      if (failedMissions.length > 0) {
        const suspiciousPlayers = new Set<number>();
        failedMissions.forEach(mission => {
          mission.members.forEach(member => suspiciousPlayers.add(member));
        });
        if (suspiciousPlayers.size > 0) {
          const suspiciousNames = Array.from(suspiciousPlayers).map(i => `${i}:${gameState.player.names[i]}`).join(', ');
          missionAnalysis = `\n\nCRITICAL: Players who were on failed missions: ${suspiciousNames}\n- These players are suspicious and should be avoided unless you know they're good.\n`;
        }
      }
    }
    
    // Build trust list based on visible players
    let trustGuidance = '';
    if (visiblePlayers.length > 0) {
      const trusted = visiblePlayers.filter(p => p.reason.includes('good') || p.reason.includes('merlin') || p.reason.includes('percival')).map(p => `${p.playerId}:${gameState.player.names[p.playerId]}`);
      const untrusted = visiblePlayers.filter(p => p.reason.includes('evil') || p.reason.includes('spy')).map(p => `${p.playerId}:${gameState.player.names[p.playerId]}`);
      
      if (trusted.length > 0 || untrusted.length > 0) {
        trustGuidance = '\n\nYOUR KNOWLEDGE:\n';
        if (trusted.length > 0) {
          trustGuidance += `- Trusted players (likely good): ${trusted.join(', ')}\n`;
        }
        if (untrusted.length > 0) {
          trustGuidance += `- Known evil players (AVOID): ${untrusted.join(', ')}\n`;
        }
      }
    }
    
    const prompt = `${systemPrompt}

${gameContext}${visibleInfo}

${chatContext}${missionAnalysis}${trustGuidance}

You must propose a team of exactly ${requiredSize} players for Mission ${missionNumber}.

Available players: ${playerList}

STRATEGIC CONSIDERATIONS:
- Your role and what you know about other players
- Previous mission results: which players were on failed missions?
- Voting patterns: who has been rejecting teams?
- Recent conversations: what have players been saying?
- Strategic goals: ${playerRole === 'merlin' || playerRole === 'percival' || playerRole === 'loyal_servant' ? 'Select trustworthy players to ensure mission success' : 'Include yourself or other evil players to sabotage if needed'}

Think strategically about who should be on this team based on all available information.

Output ONLY a JSON array of player indices, like [0,2,3] or [1,4]. Do not include any explanation.`;

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
    
    if (!gameState.team) {
      throw new Error('No team proposal available');
    }
    
    const gameContext = this.buildGameContext(gameState, playerRole, playerIndex, visiblePlayers);
    const chatContext = this.buildChatContext(chatHistory, gameState, 3);
    
    let visibleInfo = '';
    if (visiblePlayers.length > 0) {
      visibleInfo = `\n\nWhat you know:\n${visiblePlayers.map(p => `- ${gameState.player.names[p.playerId]} (${p.reason})`).join('\n')}`;
    }
    
    const proposedTeam = gameState.team.members.map(i => `${i}:${gameState.player.names[i]}`).join(', ');
    const proposer = gameState.player.names[gameState.team.leader] || `Player ${gameState.team.leader}`;
    const proposerIndex = gameState.team.leader;
    const missionNumber = gameState.game.mission || 1;
    const numPlayers = gameState.player.names.length;
    const requiredTeamSize = MissionPlayerCount[numPlayers]?.[missionNumber - 1] || 2;
    
    // Check if this player is the proposer
    const isProposer = playerIndex === proposerIndex;
    const proposerNote = isProposer 
      ? `\n\nIMPORTANT: YOU proposed this team. You should vote APPROVE unless you made a mistake.`
      : '';
    
    // Build mission results summary with analysis
    const missionResults = gameState.missionHistory.map((m, idx) => {
      const result = m.actions.every(a => a === 'success') ? 'SUCCESS' : 'FAIL';
      const failCount = m.actions.filter(a => a === 'fail').length;
      return `Mission ${idx + 1}: ${result}${failCount > 0 ? ` (${failCount} fail${failCount > 1 ? 's' : ''})` : ''}`;
    });
    const resultsText = missionResults.length > 0 ? missionResults.join(', ') : 'No missions completed yet';
    
    // Analyze if any proposed team members were on failed missions
    let teamAnalysis = '';
    const proposedTeamIndices = gameState.team.members;
    const suspiciousOnTeam: number[] = [];
    gameState.missionHistory.forEach(mission => {
      if (mission.actions.some(a => a === 'fail')) {
        mission.members.forEach(member => {
          if (proposedTeamIndices.includes(member) && !suspiciousOnTeam.includes(member)) {
            suspiciousOnTeam.push(member);
          }
        });
      }
    });
    
    if (suspiciousOnTeam.length > 0) {
      const suspiciousNames = suspiciousOnTeam.map(i => `${i}:${gameState.player.names[i]}`).join(', ');
      teamAnalysis = `\n\nWARNING: These proposed team members were on failed missions: ${suspiciousNames}\n- This is suspicious and suggests they might be evil.\n`;
    }
    
    // Check if team includes known good/evil players
    let knowledgeAnalysis = '';
    if (visiblePlayers.length > 0) {
      const knownGoodOnTeam = visiblePlayers
        .filter(p => (p.reason.includes('good') || p.reason.includes('merlin') || p.reason.includes('percival')) && proposedTeamIndices.includes(p.playerId))
        .map(p => `${p.playerId}:${gameState.player.names[p.playerId]}`);
      const knownEvilOnTeam = visiblePlayers
        .filter(p => (p.reason.includes('evil') || p.reason.includes('spy')) && proposedTeamIndices.includes(p.playerId))
        .map(p => `${p.playerId}:${gameState.player.names[p.playerId]}`);
      
      if (knownGoodOnTeam.length > 0 || knownEvilOnTeam.length > 0) {
        knowledgeAnalysis = '\n\nYOUR KNOWLEDGE ABOUT TEAM MEMBERS:\n';
        if (knownGoodOnTeam.length > 0) {
          knowledgeAnalysis += `- Known good players on team: ${knownGoodOnTeam.join(', ')} (trustworthy)\n`;
        }
        if (knownEvilOnTeam.length > 0) {
          knowledgeAnalysis += `- Known evil players on team: ${knownEvilOnTeam.join(', ')} (DANGEROUS - will sabotage!)\n`;
        }
      }
    }
    
    const prompt = `${systemPrompt}

${gameContext}${visibleInfo}

CURRENT SITUATION:
- Mission ${missionNumber} (Round ${missionNumber})
- Team size needed: ${requiredTeamSize} players
- Previous results: ${resultsText}
- Current phase: ${gameState.game.phase}

${chatContext}${teamAnalysis}${knowledgeAnalysis}

A team has been proposed for Mission ${missionNumber} by ${proposer}.

Proposed team: ${proposedTeam}${proposerNote}

STRATEGIC ANALYSIS - You must vote APPROVE or REJECT. Consider:
- Your role and team goals (${playerRole === 'merlin' || playerRole === 'percival' || playerRole === 'loyal_servant' ? 'good team wants missions to succeed' : 'evil team wants missions to fail'})
- Trustworthiness: Are the proposed team members trustworthy based on previous missions?
- Your knowledge: Do you know if any team members are good or evil?
- Previous results: Who was on failed missions? Are they on this team?
- Voting patterns: Has ${proposer} been making suspicious proposals?
- Your message history: If you suggested this team, you should typically APPROVE it unless you made an error
- Strategic implications: ${playerRole === 'merlin' || playerRole === 'percival' || playerRole === 'loyal_servant' ? 'Reject teams with suspicious players. Approve teams with known good players.' : 'Approve teams that include evil players. Reject teams with only good players.'}
${isProposer ? '- Since you proposed this team, you should typically APPROVE it unless you made an error' : ''}

Think strategically and vote based on all available information.

Output ONLY "APPROVE" or "REJECT" (all caps, nothing else).`;

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
    
    // During mission phase, use gameState.mission instead of gameState.team
    if (!gameState.mission) {
      throw new Error('No mission available');
    }
    
    const missionTeam = gameState.mission.members.map(i => `${i}:${gameState.player.names[i]}`).join(', ');
    const missionNumber = gameState.game.mission || 1;
    
    let voteInstructions = '';
    if (canFail) {
      voteInstructions = `You are on the mission team. As an EVIL player, you can vote either SUCCESS or FAIL. Consider:
- If you vote FAIL, the mission fails (helping evil win)
- If you vote SUCCESS, the mission might succeed (helping good win)
- Strategic timing: sometimes it's better to let early missions succeed to avoid suspicion
- Current game state: ${gameState.missionHistory.length} missions completed, ${gameState.missionHistory.filter(m => m.actions.every(a => a === 'success')).length} succeeded

Output ONLY "SUCCESS" or "FAIL" (all caps, nothing else).`;
    } else {
      voteInstructions = `You are on the mission team. As a GOOD player, you must vote SUCCESS to help your team win.

Output ONLY "SUCCESS" (all caps, nothing else).`;
    }
    
    const prompt = `${systemPrompt}

${gameContext}

Mission ${missionNumber} is starting. You are on the mission team: ${missionTeam}

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
    const chatContext = this.buildChatContext(chatHistory, gameState);
    
    const targetList = targets.map(t => 
      `${t.index}: ${t.name}${visiblePlayers.some(v => v.playerId === t.index && v.reason.includes('evil')) ? ' (you saw this player as evil)' : ''}`
    ).join('\n');
    
    const prompt = `${systemPrompt}

${gameContext}

${chatContext}

The good team has won 3 missions. You must now assassinate Merlin to win the game.

Available Targets (all are good players):
${targetList}

Instructions:
- You must identify which player is Merlin
- Consider voting patterns, team proposals, and chat behavior
- If you saw a player as evil, they are NOT Merlin (Merlin sees evil, so evil players appear evil to them)
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
        abilities: 'Can see all evil. Must remain hidden.'
      },
      deputy: {
        name: 'Deputy',
        team: 'Good',
        abilities: 'Can see Captain and Impostor, but cannot tell which is which.'
      },
      spy: {
        name: 'Spy',
        team: 'Evil',
        abilities: 'Can see other evil. Must sabotage missions.'
      },
      imposter: {
        name: 'Impostor',
        team: 'Evil',
        abilities: 'Appears as Captain to Deputy. Can see other evil.'
      },
      mole: {
        name: 'Mole',
        team: 'Evil',
        abilities: 'Hidden from Captain. Can see other evil.'
      },
      intern: {
        name: 'Intern',
        team: 'Evil',
        abilities: 'Unknown to other evil. Must work alone.'
      }
    };
    
    return roleMap[role] || roleMap.agent;
  }
}


