const stripFence = value => String(value || '')
  .trim()
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/```$/i, '')
  .trim();

const compactLine = value => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\x00-\x1F\x7F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeList = value => {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return source
    .map(item => compactLine(String(item || '').replace(/^[-•*\d.、)）\s]+/, '')))
    .filter(Boolean)
    .slice(0, 8)
    .map(item => `- ${item}`)
    .join('\n');
};

const firstUsefulLine = text => String(text || '')
  .split(/\r?\n/)
  .map(compactLine)
  .find(Boolean) || '';

export const buildRoleFragmentImportPrompt = ({ fragment, roleLang = 'en', languageInstruction = '' } = {}) => {
  const safeFragment = String(fragment || '').trim();
  const langLine = languageInstruction || `Output language: ${roleLang || 'en'}.`;
  return [
    'You are creating an xKEVA role from a user-provided character fragment.',
    langLine,
    '',
    'Analyze the fragment and create one coherent role profile.',
    'Return JSON only. No markdown, no explanation.',
    '',
    'JSON schema:',
    '{',
    '  "roleName": "short role name",',
    '  "verified": ["facts explicitly present in the fragment"],',
    '  "likely": ["careful high-probability inferences from the fragment"],',
    '  "fog": ["dreamlike fragments, uncertain memories, imagery, unresolved clues"]',
    '}',
    '',
    'Rules:',
    '- roleName must be short, memorable, and suitable as a chat role name.',
    '- verified must not invent facts beyond the fragment.',
    '- likely may infer style/function/relationships, but mark uncertainty through wording.',
    '- fog should preserve atmosphere, symbols, trauma, mysteries, or broken memories.',
    '- Keep each item concise.',
    '',
    'CHARACTER FRAGMENT:',
    safeFragment,
  ].join('\n');
};

export const parseRoleFragmentImportResult = ({ raw, fragment, fallbackName = 'Imported Role' } = {}) => {
  const text = stripFence(raw);
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch {}
    }
  }

  const roleName = compactLine(parsed?.roleName || parsed?.name || fallbackName || firstUsefulLine(fragment) || 'Imported Role')
    .replace(/^ROLE\s*=\s*/i, '')
    .slice(0, 60)
    .trim() || 'Imported Role';

  const fragmentLine = firstUsefulLine(fragment);
  const verified = normalizeList(parsed?.verified || parsed?.facts || (fragmentLine ? [fragmentLine] : []));
  const likely = normalizeList(parsed?.likely || parsed?.inferred || []);
  const fog = normalizeList(parsed?.fog || parsed?.fragments || parsed?.mystery || []);

  return {
    roleName,
    memoryLayers: {
      verified,
      likely,
      fog,
    },
  };
};
