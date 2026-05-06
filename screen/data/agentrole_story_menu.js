import { Alert } from 'react-native';
import {
  exportStoryRecordToFile,
  importStoryRecordFromFile,
  isStoryRecordImportCancel,
} from './story_record_io';
import { getStoryCurrentPath } from './agentchat_story_storage';
import { buildRoleStorySwitchWorldlineMenuMessage } from './agentrole_story_switch_worldline';

export const getStoryChatDir = (agentId, chatDir) => `${chatDir}/${encodeURIComponent(String(agentId || 'default'))}/story`;

export const getRoleStoryChoicesPath = (agentId, chatDir) => `${getStoryChatDir(agentId, chatDir)}/current_choices.json`;

export const getRoleCurrentStoryPath = (agentId, chatDir) => getStoryCurrentPath(getStoryChatDir(agentId, chatDir));

export const getRoleCurrentStorySummaryPath = (agentId, chatDir) => `${getStoryChatDir(agentId, chatDir)}/current_summary.json`;

export const buildRoleAdventureRecordsMenuMessage = ({ hasCurrentStory, getRoleUiText }) => {
  const lines = [];
  lines.push(`[[/role story view|${getRoleUiText('viewStory') || 'View story'}]]`);
  lines.push('');
  lines.push(`[[/role story summary|${getRoleUiText('summaryStory') || 'Summarize story'}]]`);
  lines.push('');
  lines.push(`[[/role story clone|${getRoleUiText('cloneStory') || 'Clone'}]]`);
  lines.push('');
  lines.push(`[[/role story snapshot|${getRoleUiText('storySnapshot') || 'Story snapshots'}]]`);
  lines.push('');
  lines.push(`[[/role story|${getRoleUiText('back')}]]`);
  return lines.join('\n');
};

export const buildRoleStoryMenuMessage = ({ hasChoices, hasCurrentStory, getRoleUiText }) => {
  const isContinueState = !!hasCurrentStory;
  const entryLabel = isContinueState ? getRoleUiText('continueStory') : getRoleUiText('startStory');
  const lines = [
    `[[/role story open|${entryLabel}]]`,
    '',
    `[[/role story import|${getRoleUiText('importStory')}]]`,
    '',
    `[[/role story importfragment|${getRoleUiText('importStoryFragment') || 'Import Fragment'}]]`,
    '',
    `[[/role story onchain|${getRoleUiText('onchainStory') || 'On-chain Story'}]]`,
    '',
  ];
  if (!isContinueState) {
    lines.push(`[[/role story snapshot list|${getRoleUiText('storySnapshot') || 'Story snapshots'}]]`);
    lines.push('');
  }
  if (isContinueState) {
    lines.push(`[[/role story export|${getRoleUiText('exportStory')}]]`);
    lines.push('');
    lines.push(`[[/role story records|${getRoleUiText('adventureRecords') || 'Adventure records'}]]`);
    lines.push('');
    lines.push(buildRoleStorySwitchWorldlineMenuMessage({ getRoleUiText }));
    lines.push('');
    lines.push(`[[/role story clear|${getRoleUiText('deleteStory') || 'Delete story'}]]`);
    lines.push('');
  }
  lines.push(`[[/role menu|${getRoleUiText('back')}]]`);
  return lines.join('\n');
};

export const openRoleStorySpace = async ({ persistLastSpaceShortcut, navigation, extraParams = {} }) => {
  await persistLastSpaceShortcut('story');
  const params = navigation?.state?.params || {};
  navigation?.push?.('AgentStory', {
    namespaceId: params.namespaceId,
    shortCode: params.shortCode,
    displayName: params.displayName,
    walletId: params.walletId,
    txid: params.txid,
    rootAddress: params.rootAddress,
    price: params.price,
    desc: params.desc,
    addr: params.addr,
    profile: params.profile,
    suppressAutoLinkStart: true,
    ...extraParams,
  });
};

export const exportRoleStoryRecord = async ({ namespace }) => {
  try {
    return await exportStoryRecordToFile(namespace);
  } catch (error) {
    console.warn('Failed to export role story record', error);
    Alert.alert('Export story failed', String(error?.message || error || 'unknown'));
    return null;
  }
};

export const importRoleStoryRecord = async ({ namespace, onOpenStory }) => {
  Alert.alert(
    'Import story record?',
    'This will replace the current local story record for this namespace with the selected xKEVA story export file. A backup of the current local story folder will be kept before importing.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: async () => {
          try {
            const result = await importStoryRecordFromFile(namespace);
            if (result && result.cancelled) return;
            Alert.alert(
              'Import complete',
              `Story record restored. Files imported: ${result && result.writtenCount ? result.writtenCount : 0}.`,
              [
                { text: 'OK' },
                onOpenStory ? {
                  text: 'Open Story',
                  onPress: () => {
                    onOpenStory();
                  },
                } : null,
              ].filter(Boolean),
            );
          } catch (error) {
            if (isStoryRecordImportCancel(error)) return;
            console.warn('Failed to import role story record', error);
            Alert.alert('Import story failed', String(error?.message || error || 'unknown'));
          }
        },
      },
    ],
  );
};
