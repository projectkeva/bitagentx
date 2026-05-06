import { Buffer } from 'buffer';
import { decodeBase64, getNamespaceInfoFromShortCode, getNamespaceScriptHash } from '../../class/keva-ops';

export const normalizeOnChainStoryId = value => String(value || '').replace(/\s+/g, '').trim();

const decodeKvKey = key => {
  if (!key) return '';
  try {
    return decodeBase64(key) || String(key || '');
  } catch (_) {
    return String(key || '');
  }
};

const decodeKvValue = value => {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch (_) {
    return String(value || '');
  }
};

const fetchNamespaceKeyValueMap = async ({ BlueElectrum, namespaceId } = {}) => {
  if (!BlueElectrum || !namespaceId) return {};
  await BlueElectrum.ping();
  if (typeof BlueElectrum.waitTillConnected === 'function') {
    await BlueElectrum.waitTillConnected();
  }
  const history = await BlueElectrum.blockchainKeva_getKeyValues(getNamespaceScriptHash(namespaceId), -1);
  const keyValues = Array.isArray(history?.keyvalues) ? history.keyvalues : (Array.isArray(history) ? history : []);
  const result = {};
  keyValues.forEach(kv => {
    const key = decodeKvKey(kv?.key).trim();
    if (!key) return;
    result[key] = decodeKvValue(kv?.value).trim();
  });
  return result;
};

const pickStorySummary = ({ kvMap, preferredSlug = '' } = {}) => {
  const slug = normalizeOnChainStoryId(preferredSlug);
  if (slug) {
    const value = String(kvMap?.[`story.summary.${slug}`] || '').trim();
    if (value) {
      return { roleSlug: slug, summary: value, key: `story.summary.${slug}` };
    }
  }
  const keys = Object.keys(kvMap || {}).filter(key => /^story\.summary\.[^.]+$/i.test(key));
  for (const key of keys) {
    const value = String(kvMap[key] || '').trim();
    if (!value) continue;
    const roleSlug = key.replace(/^story\.summary\./i, '').trim();
    return { roleSlug, summary: value, key };
  }
  return null;
};

export const fetchLocalOnChainStorySummary = async ({ BlueElectrum, namespaceId, roleSlug } = {}) => {
  if (!namespaceId) return null;
  const kvMap = await fetchNamespaceKeyValueMap({ BlueElectrum, namespaceId });
  const picked = pickStorySummary({ kvMap, preferredSlug: roleSlug });
  if (!picked?.summary) return null;
  return {
    inputId: normalizeOnChainStoryId(roleSlug),
    namespaceId,
    source: 'local',
    ...picked,
  };
};

export const resolveDoppelStoryNamespace = async ({ BlueElectrum, rawId } = {}) => {
  const id = normalizeOnChainStoryId(rawId);
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

export const fetchDoppelOnChainStorySummary = async ({ BlueElectrum, rawId } = {}) => {
  const resolved = await resolveDoppelStoryNamespace({ BlueElectrum, rawId });
  if (!resolved?.namespaceId) return null;
  const kvMap = await fetchNamespaceKeyValueMap({ BlueElectrum, namespaceId: resolved.namespaceId });
  const picked = pickStorySummary({ kvMap, preferredSlug: resolved.roleSlug });
  if (!picked?.summary) return null;
  return {
    ...resolved,
    ...picked,
  };
};
