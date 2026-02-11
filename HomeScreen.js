// HomeScreen.js (clean, no debug toolbar)
import React, { useCallback, useEffect, useRef } from 'react';
import { View, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { WebView } from 'react-native-webview';
import { useNavigation } from 'react-navigation-hooks';
import BlueElectrum from './BlueElectrum';
import { AppStorage } from './class';

const OFFICIAL_NODES = [
  { id: 'n0', host: 'x.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n1', host: 'y.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n2', host: 'z.xkeva.com', ssl: '50002', tcp: '' },
  { id: 'n3', host: 'ec.kevacoin.org', ssl: '50002', tcp: '' },
];

const DEFAULT_NODE = OFFICIAL_NODES[0];
const PROBE_COOLDOWN_MS = 2 * 60 * 1000;

// in-memory cache (good enough for "close window then reopen"; persists while app stays alive)
let lastProbeCache = {
  ts: 0,
  resultById: {},
};

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const nowMs = () => Date.now();

const isCacheFresh = () => {
  return lastProbeCache.ts && nowMs() - lastProbeCache.ts < PROBE_COOLDOWN_MS;
};

const secondsLeft = () => {
  const left = PROBE_COOLDOWN_MS - (nowMs() - lastProbeCache.ts);
  return Math.max(0, Math.ceil(left / 1000));
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const webviewRef = useRef(null);
  const probeSeqRef = useRef(0);

  const ensureDefaultElectrum = useCallback(async () => {
    const host = (await AsyncStorage.getItem(AppStorage.ELECTRUM_HOST)) || '';
    if (!host) {
      await AsyncStorage.setItem(AppStorage.ELECTRUM_HOST, DEFAULT_NODE.host);
      await AsyncStorage.setItem(AppStorage.ELECTRUM_SSL_PORT, DEFAULT_NODE.ssl);
      await AsyncStorage.setItem(AppStorage.ELECTRUM_TCP_PORT, DEFAULT_NODE.tcp || '');
    }
  }, []);

  useEffect(() => {
    ensureDefaultElectrum();
  }, [ensureDefaultElectrum]);

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
      })();
      true;
    `);
  }, []);

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
        await ensureDefaultElectrum();
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

        if (isCacheFresh()) {
          postToWeb({
            type: 'electrum_probe_cached',
            seq: mySeq,
            ts: lastProbeCache.ts,
            cooldownLeftSec: secondsLeft(),
            resultById: lastProbeCache.resultById || {},
          });
          return;
        }

        lastProbeCache = { ts: nowMs(), resultById: {} };
        postToWeb({ type: 'electrum_probe_reset', seq: mySeq, cooldownLeftSec: secondsLeft() });

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

          lastProbeCache.resultById = {
            ...(lastProbeCache.resultById || {}),
            [node.id]: { ok, height },
          };
          lastProbeCache.ts = nowMs();

          postToWeb({
            type: 'electrum_probe_one',
            seq: mySeq,
            id: node.id,
            ok,
            height,
            cooldownLeftSec: secondsLeft(),
          });
        }

        postToWeb({ type: 'electrum_probe_done', seq: mySeq, cooldownLeftSec: secondsLeft() });
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

      if (msg === 'open_wallet') {
        navigation.navigate('Wallets');
        return;
      } else if (msg === 'open_agents' || msg === 'open_getagents') {
        navigation.navigate('GetAgents');
        return;
      } else if (msg === 'open_following') {
        navigation.navigate('Namespaces', { initialTab: 'following' });
        return;
      } else if (msg === 'open_guest_following') {
        navigation.navigate('Namespaces', { initialTab: 'following', openGuest: true });
        return;
      } else if (msg === 'open_readme') {
        navigation.navigate('Readme');
        return;
      }

      // legacy structured messages are ignored now that Get Agents runs as a native screen
    },
    [ensureDefaultElectrum, navigation, postToWeb],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={{ uri: 'file:///android_asset/os/index.html' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleMessage}
        mixedContentMode="always"
      />
    </View>
  );
}
