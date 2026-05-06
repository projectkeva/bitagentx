export const getStoryLLMLanguageName = (code, normalizeStoryLangCode) => {
  switch (normalizeStoryLangCode(code)) {
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
};

export const buildStoryAutostartHeader = languageName =>
  'IMPORTANT:\n' +
  `- Language: ${languageName || 'English'}. Reply only in ${languageName || 'English'}.\n` +
  '- Do NOT ask the player to choose a language.\n' +
  '- Do NOT show setup menus, copy/export instructions, or A/B/C/D confirmation flows.\n' +
  '- Start the interactive game immediately.\n' +
  '- The user is NOT physically in the Story world. The role is the user\'s remote eyes, ears, and on-site actor inside that world.\n' +
  '- Your FIRST reply MUST be a live terminal communication from inside the world, as if the role has just successfully logged in and opened a stable field link back to the user.\n' +
  '- Do NOT write the FIRST reply as literary narration, monologue, diary text, or detached scene-setting prose.\n' +
  '- Do NOT make the FIRST reply sound like system setup text either. It must feel like a real-time field report over comms.\n' +
  '- In the FIRST reply, clearly report: successful login/entry, signal/comms status, what the role currently sees, what is happening nearby, and what action the user wants the role to take next.\n' +
  '- Keep the FIRST reply grounded, sensory, immediate, and interactive, so the user feels present on-site through the role.\n\n';

export const removeStoryLanguageHandshake = seedPrompt =>
  String(seedPrompt || '')
    .replace(/LANGUAGE HANDSHAKE \(BEFORE THE GAME STARTS\):[\s\S]*?\n\nGAME LOOP OUTLINE:/, 'GAME LOOP OUTLINE:')
    .trim();

export const buildStoryLanguageInstruction = ({
  code,
  isStoryScope,
  normalizeStoryLangCode,
  getStoryLangLabel,
} = {}) => {
  if (!isStoryScope || !code) {
    return '';
  }
  const normalizedCode = normalizeStoryLangCode(code);
  switch (normalizedCode) {
    case 'zh-cn':
      return 'Language: Simplified Chinese. Reply only in Simplified Chinese.';
    case 'zh-tw':
      return 'Language: Traditional Chinese. Reply only in Traditional Chinese.';
    case 'ja':
      return 'Language: Japanese. Reply only in Japanese.';
    default: {
      const label = getStoryLangLabel(normalizedCode);
      return `Language: ${label}. Reply only in ${label}.`;
    }
  }
};

export const buildStoryDigestPrompt = ({
  roleLangCode,
  isUser,
  normalizeStoryLangCode,
  getStoryLangLabel,
} = {}) => {
  const normalizedCode = normalizeStoryLangCode(roleLangCode || 'en');
  const languageName = getStoryLLMLanguageName(normalizedCode, normalizeStoryLangCode) || getStoryLangLabel(normalizedCode) || 'English';
  if (isUser) {
    return `You are a summarizer. Generate a short action-style digest in ${languageName} based only on the original text below (max 100 words or equivalent brevity). Remove prompt markers like Option/Choice/A/B/1/2/:. Do not use first-person choice phrases like "I choose." Do not add new information. If the source is a question or small talk, preserve its core intent. Output digest only.`;
  }
  return `You are a summarizer. Generate a short narrative digest in ${languageName} based only on the original text below (max 100 words or equivalent brevity). Compress only; do not add events or facts. Avoid quoted dialogue and prefer declarative narration. Output digest only.`;
};
