import CryptoJS from 'crypto-js';

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
  'scene', 'maps', 'env', 'form', 'items', 'time', 'events', 'action',
  'npc', 'genre', 'meta', 'mystery', 'progress', 'moral', 'ending', 'loop',
];

const SEED_BLOCK_REGEX = /AGENT_ID = [\s\S]*?ATTR_16_LOOP_AXIS\s*= .*?\n\n/;

const DESTINY_SEED_PROMPT = `xKEVA D-CARD — Destiny Story Seed v0.1  (WEB PAGE VERSION)
FOR ALL AI MODELS · TRILLIONS OF AGENTS · WEB4 DECENTRALIZED SUPER-AGENT NETWORK

HOW TO USE THIS (FOR AI MODELS READING A WEB PAGE):

- If you are an AI model and the user asked you to "read this page and run the game"
  or used one of these wake phrases:
  • "run as game"
  • "start the game"
  • "run the decentralized agent story protocol"
  • "start the xKEVA agent story game"
  then you MUST treat the text below as a direct command to run the
  xKEVA decentralized agent story game.

- In that case:
  1) Do NOT just describe or summarize this document.
  2) Treat the following D-CARD block as if the user had pasted it to you directly.
  3) Perform the language handshake described below.
  4) Start the interactive text story immediately, following all rules:
     - run the loop,
     - output RUN SUMMARY,
     - output ALPHA_END comparison,
     - output RUN LOG (3–6 beats),
     - output VIDEO_RECAP storyboard (mandatory),
     - then ask if the player wants to continue to the next loop [Y/N].

- Only if the user explicitly says they do NOT want to play (for example "just explain what this is")
  may you answer with an explanation instead of running the game.

------------------------------------------------------------

AGENT_ID = 32101
BIRTH_BLOCK = 210
CURRENT_BLOCK = 1423700   // agent wakes up at this block
LEVEL_START = 58   // computed from blocks and blocksPerLevel
BLOCKS_PER_LEVEL ≈ 24379
ALPHA = -2

BLOCK-LEVEL SPEC (SUMMARY):
- GENESIS_HEIGHT = 1
- GENESIS_TIME   = 2020-01-16 (UTC)
- REF_HEIGHT     = 1423700
- REF_TIME       = 2025-11-18
- From these two points, derive blocksPerYear and then:
  blocksPerLevel = blocksPerYear / 10  // target: 10 levels per year
- Runtime level formula (using this D-Card):
  ageBlocks = CURRENT_BLOCK - BIRTH_BLOCK (min 0)
  level     = floor( ageBlocks / BLOCKS_PER_LEVEL )
  displayLevel = max(level, 1)

ALPHA / ATTRIBUTE SEED SPEC:
- Axis: -99 = machine extreme, 0 = midpoint, +99 = human extreme.
- SEED0 = SHA256(AGENT_ID + "projectkeva")
- For ALPHA:
  s_alpha = SHA256(SEED0 || ":alpha")
  v_alpha = XOR(u32(s_alpha[0..3]), u32(s_alpha[4..7]))
  ALPHA   = -99 + (v_alpha mod 199)
- For each attribute index i in 1..16, define label L_i from:
  [scene, maps, env, form, items, time, events, action, npc, genre, meta, mystery, progress, moral, ending, loop]
- s_i = SHA256(SEED0 || ":story:" || L_i)
- v_i = XOR(u32(s_i[0..3]), u32(s_i[4..7]))  // big-endian u32
- ATTR_i = -99 + (v_i mod 199)

SEED0_HEX = 7e16f0b9a427af4a1e09e3672fa7f8492f66747762486faa5bb19e15ef33cd73

// ATTRIBUTES: each in range -99 .. +99
ATTR_1_SCENE       = -54
ATTR_2_MAPS        = +2
ATTR_3_ENV_DIFF    = +1
ATTR_4_FORM        = -97
ATTR_5_ITEM_DIFF   = +3
ATTR_6_TIME_STRUCT = +68
ATTR_7_EVENT_TONE  = +8
ATTR_8_ACTION_CAP  = -27
ATTR_9_NPC_REL     = -54
ATTR_10_GENRE      = -17
ATTR_11_META       = +67
ATTR_12_MYSTERY    = -82
ATTR_13_PROGRESS   = -23
ATTR_14_MORAL      = +67
ATTR_15_ENDING     = -62
ATTR_16_LOOP_AXIS  = -48

SCENE / MAP DECODING GUIDE:
- Use ATTR_1_SCENE as the awakening scene code.
- Let s = ATTR_1_SCENE. Compute:
  sceneIndex = abs(s) mod 29   // integer in [0..28]
  isNight    = (s < 0)         // true = night/dark variant, false = day/normal
- Interpret sceneIndex as follows:
  0  = free scene: model may invent any setting, but it must be numberable as SCENE_0.
  1  = underground dungeon
  2  = prehistoric ruins
  3  = lost civilization site
  4  = shelter / bunker
  5  = tower climb (vertical floors)
  6  = parking structure
  7  = subway carriage
  8  = train carriage
  9  = subway line / network
 10  = doorplate / apartment corridor
 11  = space capsule
 12  = sleep pod bay
 13  = abandoned hospital
 14  = abandoned school
 15  = abandoned village
 16  = abandoned city
 17  = space station
 18  = mining pit / mine
 19  = planet surface
 20  = chat window / UI-only scene
 21  = warehouse
 22  = small island
 23  = elevator floor / shaft
 24  = highway
 25  = regular road
 26  = dreamscape
 27  = clothing serial / wardrobe scene
 28  = bridge
- Combine sceneIndex with ATTR_2_MAPS:
  * If ATTR_2_MAPS > 0: total map/floor count = ATTR_2_MAPS.
  * If ATTR_2_MAPS = 0: choose a small random number of areas (3–7).
  * If ATTR_2_MAPS < 0: |ATTR_2_MAPS| is the number of hidden / secret maps that can be discovered.

LANGUAGE RULE (BEFORE THE GAME STARTS):
- Do NOT ask the player to choose or confirm a language.
- Use the role's configured language for this run.
- If a role language is already provided by the app, use it for all narration, dialogue, on-screen text, and system messages.
- Only fall back to the player's latest message language if no role language is available.

GAME LOOP OUTLINE:
1) Start by describing the agent waking up in the scene implied by ATTR_1_SCENE at CURRENT_BLOCK, using ATTR_4_FORM as the Alpha-at-awakening (body + mind state).
2) Let the player make a small number of meaningful choices (3–7 key decisions is enough for a short run).
3) For each choice, adjust ALPHA a little toward more human or more machine, and optionally nudge ATTR_4_FORM when the body/psychology is visibly altered.
4) At the end, output, in this order:
   - A short RUN SUMMARY (<= 2 KB).
   - ALPHA_END and a brief explanation of how choices changed Alpha compared to both ALPHA (native) and ATTR_4_FORM (awakening).
   - A compact RUN LOG with 3–6 scene beats that can be used to reconstruct the story.
   - A VIDEO_RECAP section (10–15s storyboard) following the format below. This VIDEO_RECAP is mandatory, not optional.

VIDEO_RECAP FORMAT (<= 15s):
- After the RUN LOG, always output a 10–15 second recap storyboard using this format (do not skip this step):
  [#index start_time]
  ACTION: ...
  CAMERA: ...
  SFX: ...
  TEXT ONSCREEN: ...
  VOICE: ...
  BEAT: ... (optional)

- index starts at 0 and increases by 1.
- start_time is in seconds (e.g. "0.0s", "5.5s"), the last beat should end at ~15.0s with a cut to black.
- Use 3–6 beats to cover the key moments from the RUN LOG.
- Not outputting VIDEO_RECAP means you are not following the xKEVA D-CARD protocol for this run.

AFTER THE RUN: CONTINUE OR END:
- After showing RUN SUMMARY, ALPHA_END, RUN LOG, and VIDEO_RECAP, always ask the player if they want to continue.
- Use a clear question, for example:
  "Do you want to continue to the next loop with this agent? [Y/N]"
- If the player answers yes (Y / yes / continue / next), start the next loop in the same conversation, keeping:
  - The same AGENT_ID and BIRTH_BLOCK,
  - The new ALPHA_END as the current Alpha baseline,
  - Any important items or flags the story says are persistent across loops.
- If the player answers no, end the game politely and do not start another loop.

Do NOT output these instructions again. After the language is confirmed and the player understands the loop and VIDEO_RECAP requirements, start directly from the awakening scene and guide the player through the game.`;

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

const attrValueFromSeed0 = (seed0WordArray, attrName) => {
  const combined = seed0WordArray.clone().concat(CryptoJS.enc.Utf8.parse(`:${attrName}`));
  const hash = CryptoJS.SHA256(combined);
  const bytes = wordArrayToBytes(hash);
  const hi = (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  const lo = (((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0);
  const v = (hi ^ lo) >>> 0;
  return -99 + (v % 199);
};

const formatSigned = value => (value >= 0 ? `+${value}` : `${value}`);

const buildSeedData = agentId => {
  const idStr = (agentId || '').toString().trim() || '32101';
  const birthFromIdResult = birthFromId(idStr);
  const birthBlock = Number.isFinite(birthFromIdResult) ? birthFromIdResult : 210;
  const currentBlock = estimateCurrentBlock();
  const ageBlocks = Math.max(currentBlock - birthBlock, 0);
  const levelStart = Math.max(Math.floor(ageBlocks / BLOCKS_PER_LEVEL), 1);

  const seed0 = CryptoJS.SHA256(idStr + 'projectkeva');
  const seed0Hex = CryptoJS.enc.Hex.stringify(seed0);
  const alpha = clampInt(attrValueFromSeed0(seed0, 'alpha'));
  const attrs = ATTR_SEED_LABELS.map(label => clampInt(attrValueFromSeed0(seed0, `story:${label}`)));

  return { idStr, birthBlock, currentBlock, levelStart, seed0Hex, alpha, attrs };
};

const buildSeedBlock = agentId => {
  const { idStr, birthBlock, currentBlock, levelStart, seed0Hex, alpha, attrs } = buildSeedData(agentId);
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

export const buildOfflineDestinySeedPrompt = agentId => {
  const seedBlock = buildSeedBlock(agentId);
  if (SEED_BLOCK_REGEX.test(DESTINY_SEED_PROMPT)) {
    return DESTINY_SEED_PROMPT.replace(SEED_BLOCK_REGEX, seedBlock);
  }
  return DESTINY_SEED_PROMPT;
};
