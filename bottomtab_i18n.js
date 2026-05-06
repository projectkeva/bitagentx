import AsyncStorage from '@react-native-community/async-storage';
import RNFS from 'react-native-fs';

const LAST_ROLE_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_role_space.json`;
const LAST_STORY_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_story_space.json`;
const LAST_CHAT_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_chat_space.json`;

const SUPPORTED_LANGS = ['en', 'zh-cn', 'zh-tw', 'ja', 'ko', 'es', 'fr'];
const CACHE_TTL_MS = 1000;

let cachedLang = 'en';
let cachedAt = 0;
let pendingResolve = null;

export const normalizeBottomTabLang = lang => {
  const raw = String(lang || '').trim().toLowerCase();
  const aliased = raw === 'zh' || raw === 'zh-hans' ? 'zh-cn' : raw === 'zh-hant' ? 'zh-tw' : raw;
  if (SUPPORTED_LANGS.includes(aliased)) return aliased;
  const base = aliased.split('-')[0];
  return SUPPORTED_LANGS.includes(base) ? base : 'en';
};

export const getRoleLangStorageKey = agentId => `role_lang_code_${encodeURIComponent(String(agentId || 'default'))}`;

const readLastSpaceRecord = async path => {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return null;
    return JSON.parse(await RNFS.readFile(path, 'utf8'));
  } catch (_) {
    return null;
  }
};

export const BOTTOM_TAB_MESSAGES = {
  en: {
    home: 'Home',
    getId: 'Satoshi',
    agents: 'Agents',
    explore: 'Explore',
    settings: 'Settings',
  },
  'zh-cn': {
    home: '首页',
    getId: '中本聪',
    agents: '智能体',
    explore: '探索',
    settings: '设置',
  },
  'zh-tw': {
    home: '首頁',
    getId: '中本聰',
    agents: '智能體',
    explore: '探索',
    settings: '設定',
  },
  ja: {
    home: 'ホーム',
    getId: 'サトシ',
    agents: 'エージェント',
    explore: '探索',
    settings: '設定',
  },
  ko: {
    home: '홈',
    getId: '사토시',
    agents: '에이전트',
    explore: '탐색',
    settings: '설정',
  },
  es: {
    home: 'Inicio',
    getId: 'Satoshi',
    agents: 'Agentes',
    explore: 'Explorar',
    settings: 'Ajustes',
  },
  fr: {
    home: 'Accueil',
    getId: 'Satoshi',
    agents: 'Agents',
    explore: 'Explorer',
    settings: 'Réglages',
  },
};

export const BOTTOM_TAB_ROUTE_KEYS = {
  Home: 'home',
  Satoshi: 'getId',
  Namespaces: 'agents',
  Explore: 'explore',
  Settings: 'settings',
};

export const getCachedBottomTabLang = () => cachedLang;

export const getBottomTabText = (routeName, lang) => {
  const key = BOTTOM_TAB_ROUTE_KEYS[routeName];
  const normalized = normalizeBottomTabLang(lang || cachedLang);
  const messages = BOTTOM_TAB_MESSAGES[normalized] || BOTTOM_TAB_MESSAGES.en;
  return (key && messages[key]) || (key && BOTTOM_TAB_MESSAGES.en[key]) || routeName;
};

export const resolveBottomTabLanguage = async (force = false) => {
  const now = Date.now();
  if (!force && now - cachedAt < CACHE_TTL_MS) return cachedLang;
  if (pendingResolve) return pendingResolve;

  pendingResolve = (async () => {
    try {
      const records = await Promise.all([
        readLastSpaceRecord(LAST_ROLE_SPACE_PATH),
        readLastSpaceRecord(LAST_CHAT_SPACE_PATH),
        readLastSpaceRecord(LAST_STORY_SPACE_PATH),
      ]);
      const candidates = records
        .filter(Boolean)
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .flatMap(record => [record.agentId, record.shortCode, record.namespaceId, record.peerShortCode, record.peerNamespaceId])
        .filter(Boolean);
      candidates.push('default');

      const seen = new Set();
      for (const candidate of candidates) {
        const key = String(candidate || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const stored = await AsyncStorage.getItem(getRoleLangStorageKey(key));
        if (stored) {
          cachedLang = normalizeBottomTabLang(stored);
          cachedAt = Date.now();
          return cachedLang;
        }
      }
    } catch (_) {}

    cachedLang = 'en';
    cachedAt = Date.now();
    return cachedLang;
  })();

  try {
    return await pendingResolve;
  } finally {
    pendingResolve = null;
  }
};
