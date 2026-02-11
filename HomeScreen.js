// HomeScreen.js (clean, no debug toolbar)
import React, { useCallback, useEffect, useRef } from 'react';
import { View, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { WebView } from 'react-native-webview';
import { useNavigation } from 'react-navigation-hooks';
import BlueElectrum from './BlueElectrum';
import { AppStorage } from './class';

const ELECTRUM_INIT_FLAG = 'ELECTRUM_INIT_DONE_V1';

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

export default function HomeScreen() {
  const navigation = useNavigation();
  const webviewRef = useRef(null);
  const probeSeqRef = useRef(0);

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

        // 2分钟内：只回缓存，不做任何连接
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

        // 新一轮探测：先 reset（灰），允许逐个点亮
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

        // 全部检测完毕后：一次性写缓存并开始 2 分钟冷却
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
    [navigation, postToWeb],
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
