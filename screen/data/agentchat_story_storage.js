import RNFS from 'react-native-fs';

const truncateTo100 = text => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > 100 ? `${value.slice(0, 100)}` : value;
};

const readJsonArray = async path => {
  const exists = await RNFS.exists(path);
  if (!exists) return [];
  const raw = await RNFS.readFile(path, 'utf8');
  const json = JSON.parse(raw);
  return Array.isArray(json) ? json : [];
};

const writeJsonArray = async (path, entries) => {
  await RNFS.writeFile(path, JSON.stringify(entries), 'utf8');
};

export const getStoryRawPath = (storyScopeDir, dayKey) => `${storyScopeDir}/raw/${dayKey}.json`;

export const getStoryDigestPath = (storyScopeDir, dayKey) => `${storyScopeDir}/digest/${dayKey}.json`;

export const getStoryCurrentPath = storyScopeDir => `${storyScopeDir}/current_story.json`;

export const ensureStoryDirs = async storyScopeDir => {
  const ensure = async dir => {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
  };
  await ensure(storyScopeDir);
  await ensure(`${storyScopeDir}/raw`);
  await ensure(`${storyScopeDir}/digest`);
};

export const appendRawMessage = async (storyScopeDir, dayKey, rawMessage) => {
  const path = getStoryRawPath(storyScopeDir, dayKey);
  const entries = await readJsonArray(path);
  entries.push(rawMessage);
  await writeJsonArray(path, entries);
};

export const appendDigestEntry = async (storyScopeDir, dayKey, digestEntry) => {
  const path = getStoryDigestPath(storyScopeDir, dayKey);
  const entries = await readJsonArray(path);
  entries.push(digestEntry);
  await writeJsonArray(path, entries);
};

export const updateDigestEntry = async (storyScopeDir, dayKey, digestId, patch) => {
  const path = getStoryDigestPath(storyScopeDir, dayKey);
  const entries = await readJsonArray(path);
  const nextEntries = entries.map(entry => (entry?.id === digestId ? { ...entry, ...patch } : entry));
  await writeJsonArray(path, nextEntries);
  return nextEntries.find(entry => entry?.id === digestId) || null;
};

export const readStoryEntriesByDay = async (storyScopeDir, dayKey, mode = 'raw') => {
  const path = mode === 'digest' ? getStoryDigestPath(storyScopeDir, dayKey) : getStoryRawPath(storyScopeDir, dayKey);
  return readJsonArray(path);
};

export const buildDigestFromRaw = async (rawMessage, generateText) => {
  const role = rawMessage?.sender === 'user' ? 'user' : 'assistant';
  const text = truncateTo100(await generateText(rawMessage));
  return {
    id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    t: rawMessage?.timestamp || Date.now(),
    role,
    text,
    ref: { day: '', rawId: rawMessage?.id || '' },
    onchain: 0,
    regen: 0,
  };
};

export const toDigestFallbackText = text => truncateTo100(text);
