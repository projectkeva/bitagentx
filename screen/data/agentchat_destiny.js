// \app\screen\data\agentchat_destiny.js
// Destiny (/d) module extracted from agentchat.js

function handleDestinyCommand(chat, deps) {
  const { buildDestinySeedPrompt } = deps || {};
  if (typeof buildDestinySeedPrompt !== 'function') {
    chat.replyFromAgent('Destiny module deps missing.');
    return;
  }

  const params = chat?.props?.navigation?.state?.params || {};
  const { namespaceId, shortCode } = params || {};
  const agentId = shortCode || namespaceId;

  const seedPrompt = buildDestinySeedPrompt(agentId);
  const cardText = `Destiny Seed Card\nAgent ID: ${agentId || 'Unknown'}\nReady to copy the full card.`;

  chat.replyFromAgentSeedCard(cardText, seedPrompt);
  chat.replyFromAgent(
    'Click the link above to copy. Paste into GPT, Grok, DeepSeek, or any base model to start the Interactive Destiny story game. When you finish the run, paste the result here to commit it on-chain for your next level. Have fun!',
  );
}

module.exports = {
  handleDestinyCommand,
};
