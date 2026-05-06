import RNFS from 'react-native-fs';

const createHash = require('create-hash');

const clampAlpha = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 99) return 99;
  if (n < -99) return -99;
  return Math.round(n);
};

const normalizeText = value => String(value || '').trim();

export const ALPHA_ALGORITHM_VERSION = 'xkeva-alpha-shortcode-v1';
export const ALPHA_PROTOCOL_SALT = 'projectkeva';

export const normalizeAlphaAgentId = value => {
  if (value === null || typeof value === 'undefined') {
    return '32101';
  }
  const normalized = String(value).replace(/\s+/g, '').trim();
  return normalized || '32101';
};

const sha256Bytes = message => Buffer.from(createHash('sha256').update(String(message)).digest());

const u32FromBytes = (bytes, offset) =>
  (((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);

const attrSeedBytes = (id, attrName) => {
  const seed0 = sha256Bytes(`${normalizeAlphaAgentId(id)}${ALPHA_PROTOCOL_SALT}`);
  const attrBytes = Buffer.from(`:${attrName}`);
  return Buffer.from(createHash('sha256').update(Buffer.concat([seed0, attrBytes])).digest());
};

const attrIntInRange = (seedBytes, min, max) => {
  const hi = u32FromBytes(seedBytes, 0);
  const lo = u32FromBytes(seedBytes, 4);
  const v = (hi ^ lo) >>> 0;
  const span = max - min + 1;
  return min + (v % span);
};

export const computeAlphaFromAgentId = agentId => {
  const id = normalizeAlphaAgentId(agentId);
  return clampAlpha(attrIntInRange(attrSeedBytes(id, 'alpha'), -99, 99));
};

const clampDelta = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 198) return 198;
  if (n < -198) return -198;
  return Math.round(n);
};

export const ALPHA_PROMPT_POLICY = `ALPHA STYLE RULES
- Respect the sign of Alpha: positive Alpha leans more human, negative Alpha leans more machine.
- Scale the strength of that tendency with the magnitude |Alpha|.
- Let Alpha influence expression style only: tone, emotional density, subjectivity, logic texture, and reaction texture.
- Do not explain Alpha, expose Alpha mechanics, or let Alpha overwrite established facts, memory, or world truth.`;

export const getAlphaStatePath = storyScopeDir => `${storyScopeDir}/alpha.json`;
export const getAlphaLogDir = storyScopeDir => `${storyScopeDir}/alpha_log`;
export const getCurrentAlphaLogPath = storyScopeDir => `${getAlphaLogDir(storyScopeDir)}/current_run.json`;

const ensureDir = async dir => {
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
};

let alphaPersistQueue = Promise.resolve();

const writeJsonFileSafely = async (path, value) => {
  const tempPath = `${path}.tmp`;
  const payload = JSON.stringify(value);
  await RNFS.unlink(tempPath).catch(() => {});
  await RNFS.writeFile(tempPath, payload, 'utf8');
  const exists = await RNFS.exists(path);
  if (exists) {
    await RNFS.unlink(path).catch(() => {});
  }
  await RNFS.moveFile(tempPath, path);
};

export const ensureAlphaDirs = async storyScopeDir => {
  await ensureDir(storyScopeDir);
  await ensureDir(getAlphaLogDir(storyScopeDir));
};

export const readStoryJsonFile = async path => {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return null;
    const raw = await RNFS.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to read story alpha json', path, error);
    return null;
  }
};

export const writeStoryJsonFile = async (path, value) => {
  try {
    await writeJsonFileSafely(path, value);
    return true;
  } catch (error) {
    console.warn('Failed to write story alpha json', path, error);
    return false;
  }
};

export const writeAlphaStateFile = async (path, value) => {
  alphaPersistQueue = alphaPersistQueue
    .catch(() => {})
    .then(async () => {
      const dir = path.slice(0, path.lastIndexOf('/'));
      if (dir) {
        await ensureDir(dir);
      }
      await writeJsonFileSafely(path, value);
      return true;
    });

  try {
    return await alphaPersistQueue;
  } catch (error) {
    console.warn('Failed to write alpha state json', path, error);
    return false;
  }
};

export const ensureAlphaState = async ({ storyScopeDir, agentId, roleSlug, roleName }) => {
  await ensureAlphaDirs(storyScopeDir);
  const path = getAlphaStatePath(storyScopeDir);
  const alphaAgentId = normalizeAlphaAgentId(agentId);
  const deterministicBaseAlpha = computeAlphaFromAgentId(alphaAgentId);
  const existing = await readStoryJsonFile(path);

  if (existing && Number.isFinite(Number(existing?.currentAlpha))) {
    const existingCurrentAlpha = clampAlpha(existing.currentAlpha);
    const existingBaseAlpha = Number.isFinite(Number(existing?.baseAlpha))
      ? clampAlpha(existing.baseAlpha)
      : existingCurrentAlpha;
    const existingAgentId = normalizeText(existing.alphaAgentId || existing.agentId || '');
    const existingAlgorithm = normalizeText(existing.algorithmVersion);
    const needsMigration = existingAlgorithm !== ALPHA_ALGORITHM_VERSION || (existingAgentId && existingAgentId !== alphaAgentId);

    let baseAlpha = existingBaseAlpha;
    let currentAlpha = existingCurrentAlpha;
    let migratedAlphaFrom = existing.migratedAlphaFrom;

    if (needsMigration) {
      const preservedDelta = clampDelta(existingCurrentAlpha - existingBaseAlpha);
      baseAlpha = deterministicBaseAlpha;
      currentAlpha = clampAlpha(deterministicBaseAlpha + preservedDelta);
      migratedAlphaFrom = {
        algorithmVersion: existingAlgorithm || 'legacy',
        alphaAgentId: existingAgentId || '',
        baseAlpha: existingBaseAlpha,
        currentAlpha: existingCurrentAlpha,
        preservedDelta,
        migratedAt: Date.now(),
      };
    }

    const normalized = {
      ...existing,
      agentId: alphaAgentId,
      alphaAgentId,
      roleSlug: normalizeText(roleSlug || existing.roleSlug),
      roleName: normalizeText(roleName || existing.roleName),
      baseAlpha,
      currentAlpha,
      computedBaseAlpha: deterministicBaseAlpha,
      updatedAt: needsMigration ? Date.now() : Number.isFinite(Number(existing.updatedAt)) ? Number(existing.updatedAt) : Date.now(),
      algorithmVersion: ALPHA_ALGORITHM_VERSION,
      seedAlgorithm: 'seed0=SHA256(id+projectkeva bytes); alpha=SHA256(seed0 bytes || :alpha); -99+(xor32%199)',
      alphaSource: 'agent-id-shortcode',
      migratedAlphaFrom,
    };

    if (needsMigration) {
      await writeAlphaStateFile(path, normalized);
    }
    return normalized;
  }

  const next = {
    agentId: alphaAgentId,
    alphaAgentId,
    roleSlug: normalizeText(roleSlug),
    roleName: normalizeText(roleName),
    baseAlpha: deterministicBaseAlpha,
    currentAlpha: deterministicBaseAlpha,
    computedBaseAlpha: deterministicBaseAlpha,
    updatedAt: Date.now(),
    algorithmVersion: ALPHA_ALGORITHM_VERSION,
    seedAlgorithm: 'seed0=SHA256(id+projectkeva bytes); alpha=SHA256(seed0 bytes || :alpha); -99+(xor32%199)',
    alphaSource: 'agent-id-shortcode',
  };
  await writeAlphaStateFile(path, next);
  return next;
};

export const readCurrentAlphaLog = async (storyScopeDir, fallbackStoryId) => {
  const current = await readStoryJsonFile(getCurrentAlphaLogPath(storyScopeDir));
  if (!current || typeof current !== 'object') {
    return { storyId: normalizeText(fallbackStoryId), entries: [] };
  }
  return {
    storyId: normalizeText(current.storyId || fallbackStoryId),
    entries: Array.isArray(current.entries) ? current.entries : [],
  };
};

export const appendAlphaLogEntry = async (storyScopeDir, entry, fallbackStoryId) => {
  await ensureAlphaDirs(storyScopeDir);
  const path = getCurrentAlphaLogPath(storyScopeDir);
  const current = await readCurrentAlphaLog(storyScopeDir, fallbackStoryId);
  const next = {
    storyId: normalizeText(current.storyId || fallbackStoryId),
    entries: [...current.entries, entry],
  };
  await writeStoryJsonFile(path, next);
  return next;
};

export const clearCurrentAlphaLog = async storyScopeDir => {
  const path = getCurrentAlphaLogPath(storyScopeDir);
  try {
    const exists = await RNFS.exists(path);
    if (exists) {
      await RNFS.unlink(path);
    }
  } catch (error) {
    console.warn('Failed to clear current alpha log', error);
  }
};

export const buildAlphaPromptBlock = alphaValue => {
  const alpha = clampAlpha(alphaValue);
  const absAlpha = Math.abs(alpha);
  let tendency = 'balanced midpoint';
  let expression = 'Keep machine and human tendencies balanced, with neither side dominating.';

  if (alpha <= -60) {
    tendency = 'strongly machine-leaning';
    expression = 'Lean calculation-first, highly structured, logically rigid, emotionally quiet, and predictably efficient.';
  } else if (alpha < -20) {
    tendency = 'mildly machine-leaning';
    expression = 'Lean analytical, controlled, concise, and relatively low in emotional noise.';
  } else if (alpha >= 60) {
    tendency = 'strongly human-leaning';
    expression = 'Lean emotional, narrative-driven, subjective, context-rich, and vividly human in tone.';
  } else if (alpha > 20) {
    tendency = 'mildly human-leaning';
    expression = 'Lean warmer, more empathetic, more intuitive, and richer in emotional/contextual texture.';
  }

  return `CURRENT_ALPHA = ${alpha}
${ALPHA_PROMPT_POLICY}
ALPHA_EXPRESSION_GUIDE:
- Current tendency: ${tendency}
- Strength scale from |Alpha|: ${absAlpha}
- Current expression rule: ${expression}`;
};

const HUMAN_KEYWORDS = [
  'feel', 'comfort', 'understand', 'hesitate', 'remember', 'memory', 'companion', 'trust', 'embrace', 'observe', 'listen', 'help', 'soothe', 'communicate', 'empathy',
  '\u611f\u53d7', '\u5b89\u6170', '\u7406\u89e3', '\u72b9\u8c6b', '\u56de\u5fc6', '\u966a\u4f34', '\u4fe1\u4efb', '\u62e5\u62b1', '\u89c2\u5bdf', '\u503e\u542c', '\u5e2e\u52a9', '\u5b89\u629a', '\u6c9f\u901a', '\u5171\u60c5',
];
const MACHINE_KEYWORDS = [
  'calculate', 'scan', 'optimal', 'execute', 'protocol', 'efficiency', 'parse', 'simulate', 'direct action', 'logic', 'analyze', 'search', 'lock on',
  '\u8ba1\u7b97', '\u626b\u63cf', '\u6700\u4f18', '\u6267\u884c', '\u534f\u8bae', '\u6548\u7387', '\u89e3\u6790', '\u63a8\u6f14', '\u76f4\u63a5\u884c\u52a8', '\u903b\u8f91', '\u5206\u6790', '\u68c0\u7d22', '\u9501\u5b9a',
];

export const analyzeAlphaDelta = ({ choiceText, choiceSend, recentStoryText, currentAlpha }) => {
  const haystack = [choiceText, choiceSend, recentStoryText].map(normalizeText).join(' | ').toLowerCase();
  let score = 0;
  HUMAN_KEYWORDS.forEach(keyword => {
    if (haystack.includes(keyword.toLowerCase())) score += 1;
  });
  MACHINE_KEYWORDS.forEach(keyword => {
    if (haystack.includes(keyword.toLowerCase())) score -= 1;
  });

  if (score === 0) {
    if (/^\s*1\b/.test(normalizeText(choiceSend))) score += 1;
    if (/^\s*2\b/.test(normalizeText(choiceSend))) score -= 1;
  }

  let delta = 0;
  if (score >= 2) delta = 2;
  else if (score === 1) delta = 1;
  else if (score <= -2) delta = -2;
  else if (score === -1) delta = -1;

  const alphaBefore = clampAlpha(currentAlpha);
  const alphaAfter = clampAlpha(alphaBefore + delta);
  const reason = delta > 0 ? 'human-leaning expression / empathy / perception' : delta < 0 ? 'machine-leaning expression / execution / analysis' : 'neutral behavioral signal; alpha unchanged';

  return {
    delta,
    alphaBefore,
    alphaAfter,
    reason,
  };
};
