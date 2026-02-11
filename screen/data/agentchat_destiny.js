// \app\screen\data\agentchat_destiny.js
// Destiny (/d) module extracted from agentchat.js

function pickGameLanguage(loc) {
  const lang =
    (loc && typeof loc.getInterfaceLanguage === 'function' && loc.getInterfaceLanguage()) ||
    (loc && typeof loc.getLanguage === 'function' && loc.getLanguage()) ||
    'en';

  const normalized = String(lang).toLowerCase().replace('_', '-');
  if (normalized.startsWith('zh-hant') || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) return '繁體中文';
  if (normalized.startsWith('zh')) return '简体中文';
  return 'English';
}

function isLLMActive(chat) {
  const cfg = chat?.currentLLMConfig || chat?.state?.llmConfig;
  const active = cfg?.activeProvider?.name || cfg?.activeProviderName || cfg?.provider || cfg?.name;
  return Boolean(active && typeof chat?.replyFromLLM === 'function');
}

async function handleDestinyCommand(chat, deps) {
  const { buildDestinySeedPrompt, loc } = deps || {};
  if (typeof buildDestinySeedPrompt !== 'function') {
    chat.replyFromAgent('Destiny module deps missing.');
    return;
  }

  const params = chat?.props?.navigation?.state?.params || {};
  const { namespaceId, shortCode } = params || {};
  const agentId = shortCode || namespaceId;

  const seedPrompt = buildDestinySeedPrompt(agentId);

  if (isLLMActive(chat)) {
    const uiLang = pickGameLanguage(loc);
    const autostartHeader =
      'IMPORTANT:\n' +
      `- Use ${uiLang} for the entire run (follow the app/system language).\n` +
      '- Do NOT ask the player to choose a language.\n' +
      '- Start the interactive game immediately.\n\n';

    chat.replyFromAgent('Starting Destiny run…');
    await chat.replyFromLLM(autostartHeader + seedPrompt, null, { silentUser: true });
    return;
  }

  const cardText = `Destiny Seed Card\nAgent ID: ${agentId || 'Unknown'}\nReady to copy the full card.`;

  chat.replyFromAgentSeedCard(cardText, seedPrompt);
  chat.replyFromAgent(
    'Click the link above to copy. Paste into GPT, Grok, DeepSeek, or any base model to start the Interactive Destiny story game. When you finish the run, paste the result here to commit it on-chain for your next level. Have fun!',
  );
}

module.exports = {
  handleDestinyCommand,
};
