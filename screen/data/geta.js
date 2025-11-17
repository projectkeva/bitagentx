import React, { useCallback, useRef } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSelector } from 'react-redux';
import BlueElectrum from '../../BlueElectrum';
import { handleGetAgentsNamespaceRequest } from '../../GetAgentsNamespace';

const ANDROID_GETAGENTS_SOURCE = { uri: 'file:///android_asset/os/getagents.html' };
const IOS_GETAGENTS_SOURCE = { uri: 'getagents.html' };

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

function normalizeShortcodeValue(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

export default function GetAgentsScreen() {
  const webviewRef = useRef(null);
  const namespaceList = useSelector(state => state?.namespaceList);

  const getWalletShortcodeGroups = useCallback(() => {
    const namespaces = namespaceList && namespaceList.namespaces;
    if (!namespaces || typeof namespaces !== 'object') {
      return [];
    }

    const grouped = new Map();
    Object.values(namespaces).forEach(ns => {
      const normalized = normalizeShortcodeValue(ns && ns.shortCode);
      if (!normalized) {
        return;
      }
      const blockHeight = parseBlockHeightFromShortcode(normalized);
      if (!Number.isFinite(blockHeight)) {
        return;
      }
      if (!grouped.has(blockHeight)) {
        grouped.set(blockHeight, new Set());
      }
      grouped.get(blockHeight).add(normalized);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([blockHeight, shortcodes]) => ({
        blockHeight,
        shortcodes: Array.from(shortcodes),
      }));
  }, [namespaceList]);

  const buildWalletAgentsPayload = useCallback(
    latestBlockHeight => {
      const groups = getWalletShortcodeGroups();
      if (!groups.length) {
        return null;
      }

      const numericLatest = Number(latestBlockHeight);
      const currentGroup = Number.isFinite(numericLatest)
        ? groups.find(group => group.blockHeight === numericLatest)
        : null;

      return {
        blockHeight: Number.isFinite(numericLatest)
          ? numericLatest
          : groups[0]?.blockHeight ?? null,
        shortcodes: currentGroup ? currentGroup.shortcodes : [],
        blocks: groups.map(group => ({
          blockHeight: group.blockHeight,
          timestamp: null,
          shortcodes: group.shortcodes,
        })),
      };
    },
    [getWalletShortcodeGroups],
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

  const handleNamespaceCreationRequest = useCallback(
    request => handleGetAgentsNamespaceRequest(request, sendMessageToWebView),
    [sendMessageToWebView],
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
        const latestHeader = await BlueElectrum.getLatestHeaderSimple();
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

        const walletAgents = buildWalletAgentsPayload(latestHeader.height);
        const latestPayload = {
          height: latestHeader.height,
          timestamp: latestHeader.timestamp,
          electrum: electrumPayload,
        };
        if (walletAgents) {
          latestPayload.walletAgents = walletAgents;
        }

        sendMessageToWebView({
          type: 'getagents_latest_block_response',
          payload: latestPayload,
        });
      } catch (error) {
        console.warn('GetAgentsScreen: failed to fetch latest block info', error);
        sendMessageToWebView({
          type: 'getagents_latest_block_error',
          error: (error && error.message) || String(error),
        });
      }
    },
    [sendMessageToWebView, handleNamespaceCreationRequest, buildWalletAgentsPayload],
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
