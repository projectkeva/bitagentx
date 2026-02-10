// \app\screen\data\agentchat_roleplay.js
let loc = require('../../loc');

async function handleRoleCommand(chat, roleArg, deps) {
  // TODO: paste moved logic here
  chat.replyFromAgent('roleplay module not wired yet');
}

function buildRoleHistoryMessage(chat, deps) {
  // TODO: paste moved logic here
  return '';
}

module.exports = {
  handleRoleCommand,
  buildRoleHistoryMessage,
};
