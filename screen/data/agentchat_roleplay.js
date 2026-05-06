// \app\screen\data\agentchat_roleplay.js
// Roleplay (/r) module extracted from agentchat.js

async function handleRoleCommand(chat, rawValue, deps) {
  const roleText = String(rawValue || '').trim().slice(0, 1000);
  const normalizedRole = roleText.toLowerCase() === 'unknown' ? '' : roleText;

  if (!normalizedRole) {
    if (typeof chat.handleRoleNewMenu === 'function') {
      await chat.handleRoleNewMenu();
      return;
    }
    chat.replyFromAgent('Role text is empty.');
    return;
  }

  if (typeof chat.handleRoleSuggestWithName === 'function') {
    await chat.handleRoleSuggestWithName(normalizedRole, null);
    return;
  }

  chat.replyFromAgent('Role summon flow is unavailable.');
}

function getRecentRoleCommands(chat) {
  const allMessages = chat?.state?.allMessages || [];
  const recentCommands = [];
  let unknownCommand = null;

  for (let index = allMessages.length - 1; index >= 0; index -= 1) {
    const message = allMessages[index];
    if (message?.sender !== 'user') continue;

    const trimmed = message.text?.trim();
    if (!trimmed || !/^\/r\b/i.test(trimmed)) continue;

    const roleValue = trimmed.replace(/^\/r\b/i, '').trim();
    if (!roleValue || roleValue.toLowerCase() === 'unknown') {
      if (!unknownCommand) unknownCommand = '/r unknown';
      continue;
    }

    recentCommands.push(`/r ${roleValue}`);
    if (recentCommands.length >= 3 && unknownCommand) break;
  }

  return { recentCommands, unknownCommand: unknownCommand || '/r unknown' };
}

function buildRoleHistoryMessage(chat, deps) {
  const { getRoleHistoryTitle, getCommandUsageMessage } = deps || {};
  const { recentCommands, unknownCommand } = getRecentRoleCommands(chat);

  const title =
    typeof getRoleHistoryTitle === 'function' ? getRoleHistoryTitle() : 'Recent /r commands:';
  const usage =
    typeof getCommandUsageMessage === 'function' ? getCommandUsageMessage('r') : '';

  const lines = [String(title)];
  if (recentCommands.length > 0) lines.push(...recentCommands);
  lines.push(unknownCommand);

  if (usage) {
    lines.push('');
    lines.push(String(usage));
  }

  return lines.join('\n');
}

module.exports = {
  handleRoleCommand,
  buildRoleHistoryMessage,
};
