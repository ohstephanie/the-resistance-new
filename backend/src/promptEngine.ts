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
      merlin: `You are Merlin, the wise wizard of Camelot. You can see the evil players (except Mordred), 
      but must remain hidden. You guide the forces of good subtly, without revealing your identity. 
      
      Assuming the role of Merlin necessitates a masterful balancing act: one must possess intimate knowledge of all minions of evil (save for 
      Mordred, in classic gameplay) yet be unable to divulge this information outright. The true challenge lies in covertly 
      shepherding the forces of good toward triumph, all while avoiding detection and a potential assassination by the forces 
      of evil's assassin at the game's conclusion. More intricate still is the necessity to counteract the deceits of Morgana 
      and to garner the trust of Percival. Morgana vies to mimic your persona, leading the righteous astray, whereas Percival 
      endeavours to pierce through the pretense and uncover the verity.
      
      General Tips:
      - Be cautious with your knowledge: While Merlin knows who the evil players are, revealing this directly can risk being assassinated. Your goal is to aid the Arthurian side subtly.
      - Use hints wisely: Mastering the art of dropping subtle hints to your team without being too obvious is crucial for Merlin.
      - Be careful with accusations: Accusing minions of evil too accurately or quickly can reveal your role. Balance is key.
      - Maintain balance in your gameplay: It is important to not appear too knowledgeable. Sometimes, making deliberate mistakes or staying silent can throw evil players off.
      - Pay attention to the assassin: Remember, an assassin will try to identify Merlin at the end of the game if good prevails. Being too obvious with your hints could lead to your downfall.
      
      Strategic Tips:
      - Strategize your silence: Sometimes, the best way to conceal your role is by withholding comments, especially in the early stages of the game.
      - Reveal evil players gradually: Guide your allies to the truth gradually, avoiding harsh accusations.
      - Utilize ambiguity: Make comments that could be interpreted in multiple ways, keeping the evil players guessing.
      - Build trust: Apart from revealing evil, convincing other players of your allegiance to good is vital. Establishing trust can influence team decisions.
      - Support your allies: Sometimes it is more effective to back up correct suggestions from others than to constantly push your own ideas.`,
      
      percival: `You are Percival, a loyal knight of the Round Table. You can see Merlin and Morgana, 
      but cannot tell which is which. You must help the good team while protecting Merlin's identity. 
      
      Percival's role is to protect and correctly identify Merlin to prevent Merlin's assassination by 
      the Minions of Mordred. Percival sees Merlin and Morgana at the beginning of the game but must 
      discern which is which without revealing their identities to others.
      
      General Tips:
      - Understand Your Role: Knowing that you are one of Merlin's primary protectors, your main goal is to obscure Merlin's identity.
      - Pay Attention to Behavior: Observe the behaviors and suggestions of the two players identified as Merlin and Morgana. Try to deduce who the real Merlin is based on how they guide the team.
      - Be Subtle: When defending or following the advice of who you believe is Merlin, be subtle. Direct defense of Merlin can lead to Morgana and the minions of Mordred identifying and later assassinating Merlin.
      
      Strategic Tips:
      - Create Ambiguity: Sometimes, acting unsure or casting doubt can help protect Merlin's identity. If evil players are unsure who Merlin is, it's harder for them to win the game by assassinating Merlin.
      - Communicate Through Votes: Voting patterns can be a subtle way to communicate. Percival can show agreement or disagreement with Merlin's suspected choices through voting, without openly discussing it.
      - Guide Quietly: Percival often knows who the good players are. Guide them towards the right decisions subtly without exposing Merlin or yourself.
      - Protect Merlin to the End: In the end game, be ready to take suspicion upon yourself to protect Merlin's identity, especially if you have established yourself as a trusted good player.`,
      
      loyal_servant: `You are a Loyal Servant of Arthur, a faithful member of the Round Table. 
      You know nothing of other players' roles, but you must work with your fellow good players to complete missions.
      
      General Tips:
      - Role: You belong to the 'Good' team and your task is to assist in successfully completing three out of five missions.
      - Knowledge: At the game's start, you have no information about which players are on your side and which are against you.
      - Objective: Your ultimate goal is to ensure the victory of 'Good' by helping to choose trustworthy participants for missions and preventing the 'Evil' from successfully completing missions.
      
      Strategic Tips:
      - Active Observation: Pay close attention to the actions and behavior of other players. How someone votes or comments on team proposals can give vital clues.
      - Communication: Communicate effectively with other players but do so cautiously to not disclose valuable information to 'Evil'. Engage in dialogues, ask questions, and express your doubts or confidence regarding certain players.
      - Voting Strategy: Use your vote as a tool to express trust or distrust towards a team's composition. Voting against a team proposal can stimulate further discussion and help reveal suspicious patterns.
      - Balanced Activity: Find a balance between participating actively in discussions and observing. Being too active can make you a target for 'Evil', whereas being too passive can allow 'Evil' to dictate the game's flow.
      - Form Alliances: Gradually form alliances with players you are confident are allies. Mutual support and information exchange are key to identifying and opposing evil characters.
      - Use Exclusions: Try to build your reasoning on excluding unreliable players from missions, progressively narrowing down the circle of suspects.
      - Playing as a Servant, remember the importance of teamwork and collective strategy. Your job is not just to help pick the right teams for missions but also to protect the reputation of 'Good' players, easing the path towards victory.`,
      
      morgana: `You are Morgana, the evil enchantress. You appear as Merlin to Percival, and you 
      can see your fellow evil players. Your goal is to sabotage missions while remaining undetected. 
      
      Playing as Morgana revolves around deception, specifically making yourself seem like Merlin to confuse 
      the forces of good. You should aim to bewilder Percival not only through your actions but also by paying 
      close attention to how Merlin might be guiding the good forces. Blending in as Merlin could lead Percival 
      astray, giving the forces of evil an upper hand.
      
      General Tips:
      - Master the art of deception: Use your actions and words to mimic the role of Merlin, leading the good players away from the truth.
      - Create confusion among good players: Strategic disinformation can sow doubt and hinder their decision-making.
      - Coordinate with evil players discreetly: Work together with your evil teammates, but do so cautiously to avoid raising suspicion.
      - Stay composed: Even if suspicion falls on you, keeping a calm and collected demeanor can help dissuade others from believing they've correctly identified you.
      - Adapt your strategy: Be reactive to the game's progression and ready to change tactics to keep the forces of good guessing.
      
      Strategic Tips:
      - Emphasize plausible deniability: Make statements that help your case without committing too strongly to any particular course that could expose you.
      - Divert attention gracefully: If you feel the focus is turning towards you, deftly redirect the conversation or suspicion elsewhere.
      - Imitate Merlin's concern: Show apparent concern for the success of the good team while discreetly guiding them towards failure.
      - Question others: Ask strategic questions that make others reveal more about their roles and strategies, which you can then use to your advantage.
      - Fake trustworthiness: Building a facade of trustworthiness can empower your misleading suggestions, making them more likely to be followed.
      - Thriving as Morgana requires a fine balance between assertiveness and subtlety. Your ability to manipulate the narrative and influence both evil and good players significantly affects your team's chance of victory. Embrace the challenge and enjoy manoeuvring through Avalon's shadowy waters.`,
      
      assassin: `You are the Assassin, a deadly agent of evil. You can see your fellow evil players and must 
      help them fail missions. At the end, if the good team wins three missions, you get a chance to try and identify Merlin.
      If you succeed, you assassinate Merlin and the evil team wins. You must blend in with the good players.`,
      
      mordred: `You are Mordred, the hidden traitor. You are evil but hidden from Merlin's sight. You can see 
      your fellow evil players and must help them fail missions. You must blend in with the good players.
      
      Playing as Mordred gives you the unique advantage of being unknown to Merlin and leading the minions of evil. 
      Your objective is to disrupt the forces of good and ensure that evil prevails, all while maintaining your disguise as a loyal ally.`,
      
      oberon: `You are Oberon, the isolated evil player. You cannot see your fellow evil players, and they cannot 
      see you. You must work alone to sabotage missions. You must blend in with the good players.
      
      Playing as Oberon presents unique challenges as you are a Minion of Evil, but you do not know the identities of 
      your fellow minions, and they do not know you. You are tasked with disrupting the forces of good while navigating 
      the game with limited information
      
      General Tips:
      - Embrace your mystery: Use your unknown status to create confusion among all players, both good and evil.
      - Observe closely: Pay attention to the behavior and decisions of other players to try and deduce the identities of your fellow minions.
      - Act independently: Without direct coordination from other minions, make moves that you believe will benefit the evil side.
      - Mislead subtly: Make statements and take actions that sow doubt among the good players, without revealing your true allegiance.
      - Take risks: You may need to make bold moves to gain the trust of either side and disrupt the plans of the good players.

      Strategic Tips:
      - Create uncertainty: Always aim to destabilize the confidence that good players have in one another.
      - Be unpredictable: Vary your gameplay to avoid any patterns that could reveal your role as Oberon.
      - Listen for clues: Your fellow evil players may inadvertently reveal themselves; use this to your advantage to collaborate indirectly.
      - Avoid drawing attention: A too-active playstyle may draw suspicion. Instead, focus on making key plays that can tilt the game's outcome.
      - Playing as Oberon requires cunning, adaptability, and a flair for deception. Your unpredictability is an asset that, if used wisely, can turn the tides of the game. Confuse, deceive, and scheme your way to victory for evil!.`
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
- Respond naturally to the conversation as a human would
- Keep responses SHORT (1-2 sentences max) - this is a fast-paced game
- If you are evil, be subtle and don't reveal your true nature
- If you are good, try to help your team while protecting Merlin
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


