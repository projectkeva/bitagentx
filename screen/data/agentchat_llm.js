// app/screen/data/agentchat_llm.js
// Attach LLM provider registry + /a command + LLM chat calls onto AgentChat instance.

import RNFS from 'react-native-fs';

export function attachAgentChatLLM(agent, deps) {
  if (!agent) return;

  const {
    loc,
    LLM_DIR,
    LLM_BUILTIN_PATH,
    LLM_CUSTOM_PATH,
    LLM_ACTIVE_PATH,
    LLM_LAST_USED_PATH,
    LLM_PROVIDERS,
    DEFAULT_AUTH_HEADER,
    LLM_HISTORY_LIMIT,
    getTodayDateString,
  } = deps || {};

  // ---- file helpers ----
  agent.readJsonFile =
    agent.readJsonFile ||
    (async path => {
      try {
        const exists = await RNFS.exists(path);
        if (!exists) return { __missing: true, __parseError: false, value: null };

        const raw = await RNFS.readFile(path, 'utf8');
        try {
          return { __missing: false, __parseError: false, value: JSON.parse(raw) };
        } catch (parseError) {
          const backup = `${path}.broken`;
          try {
            await RNFS.writeFile(backup, raw || '', 'utf8');
          } catch (_) {}
          console.warn('JSON parse failed; kept original file; backup created', { path, backup, parseError });
          return { __missing: false, __parseError: true, value: null };
        }
      } catch (e) {
        return { __missing: false, __parseError: true, value: null };
      }
    });

  agent.writeJsonFile =
    agent.writeJsonFile ||
    (async (path, data) => {
      const tmpPath = `${path}.tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const json = JSON.stringify(data, null, 2);
      try {
        await RNFS.writeFile(tmpPath, json, 'utf8');
        const exists = await RNFS.exists(path);
        if (exists) {
          try {
            await RNFS.unlink(path);
          } catch (_) {}
        }
        await RNFS.moveFile(tmpPath, path);
        return true;
      } catch (error) {
        console.warn('writeJsonFile failed', { path, error });
        try {
          await RNFS.unlink(tmpPath);
        } catch (_) {}
        return false;
      }
    });

  agent.readActiveProvider =
    agent.readActiveProvider ||
    (async () => {
      const r = await agent.readJsonFile(LLM_ACTIVE_PATH);
      return r && r.value ? r.value : null;
    });

  agent.writeActiveProvider =
    agent.writeActiveProvider ||
    (async active => agent.writeJsonFile(LLM_ACTIVE_PATH, active || {}));

  agent.clearActiveProvider =
    agent.clearActiveProvider ||
    (async () => {
      try {
        await RNFS.unlink(LLM_ACTIVE_PATH);
      } catch (_) {}
    });

  agent.readBuiltinRegistry =
    agent.readBuiltinRegistry ||
    (async () => {
      const r = await agent.readJsonFile(LLM_BUILTIN_PATH);
      const obj = r.value;
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    });

  agent.writeBuiltinRegistry =
    agent.writeBuiltinRegistry ||
    (async registry => agent.writeJsonFile(LLM_BUILTIN_PATH, registry || {}));

  agent.readCustomRegistry =
    agent.readCustomRegistry ||
    (async () => {
      const r = await agent.readJsonFile(LLM_CUSTOM_PATH);
      const obj = r.value;
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    });

  agent.writeCustomRegistry =
    agent.writeCustomRegistry ||
    (async registry => agent.writeJsonFile(LLM_CUSTOM_PATH, registry || {}));

  agent.loadMergedRegistry =
    agent.loadMergedRegistry ||
    (async () => {
      const [builtin, custom] = await Promise.all([agent.readBuiltinRegistry(), agent.readCustomRegistry()]);
      return { ...(builtin || {}), ...(custom || {}) };
    });

  agent.isBuiltinProvider = agent.isBuiltinProvider || (name => !!LLM_PROVIDERS[String(name || '').toLowerCase()]);

  agent.loadLLMConfig =
    agent.loadLLMConfig ||
    (async () => {
      try {
        const active = await agent.readActiveProvider();
        const providerName = String(active?.name || '').toLowerCase();
        if (!providerName) return null;

        const merged = await agent.loadMergedRegistry();
        const override = merged?.[providerName] || {};
        const builtinDef = LLM_PROVIDERS[providerName] || null;
        const baseUrl = String(override.baseUrl || builtinDef?.baseUrl || '')
          .trim()
          .replace(/\/$/, '');
        if (!baseUrl) return null;

        return {
          provider: providerName,
          baseUrl,
          apiKey: override.apiKey || '',
          model: override.model || (builtinDef?.defaultModel || 'default'),
          updatedAt: override.updatedAt || Date.now(),
        };
      } catch (error) {
        console.warn('Failed to load llm config', error);
        return null;
      }
    });

  agent.saveLLMConfig =
    agent.saveLLMConfig ||
    (async config => {
      agent.currentLLMConfig = config;
      const name = String(config.provider || '').toLowerCase();
      const entry = {
        baseUrl: String(config.baseUrl || '').trim().replace(/\/$/, ''),
        apiKey: config.apiKey || '',
        model: config.model || 'default',
        updatedAt: Date.now(),
      };

      if (agent.isBuiltinProvider(name)) {
        const reg = await agent.readBuiltinRegistry();
        reg[name] = { ...(reg[name] || {}), ...entry };
        await agent.writeBuiltinRegistry(reg);
      } else {
        const reg = await agent.readCustomRegistry();
        reg[name] = { ...(reg[name] || {}), ...entry };
        await agent.writeCustomRegistry(reg);
      }
    });

  agent.clearLLMConfig =
    agent.clearLLMConfig ||
    (async () => {
      agent.setState({ llmConfig: null });
      agent.currentLLMConfig = null;
    });

  agent.fetchOpenAICompatModels =
    agent.fetchOpenAICompatModels ||
    (async (baseUrl, apiKey, authHeaderFn) => {
      const root = String(baseUrl || '').replace(/\/$/, '');
      if (!root) return [];
      const headers = {
        'Content-Type': 'application/json',
        ...(authHeaderFn
          ? authHeaderFn(apiKey)
          : apiKey
            ? { Authorization: `Bearer ${apiKey}` }
            : {}),
      };
      try {
        const resp = await fetch(`${root}/models`, { method: 'GET', headers });
        const json = await resp.json().catch(() => ({}));
        const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
        const models = [];
        const seen = new Set();
        list.forEach(entry => {
          const id = typeof entry === 'string' ? entry : entry?.id;
          if (!id || seen.has(id)) return;
          seen.add(id);
          models.push(id);
        });
        return models.slice(0, 30);
      } catch (error) {
        console.warn('Failed to fetch openai compatible models', error);
        return [];
      }
    });

  agent.resolveProviderDef =
    agent.resolveProviderDef ||
    (async name => {
      const normalized = String(name || '').toLowerCase();
      if (!normalized) return null;

      const builtinReg = await agent.readBuiltinRegistry();
      const customReg = await agent.readCustomRegistry();
      const entryBuiltin = builtinReg?.[normalized];
      const entryCustom = customReg?.[normalized];

      if (LLM_PROVIDERS[normalized]) {
        const baseUrlOverride = entryBuiltin?.baseUrl ? String(entryBuiltin.baseUrl).trim().replace(/\/$/, '') : '';
        return {
          name: normalized,
          def: {
            ...LLM_PROVIDERS[normalized],
            baseUrl: baseUrlOverride || LLM_PROVIDERS[normalized].baseUrl,
          },
          source: baseUrlOverride ? 'builtin_override' : 'builtin',
        };
      }

      if (entryCustom && entryCustom.baseUrl) {
        return {
          name: normalized,
          def: {
            kind: 'openai_compat',
            baseUrl: entryCustom.baseUrl,
            defaultModel: 'default',
            authHeader: DEFAULT_AUTH_HEADER,
          },
          source: 'custom',
        };
      }

      return null;
    });

  agent.applyProviderConfig =
    agent.applyProviderConfig ||
    (async ({
      providerName,
      providerDef,
      registryEntry,
      llmConfig,
      baseUrlOverride,
      apiKeyOverride,
      modelOverride,
      startup = false,
    }) => {
      const baseUrl = String(
        baseUrlOverride || registryEntry?.baseUrl || providerDef?.baseUrl || llmConfig?.baseUrl || '',
      )
        .trim()
        .replace(/\/$/, '');
      const apiKey =
        apiKeyOverride ||
        registryEntry?.apiKey ||
        (llmConfig?.provider === providerName ? llmConfig?.apiKey : '') ||
        '';
      if (!baseUrl) throw new Error('Missing baseUrl');

      const models = await agent.fetchOpenAICompatModels(baseUrl, apiKey, providerDef?.authHeader);
      if (models.length === 0) {
        if (!apiKey) throw new Error('Missing api key');
        throw new Error('Failed to load models');
      }

      const selectedModel =
        modelOverride ||
        (llmConfig && llmConfig.provider === providerName ? llmConfig.model : '') ||
        models[0] ||
        providerDef?.defaultModel ||
        'default';

      const next = { provider: providerName, baseUrl, apiKey, model: selectedModel, updatedAt: Date.now() };
      agent.setState({ llmConfig: next });
      await agent.saveLLMConfig(next);
      await agent.writeActiveProvider({ name: providerName, updatedAt: Date.now() });
      await agent.writeJsonFile(LLM_LAST_USED_PATH, {
        provider: String(providerName || '').trim().toLowerCase(),
        baseUrl: String(baseUrl || providerDef?.baseUrl || '').trim().replace(/\/$/, ''),
        apiKey: String(apiKey || '').trim(),
        model: String(selectedModel || providerDef?.defaultModel || 'default').trim(),
        updatedAt: Date.now(),
      });

      agent.currentLLMConfig = next;

      const modeLabel = apiKey ? 'cloud' : 'local';
      const hello = startup
        ? `Provider restored: ${providerName} (${modeLabel})`
        : `Provider loaded: ${providerName} (${modeLabel}) model=${selectedModel}`;

      if (startup) {
        agent.replyFromAgent(hello);
      } else {
        const today = typeof getTodayDateString === 'function' ? getTodayDateString() : new Date().toISOString().slice(0, 10);
        const modelLines = models.map(modelId => `${today}  [[/a model ${modelId}|${modelId}]]`);
        agent.replyFromAgent(`${hello}\nEndpoint: ${baseUrl}\nSelect model:\n${modelLines.join('\n')}`);
      }

      return { models, selectedModel, baseUrl, apiKey };
    });

  agent.restoreProviderFromDisk =
    agent.restoreProviderFromDisk ||
    (async () => {
      const snapRead = await agent.readJsonFile(LLM_LAST_USED_PATH);
      const snap = snapRead.value;
      if (snap?.provider && snap?.baseUrl) {
        const providerName = String(snap.provider).trim().toLowerCase();
        const resolved = await agent.resolveProviderDef(providerName);
        if (resolved?.def) {
          try {
            await agent.applyProviderConfig({
              providerName,
              providerDef: resolved.def,
              registryEntry: null,
              llmConfig: {
                provider: providerName,
                baseUrl: String(snap.baseUrl || '').trim().replace(/\/$/, ''),
                apiKey: String(snap.apiKey || '').trim(),
                model: String(snap.model || resolved.def.defaultModel || 'default').trim(),
                updatedAt: snap.updatedAt || Date.now(),
              },
              startup: true,
            });
            return;
          } catch (error) {
            console.warn('Failed to restore provider from last used snapshot', error);
          }
        }
      }

      const active = await agent.readActiveProvider();
      if (!active?.name) return;

      const registry = await agent.loadMergedRegistry();
      const resolved = await agent.resolveProviderDef(active.name);
      if (!resolved) return;

      const providerDef = resolved.def;
      const registryEntry = registry?.[active.name] || null;
      const llmConfig = await agent.loadLLMConfig();

      try {
        await agent.applyProviderConfig({
          providerName: active.name,
          providerDef,
          registryEntry,
          llmConfig,
          startup: true,
        });
      } catch (error) {
        const msg = String(error?.message || error || '');
        if (/key/i.test(msg) || /api\s*key/i.test(msg) || /401|403/.test(msg)) {
          agent.replyFromAgent(`Provider "${active.name}" requires a key. Use: /a ${active.name} <key>`);
        } else {
          agent.replyFromAgent(`Failed to restore provider "${active.name}": ${msg || 'unknown error'}`);
        }
      }
    });

  // ---- LLM runtime ----


  const getLLMMessageText = message => {
    if (!message) {
      return '';
    }
    if (message.sender === 'user' && message._modelText) {
      return String(message._modelText);
    }
    return String(message.text || '');
  };
  agent.buildLLMSystemPrompt =
    agent.buildLLMSystemPrompt ||
    (() => {
      const params = agent.props?.navigation?.state?.params || {};
      const name = params.displayName || 'Agent';
      const short = params.shortCode ? `@${params.shortCode}` : '';
      const id = params.shortCode || params.namespaceId || 'unknown';
      return `You are ${name}${short} (Agent ID: ${id}) in xKEVA. Reply naturally, concise when possible.`;
    });

  agent.getRecentChatMessagesForLLM =
    agent.getRecentChatMessagesForLLM ||
    (() => {
      const msgs = (agent.state.allMessages || []).filter(
        message =>
          message &&
          (message.sender === 'user' || message.sender === 'agent') &&
          message.text &&
          !message.pending,
      );
      return msgs.slice(-LLM_HISTORY_LIMIT);
    });

  agent.callOpenAICompatible =
    agent.callOpenAICompatible ||
    (async ({ baseUrl, apiKey, model, systemPrompt, recent, authHeader }) => {
      const url = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...recent.map(message => ({
          role: message.sender === 'user' ? 'user' : 'assistant',
          content: getLLMMessageText(message),
        })),
      ];

      const headers = {
        'Content-Type': 'application/json',
        ...(authHeader ? authHeader(apiKey) : apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      };

      const body = { model, messages, temperature: 0.7, stream: false };

      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(`openai_compat http ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return json?.choices?.[0]?.message?.content ?? '';
    });

  agent.callGemini =
    agent.callGemini ||
    (async ({ baseUrl, apiKey, model, systemPrompt, recent, authHeader }) => {
      const root = String(baseUrl || '').replace(/\/$/, '');
      const url = `${root}/models/${encodeURIComponent(model)}:generateContent`;

      const contents = recent.map(message => ({
        role: message.sender === 'user' ? 'user' : 'model',
        parts: [{ text: getLLMMessageText(message) }],
      }));

      if (contents.length > 0) {
        const first = contents[0];
        if (first.role === 'user' && first.parts?.[0]?.text) {
          first.parts[0].text = `SYSTEM: ${systemPrompt}\n\n${first.parts[0].text}`;
        } else {
          contents.unshift({ role: 'user', parts: [{ text: `SYSTEM: ${systemPrompt}` }] });
        }
      } else {
        contents.push({ role: 'user', parts: [{ text: `SYSTEM: ${systemPrompt}` }] });
      }

      const headers = {
        'Content-Type': 'application/json',
        ...(authHeader ? authHeader(apiKey) : { 'x-goog-api-key': apiKey }),
      };

      const body = { contents };

      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(`gemini http ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }

      const parts = json?.candidates?.[0]?.content?.parts || [];
      return parts.map(part => part?.text || '').join('');
    });

  agent.replyFromLLM =
    agent.replyFromLLM ||
    (async (userText, userMessage = null, options = {}) => {
      const requestId = `${Date.now()}-${Math.random()}`;
      const placeholder = {
        id: `agent-${requestId}`,
        sender: 'agent',
        text: '…',
        pending: true,
        requestId,
        timestamp: Date.now(),
      };
      agent.appendMessage(placeholder);

      try {
        const replyText = await agent._llmComplete({ userText, userMessage, options });
        agent.updateAgentMessage(requestId, replyText);

        const roleSlug = agent.state?.activeRoleSlug || agent.activeRoleSlug;
        if (roleSlug && typeof agent.runRoleMemoryUpdate === 'function') {
          agent.runRoleMemoryUpdate(roleSlug, replyText).catch(error => {
            console.warn('Role memory update failed', error);
          });
        }
      } catch (error) {
        console.warn('LLM call failed', error);
        agent.updateAgentMessage(requestId, error?.message || 'LLM call failed.');
      }
    });

  agent._llmComplete =
    agent._llmComplete ||
    (async ({ userText, userMessage = null, options = {} }) => {
      const { silentUser = false, useRecentHistory = true, memoryMode = 'new', condensedMemory = '' } = options || {};

      const cfg = agent.state.llmConfig;
      if (!cfg || !cfg.provider) {
        throw new Error('No cloud model configured. Use: /a <provider> <apikey>');
      }

      const resolved = await agent.resolveProviderDef(cfg.provider);
      if (!resolved) {
        throw new Error('Cloud model provider missing. Re-run /a.');
      }

      const providerDef = resolved.def;
      const baseUrl = cfg.baseUrl || providerDef.baseUrl;
      if (!baseUrl) {
        throw new Error('Provider missing baseUrl. Re-run /a.');
      }

      const requestId = `${Date.now()}-${Math.random()}`;
      const baseSystemPrompt = agent.buildLLMSystemPrompt();
      const storyLangCode =
        (typeof agent.getStoryLangCode === 'function' && agent.getStoryLangCode()) || agent.state?.storyLangCode || null;
      const storyLanguageInstruction =
        storyLangCode && typeof agent.getStoryLanguageInstruction === 'function' ? agent.getStoryLanguageInstruction() : '';
      const memoryInstruction =
        memoryMode === 'continue' && String(condensedMemory || '').trim()
          ? `MEMORY (condensed story so far):\n${String(condensedMemory || '').trim()}`
          : '';
      const systemPrompt = [storyLanguageInstruction, baseSystemPrompt, memoryInstruction].filter(Boolean).join('\n\n');
      let recent = useRecentHistory ? agent.getRecentChatMessagesForLLM() : [];

      if (silentUser) {
        recent.push({
          id: `ephemeral-${requestId}`,
          sender: 'user',
          text: userText,
          timestamp: Date.now(),
        });
      } else if (userMessage && userMessage.id) {
        recent = recent.filter(message => message.id !== userMessage.id);
        recent.push(userMessage);
      } else {
        recent.push({
          id: `ephemeral-${requestId}`,
          sender: 'user',
          text: userText,
          timestamp: Date.now(),
        });
      }

      recent = recent.slice(-LLM_HISTORY_LIMIT);

      let replyText = '';
      if (providerDef.kind === 'openai_compat') {
        replyText = await agent.callOpenAICompatible({
          baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model || providerDef.defaultModel,
          systemPrompt,
          recent,
          authHeader: providerDef.authHeader || DEFAULT_AUTH_HEADER,
        });
      } else if (providerDef.kind === 'gemini') {
        replyText = await agent.callGemini({
          baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model || providerDef.defaultModel,
          systemPrompt,
          recent,
          authHeader: providerDef.authHeader,
        });
      } else {
        throw new Error('Unsupported provider kind.');
      }

      if (!replyText) {
        throw new Error('Model returned empty response.');
      }

      return replyText.trim();
    });

  agent.callLLMSilent =
    agent.callLLMSilent ||
    (async (prompt, options = {}) => {
      const responseText = await agent._llmComplete({
        userText: String(prompt || ''),
        userMessage: null,
        options: {
          silentUser: true,
          useRecentHistory: false,
          ...(options || {}),
        },
      });
      return String(responseText || '').trim();
    });

  // ---- /a command dispatcher ----
  agent.finishAISetupFlow =
    agent.finishAISetupFlow ||
    (async () => {
      if (agent.state?.pendingReturnToRoleMenu && !agent.state?.pendingRoleModelReturnToRole) {
        await new Promise(resolve => agent.setState({ pendingReturnToRoleMenu: false }, resolve));
        await agent.handleTriggers('/role', null);
        return;
      }
      if (agent.state?.pendingReturnToStoryMenu) {
        await new Promise(resolve => agent.setState({ pendingReturnToStoryMenu: false }, resolve));
        await agent.handleTriggers('/d', null);
      }
    });

  agent.resetAISetupState =
    agent.resetAISetupState ||
    (async () => {
      await new Promise(resolve =>
        agent.setState({ pendingAISetup: false, pendingAISetupStep: null, pendingAISetupDraft: null }, resolve),
      );
    });

  agent.useProviderFromList =
    agent.useProviderFromList ||
    (async provider => {
      const resolved = await agent.resolveProviderDef(provider);
      if (!resolved) {
        agent.replyFromAgent('Unknown provider. Try: /a list');
        return;
      }

      const builtinReg = await agent.readBuiltinRegistry();
      const customReg = await agent.readCustomRegistry();
      let registryEntry = resolved.source === 'custom' ? customReg?.[provider] || null : builtinReg?.[provider] || null;

      if (resolved.source !== 'custom') {
        const hasKey = !!String(registryEntry?.apiKey || '').trim();
        if (!hasKey) {
          await new Promise(resolve =>
            agent.setState(
              {
                pendingAISetup: true,
                pendingAISetupStep: 'builtin_key',
                pendingAISetupDraft: { provider },
              },
              resolve,
            ),
          );
          agent.replyFromAgent(`Enter API key for ${provider}:`);
          return;
        }
      } else if (!String(registryEntry?.apiKey || '').trim()) {
        await new Promise(resolve =>
          agent.setState(
            {
              pendingAISetup: true,
              pendingAISetupStep: 'custom_key',
              pendingAISetupDraft: {
                provider,
                customName: registryEntry?.label || provider,
                customUrl: String(registryEntry?.baseUrl || '').trim().replace(/\/$/, ''),
              },
            },
            resolve,
          ),
        );
        agent.replyFromAgent('Enter API key:');
        return;
      }

      const current = agent.currentLLMConfig || agent.state.llmConfig || (await agent.loadLLMConfig());
      try {
        await agent.applyProviderConfig({
          providerName: provider,
          providerDef: resolved.def,
          registryEntry,
          llmConfig: current,
          startup: false,
        });
        await agent.finishAISetupFlow();
      } catch (error) {
        agent.replyFromAgent('Failed to load models. Check baseUrl/key or endpoint compatibility.');
      }
    });

  agent.renderAIProviderList =
    agent.renderAIProviderList ||
    (async () => {
      const cur = agent.currentLLMConfig || agent.state.llmConfig || (await agent.loadLLMConfig());
      const builtinReg = await agent.readBuiltinRegistry();
      const customReg = await agent.readCustomRegistry();

      const USE_COL_WIDTH = 18;
      const pad = (s, n) => String(s).padEnd(n, ' ');
      const statusDot = hasKey => (hasKey ? '🟩' : '🟥');

      const builtinLines = Object.keys(LLM_PROVIDERS).map(name => {
        const hasCurrentKey = cur?.provider === name && !!String(cur?.apiKey || '').trim();
        const hasKey = !!String(builtinReg?.[name]?.apiKey || '').trim() || hasCurrentKey;
        return `${statusDot(hasKey)} ${pad(`[[/a ${name}|use]]`, USE_COL_WIDTH)} ${name}`;
      });

      const customNames = Object.keys(customReg || {}).filter(name => customReg?.[name]?.baseUrl);
      const customLines = customNames.length
        ? customNames.map(name => `${statusDot(!!String(customReg?.[name]?.apiKey || '').trim())} ${pad(`[[/a ${name}|use]]`, USE_COL_WIDTH)} ${customReg?.[name]?.label || name}`)
        : ['(none)'];

      agent.replyFromAgent([
        'Builtin providers:',
        ...builtinLines,
        '',
        'Custom providers:',
        ...customLines,
        '',
        '[[/a addcustom|Add custom model]]',
        '[[/a remove|Remove key]]',
      ].join('\n'));
    });

  agent.renderAIRemoveMenu =
    agent.renderAIRemoveMenu ||
    (async () => {
      const builtinReg = await agent.readBuiltinRegistry();
      const customReg = await agent.readCustomRegistry();
      const builtinLines = Object.keys(LLM_PROVIDERS)
        .filter(name => !!String(builtinReg?.[name]?.apiKey || '').trim())
        .map(name => `[[/a remove builtin ${name}|${name}]]`);
      const customLines = Object.keys(customReg || {}).map(name => `[[/a remove custom ${name}|${customReg?.[name]?.label || name}]]`);
      const lines = ['Remove key / custom model:', '', ...builtinLines, ...customLines];
      if (lines.length <= 2) lines.push('(none)');
      agent.replyFromAgent(lines.join('\n'));
    });

  agent.handlePendingAISetupInput =
    agent.handlePendingAISetupInput ||
    (async trimmed => {
      if (!agent.state?.pendingAISetup || !agent.state?.pendingAISetupStep) return false;
      if (trimmed.startsWith('/')) {
        await agent.resetAISetupState();
        return false;
      }
      const value = String(trimmed || '').trim();
      if (!value) {
        agent.replyFromAgent('(empty input)');
        return true;
      }
      const step = agent.state.pendingAISetupStep;
      const draft = agent.state.pendingAISetupDraft || {};

      if (step === 'builtin_key') {
        const provider = String(draft.provider || '').toLowerCase();
        const builtin = (await agent.readBuiltinRegistry()) || {};
        builtin[provider] = { ...(builtin[provider] || {}), baseUrl: LLM_PROVIDERS[provider]?.baseUrl || '', apiKey: value, updatedAt: Date.now() };
        await agent.writeBuiltinRegistry(builtin);
        await agent.resetAISetupState();
        await agent.useProviderFromList(provider);
        return true;
      }

      if (step === 'custom_name') {
        await new Promise(resolve =>
          agent.setState({ pendingAISetupStep: 'custom_url', pendingAISetupDraft: { ...draft, customName: value } }, resolve),
        );
        agent.replyFromAgent('Enter base URL:');
        return true;
      }

      if (step === 'custom_url') {
        await new Promise(resolve =>
          agent.setState({ pendingAISetupStep: 'custom_key', pendingAISetupDraft: { ...draft, customUrl: value } }, resolve),
        );
        agent.replyFromAgent('Enter API key:');
        return true;
      }

      if (step === 'remove_menu') {
        agent.replyFromAgent('Select an item from the remove menu.');
        return true;
      }

      if (step === 'custom_key') {
        const nameRaw = String(draft.customName || '').trim();
        const provider = String(draft.provider || nameRaw).toLowerCase();
        const baseUrl = String(draft.customUrl || '').trim().replace(/\/$/, '');
        const custom = (await agent.readCustomRegistry()) || {};
        custom[provider] = { ...(custom[provider] || {}), label: nameRaw || provider, baseUrl, apiKey: value, updatedAt: Date.now() };
        await agent.writeCustomRegistry(custom);
        await agent.resetAISetupState();
        await agent.useProviderFromList(provider);
        return true;
      }

      return false;
    });

  agent.handleAIConfigCommand =
    agent.handleAIConfigCommand ||
    (async trimmed => {
      const parts = trimmed.trim().split(/\s+/);
      if (parts.length === 1) {
        const cur = agent.state.llmConfig;
        const curLine = cur ? `Current: ${cur.provider} / ${cur.model || ''}` : 'Current: (none)';
        agent.replyFromAgent(`${curLine}
Usage:
[[/a list|/a list]]
/a <provider> [key] [model]
/a add <provider> <url> [key]
/a del <provider>
/a model <model>
[[/a off|/a off]]`);
        return;
      }

      const sub = String(parts[1] || '').toLowerCase();
      if (sub === 'list') return agent.renderAIProviderList();
      if (sub === 'addcustom') {
        await new Promise(resolve =>
          agent.setState({ pendingAISetup: true, pendingAISetupStep: 'custom_name', pendingAISetupDraft: {} }, resolve),
        );
        agent.replyFromAgent('Enter custom model name:');
        return;
      }
      if (sub === 'remove') {
        const targetType = String(parts[2] || '').toLowerCase();
        const targetName = String(parts[3] || '').toLowerCase();
        if (!targetType || !targetName) {
          await new Promise(resolve =>
            agent.setState({ pendingAISetup: true, pendingAISetupStep: 'remove_menu', pendingAISetupDraft: null }, resolve),
          );
          return agent.renderAIRemoveMenu();
        }
        if (targetType === 'builtin') {
          const builtin = (await agent.readBuiltinRegistry()) || {};
          if (builtin[targetName]) {
            builtin[targetName] = { ...(builtin[targetName] || {}), apiKey: '' };
            await agent.writeBuiltinRegistry(builtin);
          }
        }
        if (targetType === 'custom') {
          const custom = (await agent.readCustomRegistry()) || {};
          if (custom[targetName]) {
            delete custom[targetName];
            await agent.writeCustomRegistry(custom);
          }
        }
        await agent.resetAISetupState();
        const activeProvider = String(agent.state.llmConfig?.provider || agent.currentLLMConfig?.provider || '').toLowerCase();
        if (activeProvider === targetName) {
          await agent.clearLLMConfig();
          await agent.clearActiveProvider();
        }
        await agent.finishAISetupFlow();
        return;
      }

      if (LLM_PROVIDERS[sub]) {
        const keyArg = parts[2] || '';
        if (keyArg) {
          const builtinReg = await agent.readBuiltinRegistry();
          builtinReg[sub] = { ...(builtinReg[sub] || {}), baseUrl: LLM_PROVIDERS[sub].baseUrl, apiKey: keyArg, updatedAt: Date.now() };
          await agent.writeBuiltinRegistry(builtinReg);
        }
        return agent.useProviderFromList(sub);
      }

      const resolved = await agent.resolveProviderDef(sub);
      if (resolved?.source === 'custom') {
        return agent.useProviderFromList(sub);
      }

      // legacy flows
      if (sub === 'model') {
        const model = parts[2];
        if (!model) {
          agent.replyFromAgent('Usage: /a model <model>');
          return;
        }
        let cur = agent.currentLLMConfig || agent.state.llmConfig;
        if (!cur || !cur.provider || !cur.baseUrl) cur = await agent.loadLLMConfig();
        if (!cur || !cur.provider) {
          agent.replyFromAgent('No provider configured. Use: /a list');
          return;
        }
        const next = { ...cur, model };
        agent.setState({ llmConfig: next });
        await agent.saveLLMConfig(next);
        await agent.writeActiveProvider({ name: cur.provider, updatedAt: Date.now() });
        agent.replyFromAgent(`Model selected: ${model}`);
        if (agent?.state?.pendingRoleModelReturnToRole) {
          agent.appendRoleCommandMessage('/role');
          agent.setState({ pendingReturnToRoleMenu: false, pendingModelFinalConfirm: false, pendingRoleModelReturnToRole: false }, () => agent.handleTriggers('/role', null));
          return;
        }
        await agent.finishAISetupFlow();
        return;
      }
      if (sub === 'off' || sub === 'clear') {
        await agent.clearLLMConfig();
        await agent.clearActiveProvider();
        agent.replyFromAgent('Cloud model disabled.');
        return;
      }
      if (sub === 'add') {
        const name = String(parts[2] || '').toLowerCase();
        const baseUrl = String(parts[3] || '').trim().replace(/\/$/, '');
        const apiKey = parts[4] || '';
        if (!name || !/^https?:\/\//i.test(baseUrl)) {
          agent.replyFromAgent('Usage: /a add <provider> <url> [key]');
          return;
        }
        const custom = (await agent.readCustomRegistry()) || {};
        custom[name] = { ...(custom[name] || {}), label: name, baseUrl, apiKey, updatedAt: Date.now() };
        await agent.writeCustomRegistry(custom);
        await agent.renderAIProviderList();
        return;
      }
      if (sub === 'del') {
        const name = String(parts[2] || '').toLowerCase();
        if (!name || LLM_PROVIDERS[name]) {
          agent.replyFromAgent('Usage: /a del <provider>');
          return;
        }
        const custom = (await agent.readCustomRegistry()) || {};
        if (custom[name]) delete custom[name];
        await agent.writeCustomRegistry(custom);
        if (String(agent.state.llmConfig?.provider || agent.currentLLMConfig?.provider || '').toLowerCase() === name) {
          await agent.clearLLMConfig();
          await agent.clearActiveProvider();
        }
        await agent.renderAIProviderList();
        return;
      }

      agent.replyFromAgent('Unknown provider. Try: /a list');
    });

}
