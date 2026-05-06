import { Buffer } from 'buffer';
import { decodeBase64, getNamespaceInfoFromShortCode, getNamespaceScriptHash } from '../../class/keva-ops';

export const normalizeDoppelMemoryId = value => String(value || '').replace(/\s+/g, '').trim();

const decodeKvValue = value => {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch (_) {
    return String(value || '');
  }
};

const decodeKvKey = key => {
  if (!key) return '';
  try {
    return decodeBase64(key) || String(key || '');
  } catch (_) {
    return String(key || '');
  }
};

export const resolveDoppelMemoryNamespace = async ({ BlueElectrum, rawId } = {}) => {
  const id = normalizeDoppelMemoryId(rawId);
  if (!id || !BlueElectrum) return null;

  try {
    const nsInfo = await getNamespaceInfoFromShortCode(BlueElectrum, id);
    if (nsInfo?.namespaceId || nsInfo?.id) {
      return {
        inputId: id,
        roleSlug: id,
        namespaceId: nsInfo.namespaceId || nsInfo.id,
        shortCode: nsInfo.shortCode || id,
        displayName: nsInfo.displayName || nsInfo.name || '',
        source: 'shortCode',
      };
    }
  } catch (_) {}

  return {
    inputId: id,
    roleSlug: id,
    namespaceId: id,
    shortCode: '',
    displayName: '',
    source: 'namespaceId',
  };
};

export const fetchDoppelOnChainMemory = async ({ BlueElectrum, rawId } = {}) => {
  const resolved = await resolveDoppelMemoryNamespace({ BlueElectrum, rawId });
  if (!resolved?.namespaceId || !BlueElectrum) return null;

  await BlueElectrum.ping();
  if (typeof BlueElectrum.waitTillConnected === 'function') {
    await BlueElectrum.waitTillConnected();
  }

  const history = await BlueElectrum.blockchainKeva_getKeyValues(getNamespaceScriptHash(resolved.namespaceId), -1);
  const keyValues = Array.isArray(history?.keyvalues) ? history.keyvalues : (Array.isArray(history) ? history : []);
  const kvMap = {};
  const kvMeta = {};
  const getKvOrder = (kv, index) => {
    const height = Number(kv?.height || kv?.block_height || kv?.confirmed_height || 0) || 0;
    const time = Number(kv?.time || kv?.timestamp || 0) || 0;
    const txNum = Number(kv?.tx_num || kv?.txNum || kv?.n || 0) || 0;
    return { height, time, txNum, index };
  };
  const isNewerKv = (next, prev) => {
    if (!prev) return true;
    if (next.height !== prev.height) return next.height > prev.height;
    if (next.time !== prev.time) return next.time > prev.time;
    if (next.txNum !== prev.txNum) return next.txNum > prev.txNum;
    return next.index < prev.index;
  };
  keyValues.forEach((kv, index) => {
    const key = decodeKvKey(kv?.key).trim();
    if (!key) return;
    const meta = getKvOrder(kv, index);
    if (!isNewerKv(meta, kvMeta[key])) return;
    kvMap[key] = decodeKvValue(kv?.value).trim();
    kvMeta[key] = meta;
  });

  const preferredSlug = resolved.roleSlug;
  const prefix = `role.memory.${preferredSlug}.`;
  let name = kvMap[`${prefix}name`] || '';
  let verified = kvMap[`${prefix}verified`] || '';
  let likely = kvMap[`${prefix}likely`] || '';
  let fog = kvMap[`${prefix}fog`] || '';
  let sourceRoleSlug = preferredSlug;

  if (!name && !verified && !likely && !fog) {
    const candidateSlugs = [];
    Object.keys(kvMap).forEach(key => {
      const match = /^role\.memory\.([^.]+)\.(?:name|verified|likely|fog)$/i.exec(key);
      if (match?.[1] && !candidateSlugs.includes(match[1])) candidateSlugs.push(match[1]);
    });
    for (const slug of candidateSlugs) {
      const p = `role.memory.${slug}.`;
      const candidate = {
        name: kvMap[`${p}name`] || '',
        verified: kvMap[`${p}verified`] || '',
        likely: kvMap[`${p}likely`] || '',
        fog: kvMap[`${p}fog`] || '',
      };
      if (candidate.name || candidate.verified || candidate.likely || candidate.fog) {
        sourceRoleSlug = slug;
        name = candidate.name;
        verified = candidate.verified;
        likely = candidate.likely;
        fog = candidate.fog;
        break;
      }
    }
  }

  const memoryLayers = {
    verified: String(verified || '').trim(),
    likely: String(likely || '').trim(),
    fog: String(fog || '').trim(),
  };
  const roleName = String(name || resolved.displayName || sourceRoleSlug || preferredSlug).trim();
  const nameExists = !!String(name || '').trim();
  const verifiedExists = !!memoryLayers.verified;
  const likelyExists = !!memoryLayers.likely;
  const fogExists = !!memoryLayers.fog;

  return {
    ...resolved,
    sourceRoleSlug,
    roleName,
    memoryLayers,
    nameExists,
    verifiedExists,
    likelyExists,
    fogExists,
    hasAnyMemory: !!(nameExists || verifiedExists || likelyExists || fogExists),
  };
};
