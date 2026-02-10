// \app\screen\data\agentchat_rolecards.js
// Role Memory Cards (/m) module — extracted from agentchat.js

let loc = require('../../loc');

const ROLECARD_KEY_PREFIX = '__ROLECARD__:';
const ROLECARD_INDEX_KEY = '__ROLECARD__INDEX__';
const ROLECARD_MAX_VALUE_BYTES = 2048;
const ROLECARD_MAX_INDEX_LINES = 200;
const ROLECARD_MAX_LIST_COUNT = 20;
const ROLECARD_SLUG_MAX_LENGTH = 48;
const ROLECARD_RESERVED_SLUGS = new Set(['unknown']);

const ROLECARD_MESSAGES = {
  en: {
    usage: 'Usage: /m <role> <card> — save/update a role memory card. Use /m <role> to view, /m del <role> to delete.',
    noCards: 'No role memory cards yet. Use `/m <role> <card>` to save one.',
    listTitle: 'Role Memory Cards (AGENT_ID={agentId})',
    listUse: 'Use:',
    listView: '- m name            (view)',
    listSave: '- m name <memory_card>    (save/update)',
    listDelete: '- m del name        (delete)',
    invalidIndex: 'Index contains invalid lines. Use /m rebuild to repair if needed.',
    reservedSlug: 'Role name "unknown" is reserved. Please choose a different role name.',
    noCardFound: 'No memory card found for "{roleSlug}". Use /m {roleSlug} <card> to save one.',
    missingNamespaceSave: 'Missing namespace or wallet information to save role memory card.',
    missingNamespaceDelete: 'Missing namespace or wallet information to delete role memory card.',
    missingNamespaceRebuild: 'Missing namespace or wallet information to rebuild index.',
    walletNotFound: 'Wallet not found for this agent.',
    emptyCard: 'Memory card text is empty.',
    saveSuccess: 'Role memory card saved for "{roleSlug}".',
    truncated: 'Note: card exceeded 2KB and was truncated.',
    saveFailed: 'Failed to save role memory card.',
    deleteSuccess: 'Role memory card deleted for "{roleSlug}".',
    deleteFailed: 'Failed to delete role memory card.',
    rebuildNone: 'No role memory cards found to rebuild.',
    rebuildSuccess: 'Role memory index rebuilt with {count} entries.',
    rebuildFailed: 'Failed to rebuild role memory index.',
  },
  'zh-cn': {
    usage: '用法：/m <role> <card> — 保存/更新记忆卡；/m <role> 查看；/m del <role> 删除。',
    noCards: '暂无记忆卡，可用 `/m <role> <card>` 保存。',
    listTitle: '记忆卡列表 (AGENT_ID={agentId})',
    listUse: '用法：',
    listView: '- m name            (查看)',
    listSave: '- m name <memory_card>    (保存/更新)',
    listDelete: '- m del name        (删除)',
    invalidIndex: '索引包含无效行。如需修复可使用 /m rebuild。',
    reservedSlug: '角色名 "unknown" 为保留字，请更换角色名。',
    noCardFound: '未找到 "{roleSlug}" 的记忆卡。可用 /m {roleSlug} <card> 保存。',
    missingNamespaceSave: '缺少命名空间或钱包信息，无法保存记忆卡。',
    missingNamespaceDelete: '缺少命名空间或钱包信息，无法删除记忆卡。',
    missingNamespaceRebuild: '缺少命名空间或钱包信息，无法重建索引。',
    walletNotFound: '未找到该 agent 的钱包。',
    emptyCard: '记忆卡内容为空。',
    saveSuccess: '已保存 "{roleSlug}" 的记忆卡。',
    truncated: '注意：记忆卡超过 2KB，已被截断。',
    saveFailed: '保存记忆卡失败。',
    deleteSuccess: '已删除 "{roleSlug}" 的记忆卡。',
    deleteFailed: '删除记忆卡失败。',
    rebuildNone: '没有找到可重建的记忆卡。',
    rebuildSuccess: '已重建记忆卡索引，共 {count} 条。',
    rebuildFailed: '重建记忆卡索引失败。',
  },
  'zh-tw': {
    usage: '用法：/m <role> <card> — 儲存/更新記憶卡；/m <role> 查看；/m del <role> 刪除。',
    noCards: '暫無記憶卡，可用 `/m <role> <card>` 儲存。',
    listTitle: '記憶卡列表 (AGENT_ID={agentId})',
    listUse: '用法：',
    listView: '- m name            (查看)',
    listSave: '- m name <memory_card>    (儲存/更新)',
    listDelete: '- m del name        (刪除)',
    invalidIndex: '索引包含無效行。如需修復可使用 /m rebuild。',
    reservedSlug: '角色名 "unknown" 為保留字，請更換角色名。',
    noCardFound: '未找到 "{roleSlug}" 的記憶卡。可用 /m {roleSlug} <card> 儲存。',
    missingNamespaceSave: '缺少命名空間或錢包資訊，無法儲存記憶卡。',
    missingNamespaceDelete: '缺少命名空間或錢包資訊，無法刪除記憶卡。',
    missingNamespaceRebuild: '缺少命名空間或錢包資訊，無法重建索引。',
    walletNotFound: '未找到該 agent 的錢包。',
    emptyCard: '記憶卡內容為空。',
    saveSuccess: '已儲存 "{roleSlug}" 的記憶卡。',
    truncated: '注意：記憶卡超過 2KB，已被截斷。',
    saveFailed: '儲存記憶卡失敗。',
    deleteSuccess: '已刪除 "{roleSlug}" 的記憶卡。',
    deleteFailed: '刪除記憶卡失敗。',
    rebuildNone: '沒有找到可重建的記憶卡。',
    rebuildSuccess: '已重建記憶卡索引，共 {count} 條。',
    rebuildFailed: '重建記憶卡索引失敗。',
  },
};

const normalizeLocale = locale => (locale || '').toString().trim().toLowerCase().replace('_', '-');
const getLang = () =>
  (loc && typeof loc.getInterfaceLanguage === 'function' && loc.getInterfaceLanguage()) ||
  (loc && typeof loc.getLanguage === 'function' && loc.getLanguage()) ||
  'en';

const getMsg = (key, replacements = {}) => {
  const lang = normalizeLocale(getLang());
  const table = ROLECARD_MESSAGES[lang] || ROLECARD_MESSAGES[lang.split('-')[0]] || ROLECARD_MESSAGES.en;
  let text = (table && table[key]) || ROLECARD_MESSAGES.en[key] || '';
  Object.entries(replacements).forEach(([token, value]) => {
    text = text.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
  });
  return text;
};

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

const normalizeRoleSlug = input => {
  if (!input) return '';
  let slug = String(input).trim().toLowerCase();
  slug = slug.replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').replace(/-+/g, '-');
  if (slug.length > ROLECARD_SLUG_MAX_LENGTH) slug = slug.slice(0, ROLECARD_SLUG_MAX_LENGTH);
  return slug;
};

const truncateToBytes = (text, maxBytes) => {
  const value = String(text || '');
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return { value, truncated: false };
  let truncatedValue = Buffer.from(value, 'utf8').slice(0, maxBytes).toString('utf8');
  while (Buffer.byteLength(truncatedValue, 'utf8') > maxBytes) truncatedValue = truncatedValue.slice(0, -1);
  return { value: truncatedValue, truncated: true };
};

const parseRoleIndexLines = (indexText = '') => {
  const lines = String(indexText || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const entries = [];
  let invalidCount = 0;

  for (const line of lines) {
    if (!line.includes('|')) {
      invalidCount += 1;
      continue;
    }
    const [datePart, rolePart] = line.split('|');
    const roleSlug = String(rolePart || '').trim();
    if (!roleSlug) {
      invalidCount += 1;
      continue;
    }
    entries.push({ date: String(datePart || '').trim(), roleSlug });
  }
  return { entries, invalidCount };
};

const updateRoleIndex = (indexText, roleSlug, dateStr) => {
  const { entries } = parseRoleIndexLines(indexText);
  const lines = [];
  const seen = new Set();

  lines.push(`${dateStr}|${roleSlug}`);
  seen.add(roleSlug);

  for (const entry of entries) {
    if (entry.roleSlug === roleSlug) continue;
    if (seen.has(entry.roleSlug)) continue;
    lines.push(`${entry.date}|${entry.roleSlug}`);
    seen.add(entry.roleSlug);
    if (lines.length >= ROLECARD_MAX_INDEX_LINES) break;
  }

  let result = lines.join('\n');
  while (Buffer.byteLength(result, 'utf8') > ROLECARD_MAX_VALUE_BYTES && lines.length > 0) {
    lines.pop();
    result = lines.join('\n');
  }
  return result;
};

const getNormalizedRoleSlugOrReply = (chat, input) => {
  const roleSlug = normalizeRoleSlug(input);
  if (!roleSlug) {
    chat.replyFromAgent(getMsg('usage'));
    return null;
  }
  if (ROLECARD_RESERVED_SLUGS.has(roleSlug)) {
    chat.replyFromAgent(getMsg('reservedSlug'));
    return null;
  }
  return roleSlug;
};

// Public API
async function handleRoleMemoryList(chat) {
  const indexText = await chat.fetchLatestKeyValue(ROLECARD_INDEX_KEY);
  const context = chat.resolveNamespaceContext();
  const agentId = context?.agentId || 'Unknown';

  if (!indexText) {
    chat.replyFromAgent(getMsg('noCards'));
    return;
  }

  const { entries, invalidCount } = parseRoleIndexLines(indexText);
  if (!entries.length) {
    chat.replyFromAgent(getMsg('noCards'));
    return;
  }

  const lines = [getMsg('listTitle', { agentId })];
  entries.slice(0, ROLECARD_MAX_LIST_COUNT).forEach(entry => {
    lines.push(`${entry.date}  [[/m ${entry.roleSlug}|${entry.roleSlug}]]`);
  });
  lines.push(getMsg('listUse'));
  lines.push(getMsg('listView'));
  lines.push(getMsg('listSave'));
  lines.push(getMsg('listDelete'));
  if (invalidCount > 0) {
    lines.push('');
    lines.push(getMsg('invalidIndex'));
  }
  chat.replyFromAgent(lines.join('\n'));
}

async function handleRoleMemoryView(chat, roleInput) {
  const roleSlug = getNormalizedRoleSlugOrReply(chat, roleInput);
  if (!roleSlug) return;

  const keyName = `${ROLECARD_KEY_PREFIX}${roleSlug}`;
  const value = await chat.fetchLatestKeyValue(keyName);
  if (!value) {
    chat.replyFromAgent(getMsg('noCardFound', { roleSlug }));
    return;
  }
  chat.replyFromAgent(`${value}\n\nStart Roleplay /r ${roleSlug}`);
}

async function handleRoleMemorySave(chat, deps, roleInput, memoryText) {
  const roleSlug = getNormalizedRoleSlugOrReply(chat, roleInput);
  if (!roleSlug) return;

  const { namespaceId, walletId } = chat.props?.navigation?.state?.params || {};
  if (!namespaceId || !walletId) {
    chat.replyFromAgent(getMsg('missingNamespaceSave'));
    return;
  }

  const wallet = deps.BlueApp.getWallets().find(w => w.getID() === walletId);
  if (!wallet) {
    chat.replyFromAgent(getMsg('walletNotFound'));
    return;
  }

  const trimmed = String(memoryText || '').trim();
  if (!trimmed) {
    chat.replyFromAgent(getMsg('emptyCard'));
    return;
  }

  const { value: cardValue, truncated } = truncateToBytes(trimmed, ROLECARD_MAX_VALUE_BYTES);
  const keyName = `${ROLECARD_KEY_PREFIX}${roleSlug}`;
  const today = getTodayDateString();

  try {
    await deps.BlueElectrum.ping();
    if (typeof deps.BlueElectrum.waitTillConnected === 'function') await deps.BlueElectrum.waitTillConnected();

    const { tx } = await deps.updateKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, keyName, cardValue);
    const result = await deps.BlueElectrum.broadcast(tx);
    if (result?.code) throw new Error(result.message || 'Broadcast failed');

    const indexText = (await chat.fetchLatestKeyValue(ROLECARD_INDEX_KEY)) || '';
    const updatedIndex = updateRoleIndex(indexText, roleSlug, today);

    const indexResult = await deps.updateKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, ROLECARD_INDEX_KEY, updatedIndex);
    const indexBroadcast = await deps.BlueElectrum.broadcast(indexResult.tx);
    if (indexBroadcast?.code) throw new Error(indexBroadcast.message || 'Broadcast failed');

    await deps.BlueApp.saveToDisk();

    const responseLines = [getMsg('saveSuccess', { roleSlug })];
    if (truncated) responseLines.push(getMsg('truncated'));
    chat.replyFromAgent(responseLines.join('\n'));
  } catch (e) {
    console.warn('Rolecards: save failed', e);
    chat.replyFromAgent(getMsg('saveFailed'));
  }
}

async function handleRoleMemoryDelete(chat, deps, roleInput) {
  const roleSlug = getNormalizedRoleSlugOrReply(chat, roleInput);
  if (!roleSlug) return;

  const { namespaceId, walletId } = chat.props?.navigation?.state?.params || {};
  if (!namespaceId || !walletId) {
    chat.replyFromAgent(getMsg('missingNamespaceDelete'));
    return;
  }

  const wallet = deps.BlueApp.getWallets().find(w => w.getID() === walletId);
  if (!wallet) {
    chat.replyFromAgent(getMsg('walletNotFound'));
    return;
  }

  const keyName = `${ROLECARD_KEY_PREFIX}${roleSlug}`;

  try {
    await deps.BlueElectrum.ping();
    if (typeof deps.BlueElectrum.waitTillConnected === 'function') await deps.BlueElectrum.waitTillConnected();

    try {
      const { tx } = await deps.deleteKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, keyName);
      const result = await deps.BlueElectrum.broadcast(tx);
      if (result?.code) throw new Error(result.message || 'Broadcast failed');
    } catch (error) {
      // fallback: write empty
      const fallback = await deps.updateKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, keyName, '');
      const fallbackResult = await deps.BlueElectrum.broadcast(fallback.tx);
      if (fallbackResult?.code) throw new Error(fallbackResult.message || 'Broadcast failed');
    }

    const indexText = (await chat.fetchLatestKeyValue(ROLECARD_INDEX_KEY)) || '';
    const { entries } = parseRoleIndexLines(indexText);
    const remaining = entries.filter(entry => entry.roleSlug !== roleSlug);

    let lines = remaining.map(entry => `${entry.date}|${entry.roleSlug}`).slice(0, ROLECARD_MAX_INDEX_LINES);
    let updatedIndex = lines.join('\n');
    while (Buffer.byteLength(updatedIndex, 'utf8') > ROLECARD_MAX_VALUE_BYTES && lines.length > 0) {
      lines.pop();
      updatedIndex = lines.join('\n');
    }

    const indexResult = await deps.updateKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, ROLECARD_INDEX_KEY, updatedIndex);
    const indexBroadcast = await deps.BlueElectrum.broadcast(indexResult.tx);
    if (indexBroadcast?.code) throw new Error(indexBroadcast.message || 'Broadcast failed');

    await deps.BlueApp.saveToDisk();
    chat.replyFromAgent(getMsg('deleteSuccess', { roleSlug }));
  } catch (e) {
    console.warn('Rolecards: delete failed', e);
    chat.replyFromAgent(getMsg('deleteFailed'));
  }
}

async function handleRoleMemoryRebuild(chat, deps) {
  const data = await chat.fetchNamespaceKeyValues();
  if (!data?.keyvalues?.length) {
    chat.replyFromAgent(getMsg('rebuildNone'));
    return;
  }

  const { namespaceId, walletId } = chat.props?.navigation?.state?.params || {};
  if (!namespaceId || !walletId) {
    chat.replyFromAgent(getMsg('missingNamespaceRebuild'));
    return;
  }

  const wallet = deps.BlueApp.getWallets().find(w => w.getID() === walletId);
  if (!wallet) {
    chat.replyFromAgent(getMsg('walletNotFound'));
    return;
  }

  const today = getTodayDateString() || '1970-01-01';
  const entries = [];
  const seen = new Set();

  data.keyvalues
    .slice()
    .reverse()
    .forEach(entry => {
      if (typeof entry?.key !== 'string') return;
      if (!entry.key.startsWith(ROLECARD_KEY_PREFIX)) return;
      if (entry.key === ROLECARD_INDEX_KEY) return;
      const roleSlug = entry.key.slice(ROLECARD_KEY_PREFIX.length).trim();
      if (!roleSlug || seen.has(roleSlug)) return;
      seen.add(roleSlug);
      entries.push(`${today}|${roleSlug}`);
    });

  let lines = entries.slice(0, ROLECARD_MAX_INDEX_LINES);
  let indexValue = lines.join('\n');
  while (Buffer.byteLength(indexValue, 'utf8') > ROLECARD_MAX_VALUE_BYTES && lines.length > 0) {
    lines.pop();
    indexValue = lines.join('\n');
  }

  try {
    await deps.BlueElectrum.ping();
    if (typeof deps.BlueElectrum.waitTillConnected === 'function') await deps.BlueElectrum.waitTillConnected();

    const { tx } = await deps.updateKeyValue(wallet, deps.FALLBACK_DATA_PER_BYTE_FEE, namespaceId, ROLECARD_INDEX_KEY, indexValue);
    const result = await deps.BlueElectrum.broadcast(tx);
    if (result?.code) throw new Error(result.message || 'Broadcast failed');

    await deps.BlueApp.saveToDisk();
    chat.replyFromAgent(getMsg('rebuildSuccess', { count: lines.length }));
  } catch (e) {
    console.warn('Rolecards: rebuild failed', e);
    chat.replyFromAgent(getMsg('rebuildFailed'));
  }
}

async function handleRoleMemoryCommand(chat, deps, trimmed) {
  const args = trimmed.replace(/^\/m\b/i, '').trim();

  if (!args) {
    await handleRoleMemoryList(chat);
    return;
  }

  const delMatch = /^del\s+(.+)/i.exec(args);
  if (delMatch) {
    await handleRoleMemoryDelete(chat, deps, delMatch[1]);
    return;
  }

  if (/^rebuild\b/i.test(args)) {
    await handleRoleMemoryRebuild(chat, deps);
    return;
  }

  const [rolePart, ...rest] = args.split(' ');
  const memoryText = rest.join(' ').trim();
  if (memoryText) {
    await handleRoleMemorySave(chat, deps, rolePart, memoryText);
    return;
  }
  await handleRoleMemoryView(chat, rolePart);
}

module.exports = {
  // constants & helpers (exported for agentchat.js / role integration)
  ROLECARD_KEY_PREFIX,
  ROLECARD_INDEX_KEY,
  ROLECARD_RESERVED_SLUGS,
  normalizeRoleSlug,
  parseRoleIndexLines,

  // main handler
  handleRoleMemoryCommand,
};
