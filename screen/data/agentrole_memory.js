import RNFS from 'react-native-fs';

const LAYER_ALIASES = {
  verified: 'verified',
  v: 'verified',
  likely: 'likely',
  l: 'likely',
  fog: 'fog',
  f: 'fog',
};

const LAYER_CODES = {
  verified: 'v',
  likely: 'l',
  fog: 'f',
};

const safeText = value => String(value || '');
const nowStamp = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export const normalizeRoleMemoryLayerKey = layer => {
  const key = String(layer || '').trim().toLowerCase();
  return LAYER_ALIASES[key] || '';
};

export const createAgentRoleMemoryStore = deps => {
  const {
    getRoleDirPath,
    getRoleFilePath,
    getLegacyRoleFilePath,
    normalizeMemoryLayerText,
    normalizeMemoryCardText,
    parseRoleMemoryLayers,
    composeRoleMemoryCard,
    captureLastMemorySnapshot,
  } = deps || {};

  const getLayerPath = (roleSlug, layer, kind = 'memory') => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    const prefix = kind === 'initial' ? 'initial_' : '';
    return `${getRoleDirPath(roleSlug)}/${prefix}${safeLayer}.md`;
  };

  const getBackupDirPath = (roleSlug, layer) => `${getRoleDirPath(roleSlug)}/backups/${LAYER_CODES[normalizeRoleMemoryLayerKey(layer)] || 'x'}`;

  const ensureRoleDir = async roleSlug => {
    const roleDirPath = getRoleDirPath(roleSlug);
    if (!(await RNFS.exists(roleDirPath))) {
      await RNFS.mkdir(roleDirPath);
    }
    return roleDirPath;
  };

  const readTextFileIfExists = async path => {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return '';
      return safeText(await RNFS.readFile(path, 'utf8'));
    } catch {
      return '';
    }
  };

  const writeTextFileReplacing = async (path, text) => {
    const tmpPath = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await RNFS.writeFile(tmpPath, safeText(text), 'utf8');
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      await RNFS.moveFile(tmpPath, path);
    } catch (error) {
      try {
        if (await RNFS.exists(tmpPath)) await RNFS.unlink(tmpPath);
      } catch {}
      throw error;
    }
  };

  const createLayerBackup = async ({ roleSlug, layer, text, reason = 'write' } = {}) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    if (!safeLayer) return null;
    await ensureRoleDir(roleSlug);
    const dir = getBackupDirPath(roleSlug, safeLayer);
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
    const stamp = nowStamp();
    const fileName = `${LAYER_CODES[safeLayer]}-${stamp}-${String(reason || 'write').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.md`;
    const path = `${dir}/${fileName}`;
    await RNFS.writeFile(path, safeText(text), 'utf8');
    return {
      layer: safeLayer,
      code: LAYER_CODES[safeLayer],
      fileName,
      path,
      reason,
    };
  };

  const maybeBackupCurrentLayer = async ({ roleSlug, layer, nextText, reason = 'write' } = {}) => {
    const currentPath = getLayerPath(roleSlug, layer, 'memory');
    const currentText = await readTextFileIfExists(currentPath);
    if (!currentText || safeText(currentText) === safeText(nextText)) {
      return null;
    }
    return createLayerBackup({ roleSlug, layer, text: currentText, reason });
  };

  const listLayerBackups = async (roleSlug, layer) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    if (!safeLayer) return [];
    const dir = getBackupDirPath(roleSlug, safeLayer);
    try {
      const exists = await RNFS.exists(dir);
      if (!exists) return [];
      const entries = await RNFS.readDir(dir);
      return entries
        .filter(entry => entry.isFile())
        .map(entry => ({
          layer: safeLayer,
          code: LAYER_CODES[safeLayer],
          fileName: entry.name,
          path: entry.path,
          mtime: entry.mtime ? new Date(entry.mtime).getTime() : 0,
          size: Number(entry.size || 0),
        }))
        .sort((a, b) => b.mtime - a.mtime || String(b.fileName).localeCompare(String(a.fileName)));
    } catch {
      return [];
    }
  };

  const readRoleFile = async roleSlug => {
    const safeRoleSlug = String(roleSlug || '').trim();
    const path = getRoleFilePath(safeRoleSlug);
    const legacyPath = getLegacyRoleFilePath(safeRoleSlug);
    try {
      if (await RNFS.exists(path)) {
        const parsed = JSON.parse(await RNFS.readFile(path, 'utf8'));
        if (!parsed || typeof parsed !== 'object') return null;
        const memoryLayers = {
          verified: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'verified'))),
          likely: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'likely'))),
          fog: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'fog'))),
        };
        const initialMemoryLayers = {
          verified: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'verified', 'initial'))),
          likely: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'likely', 'initial'))),
          fog: normalizeMemoryLayerText(await readTextFileIfExists(getLayerPath(safeRoleSlug, 'fog', 'initial'))),
        };
        const roleName = String(parsed.roleName || safeRoleSlug).trim() || safeRoleSlug;
        return {
          ...parsed,
          roleSlug: safeRoleSlug,
          roleName,
          memoryLayers,
          initialMemoryLayers,
          memory: composeRoleMemoryCard(roleName, memoryLayers),
          initialMemory: composeRoleMemoryCard(roleName, initialMemoryLayers),
        };
      }

      if (!(await RNFS.exists(legacyPath))) {
        return null;
      }
      const parsed = JSON.parse(await RNFS.readFile(legacyPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return null;
      const roleName = String(parsed.roleName || safeRoleSlug).trim() || safeRoleSlug;
      const memoryLayers = parseRoleMemoryLayers(parsed.memory || parsed.memories || parsed.memoryText || '');
      const initialMemoryLayers = parseRoleMemoryLayers(parsed.initialMemory || parsed.initial_memory || parsed.memoryInitial || parsed.memory || '');
      return {
        ...parsed,
        roleSlug: safeRoleSlug,
        roleName,
        memoryLayers: {
          verified: memoryLayers.verified,
          likely: memoryLayers.likely,
          fog: memoryLayers.fog,
        },
        initialMemoryLayers: {
          verified: initialMemoryLayers.verified,
          likely: initialMemoryLayers.likely,
          fog: initialMemoryLayers.fog,
        },
        memory: composeRoleMemoryCard(roleName, memoryLayers),
        initialMemory: composeRoleMemoryCard(roleName, initialMemoryLayers),
      };
    } catch {
      return null;
    }
  };

  const writeRoleFile = async (roleSlug, data, options = {}) => {
    const safeRoleSlug = String(roleSlug || '').trim();
    const nextData = data && typeof data === 'object' ? { ...data } : {};
    const roleName = String(nextData.roleName || safeRoleSlug).trim() || safeRoleSlug;
    const parsedMemoryLayers = parseRoleMemoryLayers(nextData.memory || nextData.memories || nextData.memoryText || '');
    const parsedInitialLayers = parseRoleMemoryLayers(nextData.initialMemory || nextData.initial_memory || nextData.memoryInitial || nextData.memory || '');
    const memoryLayers = {
      verified: normalizeMemoryLayerText(nextData.memoryLayers?.verified || parsedMemoryLayers.verified || ''),
      likely: normalizeMemoryLayerText(nextData.memoryLayers?.likely || parsedMemoryLayers.likely || ''),
      fog: normalizeMemoryLayerText(nextData.memoryLayers?.fog || parsedMemoryLayers.fog || ''),
    };
    const initialMemoryLayers = {
      verified: normalizeMemoryLayerText(nextData.initialMemoryLayers?.verified || parsedInitialLayers.verified || memoryLayers.verified || ''),
      likely: normalizeMemoryLayerText(nextData.initialMemoryLayers?.likely || parsedInitialLayers.likely || memoryLayers.likely || ''),
      fog: normalizeMemoryLayerText(nextData.initialMemoryLayers?.fog || parsedInitialLayers.fog || memoryLayers.fog || ''),
    };

    await ensureRoleDir(safeRoleSlug);

    if (options?.createBackups !== false) {
      await maybeBackupCurrentLayer({ roleSlug: safeRoleSlug, layer: 'verified', nextText: memoryLayers.verified, reason: options?.backupReason || 'write' });
      await maybeBackupCurrentLayer({ roleSlug: safeRoleSlug, layer: 'likely', nextText: memoryLayers.likely, reason: options?.backupReason || 'write' });
      await maybeBackupCurrentLayer({ roleSlug: safeRoleSlug, layer: 'fog', nextText: memoryLayers.fog, reason: options?.backupReason || 'write' });
    }

    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'verified'), memoryLayers.verified);
    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'likely'), memoryLayers.likely);
    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'fog'), memoryLayers.fog);
    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'verified', 'initial'), initialMemoryLayers.verified);
    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'likely', 'initial'), initialMemoryLayers.likely);
    await writeTextFileReplacing(getLayerPath(safeRoleSlug, 'fog', 'initial'), initialMemoryLayers.fog);

    nextData.version = 2;
    nextData.memoryMode = 'layered';
    nextData.roleSlug = safeRoleSlug;
    nextData.roleName = roleName;
    nextData.memoryLayers = memoryLayers;
    nextData.initialMemoryLayers = initialMemoryLayers;
    nextData.memory = composeRoleMemoryCard(roleName, memoryLayers);
    nextData.initialMemory = composeRoleMemoryCard(roleName, initialMemoryLayers);
    nextData.memoryFiles = { verified: 'verified.md', likely: 'likely.md', fog: 'fog.md' };
    nextData.initialMemoryFiles = { verified: 'initial_verified.md', likely: 'initial_likely.md', fog: 'initial_fog.md' };

    const payload = JSON.stringify(nextData, null, 2);
    const path = getRoleFilePath(safeRoleSlug);
    await writeTextFileReplacing(path, payload);
    const legacyPath = getLegacyRoleFilePath(safeRoleSlug);
    if (await RNFS.exists(legacyPath)) {
      try { await RNFS.unlink(legacyPath); } catch {}
    }
    return true;
  };

  const applySingleLayerChange = async ({ roleSlug, roleData, layer, nextText, backupReason, updatedAt } = {}) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    if (!safeLayer || !roleData) return null;
    const currentLayers = {
      verified: normalizeMemoryLayerText(roleData.memoryLayers?.verified || ''),
      likely: normalizeMemoryLayerText(roleData.memoryLayers?.likely || ''),
      fog: normalizeMemoryLayerText(roleData.memoryLayers?.fog || ''),
    };
    const backup = await maybeBackupCurrentLayer({ roleSlug, layer: safeLayer, nextText, reason: backupReason });
    currentLayers[safeLayer] = normalizeMemoryLayerText(nextText);
    const nextRoleData = {
      ...roleData,
      roleSlug,
      roleName: String(roleData.roleName || roleSlug).trim() || roleSlug,
      memoryLayers: currentLayers,
      memory: composeRoleMemoryCard(roleData.roleName || roleSlug, currentLayers),
      updatedAt: Number(updatedAt || Date.now()),
    };
    await writeRoleFile(roleSlug, nextRoleData, { createBackups: false });
    return { roleData: nextRoleData, backup };
  };

  const rebuildRoleLayer = async ({ roleSlug, layer } = {}) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    const roleData = await readRoleFile(roleSlug);
    if (!roleData || !safeLayer) return null;
    const initialText = normalizeMemoryLayerText(roleData.initialMemoryLayers?.[safeLayer] || '');
    const result = await applySingleLayerChange({
      roleSlug,
      roleData,
      layer: safeLayer,
      nextText: initialText,
      backupReason: `rebuild-from-initial-${LAYER_CODES[safeLayer]}`,
    });
    return {
      ...result,
      layer: safeLayer,
      restoredFrom: 'initial',
    };
  };

  const recoverRoleLayer = async ({ roleSlug, layer, backupFileName } = {}) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    const roleData = await readRoleFile(roleSlug);
    if (!roleData || !safeLayer || !backupFileName) return null;
    const backups = await listLayerBackups(roleSlug, safeLayer);
    const target = backups.find(item => item.fileName === backupFileName);
    if (!target) return null;
    const backupText = normalizeMemoryLayerText(await readTextFileIfExists(target.path));
    const result = await applySingleLayerChange({
      roleSlug,
      roleData,
      layer: safeLayer,
      nextText: backupText,
      backupReason: `recover-before-restore-${target.fileName.replace(/[^a-z0-9._-]+/gi, '-')}`,
    });
    return {
      ...result,
      layer: safeLayer,
      restoredFrom: target,
    };
  };

  const updateRoleLayer = async ({ roleSlug, layer, nextText, backupReason = 'edit-layer', updatedAt } = {}) => {
    const safeLayer = normalizeRoleMemoryLayerKey(layer);
    const roleData = await readRoleFile(roleSlug);
    if (!roleData || !safeLayer) return null;
    if (typeof captureLastMemorySnapshot === 'function') {
      try {
        await captureLastMemorySnapshot(roleSlug, roleData, { kind: 'before-edit', trigger: `update-layer-${safeLayer}` });
      } catch {}
    }
    const result = await applySingleLayerChange({
      roleSlug,
      roleData,
      layer: safeLayer,
      nextText,
      backupReason: '',
      updatedAt,
    });
    return {
      ...result,
      layer: safeLayer,
    };
  };

  return {
    getLayerPath,
    readTextFileIfExists,
    createLayerBackup,
    listLayerBackups,
    readRoleFile,
    writeRoleFile,
    rebuildRoleLayer,
    recoverRoleLayer,
    updateRoleLayer,
  };
};
