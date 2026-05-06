// HomeScreen.js (clean, no debug toolbar)
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StatusBar, Alert, TouchableOpacity } from 'react-native';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-community/async-storage';
import { WebView } from 'react-native-webview';
import { useNavigation } from 'react-navigation-hooks';
import { useDispatch, useSelector } from 'react-redux';
import BlueElectrum from './BlueElectrum';
import BlueApp from './BlueApp';
import { AppStorage, HDSegwitP2SHWallet } from './class';
import { requestServerNamespace, getServerBlockHeight } from './class/namespace-api';
import { setNamespaceList } from './actions';
import { findMyNamespaces } from './class/keva-ops';
import { fetchDoppelOnChainMemory } from './screen/data/agentrole_doppel_memory';
const createHash = require('create-hash');

const ELECTRUM_INIT_FLAG = 'ELECTRUM_INIT_DONE_V1';
const SATOSHI_STATUS_KEY = 'satoshi_agent_status_v1';
const SATOSHI_STATUS_MESSAGE_KEY = 'satoshi_agent_status_message_v1';
const SATOSHI_WALLET_LABEL = 'SATOSHI';
const SATOSHI_DOPPEL_MEMORY_ID = '715331578';
const SATOSHI_MEMORY_RESTORE_KEY = 'satoshi_memory_restore_v1';
const SATOSHI_MEMORY_RESTORE_STATUS_KEY = 'satoshi_memory_restore_status_v1';

const OFFICIAL_NODES = [
  { id: 'n0', host: 'x.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n1', host: 'y.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n2', host: 'z.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n3', host: 'ec.kevacoin.org', ssl: '50002', tcp: '' },
];

const PROBE_COOLDOWN_MS = 2 * 60 * 1000;

// in-memory cache (good enough for "close window then reopen"; persists while app stays alive)
let lastProbeCache = {
  ts: 0,
  resultById: {},
};

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const nowMs = () => Date.now();
const LAST_ROLE_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_role_space.json`;
const LAST_STORY_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_story_space.json`;
const LAST_CHAT_SPACE_PATH = `${RNFS.DocumentDirectoryPath}/agent_chats/_last_chat_space.json`;
const readLastSpaceRecord = async path => { try { const exists = await RNFS.exists(path); if (!exists) return null; return JSON.parse(await RNFS.readFile(path, 'utf8')); } catch (_) { return null; } };
const HOME_SUPPORTED_LANGS = ['en', 'zh-cn', 'zh-tw', 'ja', 'ko', 'es', 'fr'];
const normalizeHomeLang = lang => {
  const raw = String(lang || '').trim().toLowerCase();
  const aliased = raw === 'zh' || raw === 'zh-hans' ? 'zh-cn' : raw === 'zh-hant' ? 'zh-tw' : raw;
  if (HOME_SUPPORTED_LANGS.includes(aliased)) return aliased;
  const base = aliased.split('-')[0];
  return HOME_SUPPORTED_LANGS.includes(base) ? base : 'en';
};
const getRoleLangStorageKey = agentId => `role_lang_code_${encodeURIComponent(String(agentId || 'default'))}`;
const getHomeRoleLanguageCandidates = async () => {
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
  return [...new Set(candidates.map(item => String(item || '').trim()).filter(Boolean))];
};
const resolveHomeRoleLanguage = async () => {
  try {
    const candidates = await getHomeRoleLanguageCandidates();
    for (const candidate of candidates) {
      const stored = await AsyncStorage.getItem(getRoleLangStorageKey(candidate));
      if (stored) return normalizeHomeLang(stored);
    }
  } catch (_) {}
  return 'en';
};
const persistHomeRoleLanguage = async lang => {
  const normalized = normalizeHomeLang(lang);
  try {
    const candidates = await getHomeRoleLanguageCandidates();
    await Promise.all(candidates.map(candidate => AsyncStorage.setItem(getRoleLangStorageKey(candidate), normalized)));
  } catch (_) {
    await AsyncStorage.setItem(getRoleLangStorageKey('default'), normalized);
  }
  return normalized;
};
const HOME_ALERTS = {
  en: { noRole: 'No recent role record yet.', noStory: 'No recent story record yet.', noChat: 'No recent chat record yet.' },
  'zh-cn': { noRole: '还没有最近使用的 role 记录', noStory: '还没有最近使用的 story 记录', noChat: '还没有最近使用的 chat 记录' },
  'zh-tw': { noRole: '還沒有最近使用的 role 記錄', noStory: '還沒有最近使用的 story 記錄', noChat: '還沒有最近使用的 chat 記錄' },
};
const getHomeAlertText = (lang, key) => (HOME_ALERTS[normalizeHomeLang(lang)] || HOME_ALERTS.en)[key] || HOME_ALERTS.en[key] || key;

const safeText = value => String(value || '');
const trimText = value => safeText(value).trim();
const getSatoshiAgentId = info => trimText(info?.shortCode || info?.namespaceId || info?.id || info?.agentId || 'default') || 'default';
const getSatoshiRolePaths = info => {
  const agentId = getSatoshiAgentId(info);
  const roleSlug = agentId;
  const chatDir = `${RNFS.DocumentDirectoryPath}/agent_chats/${encodeURIComponent(agentId)}/role`;
  const roleFilesDir = `${chatDir}/roles`;
  const roleDir = `${roleFilesDir}/${roleSlug}`;
  return {
    agentId,
    roleSlug,
    chatDir,
    roleFilesDir,
    roleDir,
    roleFile: `${roleDir}/role.json`,
    currentRolePath: `${chatDir}/current_role.json`,
    roleIndexPath: `${chatDir}/role_index.json`,
    verifiedPath: `${roleDir}/verified.md`,
    likelyPath: `${roleDir}/likely.md`,
    fogPath: `${roleDir}/fog.md`,
    initialVerifiedPath: `${roleDir}/initial_verified.md`,
    initialLikelyPath: `${roleDir}/initial_likely.md`,
    initialFogPath: `${roleDir}/initial_fog.md`,
  };
};
const getSatoshiRestoreKey = info => String(info?.namespaceId || info?.id || info?.shortCode || info?.displayName || 'SATOSHI');
const getSatoshiRestoreKeyCandidates = info => [info?.namespaceId, info?.id, info?.shortCode, info?.displayName, 'SATOSHI']
  .map(value => String(value || '').trim())
  .filter((value, index, list) => value && list.indexOf(value) === index);
const isSatoshiMemoryRestoredForInfo = (restoredKey, info) => getSatoshiRestoreKeyCandidates(info).includes(String(restoredKey || '').trim());
const getSatoshiShortIdNumber = item => {
  const raw = trimText(item?.shortCode || item?.shortId || item?.shortid || item?.namespaceId || item?.id);
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};
const findSatoshiNamespaceInfo = namespacesInput => {
  const namespaces = namespacesInput?.namespaces || namespacesInput || {};
  const list = Array.isArray(namespaces) ? namespaces : Object.values(namespaces);
  const satoshiList = list.filter(item => {
    if (!item) return false;
    return [item.displayName, item.name, item.title].some(value => String(value || '').trim().toUpperCase() === 'SATOSHI');
  });
  if (satoshiList.length <= 1) return satoshiList[0] || null;
  return satoshiList.slice().sort((a, b) => {
    const diff = getSatoshiShortIdNumber(a) - getSatoshiShortIdNumber(b);
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return trimText(a?.shortCode || a?.shortId || a?.shortid || a?.namespaceId || a?.id)
      .localeCompare(trimText(b?.shortCode || b?.shortId || b?.shortid || b?.namespaceId || b?.id));
  })[0] || null;
};
const getSatoshiRequiredMemoryPaths = paths => [
  paths.roleFile,
  paths.verifiedPath,
  paths.likelyPath,
  paths.fogPath,
  paths.initialVerifiedPath,
  paths.initialLikelyPath,
  paths.initialFogPath,
];
const writeTextReplacing = async (path, text) => {
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await RNFS.writeFile(tmp, safeText(text), 'utf8');
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
  await RNFS.moveFile(tmp, path);
};
const composeSatoshiMemoryCard = (roleName, layers = {}) => [
  `ROLE=${trimText(roleName) || 'SATOSHI'}`,
  '[VERIFIED]',
  trimText(layers.verified),
  '',
  '[LIKELY]',
  trimText(layers.likely),
  '',
  '[FOG]',
  trimText(layers.fog),
].join('\n').trim();
const hasSatoshiMemoryFiles = async info => {
  if (!info) return false;
  const paths = getSatoshiRolePaths(info);
  for (const path of getSatoshiRequiredMemoryPaths(paths)) {
    if (!(await RNFS.exists(path))) return false;
  }
  return true;
};
const hasSatoshiRoleChatRecords = async info => {
  if (!info) return false;
  const paths = getSatoshiRolePaths(info);
  try {
    if (!(await RNFS.exists(paths.chatDir))) return false;
    const entries = await RNFS.readDir(paths.chatDir);
    for (const entry of entries) {
      if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) continue;
      try {
        const messages = JSON.parse(await RNFS.readFile(entry.path, 'utf8'));
        if (Array.isArray(messages) && messages.some(message => String(message?.text || '').trim())) return true;
      } catch (_) {}
    }
  } catch (_) {}
  return false;
};
const getSatoshiDisplayId = info => trimText(info?.shortCode || info?.id || info?.namespaceId || info?.agentId || '');

const withSatoshiStepTimeout = (promise, label, timeoutMs = 5000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs)),
]);

const getSatoshiWalletAddressFast = async wallet => {
  if (!wallet) return '';
  const direct = trimText(
    (typeof wallet.getAddress === 'function' ? wallet.getAddress() : '')
      || wallet._address
      || wallet.address,
  );
  if (direct) return direct;

  if (typeof wallet._getExternalAddressByIndex === 'function') {
    const index = Number.isFinite(wallet.next_free_address_index) && wallet.next_free_address_index >= 0
      ? wallet.next_free_address_index
      : 0;
    const derived = trimText(wallet._getExternalAddressByIndex(index));
    if (derived) {
      wallet._address = derived;
      if (!wallet.external_addresses_cache) wallet.external_addresses_cache = {};
      wallet.external_addresses_cache[index] = derived;
      return derived;
    }
  }

  return trimText(await withSatoshiStepTimeout(
    Promise.resolve(wallet.getAddressAsync ? wallet.getAddressAsync() : ''),
    'getting_address',
  ));
};

const buildSatoshiNavigationParams = info => {
  if (!info) return null;
  const text = value => String(value === undefined || value === null ? '' : value).trim();
  const namespaceId = text(info.id || info.namespaceId);
  const shortCode = text(info.shortCode || info.shortId);
  return {
    ...(namespaceId ? { namespaceId } : {}),
    ...(shortCode ? { shortCode } : {}),
    displayName: text(info.displayName || info.name || 'SATOSHI') || 'SATOSHI',
    walletId: text(info.walletId),
    txid: text(info.txId || info.txid),
    rootAddress: text(info.rootAddress),
    price: text(info.price),
    desc: text(info.desc),
    addr: text(info.addr),
    suppressAutoLinkStart: true,
  };
};

const computeAlphaValue = id => {
  try {
    const seed0 = Buffer.from(createHash('sha256').update(`${id || ''}projectkeva`).digest());
    const attrBytes = Buffer.from(':alpha');
    const seedBytes = Buffer.from(createHash('sha256').update(Buffer.concat([seed0, attrBytes])).digest());
    const hi = seedBytes.readUInt32BE(0);
    const lo = seedBytes.readUInt32BE(4);
    return -99 + (((hi ^ lo) >>> 0) % 199);
  } catch (err) {
    console.warn(err);
    return null;
  }
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const namespaceList = useSelector(state => state.namespaceList);
  const dispatch = useDispatch();
  const webviewRef = useRef(null);
  const probeSeqRef = useRef(0);
  const satoshiRequestInFlightRef = useRef(false);
  const satoshiRestoreInFlightRef = useRef(false);
  const satoshiNetworkCheckInFlightRef = useRef(null);
  const satoshiLastInfoRef = useRef(null);
  const satoshiNetworkCacheRef = useRef({ ts: 0, result: null });

  const satoshiNamespaceInfo = useMemo(() => findSatoshiNamespaceInfo(namespaceList), [namespaceList]);

  const hasSatoshiNamespace = !!satoshiNamespaceInfo;

  useEffect(() => {
    if (satoshiNamespaceInfo) {
      satoshiLastInfoRef.current = satoshiNamespaceInfo;
    }
  }, [satoshiNamespaceInfo]);

  const satoshiAlphaValue = useMemo(() => {
    if (!satoshiNamespaceInfo) return null;
    const alphaId = satoshiNamespaceInfo.shortCode || satoshiNamespaceInfo.id || satoshiNamespaceInfo.namespaceId;
    return alphaId ? computeAlphaValue(String(alphaId)) : null;
  }, [satoshiNamespaceInfo]);

  const initElectrumOnce = useCallback(async () => {
    const inited = await AsyncStorage.getItem(ELECTRUM_INIT_FLAG);
    if (inited === '1') return;

    const host = (await AsyncStorage.getItem(AppStorage.ELECTRUM_HOST)) || '';
    const ssl = (await AsyncStorage.getItem(AppStorage.ELECTRUM_SSL_PORT)) || '';
    const tcp = (await AsyncStorage.getItem(AppStorage.ELECTRUM_TCP_PORT)) || '';

    // only set defaults when nothing has ever been configured
    const hasAnyConfig = !!(host || ssl || tcp);
    if (!hasAnyConfig) {
      await AsyncStorage.setItem(AppStorage.ELECTRUM_HOST, 'x.xkeva.com');
      await AsyncStorage.setItem(AppStorage.ELECTRUM_SSL_PORT, '50002');
      await AsyncStorage.setItem(AppStorage.ELECTRUM_TCP_PORT, '');
    }

    await AsyncStorage.setItem(ELECTRUM_INIT_FLAG, '1');
  }, []);

  useEffect(() => {
    initElectrumOnce();
  }, [initElectrumOnce]);

  const postToWeb = useCallback(payload => {
    // Use template string + escape backslash + backtick + ${} to avoid breaking injected JS
    const serialized = JSON.stringify(payload)
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${')
      // Avoid JS parse issues with U+2028/U+2029 in injected script
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

    webviewRef.current?.injectJavaScript(`
      (function(){
        var data = \`${serialized}\`;
        try { window.dispatchEvent(new MessageEvent('message', { data: data })); } catch(e) {}
        try { document.dispatchEvent(new MessageEvent('message', { data: data })); } catch(e) {}
        try {
          var payload = JSON.parse(data);
          if (payload && payload.type === 'satoshi_status' && payload.status === 'api_error') {
            var statusNode = document.getElementById('satoshiStatus');
            if (statusNode) statusNode.textContent = payload.apiMessage || 'Satoshi API error. Please try again later.';
            var getButton = document.querySelector('button[data-action="get"]');
            if (getButton) getButton.disabled = false;
          }
        } catch(e) {}
      })();
      true;
    `);
  }, []);

  const syncHomeLanguage = useCallback(async () => {
    const lang = await resolveHomeRoleLanguage();
    postToWeb({ type: 'home_set_language', lang });
  }, [postToWeb]);

  const refreshNamespaceListForSatoshi = useCallback(async () => {
    const wallets = BlueApp.getWallets();
    let namespaces = {};
    await BlueElectrum.ping();
    for (const wallet of wallets) {
      const ns = await findMyNamespaces(wallet, BlueElectrum);
      namespaces = { ...namespaces, ...ns };
    }
    const oldOrder = namespaceList?.order || [];
    const nextOrder = oldOrder.filter(nsid => namespaces[nsid]);
    for (const id of Object.keys(namespaces)) {
      if (!nextOrder.find(nsid => nsid == id)) nextOrder.unshift(id);
    }
    dispatch(setNamespaceList(namespaces, nextOrder));
    const info = findSatoshiNamespaceInfo(namespaces);
    if (info) satoshiLastInfoRef.current = info;
    return info;
  }, [dispatch, namespaceList]);

  const checkSatoshiNetworkReady = useCallback(async ({ force = false } = {}) => {
    const cached = satoshiNetworkCacheRef.current;
    if (!force && cached?.result && cached.ts && Date.now() - cached.ts < 15000) {
      return cached.result;
    }
    if (satoshiNetworkCheckInFlightRef.current) {
      return satoshiNetworkCheckInFlightRef.current;
    }
    const run = (async () => {
      let electrumHeight = null;
      let satoshiApiHeight = null;
      try {
        if (typeof BlueElectrum.waitTillConnected === 'function') {
          await withTimeout(BlueElectrum.waitTillConnected(), 8000);
        }
        await BlueElectrum.ping();
        electrumHeight = Number(await BlueElectrum.blockchainBlock_count());
      } catch (error) {
        console.warn('HomeScreen: failed to fetch Electrum block height', error);
      }
      try {
        satoshiApiHeight = Number(await getServerBlockHeight());
      } catch (error) {
        console.warn('HomeScreen: failed to fetch Satoshi API block height', error);
      }
      const hasElectrumHeight = Number.isFinite(electrumHeight);
      const hasSatoshiApiHeight = Number.isFinite(satoshiApiHeight);
      const heightDelta = hasElectrumHeight && hasSatoshiApiHeight ? Math.abs(electrumHeight - satoshiApiHeight) : null;
      const result = {
        // A valid Satoshi API height proves the server RPC is connected; a valid app Electrum height
        // proves the local wallet network is connected. Do not block Get Satoshi on a transient height
        // fetch mismatch here; the actual API request will report the real server error if any.
        ready: hasSatoshiApiHeight || hasElectrumHeight,
        electrumHeight: hasElectrumHeight ? electrumHeight : null,
        satoshiApiHeight: hasSatoshiApiHeight ? satoshiApiHeight : null,
        heightDelta,
      };
      satoshiNetworkCacheRef.current = { ts: Date.now(), result };
      return result;
    })();
    satoshiNetworkCheckInFlightRef.current = run;
    try {
      return await run;
    } finally {
      satoshiNetworkCheckInFlightRef.current = null;
    }
  }, []);

  const syncSatoshiStatus = useCallback(async (preferredStatus, options = {}) => {
    let savedStatus = '';
    let savedStatusMessage = '';
    try {
      savedStatus = (await AsyncStorage.getItem(SATOSHI_STATUS_KEY)) || '';
      savedStatusMessage = (await AsyncStorage.getItem(SATOSHI_STATUS_MESSAGE_KEY)) || '';
    } catch (_) {}
    let activeSatoshiInfo = satoshiNamespaceInfo || satoshiLastInfoRef.current || null;
    let namespaceExists = !!activeSatoshiInfo || hasSatoshiNamespace;
    if (options.refreshNamespace) {
      try {
        const refreshedInfo = await refreshNamespaceListForSatoshi();
        if (refreshedInfo) activeSatoshiInfo = refreshedInfo;
        namespaceExists = !!refreshedInfo;
      } catch (error) {
        console.warn('HomeScreen: failed to refresh Satoshi namespace status', error);
      }
    }
    if (activeSatoshiInfo) satoshiLastInfoRef.current = activeSatoshiInfo;

    let memoryReady = false;
    if (namespaceExists) {
      try {
        const restoredKey = await AsyncStorage.getItem(SATOSHI_MEMORY_RESTORE_KEY);
        const restoreStatus = await AsyncStorage.getItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY);
        memoryReady = activeSatoshiInfo
          && (isSatoshiMemoryRestoredForInfo(restoredKey, activeSatoshiInfo) || restoreStatus === 'ready')
          && await hasSatoshiMemoryFiles(activeSatoshiInfo);
      } catch (_) {
        memoryReady = false;
      }
    }

    const satoshiReady = namespaceExists && memoryReady;
    const canOpenChatStory = satoshiReady ? await hasSatoshiRoleChatRecords(activeSatoshiInfo) : false;
    const normalizedSavedStatus = satoshiReady || savedStatus === 'ready' ? '' : savedStatus;
    const safePreferredStatus = preferredStatus === 'receiving' && savedStatus !== 'receiving' ? '' : preferredStatus;
    let nextStatus = satoshiReady ? 'ready' : (safePreferredStatus || normalizedSavedStatus || 'waiting');
    let networkStatus = null;
    if (!satoshiReady && !['requesting', 'checking_wallet', 'creating_wallet', 'getting_address', 'receiving', 'restoring_memory', 'api_error'].includes(nextStatus)) {
      postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists, status: 'checking_network', alphaValue: null, satoshiId: getSatoshiDisplayId(activeSatoshiInfo) });
      networkStatus = await checkSatoshiNetworkReady({ force: options.forceNetworkCheck === true });
      nextStatus = networkStatus.ready ? 'network_ready' : 'network_unstable';
    }

    postToWeb({
      type: 'satoshi_status',
      hasSatoshi: satoshiReady,
      namespaceExists,
      status: nextStatus,
      alphaValue: satoshiReady ? satoshiAlphaValue : null,
      canOpenChatStory,
      satoshiId: getSatoshiDisplayId(activeSatoshiInfo),
      electrumHeight: networkStatus?.electrumHeight,
      satoshiApiHeight: networkStatus?.satoshiApiHeight,
      apiMessage: nextStatus === 'api_error' ? savedStatusMessage : '',
    });
    return { hasSatoshi: satoshiReady, namespaceExists, info: activeSatoshiInfo, status: nextStatus };
  }, [checkSatoshiNetworkReady, hasSatoshiNamespace, postToWeb, refreshNamespaceListForSatoshi, satoshiAlphaValue, satoshiNamespaceInfo]);

  const triggerSatoshiMemoryRestore = useCallback(async (info = satoshiNamespaceInfo) => {
    if (!info || satoshiRestoreInFlightRef.current) return;
    const restoreKey = getSatoshiRestoreKey(info);
    try {
      const restoredKey = await AsyncStorage.getItem(SATOSHI_MEMORY_RESTORE_KEY);
      const restoreStatus = await AsyncStorage.getItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY);
      if ((isSatoshiMemoryRestoredForInfo(restoredKey, info) || restoreStatus === 'ready') && await hasSatoshiMemoryFiles(info)) {
        const canOpenChatStory = await hasSatoshiRoleChatRecords(info);
        postToWeb({ type: 'satoshi_status', hasSatoshi: true, namespaceExists: true, status: 'ready', alphaValue: satoshiAlphaValue, canOpenChatStory, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
        return;
      }
    } catch (_) {}

    satoshiRestoreInFlightRef.current = true;
    postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: true, status: 'restoring_memory', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    try {
      await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY, 'restoring');
      const draft = await fetchDoppelOnChainMemory({ BlueElectrum, rawId: SATOSHI_DOPPEL_MEMORY_ID });
      if (!draft?.hasAnyMemory) {
        throw new Error('No Satoshi doppel memory');
      }

      const paths = getSatoshiRolePaths(info);
      await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/agent_chats`).catch(() => {});
      await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/agent_chats/${encodeURIComponent(paths.agentId)}`).catch(() => {});
      await RNFS.mkdir(paths.chatDir).catch(() => {});
      await RNFS.mkdir(paths.roleFilesDir).catch(() => {});
      await RNFS.mkdir(paths.roleDir).catch(() => {});

      let currentRoleData = null;
      try {
        if (await RNFS.exists(paths.roleFile)) currentRoleData = JSON.parse(await RNFS.readFile(paths.roleFile, 'utf8'));
      } catch (_) {}
      if (currentRoleData) {
        await writeTextReplacing(`${paths.roleDir}/lastmemory.v1.json`, JSON.stringify({ roleData: currentRoleData, kind: 'before-satoshi-background-doppel-restore', trigger: 'home-satoshi', capturedAt: Date.now() }, null, 2));
      }

      const memoryLayers = {
        verified: trimText(draft.memoryLayers?.verified),
        likely: trimText(draft.memoryLayers?.likely),
        fog: trimText(draft.memoryLayers?.fog),
      };
      const roleName = trimText(draft.roleName || currentRoleData?.roleName || info.displayName || info.name || 'SATOSHI') || 'SATOSHI';
      const memory = composeSatoshiMemoryCard(roleName, memoryLayers);
      const rolePayload = {
        ...(currentRoleData || {}),
        version: 2,
        memoryMode: 'layered',
        roleSlug: paths.roleSlug,
        roleName,
        memoryLayers,
        initialMemoryLayers: memoryLayers,
        memory,
        initialMemory: memory,
        memoryFiles: { verified: 'verified.md', likely: 'likely.md', fog: 'fog.md' },
        initialMemoryFiles: { verified: 'initial_verified.md', likely: 'initial_likely.md', fog: 'initial_fog.md' },
        restoredFrom: 'satoshi-background-doppel-memory',
        updatedAt: Date.now(),
      };
      await writeTextReplacing(paths.verifiedPath, memoryLayers.verified);
      await writeTextReplacing(paths.likelyPath, memoryLayers.likely);
      await writeTextReplacing(paths.fogPath, memoryLayers.fog);
      await writeTextReplacing(paths.initialVerifiedPath, memoryLayers.verified);
      await writeTextReplacing(paths.initialLikelyPath, memoryLayers.likely);
      await writeTextReplacing(paths.initialFogPath, memoryLayers.fog);
      await writeTextReplacing(paths.roleFile, JSON.stringify(rolePayload, null, 2));

      const roleState = { roleName, roleSlug: paths.roleSlug, roleCardPath: paths.roleFile, updatedAt: Date.now() };
      await writeTextReplacing(paths.currentRolePath, JSON.stringify(roleState, null, 2));
      await writeTextReplacing(paths.roleIndexPath, JSON.stringify([{ ...roleState, lastSummonedAt: roleState.updatedAt, isOnChain: false, hasMemory: true }], null, 2));
      await AsyncStorage.setItem(getRoleLastSelectedStorageKey(paths.agentId), JSON.stringify({ roleName, updatedAt: Date.now() }));

      if (!(await hasSatoshiMemoryFiles(info))) {
        throw new Error('Satoshi memory files missing after restore');
      }
      await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_KEY, restoreKey);
      await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY, 'ready');
      const canOpenChatStory = await hasSatoshiRoleChatRecords(info);
      postToWeb({ type: 'satoshi_status', hasSatoshi: true, namespaceExists: true, status: 'ready', alphaValue: satoshiAlphaValue, canOpenChatStory, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    } catch (error) {
      console.warn('HomeScreen: failed to restore Satoshi memory in background', error);
      try {
        if (await hasSatoshiMemoryFiles(info)) {
          await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_KEY, restoreKey);
          await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY, 'ready');
          const canOpenChatStory = await hasSatoshiRoleChatRecords(info);
          postToWeb({ type: 'satoshi_status', hasSatoshi: true, namespaceExists: true, status: 'ready', alphaValue: satoshiAlphaValue, canOpenChatStory, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
          return;
        }
      } catch (_) {}
      try { await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY, 'failed'); } catch (_) {}
      postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: true, status: 'restoring_memory', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    } finally {
      satoshiRestoreInFlightRef.current = false;
    }
  }, [postToWeb, satoshiAlphaValue, satoshiNamespaceInfo]);

  const syncHomeWebState = useCallback(async () => {
    await syncHomeLanguage();
    await syncSatoshiStatus();
  }, [syncHomeLanguage, syncSatoshiStatus]);

  const openSatoshiWindowFromBottomTab = useCallback(async () => {
    webviewRef.current?.injectJavaScript(`
      (function(){
        var win=document.getElementById('satoshiWindow');
        if(win)win.style.display='block';
        try{ if(typeof syncSatoshiFrame==='function')syncSatoshiFrame(); }catch(_){}
        try{ if(typeof updateSatoshiGetButton==='function')updateSatoshiGetButton(); }catch(_){}
        try{ if(typeof scheduleSatoshiTouchProxySync==='function')scheduleSatoshiTouchProxySync(); }catch(_){}
      })();
      true;
    `);
    await syncSatoshiStatus(undefined, { refreshNamespace: true, forceNetworkCheck: true });
  }, [syncSatoshiStatus]);

  useEffect(() => {
    syncHomeWebState();
    const unsubscribe = navigation?.addListener?.('didFocus', syncHomeWebState);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      else if (unsubscribe && typeof unsubscribe.remove === 'function') unsubscribe.remove();
    };
  }, [navigation, syncHomeWebState]);

  const openSatoshiAt = navigation?.state?.params?.openSatoshiAt;
  const isSatoshiTab = navigation?.state?.routeName === 'Satoshi';
  useEffect(() => {
    if (openSatoshiAt && !isSatoshiTab) {
      const timer = setTimeout(openSatoshiWindowFromBottomTab, 350);
      return () => clearTimeout(timer);
    }
  }, [openSatoshiAt, isSatoshiTab, openSatoshiWindowFromBottomTab]);

  const handleHomeLoadEnd = useCallback(() => {
    syncHomeWebState();
  }, [syncHomeWebState]);

  useEffect(() => {
    syncSatoshiStatus();
  }, [hasSatoshiNamespace, syncSatoshiStatus]);

  const ensureSatoshiWalletAndAddress = useCallback(async () => {
    await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'checking_wallet').catch(() => {});
    postToWeb({ type: 'satoshi_status', hasSatoshi: hasSatoshiNamespace, status: 'checking_wallet', alphaValue: hasSatoshiNamespace ? satoshiAlphaValue : null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    await BlueApp.startAndDecrypt();
    await BlueApp.waitForStart();
    let wallets = BlueApp.getWallets();
    if (!Array.isArray(wallets)) wallets = [];

    let wallet = wallets.find(w => {
      if (!w) return false;
      const label = typeof w.getLabel === 'function' ? w.getLabel() : w.label;
      return String(label || '').trim().toUpperCase() === SATOSHI_WALLET_LABEL;
    }) || wallets.find(w => w && (typeof w.getAddressAsync === 'function' || typeof w.getAddress === 'function'));

    if (!wallet) {
      await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'creating_wallet').catch(() => {});
      postToWeb({ type: 'satoshi_status', hasSatoshi: false, status: 'creating_wallet', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
      wallet = new HDSegwitP2SHWallet();
      wallet.setLabel(SATOSHI_WALLET_LABEL);
      await wallet.generate();
      BlueApp.wallets.push(wallet);
      await BlueApp.saveToDisk();
    }

    await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'getting_address').catch(() => {});
    postToWeb({ type: 'satoshi_status', hasSatoshi: false, status: 'getting_address', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    const address = await getSatoshiWalletAddressFast(wallet);
    if (!address) {
      throw new Error('No wallet address');
    }
    return { wallet, address };
  }, [hasSatoshiNamespace, postToWeb, satoshiAlphaValue, satoshiNamespaceInfo]);

  const requestSatoshiNamespace = useCallback(async () => {
    if (satoshiRequestInFlightRef.current) return;
    satoshiRequestInFlightRef.current = true;
    try {
      await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'requesting');
      await AsyncStorage.removeItem(SATOSHI_STATUS_MESSAGE_KEY).catch(() => {});
    } catch (_) {}
    postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: hasSatoshiNamespace, status: 'checking_network', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    try {
      const networkStatus = await checkSatoshiNetworkReady({ force: true });
      postToWeb({
        type: 'satoshi_status',
        hasSatoshi: false,
        namespaceExists: hasSatoshiNamespace,
        status: 'checking_network',
        alphaValue: null,
        electrumHeight: networkStatus.electrumHeight,
        satoshiApiHeight: networkStatus.satoshiApiHeight,
        satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo),
      });
      if (!networkStatus.ready) {
        console.warn('HomeScreen: Satoshi network precheck was inconclusive; continuing so API can return the real result', networkStatus);
      }

      let existingInfo = null;
      try {
        existingInfo = await refreshNamespaceListForSatoshi();
      } catch (error) {
        console.warn('HomeScreen: Satoshi existing namespace refresh failed before request; continuing to request API', error);
      }
      if (existingInfo) {
        satoshiLastInfoRef.current = existingInfo;
        if (await hasSatoshiMemoryFiles(existingInfo)) {
          await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_KEY, getSatoshiRestoreKey(existingInfo)).catch(() => {});
          await AsyncStorage.setItem(SATOSHI_MEMORY_RESTORE_STATUS_KEY, 'ready').catch(() => {});
          await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'ready').catch(() => {});
          const canOpenChatStory = await hasSatoshiRoleChatRecords(existingInfo);
          postToWeb({ type: 'satoshi_status', hasSatoshi: true, namespaceExists: true, status: 'ready', alphaValue: computeAlphaValue(existingInfo.id || existingInfo.namespaceId), canOpenChatStory, satoshiId: getSatoshiDisplayId(existingInfo) });
          return;
        }
        await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'restoring_memory');
        triggerSatoshiMemoryRestore(existingInfo).catch(error => console.warn('HomeScreen: Satoshi memory restore trigger failed from Get Satoshi', error));
        return;
      }

      const { address } = await ensureSatoshiWalletAndAddress();
      const result = await requestServerNamespace(address, '1.0.1');
      if (result && (result.status === 'sent' || result.status === 'already_sent' || result.status === 'processing')) {
        await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'receiving');
        postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: false, status: 'receiving', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
      } else {
        await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'unavailable');
        postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: false, status: 'unavailable', alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
      }
    } catch (error) {
      const errorMessage = String(error?.message || error || 'unknown error');
      console.log('HomeScreen: Get Satoshi failed message:', errorMessage);
      console.warn('HomeScreen: Get Satoshi failed', error);
      try {
        await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'api_error');
        await AsyncStorage.setItem(SATOSHI_STATUS_MESSAGE_KEY, errorMessage);
      } catch (_) {}
      postToWeb({ type: 'satoshi_status', hasSatoshi: false, namespaceExists: hasSatoshiNamespace, status: 'api_error', apiMessage: errorMessage, alphaValue: null, satoshiId: getSatoshiDisplayId(satoshiNamespaceInfo) });
    } finally {
      satoshiRequestInFlightRef.current = false;
    }
  }, [checkSatoshiNetworkReady, ensureSatoshiWalletAndAddress, hasSatoshiNamespace, postToWeb, refreshNamespaceListForSatoshi, triggerSatoshiMemoryRestore, satoshiNamespaceInfo]);

  const handleMessage = useCallback(
    async event => {
      const msg = event.nativeEvent && event.nativeEvent.data;
      if (!msg) {
        return;
      }

      let obj;
      try {
        obj = JSON.parse(msg);
      } catch (_) {}

      if (obj && obj.type === 'electrum_get_state') {
        const host = (await AsyncStorage.getItem(AppStorage.ELECTRUM_HOST)) || '';
        const ssl = (await AsyncStorage.getItem(AppStorage.ELECTRUM_SSL_PORT)) || '';
        const tcp = (await AsyncStorage.getItem(AppStorage.ELECTRUM_TCP_PORT)) || '';
        postToWeb({ type: 'electrum_state', current: { host, ssl, tcp }, nodes: OFFICIAL_NODES });
        return;
      }

      if (obj && obj.type === 'electrum_probe_heights') {
        const mySeq = ++probeSeqRef.current;

        postToWeb({ type: 'electrum_probe_reset', seq: mySeq });

        for (const node of OFFICIAL_NODES) {
          if (mySeq !== probeSeqRef.current) {
            return;
          }

          let ok = false;
          let height = null;

          try {
            const h = await withTimeout(
              BlueElectrum.probeBlockHeight(node.host, node.tcp, node.ssl),
              6000,
            );
            ok = Number.isFinite(h) && Number(h) > 0;
            height = ok ? Number(h) : null;
          } catch (e) {
            ok = false;
            height = null;
          }

          postToWeb({
            type: 'electrum_probe_one',
            seq: mySeq,
            id: node.id,
            ok,
            height,
          });
        }

        postToWeb({ type: 'electrum_probe_done', seq: mySeq });
        return;
      }

      if (obj && obj.type === 'electrum_probe_get_or_run') {
        const mySeq = ++probeSeqRef.current;

        // Within 2 minutes: return cached results only, without opening connections.
        if (lastProbeCache.ts && nowMs() - lastProbeCache.ts < PROBE_COOLDOWN_MS) {
          const left = PROBE_COOLDOWN_MS - (nowMs() - lastProbeCache.ts);
          postToWeb({
            type: 'electrum_probe_cached',
            seq: mySeq,
            ts: lastProbeCache.ts,
            cooldownLeftSec: Math.max(0, Math.ceil(left / 1000)),
            resultById: lastProbeCache.resultById || {},
          });
          return;
        }

        // New probe round: reset first (gray), then allow nodes to light up one by one.
        postToWeb({ type: 'electrum_probe_reset', seq: mySeq, cooldownLeftSec: 0 });

        const tempResultById = {};

        for (const node of OFFICIAL_NODES) {
          if (mySeq !== probeSeqRef.current) {
            return;
          }

          let ok = false;
          let height = null;

          try {
            const h = await withTimeout(
              BlueElectrum.probeBlockHeight(node.host, node.tcp, node.ssl),
              6000,
            );
            ok = Number.isFinite(h) && Number(h) > 0;
            height = ok ? Number(h) : null;
          } catch (_) {
            ok = false;
            height = null;
          }

          tempResultById[node.id] = { ok, height };

          postToWeb({
            type: 'electrum_probe_one',
            seq: mySeq,
            id: node.id,
            ok,
            height,
            cooldownLeftSec: 0,
          });
        }

        // After all checks finish: write the cache once and start the 2-minute cooldown.
        lastProbeCache = {
          ts: nowMs(),
          resultById: tempResultById,
        };

        postToWeb({
          type: 'electrum_probe_done',
          seq: mySeq,
          cooldownLeftSec: Math.ceil(PROBE_COOLDOWN_MS / 1000),
          ts: lastProbeCache.ts,
          resultById: lastProbeCache.resultById,
        });
        return;
      }

      if (obj && obj.type === 'home_set_role_language') {
        const lang = await persistHomeRoleLanguage(obj.lang);
        postToWeb({ type: 'home_set_language', lang });
        return;
      }

      if (obj && obj.type === 'electrum_use') {
        const node = OFFICIAL_NODES.find(item => item.id === obj.id);
        if (!node) {
          return;
        }

        await AsyncStorage.setItem(AppStorage.ELECTRUM_HOST, node.host);
        await AsyncStorage.setItem(AppStorage.ELECTRUM_SSL_PORT, node.ssl || '');
        await AsyncStorage.setItem(AppStorage.ELECTRUM_TCP_PORT, node.tcp || '');

        try {
          BlueElectrum.forceDisconnect();
        } catch (_) {}

        try {
          await BlueElectrum.ping();
        } catch (_) {}

        postToWeb({ type: 'electrum_used' });
        return;
      }

      if (msg === 'open_role_last') {
        const record = await readLastSpaceRecord(LAST_ROLE_SPACE_PATH);
        const homeLang = await resolveHomeRoleLanguage();
        if (!record || (!record.namespaceId && !record.shortCode)) { Alert.alert('Role', getHomeAlertText(homeLang, 'noRole')); return; }
        if (typeof navigation.push === 'function') navigation.push('AgentRole', { ...record, roleEntrySource: 'desktop-last-space', autoCommand: record.autoCommand || '/role' });
        else navigation.navigate('AgentRole', { ...record, roleEntrySource: 'desktop-last-space', autoCommand: record.autoCommand || '/role' });
        return;
      } else if (msg === 'open_story_last') {
        const record = await readLastSpaceRecord(LAST_STORY_SPACE_PATH);
        const homeLang = await resolveHomeRoleLanguage();
        const shortCode = String(record?.shortCode || '').trim();
        const shortId = String(record?.shortId || '').trim();
        if (!record || (!shortCode && !shortId)) { Alert.alert('Story', getHomeAlertText(homeLang, 'noStory')); return; }
        const storyParams = {
          ...(shortCode ? { shortCode } : {}),
          ...(shortId ? { shortId } : {}),
          suppressAutoLinkStart: true,
        };
        if (typeof navigation.push === 'function') navigation.push('AgentStory', storyParams);
        else navigation.navigate('AgentStory', storyParams);
        return;
      } else if (msg === 'open_chat_last' || msg === 'open_following') {
        const record = await readLastSpaceRecord(LAST_CHAT_SPACE_PATH);
        const homeLang = await resolveHomeRoleLanguage();
        const routeName = record?.routeName === 'FollowChat' ? 'FollowChat' : record?.routeName === 'AgentChat' ? 'AgentChat' : 'AgentRole';
        const hasOwnChatId = !!String(record?.namespaceId || record?.shortCode || record?.agentId || '').trim();
        const hasFollowChatId = !!String(record?.peerNamespaceId || '').trim();
        if (!record || (routeName === 'FollowChat' ? !hasFollowChatId : !hasOwnChatId)) { Alert.alert('Chat', getHomeAlertText(homeLang, 'noChat')); return; }
        const chatParams = routeName === 'FollowChat'
          ? {
              peerNamespaceId: record.peerNamespaceId,
              peerShortCode: record.peerShortCode,
              peerDisplayName: record.peerDisplayName || record.displayName,
              replyFromNamespaceId: record.replyFromNamespaceId || null,
              mode: record.mode || 'mutual',
            }
          : routeName === 'AgentChat'
            ? { ...record }
            : {
                ...record,
                autoCommand: record.autoCommand || '/role chat',
                roleEntrySource: record.roleEntrySource || 'desktop-chat-last-space',
                pureChatMode: true,
                suppressAutoLinkStart: true,
              };
        if (typeof navigation.push === 'function') navigation.push(routeName, chatParams);
        else navigation.navigate(routeName, chatParams);
        return;
      } else if (msg === 'open_wallet') {
        navigation.navigate('Wallets');
        return;
      } else if (msg === 'open_agents' || msg === 'open_getagents') {
        navigation.navigate('GetAgents');
        return;
      } else if (msg === 'open_guest_following') {
        navigation.navigate('Namespaces', { initialTab: 'following', openGuest: true });
        return;
      } else if (msg === 'open_satoshi_get_namespace') {
        await requestSatoshiNamespace();
        return;
      } else if (msg === 'open_satoshi_namespace_list') {
        navigation.navigate('Namespaces', { initialTab: 'me' });
        return;
      } else if (msg === 'open_satoshi_role' || msg === 'open_satoshi_chat' || msg === 'open_satoshi_story') {
        const info = findSatoshiNamespaceInfo(namespaceList) || satoshiNamespaceInfo || satoshiLastInfoRef.current;
        const params = buildSatoshiNavigationParams(info);
        if (!params || (!params.namespaceId && !params.shortCode)) {
          navigation.navigate('Namespaces', { initialTab: 'me' });
          return;
        }
        if (msg === 'open_satoshi_role') {
          const roleParams = { ...params, autoCommand: '/role', roleEntrySource: 'satoshi-role-button', suppressAutoLinkStart: true };
          setTimeout(() => {
            if (typeof navigation.push === 'function') navigation.push('AgentRole', roleParams);
            else navigation.navigate('AgentRole', roleParams);
          }, 0);
          return;
        }
        if (msg === 'open_satoshi_chat') {
          const chatParams = { ...params, autoCommand: '/role chat', roleEntrySource: 'namespace-chat-button', pureChatMode: true, headerModeTitle: 'Chat', suppressAutoLinkStart: true };
          if (typeof navigation.push === 'function') navigation.push('AgentRole', chatParams);
          else navigation.navigate('AgentRole', chatParams);
          return;
        }
        const storyParams = { ...params, autoCommand: '/d new', autoCommandSource: 'link-story', startStoryOnMount: true, suppressAutoLinkStart: true };
        if (typeof navigation.push === 'function') navigation.push('AgentStory', storyParams);
        else navigation.navigate('AgentStory', storyParams);
        return;
      } else if (msg === 'refresh_satoshi_status') {
        const savedStatus = await AsyncStorage.getItem(SATOSHI_STATUS_KEY).catch(() => '');
        const flowStatuses = ['requesting', 'checking_wallet', 'creating_wallet', 'getting_address'];
        if (flowStatuses.includes(savedStatus) && !satoshiRequestInFlightRef.current) {
          requestSatoshiNamespace().catch(error => console.warn('HomeScreen: Satoshi get flow retry failed after refresh', error));
          return;
        }
        const refreshStatuses = ['requesting', 'checking_network', 'network_unstable', 'checking_wallet', 'creating_wallet', 'getting_address', 'receiving', 'restoring_memory'];
        const statusResult = await syncSatoshiStatus(refreshStatuses.includes(savedStatus) ? savedStatus : undefined, { refreshNamespace: true, forceNetworkCheck: true });
        if ((savedStatus === 'receiving' || savedStatus === 'restoring_memory') && statusResult?.namespaceExists && !statusResult?.hasSatoshi) {
          await AsyncStorage.setItem(SATOSHI_STATUS_KEY, 'restoring_memory').catch(() => {});
          triggerSatoshiMemoryRestore(statusResult.info || satoshiLastInfoRef.current).catch(error => console.warn('HomeScreen: Satoshi memory restore trigger failed after refresh', error));
        }
        return;
      } else if (msg === 'open_readme') {
        navigation.navigate('Readme');
        return;
      }

      // legacy structured messages are ignored now that Get Agents runs as a native screen
    },
    [hasSatoshiNamespace, namespaceList, navigation, requestSatoshiNamespace, satoshiNamespaceInfo, syncSatoshiStatus, triggerSatoshiMemoryRestore],
  );

  const handleShouldStartLoad = useCallback(
    request => {
      const url = String((request && request.url) || '');
      if (url === 'appd://open_satoshi_get_namespace') {
        handleMessage({ nativeEvent: { data: 'open_satoshi_get_namespace' } });
        return false;
      }
      return true;
    },
    [handleMessage],
  );

  const handleSatoshiNativeGetPress = useCallback(() => {
    if (hasSatoshiNamespace) {
      navigation.navigate('Namespaces', { initialTab: 'me' });
      return;
    }
    requestSatoshiNamespace().catch(error => console.warn('HomeScreen: native Satoshi get press failed', error));
  }, [hasSatoshiNamespace, navigation, requestSatoshiNamespace]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={{ uri: isSatoshiTab ? 'file:///android_asset/os/satoshi.html' : 'file:///android_asset/os/index.html' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadEnd={handleHomeLoadEnd}
        mixedContentMode="always"
      />
      {isSatoshiTab ? (
        <TouchableOpacity
          accessibilityLabel="Get Satoshi Card"
          activeOpacity={1}
          onPress={handleSatoshiNativeGetPress}
          style={{ position: 'absolute', left: '30%', top: '47%', width: '40%', height: '5.5%', backgroundColor: 'transparent' }}
        />
      ) : null}
    </View>
  );
}
