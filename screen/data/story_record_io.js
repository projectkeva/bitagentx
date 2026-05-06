import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-community/async-storage';
import DocumentPicker from 'react-native-document-picker';

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const EXPORT_SCHEMA = 'xkeva.story.record.v1';
const EXPORT_KIND = 'story-record-export';
const EXPORT_JSON_BEGIN = '===== XKEVA_STORY_RECORD_JSON_BEGIN =====';
const EXPORT_JSON_END = '===== XKEVA_STORY_RECORD_JSON_END =====';

const pad2 = value => String(value).padStart(2, '0');

const compactTimestamp = date => {
  const d = date || new Date();
  return `${String(d.getFullYear()).slice(-2)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;
};

const sanitizeFilePart = value => String(value || '')
  .trim()
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .replace(/\s+/g, ' ')
  .slice(0, 80) || 'story';

const normalizeStoryAgentId = namespace => String(
  namespace?.shortCode ||
  namespace?.namespaceId ||
  namespace?.id ||
  namespace?.agentId ||
  'default'
).trim() || 'default';

const normalizeNamespaceId = namespace => String(namespace?.id || namespace?.namespaceId || '').trim();

const getStoryLangStorageKey = agentId => `story_lang_code_${encodeURIComponent(String(agentId || 'default'))}`;

const getStoryBaseDir = agentId => `${CHAT_DIR}/${encodeURIComponent(String(agentId || 'default'))}`;

export const getStoryRecordDir = namespaceOrAgentId => {
  const agentId = typeof namespaceOrAgentId === 'string'
    ? namespaceOrAgentId
    : normalizeStoryAgentId(namespaceOrAgentId);
  return `${getStoryBaseDir(agentId)}/story`;
};

const ensureDir = async path => {
  if (!path) return;
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
};

const safeRelativePath = value => String(value || '')
  .replace(/\\/g, '/')
  .split('/')
  .filter(part => part && part !== '.' && part !== '..')
  .join('/');

const dirname = path => {
  const normalized = String(path || '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
};

const listTextFilesRecursive = async (rootDir, relativeBase = '') => {
  const exists = await RNFS.exists(rootDir);
  if (!exists) return [];
  const entries = await RNFS.readDir(rootDir);
  const out = [];

  for (const entry of entries) {
    const rel = safeRelativePath(relativeBase ? `${relativeBase}/${entry.name}` : entry.name);
    if (!rel) continue;
    if (entry.isDirectory && entry.isDirectory()) {
      const nested = await listTextFilesRecursive(entry.path, rel);
      out.push(...nested);
    } else if (entry.isFile && entry.isFile()) {
      try {
        const content = await RNFS.readFile(entry.path, 'utf8');
        out.push({ path: rel, encoding: 'utf8', content });
      } catch (error) {
        console.warn('[story_record_io] skipped unreadable story file', { path: entry.path, error: String(error?.message || error) });
      }
    }
  }

  return out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
};

const copyDirRecursive = async (sourceDir, targetDir) => {
  const exists = await RNFS.exists(sourceDir);
  if (!exists) return false;
  await ensureDir(targetDir);
  const entries = await RNFS.readDir(sourceDir);
  for (const entry of entries) {
    const targetPath = `${targetDir}/${entry.name}`;
    if (entry.isDirectory && entry.isDirectory()) {
      await copyDirRecursive(entry.path, targetPath);
    } else if (entry.isFile && entry.isFile()) {
      await RNFS.copyFile(entry.path, targetPath);
    }
  }
  return true;
};

const parseRawStoryMessages = files => {
  const rows = [];
  const rawFiles = (Array.isArray(files) ? files : [])
    .filter(file => /^raw\/\d{4}-\d{2}-\d{2}\.json$/i.test(String(file?.path || '')))
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));

  rawFiles.forEach(file => {
    const dateKey = String(file.path || '').replace(/^raw\//i, '').replace(/\.json$/i, '');
    let parsed = [];
    try {
      parsed = JSON.parse(String(file.content || ''));
    } catch {
      parsed = [];
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }
    rows.push('', `## ${dateKey}`);
    parsed
      .filter(message => !message?.hidden)
      .sort((a, b) => Number(a?.timestamp || a?.ts || 0) - Number(b?.timestamp || b?.ts || 0))
      .forEach(message => {
        const ts = Number(message?.timestamp || message?.ts || 0) || 0;
        const timeLabel = ts > 0 ? new Date(ts).toISOString() : 'unknown-time';
        const sender = String(message?.sender || message?.role || '').toLowerCase() === 'user' ? 'USER' : 'AGENT';
        const text = String(message?.text || message?.content || '').trim();
        if (!text) return;
        rows.push(`[${timeLabel}] ${sender}`);
        rows.push(text);
        rows.push('');
      });
  });

  if (rows.length === 0) {
    return 'No story raw messages were found in this export.';
  }
  return rows.join('\n').trim();
};

const buildSnapshot = async namespace => {
  const agentId = normalizeStoryAgentId(namespace);
  const storyDir = getStoryRecordDir(agentId);
  const files = await listTextFilesRecursive(storyDir);
  const storyLangCode = await AsyncStorage.getItem(getStoryLangStorageKey(agentId));
  return {
    schema: EXPORT_SCHEMA,
    kind: EXPORT_KIND,
    exportedAt: new Date().toISOString(),
    source: {
      agentId,
      namespaceId: normalizeNamespaceId(namespace),
      shortCode: String(namespace?.shortCode || '').trim(),
      displayName: String(namespace?.displayName || '').trim(),
    },
    storage: {
      relativeRoot: `agent_chats/${encodeURIComponent(agentId)}/story`,
      fileCount: files.length,
    },
    asyncStorage: {
      storyLangCode: storyLangCode || '',
    },
    files,
  };
};

const serializeSnapshot = snapshot => {
  const source = snapshot?.source || {};
  const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
  const transcript = parseRawStoryMessages(files);
  const header = [
    'xKEVA STORY RECORD EXPORT v1',
    `Exported At: ${snapshot?.exportedAt || new Date().toISOString()}`,
    `Agent ID: ${source.agentId || ''}`,
    `Namespace ID: ${source.namespaceId || ''}`,
    `ShortCode: ${source.shortCode || ''}`,
    `Display Name: ${source.displayName || ''}`,
    `Files: ${files.length}`,
    '',
    'This file can be opened for review. To restore it, use Profile > STORY > Import.',
    '',
    '===== STORY LOG =====',
    transcript,
    '',
    EXPORT_JSON_BEGIN,
    JSON.stringify(snapshot, null, 2),
    EXPORT_JSON_END,
    '',
  ];
  return header.join('\n');
};

const extractSnapshotJson = raw => {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('empty_story_export');
  }
  const beginIndex = text.indexOf(EXPORT_JSON_BEGIN);
  if (beginIndex >= 0) {
    const afterBegin = beginIndex + EXPORT_JSON_BEGIN.length;
    const endIndex = text.indexOf(EXPORT_JSON_END, afterBegin);
    const jsonText = endIndex >= 0 ? text.slice(afterBegin, endIndex) : text.slice(afterBegin);
    return JSON.parse(jsonText.trim());
  }
  return JSON.parse(text);
};

export const parseStoryRecordPayload = raw => {
  const snapshot = extractSnapshotJson(raw);
  if (snapshot?.schema !== EXPORT_SCHEMA || snapshot?.kind !== EXPORT_KIND) {
    throw new Error('invalid_story_export');
  }
  if (!Array.isArray(snapshot.files)) {
    throw new Error('invalid_story_export_files');
  }
  return snapshot;
};

export const buildStoryRecordSnapshot = async namespace => buildSnapshot(namespace);

export const exportStoryRecordToFile = async namespace => {
  const snapshot = await buildSnapshot(namespace);
  const downloadsRoot = RNFS.DownloadDirectoryPath || RNFS.ExternalStorageDirectoryPath || RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath;
  const exportDir = `${downloadsRoot}/xkeva`;
  await ensureDir(exportDir);
  const now = new Date();
  const displayName = sanitizeFilePart(namespace?.displayName || snapshot?.source?.shortCode || snapshot?.source?.agentId || 'story');
  const agentIdPart = sanitizeFilePart(snapshot?.source?.agentId || 'agent');
  const preferredPath = `${exportDir}/${displayName}-${agentIdPart}-story-xkeva-${compactTimestamp(now)}.txt`;
  const fallbackPath = `${exportDir}/story-export-${agentIdPart}-${compactTimestamp(now)}.txt`;
  const payload = serializeSnapshot(snapshot);
  let filePath = preferredPath;
  try {
    await RNFS.writeFile(preferredPath, payload, 'utf8');
    const ok = await RNFS.exists(preferredPath);
    if (!ok) throw new Error('preferred_export_missing_after_write');
  } catch (error) {
    filePath = fallbackPath;
    await RNFS.writeFile(fallbackPath, payload, 'utf8');
    const ok = await RNFS.exists(fallbackPath);
    if (!ok) throw new Error(`story_export_write_failed:${String(error?.message || error || 'unknown')}`);
  }
  return {
    filePath,
    fileCount: snapshot.files.length,
    agentId: snapshot?.source?.agentId || '',
    exportedAt: snapshot.exportedAt,
  };
};

const writeSnapshotToStoryDir = async (snapshot, namespace) => {
  const targetAgentId = normalizeStoryAgentId(namespace);
  const targetBaseDir = getStoryBaseDir(targetAgentId);
  const targetStoryDir = getStoryRecordDir(targetAgentId);
  await ensureDir(CHAT_DIR);
  await ensureDir(targetBaseDir);

  let backupDir = '';
  if (await RNFS.exists(targetStoryDir)) {
    backupDir = `${targetBaseDir}/story_backup_before_import_${compactTimestamp(new Date())}_${Math.random().toString(36).slice(2, 6)}`;
    await copyDirRecursive(targetStoryDir, backupDir).catch(error => {
      console.warn('[story_record_io] failed to backup current story before import', error);
      backupDir = '';
    });
    await RNFS.unlink(targetStoryDir).catch(error => {
      console.warn('[story_record_io] failed to remove old story dir before import', error);
    });
  }

  await ensureDir(targetStoryDir);

  let writtenCount = 0;
  for (const file of snapshot.files) {
    const rel = safeRelativePath(file?.path);
    if (!rel) continue;
    const targetPath = `${targetStoryDir}/${rel}`;
    const parent = dirname(targetPath);
    if (parent) {
      await ensureDir(parent);
    }
    await RNFS.writeFile(targetPath, String(file?.content || ''), file?.encoding === 'base64' ? 'base64' : 'utf8');
    writtenCount += 1;
  }

  const storyLangCode = String(snapshot?.asyncStorage?.storyLangCode || '').trim();
  if (storyLangCode) {
    await AsyncStorage.setItem(getStoryLangStorageKey(targetAgentId), storyLangCode);
  } else {
    await AsyncStorage.removeItem(getStoryLangStorageKey(targetAgentId));
  }

  return {
    targetAgentId,
    sourceAgentId: String(snapshot?.source?.agentId || '').trim(),
    backupDir,
    writtenCount,
  };
};

export const restoreStoryRecordSnapshot = async (snapshot, namespace) => writeSnapshotToStoryDir(snapshot, namespace);

export const importStoryRecordFromFile = async namespace => {
  const picked = await DocumentPicker.pick({
    type: [DocumentPicker.types.plainText],
    copyTo: 'cachesDirectory',
  });
  const file = Array.isArray(picked) ? picked[0] : picked;
  const readPath = file?.fileCopyUri || file?.uri;
  if (!readPath) {
    return { cancelled: true };
  }
  const raw = await RNFS.readFile(readPath, 'utf8');
  const snapshot = parseStoryRecordPayload(raw);
  return writeSnapshotToStoryDir(snapshot, namespace);
};

export const isStoryRecordImportCancel = error => {
  try {
    return !!DocumentPicker.isCancel(error);
  } catch {
    return false;
  }
};
