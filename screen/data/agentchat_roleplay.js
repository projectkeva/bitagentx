// \app\screen\data\agentchat_roleplay.js
// Roleplay (/r) module extracted from agentchat.js

async function handleRoleCommand(chat, rawValue, deps) {
  const { Rolecards, buildRoleplayPrompt } = deps || {};
  if (!Rolecards || typeof buildRoleplayPrompt !== 'function') {
    chat.replyFromAgent('Roleplay module deps missing.');
    return;
  }

  const roleText = String(rawValue || '').trim().slice(0, 1000);
  const normalizedRole = roleText.toLowerCase() === 'unknown' ? 'unknown' : roleText;

  if (!normalizedRole) {
    chat.replyFromAgent('Role text is empty.');
    return;
  }

  const ctx = typeof chat.resolveNamespaceContext === 'function' ? chat.resolveNamespaceContext() : null;
  const agentId = ctx?.agentId || 'unknown';

  let roleMemoryCard = null;
  const roleSlug = Rolecards.normalizeRoleSlug(normalizedRole);

  if (roleSlug && !Rolecards.ROLECARD_RESERVED_SLUGS.has(roleSlug)) {
    const indexText = await chat.fetchLatestKeyValue(Rolecards.ROLECARD_INDEX_KEY);
    if (indexText) {
      const parsed = Rolecards.parseRoleIndexLines(indexText);
      const entries = parsed?.entries || [];
      const matched = entries.find(entry => entry?.roleSlug === roleSlug);
      if (matched) {
        const keyName = `${Rolecards.ROLECARD_KEY_PREFIX}${roleSlug}`;
        const value = await chat.fetchLatestKeyValue(keyName);
        if (value) roleMemoryCard = value;
      }
    }
  }

  const rolePrompt = buildRoleplayPrompt(normalizedRole, agentId, roleMemoryCard);
  const cardText = `Roleplay Prompt\nAgent ID: ${agentId || 'Unknown'}\nRole: ${normalizedRole}\nReady to copy the full prompt.`;

  chat.replyFromAgentSeedCard(cardText, rolePrompt, 'Copy full roleplay prompt');
  chat.replyFromAgent(
    'Click the link above to copy. Paste into GPT, Grok, DeepSeek, or any base model to start a roleplay conversation as the role you provided.',
  );
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
