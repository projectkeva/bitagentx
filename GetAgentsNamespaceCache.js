import AsyncStorage from '@react-native-community/async-storage';

const STORAGE_KEY = 'getagents_pending_namespace_txs';

function sanitizeEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const unique = new Map();
  const now = Date.now();
  entries.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const txid = typeof entry.txid === 'string' ? entry.txid.trim() : '';
    if (!txid) {
      return;
    }
    if (unique.has(txid)) {
      return;
    }
    unique.set(txid, {
      txid,
      namespaceId:
        typeof entry.namespaceId === 'string' && entry.namespaceId.trim().length > 0
          ? entry.namespaceId.trim()
          : null,
      createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : now,
    });
  });
  return Array.from(unique.values());
}

async function persistEntries(entries) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('GetAgentsNamespaceCache: failed to persist pending tx cache', error);
  }
}

export async function getPendingGetAgentsNamespaceTxs() {
  let raw;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('GetAgentsNamespaceCache: failed to read pending tx cache', error);
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeEntries(parsed);
    if (sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      await persistEntries(sanitized);
    }
    return sanitized;
  } catch (error) {
    console.warn('GetAgentsNamespaceCache: failed to parse pending tx cache', error);
    await persistEntries([]);
    return [];
  }
}

export async function setPendingGetAgentsNamespaceTxs(entries) {
  const sanitized = sanitizeEntries(entries);
  await persistEntries(sanitized);
  return sanitized;
}

export async function addPendingGetAgentsNamespaceTx(txid, namespaceId = null) {
  const normalizedTxid = typeof txid === 'string' ? txid.trim() : '';
  if (!normalizedTxid) {
    return;
  }
  const currentEntries = await getPendingGetAgentsNamespaceTxs();
  if (currentEntries.find(entry => entry.txid === normalizedTxid)) {
    return;
  }
  const updated = [
    ...currentEntries,
    {
      txid: normalizedTxid,
      namespaceId: typeof namespaceId === 'string' && namespaceId.trim().length > 0 ? namespaceId.trim() : null,
      createdAt: Date.now(),
    },
  ];
  await setPendingGetAgentsNamespaceTxs(updated);
}

export async function removePendingGetAgentsNamespaceTxs(txids) {
  if (!Array.isArray(txids) || txids.length === 0) {
    return;
  }
  const normalized = txids
    .map(id => (typeof id === 'string' ? id.trim() : ''))
    .filter(id => id.length > 0);
  if (normalized.length === 0) {
    return;
  }
  const uniqueIds = new Set(normalized);
  const currentEntries = await getPendingGetAgentsNamespaceTxs();
  if (currentEntries.length === 0) {
    return;
  }
  const filtered = currentEntries.filter(entry => !uniqueIds.has(entry.txid));
  if (filtered.length === currentEntries.length) {
    return;
  }
  await setPendingGetAgentsNamespaceTxs(filtered);
}
