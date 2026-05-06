import RNFS from 'react-native-fs';
import { buildRoleSnapshot, normalizeRoleSnapshot, parseRoleSnapshotPayload, serializeRoleSnapshotToLegacyText } from './role_snapshot';

const MAX_SNAPSHOTS = 10;

const pad = value => String(value).padStart(2, '0');

const formatSnapshotStamp = ts => {
  const d = new Date(Number(ts || Date.now()) || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const compactSnapshotStamp = ts => {
  const d = new Date(Number(ts || Date.now()) || Date.now());
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const safeFileNamePart = value => String(value || 'role')
  .trim()
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .replace(/\s+/g, '-')
  .slice(0, 80) || 'role';

const snapshotDir = (agent, roleSlug) => `${agent.getRoleDirPath(roleSlug)}/memory_snapshots`;

const ensureSnapshotDir = async (agent, roleSlug) => {
  await agent.ensureRoleFilesDir?.();
  const dir = snapshotDir(agent, roleSlug);
  if (!(await RNFS.exists(dir))) {
    await RNFS.mkdir(dir);
  }
  return dir;
};

const readSnapshotFiles = async (agent, roleSlug) => {
  const dir = await ensureSnapshotDir(agent, roleSlug);
  const entries = await RNFS.readDir(dir).catch(() => []);
  return entries
    .filter(entry => entry?.isFile?.() && /\.txt$/i.test(String(entry.name || '')))
    .map(entry => {
      const mtime = entry.mtime ? new Date(entry.mtime).getTime() : 0;
      return {
        name: String(entry.name || ''),
        path: entry.path,
        ts: Number(mtime || 0),
      };
    })
    .filter(entry => entry.name && entry.path)
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
};

const pruneSnapshots = async (agent, roleSlug) => {
  const files = await readSnapshotFiles(agent, roleSlug);
  const extra = files.slice(MAX_SNAPSHOTS);
  await Promise.all(extra.map(file => RNFS.unlink(file.path).catch(() => {})));
};

const isExportSystemMessage = message => {
  const text = String(message?.text || message?.content || '').trim();
  const sender = String(message?.sender || '').trim().toLowerCase();
  if (!text) return true;
  if (sender === 'user' && /^\//.test(text)) return true;
  if (/^\/(?:summary|role|r)\b/i.test(text)) return true;
  if (/\[\[\/(?:summary|role|r)\b/i.test(text)) return true;
  if (/^Awakening Journey[:：]?/i.test(text)) return true;
  if (/^\u89c9\u9192\u5386\u7a0b[:：]?/.test(text)) return true;
  if (/^\u5bfc\u51fa|^\u5bfc\u5165/.test(text)) return true;
  if (/^(?:VERIFIED|LIKELY|FOG)\b/i.test(text)) return true;
  return false;
};

export const roleDataHasMemory = roleData => {
  if (!roleData || typeof roleData !== 'object') return false;
  const layers = roleData.memoryLayers || {};
  const initialLayers = roleData.initialMemoryLayers || {};
  return Boolean(
    String(layers.verified || '').trim()
    || String(layers.likely || '').trim()
    || String(layers.fog || '').trim()
    || String(initialLayers.verified || '').trim()
    || String(initialLayers.likely || '').trim()
    || String(initialLayers.fog || '').trim(),
  );
};

const buildSnapshotPayload = async (agent, roleRef) => {
  const safeRoleSlug = String(roleRef?.roleSlug || agent.getSpaceRoleKey?.() || '').trim();
  const roleData = roleRef?.roleData || await agent.readRoleFile(safeRoleSlug);
  if (!roleData) {
    throw new Error('no_active_role');
  }
  const meta = roleRef?.meta && typeof roleRef.meta === 'object' ? roleRef.meta : {};
  const summary = await agent.readConversationSummary(safeRoleSlug);
  const bufferEntriesRaw = typeof agent.readConversationBufferEntries === 'function'
    ? await agent.readConversationBufferEntries(safeRoleSlug)
    : [];
  const conversationBuffer = Array.isArray(bufferEntriesRaw)
    ? bufferEntriesRaw
      .filter(entry => {
        const role = String(entry?.role || '').toLowerCase();
        const sender = role === 'user' ? 'user' : 'agent';
        const text = String(entry?.content || '').trim();
        return text && !isExportSystemMessage({ text, sender });
      })
      .map(entry => JSON.stringify({
        ts: Number(entry?.ts || Date.now()),
        role: String(entry?.role || '').toLowerCase() === 'user' ? 'user' : 'assistant',
        content: String(entry?.content || '').trim(),
        messageId: String(entry?.messageId || ''),
      }))
      .join('\n')
    : '';

  const todayKey = typeof agent.getTodayDateString === 'function'
    ? agent.getTodayDateString()
    : new Date().toISOString().slice(0, 10);
  const todayRaw = typeof agent.readDayMessages === 'function' ? await agent.readDayMessages(todayKey) : [];
  const todayConversationMessages = (Array.isArray(todayRaw) ? todayRaw : [])
    .filter(message => ['user', 'agent'].includes(String(message?.sender || '').trim().toLowerCase()))
    .filter(message => !isExportSystemMessage(message))
    .map(message => ({
      ts: Number(message?.timestamp || message?.ts || Date.now()),
      role: String(message?.sender || '').toLowerCase() === 'user' ? 'user' : 'assistant',
      text: String(message?.text || '').trim(),
      messageId: String(message?.id || message?.requestId || message?.messageId || ''),
    }))
    .filter(item => item.text);

  const capturedAt = Date.now();
  const snapshot = buildRoleSnapshot({
    kind: 'memory-snapshot',
    roleSlug: safeRoleSlug,
    roleName: String(roleData?.roleName || safeRoleSlug).trim() || safeRoleSlug,
    agentId: agent.agentId,
    roleData,
    state: {
      currentRole: agent.state?.activeRoleSlug === safeRoleSlug,
      roleLangCode: agent.getRoleLangCode?.() || agent.state?.roleLangCode || 'en',
      lastSelectedRoleName: agent.state?.lastSelectedRole,
    },
    conversationSummary: summary,
    conversationBuffer,
    todayConversationMessages,
    capturedAt,
    source: {
      kind: String(meta.kind || 'memory-snapshot').trim() || 'memory-snapshot',
      trigger: String(meta.trigger || '/role snapshot create').trim() || '/role snapshot create',
    },
  });
  return {
    roleData,
    capturedAt,
    text: serializeRoleSnapshotToLegacyText(snapshot),
  };
};

export const buildRoleMemorySnapshotMenuMessage = ({ getRoleUiText } = {}) => {
  const t = typeof getRoleUiText === 'function' ? getRoleUiText : key => key;
  return [
    t('memorySnapshotTitle') || 'Memory rewind',
    '',
    `[[/role snapshot create|${t('memorySnapshotCreate') || 'Create snapshot'}]]`,
    '',
    `[[/role snapshot list|${t('memorySnapshotView') || 'View snapshots'}]]`,
    '',
    `[[/role summary|${t('back') || 'Back'}]]`,
  ].join('\n');
};

export const createRoleMemorySnapshot = async (agent, roleRef) => {
  const roleSlug = String(roleRef?.roleSlug || agent.getSpaceRoleKey?.() || '').trim();
  const { roleData, capturedAt, text } = await buildSnapshotPayload(agent, roleRef || { roleSlug });
  const dir = await ensureSnapshotDir(agent, roleSlug);
  const fileName = `${compactSnapshotStamp(capturedAt)}-${safeFileNamePart(roleData?.roleName || roleSlug)}.txt`;
  const path = `${dir}/${fileName}`;
  await RNFS.writeFile(path, text, 'utf8');
  await pruneSnapshots(agent, roleSlug);
  return { path, fileName, capturedAt };
};

export const buildRoleMemorySnapshotListMessage = async (agent, roleRef) => {
  const t = typeof agent.getRoleUiText === 'function' ? agent.getRoleUiText : key => key;
  const roleSlug = String(roleRef?.roleSlug || agent.getSpaceRoleKey?.() || '').trim();
  const files = await readSnapshotFiles(agent, roleSlug);
  if (!files.length) {
    return [
      t('memorySnapshotListTitle') || 'Snapshots:',
      t('memorySnapshotEmpty') || '(no snapshots)',
      '',
      `[[/role snapshot|${t('back') || 'Back'}]]`,
    ].join('\n');
  }
  const lines = [t('memorySnapshotListTitle') || 'Snapshots:', ''];
  files.forEach(file => {
    const encoded = encodeURIComponent(file.name);
    lines.push(`[[/role snapshot import ${encoded}|${formatSnapshotStamp(file.ts)}]]`);
    lines.push('');
  });
  lines.push(`[[/role snapshot|${t('back') || 'Back'}]]`);
  return lines.join('\n');
};

export const importRoleMemorySnapshot = async (agent, roleRef, encodedName) => {
  const roleSlug = String(roleRef?.roleSlug || agent.getSpaceRoleKey?.() || '').trim();
  const wanted = decodeURIComponent(String(encodedName || '').trim());
  if (!wanted || /[\\/]/.test(wanted)) {
    throw new Error('invalid_snapshot');
  }
  const files = await readSnapshotFiles(agent, roleSlug);
  const hit = files.find(file => file.name === wanted);
  if (!hit) {
    throw new Error('snapshot_not_found');
  }
  const raw = await RNFS.readFile(hit.path, 'utf8');
  const snapshot = normalizeRoleSnapshot(parseRoleSnapshotPayload(raw));
  const existingRoleData = await agent.readRoleFile?.(roleSlug);
  if (roleDataHasMemory(existingRoleData)) {
    await createRoleMemorySnapshot(agent, {
      roleSlug,
      roleData: existingRoleData,
      meta: { kind: 'before-snapshot-import', trigger: '/role snapshot import' },
    });
  }
  await agent.applyRoleSnapshot(snapshot);
  await agent.writeRoleRecoveryBaseline?.(agent.getSpaceRoleKey?.() || roleSlug);
  return { path: hit.path, name: hit.name };
};
