import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { WebView } from 'react-native-webview';
import BlueElectrum from '../../BlueElectrum';
import BlueApp from '../../BlueApp';
import { handleGetAgentsNamespaceRequest } from '../../GetAgentsNamespace';
import { findMyNamespaces } from '../../class/keva-ops';

function parseBlockHeightFromShortcode(shortCode) {
  if (shortCode === undefined || shortCode === null) {
    return null;
  }
  const normalized = String(shortCode).trim();
  if (!/^[0-9]+$/.test(normalized) || normalized.length < 2) {
    return null;
  }
  const heightDigits = parseInt(normalized[0], 10);
  if (!Number.isFinite(heightDigits) || heightDigits <= 0 || normalized.length <= heightDigits) {
    return null;
  }
  const blockSlice = normalized.slice(1, 1 + heightDigits);
  const blockHeight = parseInt(blockSlice, 10);
  if (!Number.isFinite(blockHeight)) {
    return null;
  }
  return blockHeight;
}

function parseTimestampFromHeaderHex(headerHex) {
  if (typeof headerHex !== 'string') {
    return null;
  }
  const trimmedHex = headerHex.trim();
  if (trimmedHex.length < 144) {
    return null;
  }
  const tsLittleEndian = trimmedHex.slice(136, 144);
  if (tsLittleEndian.length !== 8) {
    return null;
  }
  const bytePairs = tsLittleEndian.match(/.{2}/g);
  if (!bytePairs || bytePairs.length !== 4) {
    return null;
  }
  const bigEndianHex = bytePairs.reverse().join('');
  const timestamp = parseInt(bigEndianHex, 16);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

function extractTimestampFromHeaderPayload(header) {
  if (!header) {
    return null;
  }
  if (typeof header === 'object') {
    if (Number.isFinite(header.timestamp)) {
      return Number(header.timestamp);
    }
    if (Number.isFinite(header.time)) {
      return Number(header.time);
    }
    if (typeof header.hex === 'string') {
      return parseTimestampFromHeaderHex(header.hex);
    }
  }
  if (typeof header === 'string') {
    return parseTimestampFromHeaderHex(header);
  }
  return null;
}

async function fetchBlockTimestampSeconds(blockHeight) {
  try {
    const header = await BlueElectrum.blockchainBlock_getHeader(blockHeight);
    const timestamp = extractTimestampFromHeaderPayload(header);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  } catch (error) {
    console.warn('GetAgentsScreen: failed to fetch header for wallet block timestamp', blockHeight, error);
  }
  return null;
}

let pendingWalletRefreshPromise = null;
const UNCONFIRMED_REFRESH_INTERVAL_MS = 60 * 1000;
let lastUnconfirmedRefreshTs = 0;

async function refreshWalletDataForUnconfirmedCount() {
  if (pendingWalletRefreshPromise) {
    return pendingWalletRefreshPromise;
  }

  const now = Date.now();
  if (now - lastUnconfirmedRefreshTs < UNCONFIRMED_REFRESH_INTERVAL_MS) {
    return Promise.resolve();
  }

  pendingWalletRefreshPromise = (async () => {
    const wallets = typeof BlueApp.getWallets === 'function' ? BlueApp.getWallets() : [];
    if (!Array.isArray(wallets) || wallets.length === 0) {
      lastUnconfirmedRefreshTs = Date.now();
      return;
    }

    await Promise.all(
      wallets.map(async wallet => {
        if (!wallet) {
          return;
        }

        if (typeof wallet.fetchBalance === 'function') {
          try {
            await wallet.fetchBalance();
          } catch (error) {
            console.warn('GetAgentsScreen: failed to refresh wallet balance before counting unconfirmed tx', error);
          }
        }

        if (typeof wallet.fetchTransactions === 'function') {
          try {
            await wallet.fetchTransactions();
          } catch (error) {
            console.warn('GetAgentsScreen: failed to refresh wallet transactions before counting unconfirmed tx', error);
          }
        }
      }),
    );

    try {
      await BlueApp.saveToDisk();
    } catch (error) {
      console.warn('GetAgentsScreen: failed to persist wallet data after refresh', error);
    }

    lastUnconfirmedRefreshTs = Date.now();
  })();

  try {
    await pendingWalletRefreshPromise;
  } finally {
    pendingWalletRefreshPromise = null;
  }
}

async function getUnconfirmedTransactionCount() {
  try {
    if (typeof BlueApp.waitForStart === 'function') {
      await BlueApp.waitForStart();
    }
  } catch (error) {
    console.warn('GetAgentsScreen: failed to wait for wallet start', error);
  }

  if (typeof BlueApp.getWallets !== 'function') {
    return 0;
  }

  const wallets = BlueApp.getWallets();
  const computeCount = () =>
    wallets.reduce((total, wallet) => {
      if (!wallet || typeof wallet.getTransactions !== 'function') {
        return total;
      }
      const transactions = wallet.getTransactions() || [];
      const walletCount = transactions.reduce((count, tx) => {
        const confirmations = Number(tx && tx.confirmations);
        if (!Number.isFinite(confirmations) || confirmations <= 0) {
          return count + 1;
        }
        return count;
      }, 0);
      return total + walletCount;
    }, 0);

  refreshWalletDataForUnconfirmedCount().catch(error => {
    console.warn('GetAgentsScreen: background unconfirmed refresh failed', error);
  });

  try {
    return computeCount();
  } catch (error) {
    console.warn('GetAgentsScreen: failed to compute unconfirmed tx count', error);
    return 0;
  }
}

const ANDROID_GETAGENTS_SOURCE = { uri: 'file:///android_asset/os/getagents.html' };
const IOS_GETAGENTS_SOURCE = { uri: 'getagents.html' };

export default function GetAgentsScreen() {
  const webviewRef = useRef(null);
  const walletNamespaceStateRef = useRef({ shortcodesByBlock: new Map(), lastUpdated: 0 });
  const walletNamespaceRefreshPromiseRef = useRef(null);
  const lastKnownBlockHeightRef = useRef(null);
  const lastUnconfirmedCountRef = useRef(0);

  const refreshWalletNamespaceState = useCallback(async () => {
    if (walletNamespaceRefreshPromiseRef.current) {
      return walletNamespaceRefreshPromiseRef.current;
    }

    walletNamespaceRefreshPromiseRef.current = (async () => {
      try {
        if (typeof BlueApp.waitForStart === 'function') {
          await BlueApp.waitForStart();
        }
      } catch (error) {
        console.warn('GetAgentsScreen: failed to wait for wallet start before refreshing namespaces', error);
      }

      try {
        await BlueElectrum.ping();
        await BlueElectrum.waitTillConnected();
      } catch (error) {
        console.warn('GetAgentsScreen: failed to reach Electrum before refreshing namespaces', error);
      }

      const wallets = typeof BlueApp.getWallets === 'function' ? BlueApp.getWallets() : [];
      const map = new Map();
      for (const wallet of wallets) {
        if (!wallet) {
          continue;
        }
        try {
          const namespaces = await findMyNamespaces(wallet, BlueElectrum);
          if (!namespaces || typeof namespaces !== 'object') {
            continue;
          }
          Object.values(namespaces).forEach(ns => {
            if (!ns || typeof ns.shortCode === 'undefined' || ns.shortCode === null) {
              return;
            }
            const blockHeight = parseBlockHeightFromShortcode(ns.shortCode);
            if (!Number.isFinite(blockHeight)) {
              return;
            }
            const normalized = String(ns.shortCode).trim();
            if (!map.has(blockHeight)) {
              map.set(blockHeight, []);
            }
            map.get(blockHeight).push(normalized);
          });
        } catch (error) {
          const walletId = wallet && typeof wallet.getID === 'function' ? wallet.getID() : 'unknown';
          console.warn('GetAgentsScreen: failed to resolve namespaces for wallet', walletId, error);
        }
      }

      walletNamespaceStateRef.current = {
        shortcodesByBlock: map,
        lastUpdated: Date.now(),
      };
      return map;
    })();

    try {
      return await walletNamespaceRefreshPromiseRef.current;
    } finally {
      walletNamespaceRefreshPromiseRef.current = null;
    }
  }, []);

  const getWalletShortcodesForBlock = useCallback((blockHeight, shortcodesMap = null) => {
    if (!Number.isFinite(blockHeight)) {
      return [];
    }
    const map = shortcodesMap instanceof Map ? shortcodesMap : walletNamespaceStateRef.current.shortcodesByBlock;
    if (!(map instanceof Map) || map.size === 0) {
      return [];
    }
    const shortcodes = map.get(blockHeight);
    if (!shortcodes || shortcodes.length === 0) {
      return [];
    }
    return shortcodes.slice();
  }, []);

  const getWalletBlockEntries = useCallback(
    async (shortcodesMap = null, options = {}) => {
      const { allowRefresh = true } = options;
      let map = shortcodesMap;
      if (!(map instanceof Map)) {
        map = walletNamespaceStateRef.current.shortcodesByBlock;
      }
      if ((!(map instanceof Map) || map.size === 0) && allowRefresh) {
        map = await refreshWalletNamespaceState();
      }
      if (!(map instanceof Map) || map.size === 0) {
        return [];
      }
      const blockHeights = Array.from(map.keys()).filter(height => Number.isFinite(height));
      if (blockHeights.length === 0) {
        return [];
      }
      blockHeights.sort((a, b) => b - a);
      const entries = [];
      for (const height of blockHeights) {
        const shortcodes = map.get(height) || [];
        let timestamp = null;
        try {
          timestamp = await fetchBlockTimestampSeconds(height);
        } catch (error) {
          console.warn('GetAgentsScreen: failed to resolve wallet block timestamp', error);
        }
        entries.push({
          blockHeight: height,
          timestamp,
          shortcodes: shortcodes.slice(),
        });
      }
      return entries;
    },
    [refreshWalletNamespaceState],
  );

  const buildCachedWalletAgentPayload = useCallback(
    blockHeight => {
      if (!Number.isFinite(blockHeight)) {
        return null;
      }
      const map = walletNamespaceStateRef.current.shortcodesByBlock;
      if (!(map instanceof Map) || map.size === 0) {
        return null;
      }
      const shortcodes = getWalletShortcodesForBlock(blockHeight, map);
      if (!shortcodes || shortcodes.length === 0) {
        return null;
      }
      return {
        blockHeight,
        shortcodes: shortcodes.slice(),
        blocks: [],
      };
    },
    [getWalletShortcodesForBlock],
  );

  const sendMessageToWebView = useCallback(message => {
    const view = webviewRef.current;
    if (!view) {
      return;
    }

    try {
      const serialized = JSON.stringify(message);
      const escaped = serialized
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
      const script = `
        (function() {
          const data = \`${escaped}\`;
          window.dispatchEvent(new MessageEvent('message', { data: data }));
          document.dispatchEvent(new MessageEvent('message', { data: data }));
        })();
        true;
      `;
      view.injectJavaScript(script);
    } catch (error) {
      console.warn('GetAgentsScreen: failed to send message to WebView', error);
    }
  }, []);

  const emitWalletAgentState = useCallback(
    async (blockHeight, shortcodesMap = null, options = {}) => {
      const { skipIfEmpty = false } = options;
      if (!Number.isFinite(blockHeight)) {
        return;
      }
      let map = shortcodesMap;
      if (!(map instanceof Map)) {
        map = walletNamespaceStateRef.current.shortcodesByBlock;
      }
      if (!(map instanceof Map) || map.size === 0) {
        if (skipIfEmpty) {
          return;
        }
        sendMessageToWebView({
          type: 'getagents_wallet_state',
          payload: {
            blockHeight,
            walletAgents: null,
            unconfirmedTxCount: lastUnconfirmedCountRef.current || 0,
          },
        });
        return;
      }
      const shortcodes = getWalletShortcodesForBlock(blockHeight, map);
      let walletBlockEntries = [];
      try {
        walletBlockEntries = await getWalletBlockEntries(map, { allowRefresh: false });
      } catch (error) {
        console.warn('GetAgentsScreen: failed to build wallet block entries for emit', error);
      }
      const hasShortcodes = shortcodes.length > 0;
      const hasBlocks = walletBlockEntries.length > 0;
      if (!hasShortcodes && !hasBlocks && skipIfEmpty) {
        return;
      }
      sendMessageToWebView({
        type: 'getagents_wallet_state',
        payload: {
          blockHeight,
          walletAgents:
            hasShortcodes || hasBlocks
              ? {
                  blockHeight,
                  shortcodes,
                  blocks: walletBlockEntries,
                }
              : null,
          unconfirmedTxCount: lastUnconfirmedCountRef.current || 0,
        },
      });
    },
    [
      getWalletBlockEntries,
      getWalletShortcodesForBlock,
      lastUnconfirmedCountRef,
      sendMessageToWebView,
      walletNamespaceStateRef,
    ],
  );

  useEffect(() => {
    refreshWalletNamespaceState()
      .then(map => {
        const blockHeight = lastKnownBlockHeightRef.current;
        if (Number.isFinite(blockHeight)) {
          emitWalletAgentState(blockHeight, map, { skipIfEmpty: true });
        }
      })
      .catch(error => {
        console.warn('GetAgentsScreen: failed to prefetch wallet namespace state', error);
      });
  }, [emitWalletAgentState, lastKnownBlockHeightRef, refreshWalletNamespaceState]);

  const handleNamespaceCreationRequest = useCallback(
    async request => {
      const result = await handleGetAgentsNamespaceRequest(request, sendMessageToWebView);
      if (result && result.success) {
        try {
          const map = await refreshWalletNamespaceState();
          const blockHeight = lastKnownBlockHeightRef.current;
          if (Number.isFinite(blockHeight)) {
            await emitWalletAgentState(blockHeight, map, { skipIfEmpty: true });
          }
        } catch (error) {
          console.warn('GetAgentsScreen: failed to refresh wallet namespaces after creation', error);
        }
      }
      return result;
    },
    [emitWalletAgentState, lastKnownBlockHeightRef, refreshWalletNamespaceState, sendMessageToWebView],
  );

  const handleMessage = useCallback(
    async event => {
      const payload = event?.nativeEvent?.data;
      if (!payload) {
        return;
      }

      let parsed;
      if (typeof payload === 'string') {
        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          return;
        }
      } else if (typeof payload === 'object') {
        parsed = payload;
      }

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      if (parsed.type === 'getagents_create_namespace') {
        try {
          await handleNamespaceCreationRequest(parsed);
        } catch (error) {
          console.warn('GetAgentsScreen: namespace creation failed', error);
        }
        return;
      }

      if (parsed.type !== 'getagents_latest_block_request') {
        return;
      }

      try {
        const [latestHeader, unconfirmedTxCount] = await Promise.all([
          BlueElectrum.getLatestHeaderSimple(),
          getUnconfirmedTransactionCount(),
        ]);

        lastKnownBlockHeightRef.current = latestHeader.height;
        lastUnconfirmedCountRef.current = unconfirmedTxCount;

        let electrumConfig = null;
        try {
          electrumConfig = await BlueElectrum.getConfig();
        } catch (_) {
          electrumConfig = null;
        }

        const electrumPayload = electrumConfig && typeof electrumConfig === 'object'
          ? { ...electrumConfig }
          : {};
        if (!electrumPayload.host) {
          electrumPayload.host = latestHeader.host;
        }
        if (!electrumPayload.ssl) {
          electrumPayload.ssl = electrumPayload.port || latestHeader.ssl;
        }

        const walletAgentsPayload = buildCachedWalletAgentPayload(latestHeader.height);

        sendMessageToWebView({
          type: 'getagents_latest_block_response',
          payload: {
            height: latestHeader.height,
            timestamp: latestHeader.timestamp,
            electrum: electrumPayload,
            unconfirmedTxCount,
            walletAgents: walletAgentsPayload,
          },
        });

        refreshWalletNamespaceState()
          .then(map => emitWalletAgentState(latestHeader.height, map, { skipIfEmpty: true }))
          .catch(error => {
            console.warn('GetAgentsScreen: failed to refresh wallet namespaces for timeline', error);
          });
      } catch (error) {
        console.warn('GetAgentsScreen: failed to fetch latest block info', error);
        sendMessageToWebView({
          type: 'getagents_latest_block_error',
          error: (error && error.message) || String(error),
        });
      }
    },
    [
      buildCachedWalletAgentPayload,
      emitWalletAgentState,
      handleNamespaceCreationRequest,
      refreshWalletNamespaceState,
      sendMessageToWebView,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={Platform.OS === 'android' ? ANDROID_GETAGENTS_SOURCE : IOS_GETAGENTS_SOURCE}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onMessage={handleMessage}
      />
    </View>
  );
}

GetAgentsScreen.navigationOptions = () => ({
  title: 'Get Agents',
  headerShown: false,
});
