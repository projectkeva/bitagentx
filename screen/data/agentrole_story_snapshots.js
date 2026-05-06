import RNFS from 'react-native-fs';
import { buildStoryRecordSnapshot, restoreStoryRecordSnapshot } from './story_record_io';

const MAX_STORY_SNAPSHOTS = 10;

const pad = value => String(value).padStart(2, '0');

const formatSnapshotStamp = ts => {
  const d = new Date(Number(ts || Date.now()) || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const compactSnapshotStamp = ts => {
  const d = new Date(Number(ts || Date.now()) || Date.now());
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const safeFileNamePart = value => String(value || 'story')
  .trim()
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .replace(/\s+/g, '-')
  .slice(0, 80) || 'story';

const getStorySnapshotRootDir = agent => {
  const storyDir = String(agent.getStoryChatDir?.() || '').replace(/\/+$/, '');
  if (!storyDir) return '';
  const baseDir = storyDir.replace(/\/story$/, '');
  return `${baseDir}/story_snapshots`;
};

const ensureStorySnapshotDir = async agent => {
  const dir = getStorySnapshotRootDir(agent);
  if (!dir) throw new Error('missing_story_snapshot_dir');
  if (!(await RNFS.exists(dir))) {
    await RNFS.mkdir(dir);
  }
  return dir;
};

const readStorySnapshotFiles = async agent => {
  const dir = await ensureStorySnapshotDir(agent);
  const entries = await RNFS.readDir(dir).catch(() => []);
  return entries
    .filter(entry => entry?.isFile?.() && /\.json$/i.test(String(entry.name || '')))
    .map(entry => ({
      name: String(entry.name || ''),
      path: entry.path,
      ts: entry.mtime ? new Date(entry.mtime).getTime() : 0,
    }))
    .filter(entry => entry.name && entry.path)
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
};

const pruneStorySnapshots = async agent => {
  const files = await readStorySnapshotFiles(agent);
  const extra = files.slice(MAX_STORY_SNAPSHOTS);
  await Promise.all(extra.map(file => RNFS.unlink(file.path).catch(() => {})));
};

const getNamespaceForStorySnapshot = agent => {
  const params = agent.props?.navigation?.state?.params || {};
  return {
    namespaceId: params.namespaceId,
    shortCode: params.shortCode,
    displayName: params.displayName,
    agentId: agent.agentId,
  };
};

export const buildRoleStorySnapshotMenuMessage = ({ getRoleUiText } = {}) => {
  const t = typeof getRoleUiText === 'function' ? getRoleUiText : key => key;
  return [
    t('storySnapshotTitle') || 'Story snapshots:',
    '',
    `[[/role story snapshot create|${t('storySnapshotCreate') || 'Create snapshot'}]]`,
    '',
    `[[/role story snapshot list|${t('storySnapshotView') || 'View snapshots'}]]`,
    '',
    `[[/role story records|${t('back') || 'Back'}]]`,
  ].join('\n');
};

export const createRoleStorySnapshot = async agent => {
  const namespace = getNamespaceForStorySnapshot(agent);
  const snapshot = await buildStoryRecordSnapshot(namespace);
  const capturedAt = Date.now();
  const dir = await ensureStorySnapshotDir(agent);
  const label = safeFileNamePart(namespace.displayName || namespace.shortCode || namespace.agentId || 'story');
  const fileName = `${compactSnapshotStamp(capturedAt)}-${label}.json`;
  const path = `${dir}/${fileName}`;
  const payload = {
    ...snapshot,
    kind: 'story-record-snapshot',
    snapshotCreatedAt: new Date(capturedAt).toISOString(),
  };
  await RNFS.writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  await pruneStorySnapshots(agent);
  return { path, fileName, capturedAt, fileCount: Array.isArray(snapshot?.files) ? snapshot.files.length : 0 };
};

export const buildRoleStorySnapshotListMessage = async agent => {
  const t = typeof agent.getRoleUiText === 'function' ? agent.getRoleUiText : key => key;
  const files = await readStorySnapshotFiles(agent);
  if (!files.length) {
    return [
      t('storySnapshotListTitle') || 'Story snapshots:',
      t('storySnapshotEmpty') || '(no story snapshots)',
      '',
      `[[/role story snapshot|${t('back') || 'Back'}]]`,
    ].join('\n');
  }
  const lines = [t('storySnapshotListTitle') || 'Story snapshots:', ''];
  files.forEach(file => {
    lines.push(`[[/role story snapshot import ${encodeURIComponent(file.name)}|${formatSnapshotStamp(file.ts)}]]`);
    lines.push('');
  });
  lines.push(`[[/role story snapshot|${t('back') || 'Back'}]]`);
  return lines.join('\n');
};

export const importRoleStorySnapshot = async (agent, encodedName) => {
  const wanted = decodeURIComponent(String(encodedName || '').trim());
  if (!wanted || /[\\/]/.test(wanted)) {
    throw new Error('invalid_story_snapshot');
  }
  const files = await readStorySnapshotFiles(agent);
  const hit = files.find(file => file.name === wanted);
  if (!hit) {
    throw new Error('story_snapshot_not_found');
  }

  const hasCurrentStory = await agent.hasRoleCurrentStory?.();
  if (hasCurrentStory) {
    await createRoleStorySnapshot(agent).catch(error => {
      console.warn('Failed to capture current story before snapshot import', error);
    });
  }

  const raw = await RNFS.readFile(hit.path, 'utf8');
  const snapshot = JSON.parse(raw);
  await restoreStoryRecordSnapshot(snapshot, getNamespaceForStorySnapshot(agent));
  return { path: hit.path, name: hit.name };
};
