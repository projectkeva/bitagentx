import RNFS from 'react-native-fs';

export const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/follow_chats`;
const META_FILE = `${CHAT_DIR}/metadata.json`;

const parseConversationIdFromName = name => {
  if (!name || typeof name !== 'string') {
    return null;
  }
  const cleaned = name.replace(/\.json$/, '');
  const [myNamespaceId, peerNamespaceId] = cleaned.split('__');
  if (!myNamespaceId || !peerNamespaceId) {
    return null;
  }
  return { myNamespaceId, peerNamespaceId };
};

export const buildConversationId = (myNamespaceId, peerNamespaceId) => {
  const safeMine = myNamespaceId || 'me';
  const safePeer = peerNamespaceId || 'peer';
  return `${safeMine}__${safePeer}`;
};

export const ensureChatStorage = async () => {
  try {
    const exists = await RNFS.exists(CHAT_DIR);
    if (!exists) {
      await RNFS.mkdir(CHAT_DIR);
    }
    const metaExists = await RNFS.exists(META_FILE);
    if (!metaExists) {
      await RNFS.writeFile(META_FILE, JSON.stringify({}), 'utf8');
    }
  } catch (error) {
    console.warn('Failed to prepare follow chat storage', error);
  }
};

const readMetadataMap = async () => {
  try {
    const exists = await RNFS.exists(META_FILE);
    if (!exists) {
      return {};
    }
    const content = await RNFS.readFile(META_FILE, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read follow chat metadata', error);
  }
  return {};
};

const writeMetadataMap = async map => {
  try {
    await RNFS.writeFile(META_FILE, JSON.stringify(map), 'utf8');
  } catch (error) {
    console.warn('Failed to write follow chat metadata', error);
  }
};

export const getConversationMetadata = async conversationId => {
  if (!conversationId) {
    return null;
  }
  const map = await readMetadataMap();
  return map[conversationId] || null;
};

export const setConversationMetadata = async (conversationId, metadata) => {
  if (!conversationId) {
    return;
  }
  const map = await readMetadataMap();
  map[conversationId] = { ...(map[conversationId] || {}), ...metadata };
  await writeMetadataMap(map);
};

export const removeConversationMetadata = async conversationId => {
  if (!conversationId) {
    return;
  }
  const map = await readMetadataMap();
  if (map[conversationId]) {
    delete map[conversationId];
    await writeMetadataMap(map);
  }
};

export const listConversationMetadataForPeer = async peerNamespaceId => {
  if (!peerNamespaceId) {
    return [];
  }
  const map = await readMetadataMap();
  return Object.entries(map)
    .filter(([, value]) => value?.peerNamespaceId === peerNamespaceId)
    .map(([conversationId, value]) => ({ conversationId, ...value }));
};

export const removeConversationMetadataForPeer = async peerNamespaceId => {
  if (!peerNamespaceId) {
    return;
  }
  const map = await readMetadataMap();
  let changed = false;
  Object.keys(map).forEach(key => {
    if (map[key]?.peerNamespaceId === peerNamespaceId) {
      delete map[key];
      changed = true;
    }
  });
  if (changed) {
    await writeMetadataMap(map);
  }
  await removeChatHistoryForPeer(peerNamespaceId);
};

export const findLatestConversationForPeer = async peerNamespaceId => {
  if (!peerNamespaceId) {
    return null;
  }

  try {
    const exists = await RNFS.exists(CHAT_DIR);
    if (!exists) {
      return null;
    }

    const entries = await RNFS.readDir(CHAT_DIR);
    const normalizedPeer = String(peerNamespaceId);
    let latest = null;

    for (const entry of entries) {
      if (!entry?.isFile() || !entry.name) {
        continue;
      }
      const parsed = parseConversationIdFromName(entry.name);
      if (!parsed || parsed.peerNamespaceId !== normalizedPeer) {
        continue;
      }
      if (!parsed.myNamespaceId) {
        continue;
      }
      if (!latest || (entry.mtime && entry.mtime > latest.mtime)) {
        latest = {
          conversationId: `${parsed.myNamespaceId}__${parsed.peerNamespaceId}`,
          myNamespaceId: parsed.myNamespaceId,
          mtime: entry.mtime,
        };
      }
    }

    if (latest) {
      return { conversationId: latest.conversationId, myNamespaceId: latest.myNamespaceId };
    }
  } catch (error) {
    console.warn('Failed to find local follow chat history', error);
  }

  return null;
};

export const removeChatHistoryForPeer = async peerNamespaceId => {
  if (!peerNamespaceId) {
    return;
  }

  try {
    const exists = await RNFS.exists(CHAT_DIR);
    if (!exists) {
      return;
    }
    const entries = await RNFS.readDir(CHAT_DIR);
    const normalizedPeer = String(peerNamespaceId);
    for (const entry of entries) {
      if (!entry?.isFile() || !entry.name) {
        continue;
      }
      const parsed = parseConversationIdFromName(entry.name);
      if (parsed?.peerNamespaceId === normalizedPeer) {
        try {
          await RNFS.unlink(entry.path);
        } catch (err) {
          console.warn('Failed to remove follow chat history file', entry.path, err);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to clear follow chat history for peer', error);
  }
};
