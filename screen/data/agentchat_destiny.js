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
  const { buildDestinySeedPrompt, loc, storyLangCode, memoryMode = 'new', condensedMemory = '' } = deps || {};
  if (typeof buildDestinySeedPrompt !== 'function') {
    chat.replyFromAgent('Destiny module deps missing.');
    return;
  }

  if (!isLLMActive(chat)) {
    chat.replyFromAgent('Story now runs only through a loaded model. Use /a to load an LLM, then run /d again.');
    return;
  }

  const params = chat?.props?.navigation?.state?.params || {};
  const { namespaceId, shortCode } = params || {};
  const agentId = shortCode || namespaceId;
  const seedPrompt = buildDestinySeedPrompt(agentId);
  const lockedLanguage = storyLangCode ? languageNameFromCode(storyLangCode) : pickGameLanguage(loc);
  const isFirstTurn = memoryMode !== 'continue';
  const autostartHeader =
    'RUNTIME_HARD_CONSTRAINTS:\n' +
    `- Language: ${lockedLanguage}. Reply only in ${lockedLanguage}.\n` +
    '- Start the interactive game immediately.\n' +
    '- The agent is physically inside the Story world. The user is a remote commander linked through a live comms channel.\n' +
    (isFirstTurn
      ? '- First reply only: open with one short in-character line, then continue as a live comms report from inside the world.\n' +
        '- First reply only: do not write literary narration, monologue, diary text, detached scene-setting prose, or system setup wording.\n' +
        '- First reply only: clearly report successful login/entry, signal/comms status, what the role currently sees, what is happening nearby, and what order the commander wants to give next.\n' +
        '- First reply only: keep it grounded, sensory, immediate, interactive, and framed as a field transmission rather than omniscient narration.\n'
      : '') +
    '\n';

  chat.replyFromAgent(memoryMode === 'continue' ? 'Continuing story from latest records...' : 'Connecting to the All Generative Universe System network…');
  await chat.replyFromLLM(autostartHeader + removeLanguageHandshake(seedPrompt), null, {
    silentUser: true,
    useRecentHistory: memoryMode === 'continue',
    memoryMode,
    condensedMemory,
  });
}

module.exports = {
  handleDestinyCommand,
};

