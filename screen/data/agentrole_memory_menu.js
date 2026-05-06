import { normalizeRoleMemoryLayerKey } from './agentrole_memory';

const getTextGetter = getRoleUiText => (
  typeof getRoleUiText === 'function'
    ? getRoleUiText
    : key => String(key || '')
);

const getRoleSlugFromRef = (roleRef, getSpaceRoleKey) => {
  const roleSlug = String(
    roleRef?.roleSlug
    || roleRef?.roleData?.roleSlug
    || roleRef?.roleName
    || '',
  ).trim();
  if (roleSlug) return roleSlug;
  return typeof getSpaceRoleKey === 'function' ? String(getSpaceRoleKey() || '').trim() : '';
};

export const buildRoleMemoryQuickConsoleMessage = ({ getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  return [
    `[[/role card|${t('viewMemory')}]]`,
    '',
    `[[/rolemodel|${t('model')}]]`,
    '',
    `[[/role clear|${t('switchRole')}]]`,
  ].join('\n');
};

export const buildMemoryLanguageMenuMessage = () => '';

export const getMemoryLayerLabel = ({ layer, getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  switch (String(layer || '').toUpperCase()) {
    case 'LIKELY':
      return t('likelyFull');
    case 'FOG':
      return t('fogFull');
    case 'VERIFIED':
    default:
      return t('verifiedFull');
  }
};

export const getMemoryActionLabel = ({ action, getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  switch (String(action || '').toLowerCase()) {
    case 'add':
      return t('adjustActionAdd');
    case 'delete':
      return t('adjustActionDelete');
    case 'edit':
    default:
      return t('adjustActionEdit');
  }
};

export const buildMemoryAdjustConfirmMessage = ({ draft, getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  const encoded = encodeURIComponent(JSON.stringify({
    layer: draft?.layer || 'VERIFIED',
    action: draft?.action || 'edit',
    content: draft?.content || '',
    raw: draft?.raw || '',
    roleSlug: draft?.roleSlug || '',
  }));
  return [
    t('pendingMemoryChangeTitle'),
    t('pendingMemoryLayer', { layer: getMemoryLayerLabel({ layer: draft?.layer, getRoleUiText: t }) }),
    t('pendingMemoryAction', { action: getMemoryActionLabel({ action: draft?.action, getRoleUiText: t }) }),
    t('pendingMemoryContent', { content: draft?.content || '' }),
    '',
    `[[/r memory confirm ${encoded}|${t('confirmMemoryChange')}]]`,
    '',
    `[[/r memory adjust|${t('reenterMemoryChange')}]]`,
    '',
    `[[/r cancel|${t('cancel')}]]`,
  ].join('\n');
};

export const buildRoleMemoryCardMessage = ({ roleRef, normalizeMemoryCardText, getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  const roleData = roleRef?.roleData || roleRef || {};
  const normalize = typeof normalizeMemoryCardText === 'function'
    ? normalizeMemoryCardText
    : value => String(value || '');
  const memoryText = normalize(String(roleData.memory || '').trim()) || '(empty)';
  return [
    t('memoryTitle'),
    memoryText,
  ].join('\n');
};

export const getRoleMemoryLayerShortCode = layer => ({
  verified: 'v',
  likely: 'l',
  fog: 'f',
}[normalizeRoleMemoryLayerKey(layer)] || '?');

export const buildRoleMemoryRecoverMenuMessage = async ({
  roleRef,
  getRoleUiText,
  getSpaceRoleKey,
  getRoleInitialMemoryStatus,
  getRoleLastMemoryStatus,
} = {}) => {
  const t = getTextGetter(getRoleUiText);
  const roleSlug = getRoleSlugFromRef(roleRef, getSpaceRoleKey);
  const hasRole = !!roleRef?.roleData;
  const lines = [];
  let hasSnapshotRestoreButton = false;
  if (hasRole) {
    const initialStatus = typeof getRoleInitialMemoryStatus === 'function'
      ? await getRoleInitialMemoryStatus(roleSlug)
      : null;
    if (initialStatus?.baselineExists || initialStatus?.verifiedExists || initialStatus?.likelyExists || initialStatus?.fogExists) {
      lines.push(`[[/r memory rebuild confirm|${t('resetMemory')}]]`);
      lines.push('');
    }
  }
  lines.push(`[[/role import|${t('importRecord')}]]`);
  lines.push('');
  lines.push(`[[/role importfragment|${t('importFragment') || 'Import Fragment'}]]`);
  lines.push('');
  if (!hasSnapshotRestoreButton) {
    lines.push(`[[/role snapshot list|${t('memorySnapshot') || t('recoverMemory')}]]`);
    lines.push('');
    hasSnapshotRestoreButton = true;
  }
  lines.push(`[[/role onchainmemory|${t('onchainMemory') || 'On-chain memory'}]]`);
  lines.push('');
  lines.push(`[[${hasRole ? '/role memory' : '/role'}|${t('back')}]]`);
  return lines.join('\n');
};

export const buildRoleEditLayerChoiceMessage = ({ getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  const vCmd = '/role v';
  const lCmd = '/role l';
  const fCmd = '/role f';
  return [
    t('askAdjustMemory'),
    '',
    `[[${vCmd}|VERIFIED]] ${t('verifiedExplain')}`,
    '',
    `[[${lCmd}|LIKELY]] ${t('likelyExplain')}`,
    '',
    `[[${fCmd}|FOG]] ${t('fogExplain')}`,
    '',
    `[[/role memory|${t('back')}]]`,
  ].join('\n');
};

export const buildRoleMemoryFullConsoleMessage = ({ roleRef, getRoleUiText } = {}) => {
  const t = getTextGetter(getRoleUiText);
  const roleSlug = getRoleSlugFromRef(roleRef);
  const cardCmd = roleSlug ? `/role card ${roleSlug}` : '/role card';
  const adjustCmd = roleSlug ? `/role edit ${roleSlug}` : '/role edit';
  const summaryCmd = roleSlug ? `/role summary ${roleSlug}` : '/role summary';
  const restoreCmd = roleSlug ? `/role memory rebuild ${roleSlug}` : '/role memory rebuild';
  const commitCmd = roleSlug ? `/r memory commit ${roleSlug}` : '/r memory commit';
  const deleteCmd = roleSlug ? `/r memory delete ${roleSlug}` : '/r memory delete';
  return [
    `[[${cardCmd}|${t('viewMemory')}]]`,
    '',
    `[[${adjustCmd}|${t('adjustMemory')}]]`,
    '',
    `[[${restoreCmd}|${t('restoreMemoryMenu') || 'Restore memory'}]]`,
    '',
    `[[${summaryCmd}|${t('awakeningJourney')}]]`,
    '',
    `[[${commitCmd}|${t('commitMemoryOnChain')}]]`,
    '',
    `[[${deleteCmd}|${t('deleteMemory')}]]`,
    '',
    `[[/rolemodel|${t('model')}]]`,
    '',
    `[[/r continuechat|${t('continueChat')}]]`,
    '',
    `[[/role clear|${t('switchRole')}]]`,
  ].join('\n');
};
