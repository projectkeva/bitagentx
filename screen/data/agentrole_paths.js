import RNFS from 'react-native-fs';

export const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
export const LLM_DIR = `${RNFS.DocumentDirectoryPath}/llm`;
export const ROLE_RECOVERY_BASELINE_FILE = 'restore_baseline.v1.json';
export const LOCAL_NAMESPACE_AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/namespace_avatars`;
export const LAST_ROLE_SPACE_PATH = `${CHAT_DIR}/_last_role_space.json`;
export const LAST_STORY_SPACE_PATH = `${CHAT_DIR}/_last_story_space.json`;
export const LAST_CHAT_SPACE_PATH = `${CHAT_DIR}/_last_chat_space.json`;
export const STORY_BLOCK_CACHE_PATH = `${CHAT_DIR}/_story_block_cache.json`;

export const getNamespaceAvatarPath = namespaceId => `${LOCAL_NAMESPACE_AVATAR_DIR}/${encodeURIComponent(String(namespaceId || 'unknown'))}.jpg`;

export const getLlmBuiltinPath = agentId => `${LLM_DIR}/builtin_${encodeURIComponent(String(agentId || 'default'))}.json`;
export const getLlmCustomPath = agentId => `${LLM_DIR}/custom_${encodeURIComponent(String(agentId || 'default'))}.json`;
export const getLlmActivePath = agentId => `${LLM_DIR}/active_${encodeURIComponent(String(agentId || 'default'))}.json`;
export const getLlmLastUsedPath = agentId => `${LLM_DIR}/last_used_${encodeURIComponent(String(agentId || 'default'))}.json`;
export const getLLMOverridePath = agentId => `${LLM_DIR}/overrides_${encodeURIComponent(String(agentId || 'default'))}.json`;

export const getStoryLangStorageKey = agentId => `story_lang_code_${encodeURIComponent(String(agentId || 'default'))}`;
export const getRoleLangStorageKey = agentId => `role_lang_code_${encodeURIComponent(String(agentId || 'default'))}`;
export const getRoleLastSelectedStorageKey = agentId => `role_last_selected_${encodeURIComponent(String(agentId || 'default'))}`;
export const getRoleActiveStateStorageKey = agentId => `role_active_state_${encodeURIComponent(String(agentId || 'default'))}`;
export const getRoleCurrentSummonedStorageKey = agentId => `role_current_summoned_${encodeURIComponent(String(agentId || 'default'))}`;
export const getRolePendingNewStorageKey = agentId => `role_pending_new_${encodeURIComponent(String(agentId || 'default'))}`;
