// \app\screen\data\agentchat_destiny.js
// Destiny (/d) module extracted from agentchat.js

function pickGameLanguage(loc) {
  const lang =
    (loc && typeof loc.getInterfaceLanguage === 'function' && loc.getInterfaceLanguage()) ||
    (loc && typeof loc.getLanguage === 'function' && loc.getLanguage()) ||
    'en';

  const normalized = String(lang).toLowerCase().replace('_', '-');
  if (normalized.startsWith('zh-hant') || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) return 'Traditional Chinese';
  if (normalized.startsWith('zh')) return 'Simplified Chinese';
  if (normalized.startsWith('ja')) return 'Japanese';
  return 'English';
}

function languageNameFromCode(code) {
  const normalized = String(code || '').toLowerCase();
  switch (normalized) {
    case 'zh-cn':
      return 'Simplified Chinese';
    case 'zh-tw':
      return 'Traditional Chinese';
    case 'ja':
      return 'Japanese';
    case 'ko':
      return 'Korean';
    case 'es':
      return 'Spanish';
    case 'fr':
      return 'French';
    case 'de':
      return 'German';
    case 'pt-br':
      return 'Portuguese (Brazil)';
    case 'ru':
      return 'Russian';
    case 'en':
    default:
      return 'English';
  }
}

function removeLanguageHandshake(seedPrompt) {
  return String(seedPrompt || '')
    .replace(/LANGUAGE HANDSHAKE \(BEFORE THE GAME STARTS\):[\s\S]*?\n\nGAME LOOP OUTLINE:/, 'GAME LOOP OUTLINE:')
    .trim();
}

function isLLMActive(chat) {
  const cfg = chat?.currentLLMConfig || chat?.state?.llmConfig;
  const active = cfg?.activeProvider?.name || cfg?.activeProviderName || cfg?.provider || cfg?.name;
  return Boolean(active && typeof chat?.replyFromLLM === 'function');
}

async function handleDestinyCommand(chat, deps) {
  const { buildDestinySeedPrompt, loc, storyLangCode } = deps || {};
  if (typeof buildDestinySeedPrompt !== 'function') {
    chat.replyFromAgent('Destiny module deps missing.');
    return;
  }

  const params = chat?.props?.navigation?.state?.params || {};
  const { namespaceId, shortCode } = params || {};
  const agentId = shortCode || namespaceId;

  const seedPrompt = buildDestinySeedPrompt(agentId);

  if (isLLMActive(chat)) {
    const lockedLanguage = storyLangCode ? languageNameFromCode(storyLangCode) : pickGameLanguage(loc);
    const autostartHeader =
      'IMPORTANT:\n' +
      `- Language: ${lockedLanguage}. Reply only in ${lockedLanguage}.\n` +
      '- Do NOT ask the player to choose a language.\n' +
      '- Start the interactive game immediately.\n\n';

    chat.replyFromAgent('Starting Destiny run…');
    await chat.replyFromLLM(autostartHeader + removeLanguageHandshake(seedPrompt), null, { silentUser: true });
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
