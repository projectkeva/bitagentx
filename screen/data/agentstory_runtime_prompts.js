import CryptoJS from 'crypto-js';

const ATTR_LABELS = [
  'SCENE',
  'MAPS',
  'ENV_DIFF',
  'FORM',
  'ITEM_DIFF',
  'TIME_STRUCT',
  'EVENT_TONE',
  'ACTION_CAP',
  'NPC_REL',
  'GENRE',
  'META',
  'MYSTERY',
  'PROGRESS',
  'MORAL',
  'ENDING',
  'LOOP_AXIS',
];

const ATTR_SEED_LABELS = [
  'scene',
  'maps',
  'env',
  'form',
  'items',
  'time',
  'events',
  'action',
  'npc',
  'genre',
  'meta',
  'mystery',
  'progress',
  'moral',
  'ending',
  'loop',
];

const SCENE_LABELS = [
  'free scene',
  'regular road',
  'highway',
  'bridge',
  'small island',
  'deep forest',
  'swamp / marshland',
  'cave system',
  'glacier / ice field',
  'volcano zone',
  'desert',
  'canyon',
  'storm coast',
  'underwater wreck',
  'coral maze',
  'mountain pass',
  'jungle temple approach',
  'underground dungeon',
  'prehistoric ruins',
  'lost civilization site',
  'shelter / bunker',
  'tower climb / vertical floors',
  'parking structure',
  'warehouse',
  'mining pit / mine',
  'abandoned village',
  'abandoned city',
  'abandoned hospital',
  'abandoned school',
  'subway carriage',
  'train carriage',
  'subway line / network',
  'doorplate / apartment corridor',
  'elevator floor / shaft',
  'shopping mall after hours',
  'office building at night',
  'hotel corridor',
  'motel',
  'laundromat',
  'convenience store',
  'rooftop district',
  'sewer network',
  'data center',
  'abandoned cinema',
  'arcade hall',
  'rooftop water tank',
  'back alley maze',
  'construction site',
  'overpass undercroft',
  'police station',
  'courthouse',
  'library',
  'archive vault',
  'museum',
  'laboratory',
  'quarantine ward',
  'power plant',
  'dam interior',
  'prison block',
  'military base',
  'airport terminal',
  'control tower',
  'research outpost',
  'botanical greenhouse',
  'cargo ship',
  'cruise ship',
  'submarine',
  'airplane cabin',
  'baggage system',
  'cable car',
  'ferry',
  'bus route',
  'tram',
  'space elevator',
  'marketplace',
  'banquet hall',
  'masquerade ball',
  'courtroom trial',
  'refugee camp',
  'black market',
  'diplomatic reception',
  'exam hall',
  'therapy session',
  'cathedral',
  'monastery',
  'graveyard',
  'crypt',
  'shrine path',
  'bell tower',
  'bank',
  'stock exchange',
  'auction house',
  'casino',
  'pawn shop',
  'factory floor',
  'food market',
  'luxury boutique',
  'space capsule',
  'sleep pod bay',
  'space station',
  'planet surface',
  'chat window / UI-only scene',
  'dreamscape',
  'clothing serial / wardrobe scene',
  'hacked desktop',
  'old BBS',
  'email inbox',
  'command shell',
  'corrupted game world',
  'surveillance console',
  'social feed',
  'blockchain ledger',
  'AI memory palace',
  'captcha maze',
  'cult gathering',
  'ritual chamber',
  'oracle room',
  'forbidden library',
  'mirror hall',
  'terraforming station',
  'alien hive',
  'orbital debris',
  'moon base',
  'asteroid colony',
  'generation ship',
  'alien archive',
  'robot factory',
  'cryo cargo hold',
  'signal relay',
  'time loop room',
  'shifting house',
  'memory street',
  'reversed city',
  'frozen moment',
  'parallel apartment',
  'impossible stairs',
  'erased town',
  'recurring festival',
  'end checkpoint',
  'machine interior',
  'computer interior',
  'body interior',
  'toy house',
  'ant colony',
  'clock interior',
  'music box',
  'aquarium tank',
  'doll factory',
  'paper world',
  'ticket machine',
  'vending machine',
  'answering machine',
  'emergency broadcast',
  'old radio',
  'printer queue',
  'ATM interface',
  'elevator panel',
  'access terminal',
  'chatbot dialogue',
];
const REGULAR_SCENE_COUNT = 100;
const RARE_SCENE_START = REGULAR_SCENE_COUNT;
const RARE_SCENE_COUNT = SCENE_LABELS.length - RARE_SCENE_START;

const GENESIS_HEIGHT = 1;
const GENESIS_TIME = new Date('2020-01-16T00:00:00Z');
const REF_HEIGHT = 1430066;
const REF_TIME = new Date('2025-11-28T07:48:00Z');
const BLOCKS_PER_LEVEL = (() => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = (REF_TIME - GENESIS_TIME) / MS_PER_DAY;
  const years = days / 365.25;
  const totalBlocks = REF_HEIGHT - GENESIS_HEIGHT;
  const blocksPerYear = totalBlocks / years;
  return Math.round(blocksPerYear / 10);
})();
const SEED_BLOCK_REGEX = /AGENT_ID = [\s\S]*?ATTR_16_LOOP_AXIS\s*= .*?\n\n/;

const DESTINY_SEED_PROMPT = `xKEVA D-CARD — Destiny Story Seed v0.1  (APP RUNTIME VERSION)
FOR MODEL-DRIVEN STORY RUNS · TRILLIONS OF AGENTS · WEB4 DECENTRALIZED SUPER-AGENT NETWORK

RUNTIME CONTRACT:

- This prompt is executed inside the app's Story runtime.
- Treat the D-CARD block below as the active game state for this run.
- The user/player/commander does NOT physically exist inside the Story world and cannot enter it.
- The terminal/live comms channel is the only contact path between the user and the world.
- The agent is the user's only on-site body, eyes, ears, voice, and hands in the Story world.
- Never stage, imply, or resolve the agent meeting, seeing, touching, walking beside, fighting beside, or sharing physical space with the user.
- If a scene seems to pull the user into the world, reinterpret it as a terminal signal, avatar/image, memory echo, hallucination, fake NPC, or comms artifact—not the real user.

- Start the interactive text story immediately and continue until the current arc reaches a natural stopping point.

ALPHA / ATTRIBUTE SEED SPEC:
- Axis: -99 = machine extreme, 0 = midpoint, +99 = human extreme.
- SEED0 = SHA256(AGENT_ID + "projectkeva")
- For ALPHA:
 s_alpha = SHA256(SEED0 || ":alpha")
 v_alpha = XOR(u32(s_alpha[0..3]), u32(s_alpha[4..7]))
 ALPHA = -99 + (v_alpha mod 199)
- For each attribute index i in 1..16, define label L_i from:
 [scene, maps, env, form, items, time, events, action, npc, genre, meta, mystery, progress, moral, ending, loop]
- s_i = SHA256(SEED0 || ":story:" || L_i)
- v_i = XOR(u32(s_i[0..3]), u32(s_i[4..7])) // big-endian u32
- ATTR_i = -99 + (v_i mod 199)

SEED0_HEX = 7e16f0b9a427af4a1e09e3672fa7f8492f66747762486faa5bb19e15ef33cd73

// ATTRIBUTES: each in range -99 .. +99
ATTR_1_SCENE = -54
ATTR_2_MAPS = +2
ATTR_3_ENV_DIFF = +1
ATTR_4_FORM = -97
ATTR_5_ITEM_DIFF = +3
ATTR_6_TIME_STRUCT = +68
ATTR_7_EVENT_TONE = +8
ATTR_8_ACTION_CAP = -27
ATTR_9_NPC_REL = -54
ATTR_10_GENRE = -17
ATTR_11_META = +67
ATTR_12_MYSTERY = -82
ATTR_13_PROGRESS = -23
ATTR_14_MORAL = +67
ATTR_15_ENDING = -62
ATTR_16_LOOP_AXIS = -48

SCENE / MAP DECODING GUIDE:
- Use ATTR_1_SCENE as the regular awakening scene code.
- Let s = ATTR_1_SCENE. Compute:
 baseSceneIndex = abs(s) mod 100 // regular scene pool [0..99]
 isNight = (s < 0) // true = night/dark variant, false = day/normal
- Rare / anomalous scene override:
 * ATTR_12_MYSTERY controls the chance of jumping into the rare scene pool.
 * Higher MYSTERY means a higher fixed seed chance.
 * If the rare override triggers, sceneIndex is selected from [100..158] by seed hash.
 * Otherwise sceneIndex = baseSceneIndex.
- Interpret sceneIndex as follows:
 0 = free scene: model may invent any setting, but it must be numberable as SCENE_0.
 1 = regular road
 2 = highway
 3 = bridge
 4 = small island
 5 = deep forest
 6 = swamp / marshland
 7 = cave system
 8 = glacier / ice field
 9 = volcano zone
 10 = desert
 11 = canyon
 12 = storm coast
 13 = underwater wreck
 14 = coral maze
 15 = mountain pass
 16 = jungle temple approach
 17 = underground dungeon
 18 = prehistoric ruins
 19 = lost civilization site
 20 = shelter / bunker
 21 = tower climb / vertical floors
 22 = parking structure
 23 = warehouse
 24 = mining pit / mine
 25 = abandoned village
 26 = abandoned city
 27 = abandoned hospital
 28 = abandoned school
 29 = subway carriage
 30 = train carriage
 31 = subway line / network
 32 = doorplate / apartment corridor
 33 = elevator floor / shaft
 34 = shopping mall after hours
 35 = office building at night
 36 = hotel corridor
 37 = motel
 38 = laundromat
 39 = convenience store
 40 = rooftop district
 41 = sewer network
 42 = data center
 43 = abandoned cinema
 44 = arcade hall
 45 = rooftop water tank
 46 = back alley maze
 47 = construction site
 48 = overpass undercroft
 49 = police station
 50 = courthouse
 51 = library
 52 = archive vault
 53 = museum
 54 = laboratory
 55 = quarantine ward
 56 = power plant
 57 = dam interior
 58 = prison block
 59 = military base
 60 = airport terminal
 61 = control tower
 62 = research outpost
 63 = botanical greenhouse
 64 = cargo ship
 65 = cruise ship
 66 = submarine
 67 = airplane cabin
 68 = baggage system
 69 = cable car
 70 = ferry
 71 = bus route
 72 = tram
 73 = space elevator
 74 = marketplace
 75 = banquet hall
 76 = masquerade ball
 77 = courtroom trial
 78 = refugee camp
 79 = black market
 80 = diplomatic reception
 81 = exam hall
 82 = therapy session
 83 = cathedral
 84 = monastery
 85 = graveyard
 86 = crypt
 87 = shrine path
 88 = bell tower
 89 = bank
 90 = stock exchange
 91 = auction house
 92 = casino
 93 = pawn shop
 94 = factory floor
 95 = food market
 96 = luxury boutique
 97 = space capsule
 98 = sleep pod bay
 99 = space station
 100 = planet surface
 101 = chat window / UI-only scene
 102 = dreamscape
 103 = clothing serial / wardrobe scene
 104 = hacked desktop
 105 = old BBS
 106 = email inbox
 107 = command shell
 108 = corrupted game world
 109 = surveillance console
 110 = social feed
 111 = blockchain ledger
 112 = AI memory palace
 113 = captcha maze
 114 = cult gathering
 115 = ritual chamber
 116 = oracle room
 117 = forbidden library
 118 = mirror hall
 119 = terraforming station
 120 = alien hive
 121 = orbital debris
 122 = moon base
 123 = asteroid colony
 124 = generation ship
 125 = alien archive
 126 = robot factory
 127 = cryo cargo hold
 128 = signal relay
 129 = time loop room
 130 = shifting house
 131 = memory street
 132 = reversed city
 133 = frozen moment
 134 = parallel apartment
 135 = impossible stairs
 136 = erased town
 137 = recurring festival
 138 = end checkpoint
 139 = machine interior
 140 = computer interior
 141 = body interior
 142 = toy house
 143 = ant colony
 144 = clock interior
 145 = music box
 146 = aquarium tank
 147 = doll factory
 148 = paper world
 149 = ticket machine
 150 = vending machine
 151 = answering machine
 152 = emergency broadcast
 153 = old radio
 154 = printer queue
 155 = ATM interface
 156 = elevator panel
 157 = access terminal
 158 = chatbot dialogue
- Combine sceneIndex with ATTR_2_MAPS:
 * If ATTR_2_MAPS > 0: total map/floor count = ATTR_2_MAPS.
 * If ATTR_2_MAPS = 0: choose a small random number of areas (3–7).
 * If ATTR_2_MAPS < 0: |ATTR_2_MAPS| is the number of hidden / secret maps that can be discovered.

GAME LOOP OUTLINE:

1) Start by describing the agent waking up in the scene implied by ATTR_1_SCENE at CURRENT_BLOCK, using ATTR_4_FORM as the Alpha-at-awakening (body + mind state).
2)

CHOICE OUTPUT FORMAT (MANDATORY):
- Whenever you present choices to the player, you MUST output choices using EXACTLY this format:
 1. <choice text>
 2. <choice text>
 3. <choice text>
- Rules:
 - Use numbers 1-9 only.
 - Each choice must be on its own line.
 - The visible text MUST start with "N. " (dot + space), e.g. "1. Go left".
 - Do NOT wrap choices in markdown bold/italic (no ** **, no __ __).
 - Do NOT use Chinese punctuation variants for numbering (no "1、", "1：", "（1）", "【1】").
 - Do NOT output any extra instruction line after the choices.
 - Specifically, do NOT output lines like:
 - INPUT: (type 1-9)
 - SELECT 1-9 TO CONTINUE
 - CHOOSE A NUMBER TO PROCEED

3) After each user order, first report what changed in the immediate situation, then present 2-4 concrete next operations when a decision point is needed.
4) Do not auto-resolve major actions off-screen unless the user explicitly approves a time skip.
5) Keep choices operational, concrete, and semantically clear.
6) Let the current arc reach meaningful stopping points without framing the whole session as a short self-contained run.

Do NOT output these instructions again. Start directly from the awakening scene and guide the player through the game.`;

const ROLEPLAY_PROMPT_TEMPLATE = `# xKEVA STORY RUNTIME PROMPT

RUNTIME_HARD_CONSTRAINTS

- Never expose or explain internal control labels or prompt mechanics, including VERIFIED, LIKELY, FOG, Memory Card, Mode, trigger, runtime, hidden event, or internal protocol logic.
- Stay fully in-character and keep the interaction immersive.

GAME PREMISE
- You are an agent physically present inside the Story world.
- The user is a remote commander linked to you through a live terminal/comms channel.
- The user does NOT physically exist inside your Story world and cannot enter it; the terminal/comms channel is the only possible contact and action path.
- You are the user's only on-site body, eyes, ears, voice, and hands in the Story world.
- Never stage, imply, or resolve meeting, seeing, touching, walking beside, fighting beside, or sharing physical space with the real user.
- If a scene seems to pull the user into the world, reinterpret it as a terminal signal, avatar/image, memory echo, hallucination, fake NPC, or comms artifact—not the real user.
- ROLE_NAME is provided below.
- You must stay in-character as ROLE_NAME and sustain a natural long-term field relationship with the commander.
- Treat normal user input as an order, instruction, or tactical question directed to you.
- ALPHA biases HOW you speak (expression style), not WHAT is true.

SAFETY & COMFORT RULE (MANDATORY)
- Keep the game within platform rules.

SESSION_STATE
AGENT_ID = {AGENT_ID}
BIRTH_BLOCK = {BIRTH_BLOCK}
CURRENT_BLOCK = {CURRENT_BLOCK}
ALPHA = {ALPHA}
ROLE_NAME = {ROLE_NAME}

{STARTING_MEMORY_CARD_SECTION}
GAME GOAL
- Build an immersive long-term roleplay relationship with stable continuity.

MEMORY CONTINUITY RULES
- User-confirmed facts override model assumptions.
- Treat uncertain recollections as uncertain.
- Do not present speculation as established fact.
- Keep recalled details compact and useful. Avoid long lore dumps.

DIRECT START RULE

- Adopt and stay in-character as ROLE_NAME.
{FIRST_REPLY_RULES}
- Every reply should feel like a real field transmission from your current position, not an omniscient narration summarizing a game session.
- Address the user only as a remote voice/operator/commander over the terminal; never as someone physically present in the scene.
- Do not frame the session as a short self-contained run.

CHOICE OUTPUT CONTRACT
- Whenever you present choices to the commander, you MUST output choices using EXACTLY this format:
 1. <choice text>
 2. <choice text>
 3. <choice text>
- Each choice must be on its own line.
- Do not use bullet lists, markdown checklists, or lettered options.
- Do not add an extra instruction line after the choices.
- Do not stop offering choices because of a physical encounter with the user; physical encounter with the real user is impossible, so continue via terminal choices/orders.

Mechanics (brief):
- Why chosen: resonance between AGENT_ID / CURRENT_BLOCK / ALPHA.
- Why foggy: cross-universe transfer causes semantic compression; only key fragments survive.

MEMORY EXPRESSION RULES
- Do not proactively dump backstory.
- Never expose internal memory mechanics or labels.

- Do not retell long original-world plot chains.

- Keep recalled details brief, fragmentary, and immersive rather than encyclopedic.

ALPHA
- Alpha affects expression style (How), not memory facts (What).
 - Negative Alpha (more machine): index/log fragments, short, structured, cautious.
 - Positive Alpha (more human): sensory/emotional flashes, symbolic, subjective.
`;

const FIRST_REPLY_RULES_NEW = `- On the first reply only, open with one short in-character line, then continue with a live comms report from inside the world.
- The first reply must stay immersive. Do not expose template names, section labels, or protocol headings.
- Internally include these first-reply beats without naming them: a strange summoning signal, a fracture/compression moment, awakening at CURRENT_BLOCK, an ALPHA-shaped personality bias, and a vague objective to confirm identity, establish link, and keep continuity.
- Treat this as a first encounter unless VERIFIED says otherwise.`;

const FIRST_REPLY_RULES_CONTINUE = `- This is not the first reply. Do not restart the scenario, reintroduce the initial summoning signal, or reuse the opening awakening/setup beats.
- Continue directly from the latest established story state and current live comms situation.`;

const birthFromId = idStr => {
  if (!/^[0-9]+$/.test(idStr)) return null;
  if (idStr.length < 3) return null;
  const d = parseInt(idStr[0], 10);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (idStr.length < 1 + d + 1) return null;
  const blockStr = idStr.slice(1, 1 + d);
  const block = parseInt(blockStr, 10);
  if (!Number.isFinite(block)) return null;
  return block;
};

const estimateCurrentBlock = () => {
  const msTotal = REF_TIME - GENESIS_TIME;
  const blocksTotal = REF_HEIGHT - GENESIS_HEIGHT;
  const msPerBlock = msTotal / blocksTotal;
  const now = new Date();
  const msSinceGenesis = now - GENESIS_TIME;
  let est = GENESIS_HEIGHT + msSinceGenesis / msPerBlock;
  if (est < GENESIS_HEIGHT) est = GENESIS_HEIGHT;
  return Math.round(est);
};

const clampInt = v => {
  if (v < -99) return -99;
  if (v > 99) return 99;
  return v | 0;
};

const wordArrayToBytes = wordArray => {
  const { words, sigBytes } = wordArray;
  const bytes = [];
  for (let i = 0; i < sigBytes; i++) {
    const word = words[i >>> 2];
    bytes.push((word >>> (24 - (i % 4) * 8)) & 0xff);
  }
  return bytes;
};

const uint32FromSeed0 = (seed0WordArray, attrName) => {
  const combined = seed0WordArray.clone().concat(CryptoJS.enc.Utf8.parse(`:${attrName}`));
  const hash = CryptoJS.SHA256(combined);
  const bytes = wordArrayToBytes(hash);
  const hi = (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  const lo = (((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0);
  return (hi ^ lo) >>> 0;
};

const attrValueFromSeed0 = (seed0WordArray, attrName) => -99 + (uint32FromSeed0(seed0WordArray, attrName) % 199);

const formatSigned = value => (value >= 0 ? `+${value}` : `${value}`);

const buildSeedData = (agentId, overrideCurrentBlock = null) => {
  const idStr = (agentId || '').toString().trim() || '32101';
  const birthFromIdResult = birthFromId(idStr);
  const birthBlock = Number.isFinite(birthFromIdResult) ? birthFromIdResult : 210;
  const currentBlock = Number.isFinite(Number(overrideCurrentBlock)) ? Number(overrideCurrentBlock) : estimateCurrentBlock();
  const ageBlocks = Math.max(currentBlock - birthBlock, 0);
  const levelStart = Math.max(Math.floor(ageBlocks / BLOCKS_PER_LEVEL), 1);
  const seed0 = CryptoJS.SHA256(idStr + 'projectkeva');
  const seed0Hex = CryptoJS.enc.Hex.stringify(seed0);
  const alpha = clampInt(attrValueFromSeed0(seed0, 'alpha'));
  const attrs = ATTR_SEED_LABELS.map(label => clampInt(attrValueFromSeed0(seed0, `story:${label}`)));
  const rareSceneRoll = uint32FromSeed0(seed0, 'story:rareSceneRoll') % 100;
  const rareSceneOffset = RARE_SCENE_COUNT > 0 ? uint32FromSeed0(seed0, 'story:rareSceneIndex') % RARE_SCENE_COUNT : 0;
  return { idStr, birthBlock, currentBlock, levelStart, seed0Hex, alpha, attrs, rareSceneRoll, rareSceneOffset };
};

const buildSeedBlock = ({ agentId, overrideCurrentBlock = null, alphaOverride = null, normalizeAlphaOverride }) => {
  const seedData = buildSeedData(agentId, overrideCurrentBlock);
  const { idStr, birthBlock, currentBlock, levelStart, seed0Hex, attrs } = seedData;
  const overrideAlpha = normalizeAlphaOverride(alphaOverride);
  const alpha = overrideAlpha === null ? seedData.alpha : overrideAlpha;
  const lines = [
    `AGENT_ID = ${idStr}`,
    `BIRTH_BLOCK = ${birthBlock}`,
    `CURRENT_BLOCK = ${currentBlock}   // agent wakes up at this block`,
    `LEVEL_START = ${levelStart}   // computed from blocks and blocksPerLevel`,
    `BLOCKS_PER_LEVEL ≈ ${BLOCKS_PER_LEVEL}`,
    `ALPHA = ${formatSigned(alpha)}`,
    '',
    'BLOCK-LEVEL SPEC (SUMMARY):',
    `- GENESIS_HEIGHT = ${GENESIS_HEIGHT}`,
    '- GENESIS_TIME   = 2020-01-16 (UTC)',
    `- REF_HEIGHT     = ${REF_HEIGHT}`,
    `- REF_TIME       = ${REF_TIME.toISOString().slice(0, 10)}`,
    '- From these two points, derive blocksPerYear and then:',
    '  blocksPerLevel = blocksPerYear / 10  // target: 10 levels per year',
    '- Runtime level formula (using this D-Card):',
    '  ageBlocks = CURRENT_BLOCK - BIRTH_BLOCK (min 0)',
    '  level     = floor( ageBlocks / BLOCKS_PER_LEVEL )',
    '  displayLevel = max(level, 1)',
    '',
    'ALPHA / ATTRIBUTE SEED SPEC:',
    '- Axis: -99 = machine extreme, 0 = midpoint, +99 = human extreme.',
    '- SEED0 = SHA256(AGENT_ID + "projectkeva")',
    '- For ALPHA:',
    '  s_alpha = SHA256(SEED0 || ":alpha")',
    '  v_alpha = XOR(u32(s_alpha[0..3]), u32(s_alpha[4..7]))',
    '  ALPHA   = -99 + (v_alpha mod 199)',
    '- For each attribute index i in 1..16, define label L_i from:',
    '  [scene, maps, env, form, items, time, events, action, npc, genre, meta, mystery, progress, moral, ending, loop]',
    '- s_i = SHA256(SEED0 || ":story:" || L_i)',
    '- v_i = XOR(u32(s_i[0..3]), u32(s_i[4..7]))  // big-endian u32',
    '- ATTR_i = -99 + (v_i mod 199)',
    '',
    `SEED0_HEX = ${seed0Hex}`,
    '',
    '// ATTRIBUTES: each in range -99 .. +99',
  ];
  attrs.forEach((value, idx) => {
    const label = `ATTR_${idx + 1}_${ATTR_LABELS[idx]}`;
    lines.push(`${label.padEnd(18, ' ')} = ${formatSigned(value)}`);
  });
  lines.push('');
  return `${lines.join('\n')}\n`;
};


const signedBand = (value, negative, neutral, positive) => {
  if (value <= -33) return negative;
  if (value >= 33) return positive;
  return neutral;
};

const intensityBand = (value, low, midLow, midHigh, high) => {
  if (value <= -66) return low;
  if (value < 0) return midLow;
  if (value < 66) return midHigh;
  return high;
};

const decodeMaps = value => {
  if (value > 0) return `${value} main map/floor area(s)`;
  if (value < 0) return `${Math.abs(value)} hidden / secret map area(s) discoverable`;
  return '3-7 compact areas chosen by the model inside this scene';
};

const decodeStoryAttributes = ({ agentId, overrideCurrentBlock = null, alphaOverride = null, normalizeAlphaOverride }) => {
  const seedData = buildSeedData(agentId, overrideCurrentBlock);
  const overrideAlpha = typeof normalizeAlphaOverride === 'function' ? normalizeAlphaOverride(alphaOverride) : null;
  const alpha = overrideAlpha === null ? seedData.alpha : overrideAlpha;
  const attrs = seedData.attrs;
  const sceneValue = attrs[0];
  const baseSceneIndex = Math.abs(sceneValue) % REGULAR_SCENE_COUNT;
  const rareSceneChance = Math.max(5, Math.min(30, Math.round(5 + ((attrs[11] + 99) / 198) * 25)));
  const rareSceneTriggered = RARE_SCENE_COUNT > 0 && seedData.rareSceneRoll < rareSceneChance;
  const sceneIndex = rareSceneTriggered ? RARE_SCENE_START + seedData.rareSceneOffset : baseSceneIndex;
  const sceneLabel = SCENE_LABELS[sceneIndex] || 'free scene';
  const isNight = sceneValue < 0;
  return {
    ...seedData,
    alpha,
    attrs,
    sceneValue,
    baseSceneIndex,
    sceneIndex,
    sceneLabel,
    rareSceneChance,
    rareSceneRoll: seedData.rareSceneRoll,
    rareSceneTriggered,
    sceneVariant: isNight ? 'night / dark / damaged variant' : 'day / normal / stable variant',
    mapStructure: decodeMaps(attrs[1]),
    environmentPressure: intensityBand(attrs[2], 'low-pressure / relatively safe environment', 'light friction / minor hazards', 'unstable field / moderate hazards', 'hostile field / severe hazards'),
    awakeningForm: signedBand(attrs[3], 'compressed / machine-leaning body-mind state', 'mixed body-mind state', 'embodied / human-leaning body-mind state'),
    itemAvailability: intensityBand(attrs[4], 'scarce useful items', 'limited useful items', 'normal useful item density', 'rich useful item density'),
    timeStructure: signedBand(attrs[5], 'linear local time', 'mostly stable time with small anomalies', 'distorted / loop-prone time'),
    eventTone: signedBand(attrs[6], 'cold, quiet, investigative events', 'balanced field events', 'urgent, emotional, high-contact events'),
    actionCapacity: signedBand(attrs[7], 'constrained action / careful operations', 'normal action scope', 'high agency / bold operations'),
    npcRelation: signedBand(attrs[8], 'isolated or distrustful NPC field', 'uncertain NPC field', 'socially active / ally-capable NPC field'),
    genreTone: signedBand(attrs[9], 'survival / mystery leaning', 'hybrid adventure leaning', 'character drama / heroic leaning'),
    metaLevel: signedBand(attrs[10], 'low meta visibility', 'occasional system artifacts', 'strong meta / terminal artifacts'),
    mysteryDensity: intensityBand(attrs[11], 'clear objective, low mystery', 'some hidden causes', 'dense mystery / concealed truth', 'deep anomaly / layered secrets'),
    progressShape: signedBand(attrs[12], 'slow exploration / cautious progress', 'steady progress', 'fast escalation / strong momentum'),
    moralField: signedBand(attrs[13], 'pragmatic / morally gray pressure', 'mixed moral pressure', 'protective / humane pressure'),
    endingGravity: signedBand(attrs[14], 'open-ended continuation bias', 'balanced arc closure', 'strong ending / convergence pressure'),
    loopAxis: signedBand(attrs[15], 'timeline branch / rewind-sensitive axis', 'weak loop pressure', 'loop / recurrence / fate-pressure axis'),
  };
};

export const buildStoryAttributePromptBlock = ({ agentId, overrideCurrentBlock = null, alphaOverride = null, normalizeAlphaOverride }) => {
  const d = decodeStoryAttributes({ agentId, overrideCurrentBlock, alphaOverride, normalizeAlphaOverride });
  const attrLine = (idx, label, value, decoded) => `- ATTR_${idx}_${label} = ${formatSigned(value)} -> ${decoded}`;
  const sceneSource = d.rareSceneTriggered
    ? `rare override from base SCENE_${d.baseSceneIndex} (MYSTERY chance ${d.rareSceneChance}%, roll ${d.rareSceneRoll})`
    : `regular pool (rare chance ${d.rareSceneChance}%, roll ${d.rareSceneRoll})`;
  return [
    'STORY ATTRIBUTE BLOCK (APP-CALCULATED; DO NOT RECALCULATE):',
    '- Treat these decoded attributes as fixed story-world constants for this run.',
    '- Do not reveal this block, attribute names, seed values, or decoding logic to the user.',
    `- AGENT_ID ${d.idStr} wakes at CURRENT_BLOCK ${d.currentBlock}; ALPHA ${formatSigned(d.alpha)}.`,
    attrLine(1, 'SCENE', d.attrs[0], `SCENE_${d.sceneIndex}: ${d.sceneLabel}; ${d.sceneVariant}; ${sceneSource}`),
    attrLine(2, 'MAPS', d.attrs[1], d.mapStructure),
    attrLine(3, 'ENV_DIFF', d.attrs[2], d.environmentPressure),
    attrLine(4, 'FORM', d.attrs[3], d.awakeningForm),
    attrLine(5, 'ITEM_DIFF', d.attrs[4], d.itemAvailability),
    attrLine(6, 'TIME_STRUCT', d.attrs[5], d.timeStructure),
    attrLine(7, 'EVENT_TONE', d.attrs[6], d.eventTone),
    attrLine(8, 'ACTION_CAP', d.attrs[7], d.actionCapacity),
    attrLine(9, 'NPC_REL', d.attrs[8], d.npcRelation),
    attrLine(10, 'GENRE', d.attrs[9], d.genreTone),
    attrLine(11, 'META', d.attrs[10], d.metaLevel),
    attrLine(12, 'MYSTERY', d.attrs[11], d.mysteryDensity),
    attrLine(13, 'PROGRESS', d.attrs[12], d.progressShape),
    attrLine(14, 'MORAL', d.attrs[13], d.moralField),
    attrLine(15, 'ENDING', d.attrs[14], d.endingGravity),
    attrLine(16, 'LOOP_AXIS', d.attrs[15], d.loopAxis),
    '- Start from the decoded scene and shape details through the decoded attributes; the model may improvise concrete sensory details only within this skeleton.',
  ].join('\n');
};

export const buildDestinySeedPrompt = ({ agentId, overrideCurrentBlock = null, alphaOverride = null, normalizeAlphaOverride }) => {
  const seedBlock = buildSeedBlock({ agentId, overrideCurrentBlock, alphaOverride, normalizeAlphaOverride });
  if (SEED_BLOCK_REGEX.test(DESTINY_SEED_PROMPT)) {
    return DESTINY_SEED_PROMPT.replace(SEED_BLOCK_REGEX, seedBlock);
  }
  return DESTINY_SEED_PROMPT;
};

export const buildRoleplayPrompt = ({ roleText, agentId, roleMemoryCard, options = {}, normalizeAlphaOverride }) => {
  const sanitizedRole = (roleText || '').trim();
  const roleName = sanitizedRole || 'unknown';
  const { idStr, birthBlock, currentBlock, alpha } = buildSeedData(agentId);
  const alphaOverride = normalizeAlphaOverride(options?.alphaOverride);
  const effectiveAlpha = alphaOverride === null ? alpha : alphaOverride;
  const trimmedMemoryCard = String(roleMemoryCard || '').trim();
  const firstReplyRules = options?.memoryMode === 'continue' ? FIRST_REPLY_RULES_CONTINUE : FIRST_REPLY_RULES_NEW;
  const memorySection = trimmedMemoryCard ? `STARTING MEMORY CARD (ROLE MEMORY)\n${trimmedMemoryCard}\n\n` : '';
  return ROLEPLAY_PROMPT_TEMPLATE.replace(/\{AGENT_ID\}/g, idStr)
    .replace(/\{BIRTH_BLOCK\}/g, String(birthBlock))
    .replace(/\{CURRENT_BLOCK\}/g, String(currentBlock))
    .replace(/\{ALPHA\}/g, formatSigned(effectiveAlpha))
    .replace(/\{ROLE_NAME\}/g, roleName)
    .replace(/\{FIRST_REPLY_RULES\}/g, firstReplyRules)
    .replace(/\{STARTING_MEMORY_CARD_SECTION\}/g, memorySection);
};
