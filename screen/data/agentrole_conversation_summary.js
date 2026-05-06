export const DEFAULT_CONVERSATION_SUMMARY = {
  version: 1,
  roleSlug: '',
  updatedAt: 0,
  lastSummarizedAt: 0,
  summaryEpoch: 0,
  facts: [],
  open_loops: [],
  recent_arc: [],
};

export const ensureStringList = (items, limit = 8) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

export const normalizeConversationSummary = (summary, roleSlug = '') => {
  const base = summary && typeof summary === 'object' ? summary : {};
  return {
    version: 1,
    roleSlug: String(base.roleSlug || roleSlug || '').trim(),
    updatedAt: Number(base.updatedAt || 0),
    lastSummarizedAt: Number(base.lastSummarizedAt || 0),
    summaryEpoch: Number(base.summaryEpoch || 0),
    facts: ensureStringList(base.facts, 12),
    open_loops: ensureStringList(base.open_loops, 8),
    recent_arc: ensureStringList(base.recent_arc, 4),
  };
};
