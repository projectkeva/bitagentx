const DEFAULT_SUMMARY = {
  current_state: '',
  current_desire: '',
  relationship_delta: '',
  unresolved_threads: [],
  open_loops: [],
  recent_arc: [],
};

const safeText = value => String(value || '');
const trimText = value => String(value || '').trim();

const normalizeLayers = layers => ({
  verified: trimText(layers?.verified || ''),
  likely: trimText(layers?.likely || ''),
  fog: trimText(layers?.fog || ''),
});

export const buildRoleSnapshot = ({
  kind = 'export',
  roleSlug = '',
  roleName = '',
  agentId = '',
  roleData = null,
  source = null,
  state = null,
  conversationSummary = null,
  conversationBuffer = '',
  todayConversationMessages = [],
  capturedAt = Date.now(),
} = {}) => {
  const currentRoleData = roleData && typeof roleData === 'object' ? roleData : {};
  const safeRoleSlug = trimText(roleSlug || currentRoleData.roleSlug || currentRoleData.roleName || '');
  const safeRoleName = trimText(roleName || currentRoleData.roleName || safeRoleSlug);
  return {
    version: 1,
    schema: 'role_snapshot',
    kind: trimText(kind || 'export') || 'export',
    role: {
      agentId: trimText(agentId || ''),
      roleSlug: safeRoleSlug,
      roleName: safeRoleName,
      createdAt: Number(currentRoleData.createdAt || 0) || 0,
      updatedAt: Number(currentRoleData.updatedAt || capturedAt || Date.now()) || Date.now(),
    },
    capturedAt: Number(capturedAt || Date.now()) || Date.now(),
    source: source && typeof source === 'object'
      ? {
          kind: trimText(source.kind || ''),
          trigger: trimText(source.trigger || ''),
        }
      : null,
    memoryLayers: normalizeLayers(currentRoleData.memoryLayers || currentRoleData.memory || {}),
    initialMemoryLayers: normalizeLayers(currentRoleData.initialMemoryLayers || currentRoleData.initialMemory || {}),
    roleData: currentRoleData,
    artifacts: {
      conversationSummary: conversationSummary && typeof conversationSummary === 'object'
        ? conversationSummary
        : DEFAULT_SUMMARY,
      conversationBuffer: safeText(conversationBuffer),
      todayConversationMessages: Array.isArray(todayConversationMessages) ? todayConversationMessages : [],
      state: state && typeof state === 'object' ? state : {},
    },
  };
};

export const serializeRoleSnapshotToLegacyText = snapshot => {
  const data = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const role = data.roleData && typeof data.roleData === 'object' ? data.roleData : {};
  const roleMeta = data.role && typeof data.role === 'object' ? data.role : {};
  const summaryText = JSON.stringify(data?.artifacts?.conversationSummary || DEFAULT_SUMMARY, null, 2);
  const todayConversationText = JSON.stringify(data?.artifacts?.todayConversationMessages || [], null, 2);
  const stateText = JSON.stringify(data?.artifacts?.state || {}, null, 2);
  return [
    `version: ${Number(data.version || 1) || 1}`,
    `schema: ${trimText(data.schema || 'role_snapshot') || 'role_snapshot'}`,
    `kind: ${trimText(data.kind || 'export') || 'export'}`,
    `agentId: ${trimText(roleMeta.agentId || '')}`,
    `roleSlug: ${trimText(roleMeta.roleSlug || '')}`,
    `roleName: ${trimText(roleMeta.roleName || '')}`,
    `capturedAt: ${Number(data.capturedAt || Date.now()) || Date.now()}`,
    '',
    '[role.json]',
    JSON.stringify(role, null, 2),
    '',
    '[memory.verified.md]',
    trimText(data?.memoryLayers?.verified || ''),
    '',
    '[memory.likely.md]',
    trimText(data?.memoryLayers?.likely || ''),
    '',
    '[memory.fog.md]',
    trimText(data?.memoryLayers?.fog || ''),
    '',
    '[memory.initial_verified.md]',
    trimText(data?.initialMemoryLayers?.verified || ''),
    '',
    '[memory.initial_likely.md]',
    trimText(data?.initialMemoryLayers?.likely || ''),
    '',
    '[memory.initial_fog.md]',
    trimText(data?.initialMemoryLayers?.fog || ''),
    '',
    '[conversationSummary]',
    summaryText,
    '',
    '[conversationBuffer]',
    safeText(data?.artifacts?.conversationBuffer || ''),
    '',
    '[todayConversationMessages]',
    todayConversationText,
    '',
    '[state]',
    stateText,
    '',
  ].join('\n');
};

export const parseLegacyRoleExportText = raw => {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/);
  const meta = {};
  const sections = {};
  let currentSection = null;
  let currentLines = [];

  const flushSection = () => {
    if (!currentSection) return;
    sections[currentSection] = currentLines.join('\n').trim();
    currentSection = null;
    currentLines = [];
  };

  lines.forEach(line => {
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      flushSection();
      currentSection = sectionMatch[1].trim();
      currentLines = [];
      return;
    }
    if (currentSection) {
      currentLines.push(line);
      return;
    }
    const metaMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
    if (metaMatch) {
      meta[metaMatch[1]] = metaMatch[2];
    }
  });
  flushSection();

  const tryParseJson = value => {
    const source = String(value || '').trim();
    if (!source) return null;
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  };

  const roleData = tryParseJson(sections['role.json']) || {};
  const conversationSummary = tryParseJson(sections.conversationSummary) || DEFAULT_SUMMARY;
  const todayConversationMessages = tryParseJson(sections.todayConversationMessages);
  const state = tryParseJson(sections.state) || {};

  return {
    version: Number(meta.version || 1) || 1,
    schema: 'role_snapshot',
    kind: trimText(meta.kind || 'export') || 'export',
    role: {
      agentId: trimText(meta.agentId || ''),
      roleSlug: trimText(meta.roleSlug || roleData.roleSlug || roleData.roleName || ''),
      roleName: trimText(meta.roleName || roleData.roleName || meta.roleSlug || ''),
      createdAt: Number(roleData.createdAt || 0) || 0,
      updatedAt: Number(roleData.updatedAt || meta.capturedAt || Date.now()) || Date.now(),
    },
    capturedAt: Number(meta.capturedAt || meta.exportedAt || Date.now()) || Date.now(),
    source: null,
    memoryLayers: normalizeLayers({
      verified: sections['memory.verified.md'] || '',
      likely: sections['memory.likely.md'] || '',
      fog: sections['memory.fog.md'] || '',
    }),
    initialMemoryLayers: normalizeLayers({
      verified: sections['memory.initial_verified.md'] || '',
      likely: sections['memory.initial_likely.md'] || '',
      fog: sections['memory.initial_fog.md'] || '',
    }),
    roleData,
    artifacts: {
      conversationSummary,
      conversationBuffer: sections.conversationBuffer || '',
      todayConversationMessages: Array.isArray(todayConversationMessages) ? todayConversationMessages : [],
      state,
    },
  };
};

export const normalizeRoleSnapshot = snapshot => {
  const data = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const role = data.role && typeof data.role === 'object' ? data.role : {};
  return {
    version: Number(data.version || 1) || 1,
    schema: 'role_snapshot',
    kind: trimText(data.kind || data.schema || 'export') || 'export',
    role: {
      agentId: trimText(role.agentId || data.agentId || ''),
      roleSlug: trimText(role.roleSlug || data.roleSlug || data.roleData?.roleSlug || ''),
      roleName: trimText(role.roleName || data.roleName || data.roleData?.roleName || role.roleSlug || data.roleSlug || ''),
      createdAt: Number(role.createdAt || data.createdAt || data.roleData?.createdAt || 0) || 0,
      updatedAt: Number(role.updatedAt || data.updatedAt || data.roleData?.updatedAt || data.capturedAt || Date.now()) || Date.now(),
    },
    capturedAt: Number(data.capturedAt || data.exportedAt || Date.now()) || Date.now(),
    source: data.source && typeof data.source === 'object'
      ? {
          kind: trimText(data.source.kind || ''),
          trigger: trimText(data.source.trigger || ''),
        }
      : null,
    memoryLayers: normalizeLayers(data.memoryLayers || data.memory || data.roleData?.memoryLayers || {}),
    initialMemoryLayers: normalizeLayers(data.initialMemoryLayers || data.initialMemory || data.roleData?.initialMemoryLayers || {}),
    roleData: data.roleData && typeof data.roleData === 'object'
      ? data.roleData
      : (data.role && typeof data.role === 'object' && !data.roleData ? data.role : {}),
    artifacts: {
      conversationSummary: data?.artifacts?.conversationSummary || data.conversationSummary || DEFAULT_SUMMARY,
      conversationBuffer: safeText(data?.artifacts?.conversationBuffer || data.conversationBuffer || ''),
      todayConversationMessages: Array.isArray(data?.artifacts?.todayConversationMessages)
        ? data.artifacts.todayConversationMessages
        : (Array.isArray(data.todayConversationMessages) ? data.todayConversationMessages : []),
      state: data?.artifacts?.state && typeof data.artifacts.state === 'object'
        ? data.artifacts.state
        : (data.state && typeof data.state === 'object' ? data.state : {}),
    },
  };
};

export const parseRoleSnapshotPayload = raw => {
  const text = String(raw || '');
  try {
    const parsed = JSON.parse(text);
    return normalizeRoleSnapshot(parsed);
  } catch {
    return normalizeRoleSnapshot(parseLegacyRoleExportText(text));
  }
};
