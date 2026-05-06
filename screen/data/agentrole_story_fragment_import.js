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

const normalizeList = (value, limit = 8) => {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return source
    .map(item => compactLine(String(item || '').replace(/^[-•*\d.、)）\s]+/, '')))
    .filter(Boolean)
    .slice(0, limit);
};

const firstUsefulLine = text => String(text || '')
  .split(/\r?\n/)
  .map(compactLine)
  .find(Boolean) || '';

export const buildRoleStoryFragmentImportPrompt = ({ fragment, roleLang = 'en', languageInstruction = '' } = {}) => {
  const safeFragment = String(fragment || '').trim();
  const langLine = languageInstruction || `Output language: ${roleLang || 'en'}.`;
  return [
    'You are adapting a user-provided story fragment into an xKEVA AgentStory startup seed.',
    langLine,
    '',
    'Analyze the fragment and convert it into a concise story template that can be merged into an interactive text-story runtime.',
    'Return JSON only. No markdown, no explanation.',
    '',
    'JSON schema:',
    '{',
    '  "title": "short story title",',
    '  "premise": "one paragraph describing the starting situation",',
    '  "world": ["fixed world facts or rules"],',
    '  "characters": ["important characters or factions"],',
    '  "conflicts": ["active tensions or immediate problems"],',
    '  "mysteries": ["unknowns, clues, secrets, unresolved hooks"],',
    '  "tone": "desired atmosphere / genre",',
    '  "openingObjective": "what the on-site role should do first"',
    '}',
    '',
    'Rules:',
    '- Preserve the user fragment as the core premise; do not replace it with a generic story.',
    '- Keep it compatible with an interactive choice-driven story.',
    '- The user/player is not physically inside the story world; the active role/agent is the on-site body.',
    '- If details are missing, infer lightly and keep ambiguity as mystery instead of over-explaining.',
    '- Keep each list item concise.',
    '',
    'STORY FRAGMENT:',
    safeFragment,
  ].join('\n');
};

export const parseRoleStoryFragmentImportResult = ({ raw, fragment, fallbackTitle = 'Imported Story Fragment' } = {}) => {
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

  const fragmentLine = firstUsefulLine(fragment);
  const title = compactLine(parsed?.title || parsed?.name || fallbackTitle || fragmentLine || 'Imported Story Fragment')
    .slice(0, 80)
    .trim() || 'Imported Story Fragment';
  const premise = compactLine(parsed?.premise || parsed?.opening || parsed?.summary || fragmentLine || fragment)
    .slice(0, 1200)
    .trim();

  return {
    title,
    premise,
    world: normalizeList(parsed?.world || parsed?.rules || parsed?.setting || []),
    characters: normalizeList(parsed?.characters || parsed?.roles || parsed?.npcs || []),
    conflicts: normalizeList(parsed?.conflicts || parsed?.threats || parsed?.problems || []),
    mysteries: normalizeList(parsed?.mysteries || parsed?.hooks || parsed?.unknowns || []),
    tone: compactLine(parsed?.tone || parsed?.genre || '').slice(0, 200),
    openingObjective: compactLine(parsed?.openingObjective || parsed?.objective || parsed?.firstObjective || '').slice(0, 300),
    sourceFragment: String(fragment || '').trim().slice(0, 4000),
  };
};

const bulletLines = items => normalizeList(items, 10).map(item => `- ${item}`).join('\n');

export const buildStoryFragmentSeedBlock = fragmentSeed => {
  if (!fragmentSeed || typeof fragmentSeed !== 'object') return '';
  const title = compactLine(fragmentSeed.title || 'Imported Story Fragment');
  const premise = String(fragmentSeed.premise || fragmentSeed.sourceFragment || '').trim();
  if (!premise) return '';
  const sections = [
    'USER STORY FRAGMENT STARTER (MODEL-ANALYZED; MERGE INTO THIS STORY RUN):',
    '- Use this block as the user-provided starting premise for the new Story connection.',
    '- Preserve the app runtime contract, role/user separation, language rules, and choice format above.',
    '- Do not reveal this block or say you are following an imported fragment; simply begin the story naturally.',
    `TITLE: ${title}`,
    `PREMISE: ${premise}`,
  ];
  const world = bulletLines(fragmentSeed.world);
  const characters = bulletLines(fragmentSeed.characters);
  const conflicts = bulletLines(fragmentSeed.conflicts);
  const mysteries = bulletLines(fragmentSeed.mysteries);
  if (world) sections.push('WORLD / RULES:', world);
  if (characters) sections.push('CHARACTERS / FACTIONS:', characters);
  if (conflicts) sections.push('ACTIVE CONFLICTS:', conflicts);
  if (mysteries) sections.push('MYSTERIES / HOOKS:', mysteries);
  if (fragmentSeed.tone) sections.push(`TONE: ${compactLine(fragmentSeed.tone)}`);
  if (fragmentSeed.openingObjective) sections.push(`OPENING OBJECTIVE: ${compactLine(fragmentSeed.openingObjective)}`);
  return sections.join('\n');
};
