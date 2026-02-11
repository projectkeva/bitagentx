// app/screen/data/agentchat_chain.js
// Attach chain / on-chain / namespace related handlers onto AgentChat instance.

export function attachAgentChatChain(agent, deps = {}) {
  if (!agent) return;

  const BlueElectrum = deps.BlueElectrum || agent.BlueElectrum;
  const BlueApp = deps.BlueApp || agent.BlueApp;

  // ---- namespace context helpers ----
  agent.resolveNamespaceContext = agent.resolveNamespaceContext || (() => {
    const { navigation } = agent.props;
    const { namespaceId, shortCode } = navigation.state.params || {};
    if (!namespaceId) return null;

    const namespace = agent.getNamespaceById ? agent.getNamespaceById(namespaceId) : null;
    const resolvedNamespaceId = namespace?.namespaceId || namespaceId;

    const scriptHash = namespace?.rootAddress
      ? agent.toScriptHash(namespace.rootAddress)
      : agent.getNamespaceScriptHash(resolvedNamespaceId);

    const agentId = shortCode || resolvedNamespaceId;

    return { agentId, namespace, namespaceId: resolvedNamespaceId, scriptHash };
  });

  // ---- fetch namespace keyvalues ----
  agent.fetchNamespaceKeyValues = agent.fetchNamespaceKeyValues || (async () => {
    const context = agent.resolveNamespaceContext();
    if (!context) return null;

    try {
      await BlueElectrum.ping();
      const response = await BlueElectrum.blockchainKeva_getKeyValues(context.scriptHash, -1);
      const keyvalues = Array.isArray(response) ? response : response?.keyvalues || [];
      const decoded = keyvalues.map(agent.decodeKeyValueEntry);
      return { context, keyvalues: decoded };
    } catch (error) {
      console.warn('AgentChat(chain): failed to fetch keyvalues', error);
      return null;
    }
  });

  agent.fetchLatestKeyValue = agent.fetchLatestKeyValue || (async keyName => {
    const data = await agent.fetchNamespaceKeyValues();
    if (!data?.keyvalues?.length) return null;

    const entry = data.keyvalues
      .slice()
      .reverse()
      .find(item => item?.key === keyName);

    if (!entry) return null;

    if (typeof entry.value === 'string') return entry.value;
    if (entry.value === null || typeof entry.value === 'undefined') return '';
    return String(entry.value || '');
  });

  // ---- welcome ----
  agent.fetchWelcomeValue = agent.fetchWelcomeValue || (async () => {
    try {
      const data = await agent.fetchNamespaceKeyValues();
      if (!data?.keyvalues?.length) return null;

      const welcomeEntry = data.keyvalues
        .slice()
        .reverse()
        .find(entry => entry?.key === 'welcome' && entry.value);

      if (!welcomeEntry) return null;

      const parsedValue = agent.parseWelcomeEnvelope(welcomeEntry.value);
      const welcomeText =
        typeof parsedValue === 'string' ? parsedValue.trim() : String(parsedValue || '').trim();

      return welcomeText || null;
    } catch (error) {
      console.warn('AgentChat(chain): failed to load welcome message', error);
      return null;
    }
  });

  agent.handleWelcomeLookup = agent.handleWelcomeLookup || (async () => {
    const welcomeText = await agent.fetchWelcomeValue();
    if (welcomeText) {
      agent.replyFromAgent(welcomeText);
      return;
    }
    agent.replyFromAgent(agent.getCommandUsageMessage('welcome'));
  });

  agent.handleWelcomeCommand = agent.handleWelcomeCommand || (async rawValue => {
    const { navigation } = agent.props;
    const { namespaceId, walletId } = navigation.state.params || {};

    const value = rawValue.trim().slice(0, 1000);
    if (!value) {
      agent.replyFromAgent('Welcome message is empty.');
      return;
    }

    if (!namespaceId || !walletId) {
      agent.replyFromAgent('Missing namespace or wallet information to save welcome message.');
      return;
    }

    const wallet = BlueApp.getWallets().find(w => w.getID() === walletId);
    if (!wallet) {
      agent.replyFromAgent('Wallet not found for this agent.');
      return;
    }

    // 这里复用你原来 agentchat.js 里的保存逻辑（updateKeyValue / createKevaTx 等）
    // 只要 agent.updateKeyValue / agent.submitKeyValue 等函数仍在 agentchat.js 里即可。
    if (!agent.updateKeyValue) {
      agent.replyFromAgent('Chain writer is not available (updateKeyValue missing).');
      return;
    }

    try {
      await agent.updateKeyValue({
        wallet,
        namespaceId,
        key: 'welcome',
        value,
      });
      agent.replyFromAgent('Saved welcome message on-chain.');
    } catch (e) {
      console.warn('AgentChat(chain): failed to save welcome', e);
      agent.replyFromAgent('Failed to save welcome message.');
    }
  });

  // ---- current block ----
  agent.replyWithCurrentBlock = agent.replyWithCurrentBlock || (async () => {
    try {
      await BlueElectrum.ping();
      const height = await BlueElectrum.blockchainHeaders_subscribe();
      // 你的工程里这个 subscribe 可能返回对象或 height，按你原实现格式化即可
      const block =
        typeof height === 'number'
          ? height
          : typeof height?.height === 'number'
            ? height.height
            : null;

      agent.replyFromAgent(block ? `CURRENT_BLOCK = ${block}` : 'Failed to fetch CURRENT_BLOCK.');
    } catch (e) {
      console.warn('AgentChat(chain): failed to get current block', e);
      agent.replyFromAgent('Failed to fetch CURRENT_BLOCK.');
    }
  });

  // ---- avatar press => open submit ----
  agent.handleAvatarPress = agent.handleAvatarPress || (async messageText => {
    // 这里保持你现有逻辑：点头像打开提交表单/写链
    // 如果你原来是 navigation.navigate('KevaSubmit', ...) 之类，把原实现整段搬来即可。
    if (!agent.openSubmitFromMessage) {
      // 最保守：如果你还没拆 submit writer，就保持原 agentchat.js 的实现不动；
      // 这里只给一个兜底提示，避免崩。
      agent.replyFromAgent('Submit UI is not wired yet.');
      return;
    }
    agent.openSubmitFromMessage(messageText);
  });

  // ---- command dispatcher for chain ----
  agent.handleChainCommand = agent.handleChainCommand || (async trimmed => {
    const lower = trimmed.toLowerCase();

    // /welcome
    if (/^\/welcome\b/.test(lower)) {
      const payload = trimmed.replace(/^\/welcome\b/i, '').trim();
      if (payload) await agent.handleWelcomeCommand(payload);
      else await agent.handleWelcomeLookup();
      return true;
    }

    // /block
    if (/^\/block\b/.test(lower)) {
      await agent.replyWithCurrentBlock();
      return true;
    }

    return false;
  });
}
