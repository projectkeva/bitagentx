const ROLE_RECORD_EXCLUDED_TEXT_PATTERNS = [
  /^SYSTEM CALL$/i,
  /^Booting the Super Agent Network/i,
  /^Loading the on-device LLM/i,
  /^\/h for help\.?$/i,
  /^Unknown command/i,
  /^Enter API key/i,
  /^Enter base URL/i,
  /^Role model check/i,
  /^Current[:：]\s*(?:Model|模型)/i,
  /^当前[:：]\s*(?:Model|模型)/i,
  /^Model selected(?::|\s|$)/i,
  /^Select model[:：]?/i,
  /^Model\s+\S+/i,
  /^Model[:：]\s*\S+/i,
  /^模型\s+\S+/i,
  /^模型[:：]\s*\S+/i,
  /^Role selected(?::|\s|$)/i,
  /^Updating memory/i,
  /^正在更新记忆/i,
  /^Memory updated/i,
  /^记忆已更新\.?$/i,
  /^Welcome message is empty/i,
  /^Saved welcome message on-chain/i,
  /^Failed to save welcome/i,
  /^No active role/i,
  /^Empty input/i,
  /^\(empty input\)$/i,
  /^\(no active role\)$/i,
  /^Restore this role to its initial memory\?/i,
  /^Restore this role to its archived memory\?/i,
  /^要将这个角色恢复为初始记忆吗？/i,
  /^要恢复这条存档记忆吗？/i,
  /^Restored this role to its initial memory\.?/i,
  /^Archived memory restored\.?/i,
  /^已恢复为初始记忆。?/i,
  /^已恢复存档记忆。?/i,
  /^\(memory rebuild failed\)$/i,
  /^（记忆层重建失败）$/i,
  /^\(archived memory recover failed\)$/i,
  /^（存档记忆恢复失败）$/i,
  /^要恢复链上记忆吗？/i,
  /^要恢復鏈上記憶嗎？/i,
  /^\(On-chain memory restore failed\)$/i,
  /^（链上记忆恢复失败）$/i,
  /^（鏈上記憶恢復失敗）$/i,
  /^On-chain memory restored\.?$/i,
  /^已恢复链上记忆。?$/i,
  /^已恢復鏈上記憶。?$/i,
  /^(?:NAME|VERIFIED|LIKELY|FOG)：(?:✅|-)$/i,
  /^(?:VERIFIED|LIKELY|FOG)\s*(?:（[^）]+）|\([^\)]+\))?$/i,
  /^(?:初始记忆|存档记忆|恢复记忆|记忆上链|删除记忆|链上记忆)$/i,
  /^(?:查看故事|总结故事|探索记录|换世界线|当前故事|剧情摘要)$/i,
  /^(?:View Story|Summarize Story|Records|Timeline|Current Story|Story Summary)$/i,
  /^还没有故事总结。?$/i,
  /^還沒有故事總結。?$/i,
  /^正在总结故事/i,
  /^正在總結故事/i,
  /^故事总结失败$/i,
  /^故事總結失敗$/i,
  /^故事总结已上链。?$/i,
  /^故事總結已上鏈。?$/i,
  /^故事总结上链失败$/i,
  /^故事總結上鏈失敗$/i,
  /^召唤成功/i,
  /^沉睡于基底现实的信念/i,
  /^Awakening Journey[:：]?/i,
  /^觉醒历程[:：]?/i,
  /^還原記憶[:：]?/i,
  /^还原记忆[:：]?/i,
  /^記憶快照[:：]?/i,
  /^记忆快照[:：]?/i,
  /^Memory snapshots?[:：]?/i,
  /^Memory rewind[:：]?/i,
  /^Snapshot (?:created|imported|failed)[:：.]?/i,
  /^快照(?:已创建|已导入|操作失败)[:：.]?/i,
  /^快照(?:已建立|已匯入|操作失敗)[:：.]?/i,
  /^(?:创建快照|查看快照|建立快照|Create snapshot|View snapshots)$/i,
  /^正在更新觉醒历程/i,
  /^觉醒历程已更新。?$/i,
  /^（觉醒历程修改失败）$/i,
];

const isSlashLikeRoleCommand = text => /^[,，\s]*\/(?:summary|role|rolemodel|r(?:\s+summary)?|a|h|d|block|welcome|linkstart)/i.test(
  String(text || '').trim(),
);

const looksLikeCommandMenuText = text => {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const matches = raw.match(/\[\[[^\]]+\|[^\]]+\]\]/g) || [];
  return matches.length >= 1 && matches.join('').length >= Math.max(12, raw.length * 0.35);
};

const isExcludedRoleRecordText = text => {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (looksLikeCommandMenuText(raw)) return true;
  return ROLE_RECORD_EXCLUDED_TEXT_PATTERNS.some(pattern => pattern.test(raw));
};

const shouldPersistRoleMessage = (message, { chatScope = 'role' } = {}) => {
  if (chatScope !== 'role') return true;
  if (!message || message.pending || !message.text) return false;
  if (message._localOnly || message._renderMode === 'commands') return false;
  const rawText = String(message.text || '').trim();
  if (!rawText) return false;
  if (message.sender === 'user' && isSlashLikeRoleCommand(rawText)) return false;
  if (message.sender === 'agent' && isExcludedRoleRecordText(rawText)) return false;
  return true;
};

const filterPersistableMessages = (messages = [], options = {}) => {
  if (options.chatScope !== 'role') return Array.isArray(messages) ? messages : [];
  return (Array.isArray(messages) ? messages : []).filter(message => shouldPersistRoleMessage(message, options));
};

const shouldHideHistoryText = rawText => {
  const text = String(rawText || '').trim();
  if (!text) return true;
  if (/^[,，\s]*\//.test(text)) return true;
  if (/^\[\[(?:\/|role\s|r\s)/i.test(text)) return true;
  if (/^ROLE=/i.test(text)) return true;
  if (/^\[(?:VERIFIED|LIKELY|FOG)\]/i.test(text)) return true;
  if (/^(?:VERIFIED|LIKELY|FOG)\s*(?:（[^）]+）|\([^\)]+\))?\s*$/i.test(text)) return true;
  if (/^(?:未竟之事|最近篇章|Open Loops|Recent Arc)\s*$/i.test(text)) return true;
  if (/^(?:-\s|•\s|\d+[.)]\s).+/.test(text)) return true;
  if (/Origin World Tag:|Role Function:|Signature:|Key Relationship:|Last Known Scene:|Others:/i.test(text)) return true;
  if (/起源世界标签|角色职能|标志特征|关键关系|最后已知场景|其他:/i.test(text)) return true;
  if (/^Role data initialized\.?$/i.test(text)) return true;
  if (/^角色数据已初始化\.?$/i.test(text)) return true;
  if (/^No role card yet\.?/i.test(text)) return true;
  if (/please use[“"']?\{?newRole\}?/i.test(text)) return true;
  if (/^暂无角色卡/i.test(text) && /newRole/i.test(text)) return true;
  if (/^Current[:：]\s*(?:Model|模型)/i.test(text)) return true;
  if (/^当前[:：]\s*(?:Model|模型)/i.test(text)) return true;
  if (/^Model selected(?::|\s|$)/i.test(text)) return true;
  if (/^Select model[:：]?/i.test(text)) return true;
  if (/^Model\s+\S+/i.test(text)) return true;
  if (/^Model[:：]\s*\S+/i.test(text)) return true;
  if (/^模型\s+\S+/i.test(text)) return true;
  if (/^模型[:：]\s*\S+/i.test(text)) return true;
  if (/^Role selected(?::|\s|$)/i.test(text)) return true;
  if (/^Current[:：]\s*(?:Model|模型)/i.test(text)) return true;
  if (/^当前[:：]\s*(?:Model|模型)/i.test(text)) return true;
  if (/^Model selected(?::|\s|$)/i.test(text)) return true;
  if (/^Select model[:：]?/i.test(text)) return true;
  if (/^Model\s+\S+/i.test(text)) return true;
  if (/^Model[:：]\s*\S+/i.test(text)) return true;
  if (/^模型\s+\S+/i.test(text)) return true;
  if (/^模型[:：]\s*\S+/i.test(text)) return true;
  if (/^Role selected(?::|\s|$)/i.test(text)) return true;
  if (/^Role talk enabled\.?/i.test(text)) return true;
  if (/^Role talk 已开启/i.test(text)) return true;
  if (/点麦克风开始说一句/i.test(text)) return true;
  if (/^已开启自动语音$/i.test(text)) return true;
  if (/^已关闭自动语音$/i.test(text)) return true;
  if (/^已开启实时语音(?:（并顺带开启自动语音）)?$/i.test(text)) return true;
  if (/^已关闭实时语音$/i.test(text)) return true;
  if (/^Please choose which memory to adjust\.?$/i.test(text)) return true;
  if (/^请选择要调整的记忆。?$/i.test(text)) return true;
  if (/^Restore this role to its initial memory\?/i.test(text)) return true;
  if (/^Restore this role to its archived memory\?/i.test(text)) return true;
  if (/^要将这个角色恢复为初始记忆吗？/i.test(text)) return true;
  if (/^要恢复这条存档记忆吗？/i.test(text)) return true;
  if (/adjust memory|调整记忆|删除记忆|恢复记忆|记忆上链/.test(text)) return true;
  if (/^Updating memory\.?$/i.test(text)) return true;
  if (/^正在更新记忆/i.test(text)) return true;
  if (/^Memory updated\.?$/i.test(text)) return true;
  if (/^记忆已更新\.?$/i.test(text)) return true;
  if (/^Restored this role to its initial memory\.?/i.test(text)) return true;
  if (/^Archived memory restored\.?/i.test(text)) return true;
  if (/^已恢复为初始记忆。?/i.test(text)) return true;
  if (/^已恢复存档记忆。?/i.test(text)) return true;
  if (/^要恢复链上记忆吗？/i.test(text)) return true;
  if (/^要恢復鏈上記憶嗎？/i.test(text)) return true;
  if (/^\(On-chain memory restore failed\)$/i.test(text)) return true;
  if (/^（链上记忆恢复失败）$/i.test(text)) return true;
  if (/^（鏈上記憶恢復失敗）$/i.test(text)) return true;
  if (/^On-chain memory restored\.?$/i.test(text)) return true;
  if (/^已恢复链上记忆。?$/i.test(text)) return true;
  if (/^已恢復鏈上記憶。?$/i.test(text)) return true;
  if (/^(?:NAME|VERIFIED|LIKELY|FOG)：(?:✅|-)$/i.test(text)) return true;
  if (/^Memory deleted\.?$/i.test(text)) return true;
  if (/^角色记忆删除成功\.?$/i.test(text)) return true;
  if (/^(?:查看故事|总结故事|探索记录|换世界线|当前故事|剧情摘要)$/i.test(text)) return true;
  if (/^(?:View Story|Summarize Story|Records|Timeline|Current Story|Story Summary)$/i.test(text)) return true;
  if (/^还没有故事总结。?$/i.test(text)) return true;
  if (/^還沒有故事總結。?$/i.test(text)) return true;
  if (/^正在总结故事/i.test(text)) return true;
  if (/^正在總結故事/i.test(text)) return true;
  if (/^故事总结失败$/i.test(text)) return true;
  if (/^故事總結失敗$/i.test(text)) return true;
  if (/^故事总结已上链。?$/i.test(text)) return true;
  if (/^故事總結已上鏈。?$/i.test(text)) return true;
  if (/^故事总结上链失败$/i.test(text)) return true;
  if (/^故事總結上鏈失敗$/i.test(text)) return true;
  if (/^Awakening Journey[:：]?/i.test(text)) return true;
  if (/^觉醒历程[:：]?/i.test(text)) return true;
  if (/^還原記憶[:：]?/i.test(text)) return true;
  if (/^还原记忆[:：]?/i.test(text)) return true;
  if (/^記憶快照[:：]?/i.test(text)) return true;
  if (/^记忆快照[:：]?/i.test(text)) return true;
  if (/^Memory snapshots?[:：]?/i.test(text)) return true;
  if (/^Memory rewind[:：]?/i.test(text)) return true;
  if (/^Snapshot (?:created|imported|failed)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已创建|已导入|操作失败)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已建立|已匯入|操作失敗)[:：.]?/i.test(text)) return true;
  if (/^(?:创建快照|查看快照|建立快照|Create snapshot|View snapshots)$/i.test(text)) return true;
  if (/^正在更新觉醒历程/i.test(text)) return true;
  if (/^觉醒历程已更新。?$/i.test(text)) return true;
  if (/^（觉醒历程修改失败）$/i.test(text)) return true;
  if (/^已铭记$/i.test(text)) return true;
  if (/\[\[[^\]]+\]\]/.test(text)) return true;
  if (/导出记录|导入记录|读取记录/.test(text)) return true;
  if (/^导出记录成功[:：]/.test(text)) return true;
  if (/^导入记录成功\.?$/.test(text)) return true;
  if (/^导入记录失败[:：]/.test(text)) return true;
  if (/\/storage\/emulated\/0\/Download\/xkeva\//i.test(text)) return true;
  if (/^Download\/xkeva\//i.test(text)) return true;
  return false;
};

const filterRoleHistoryMessages = (messages = []) => {
  const filtered = [];
  let skippingAwakeningBlock = false;

  for (const message of Array.isArray(messages) ? messages : []) {
    const text = String(message?.text || '').trim();
    if (shouldHideHistoryText(text)) continue;

    if (/^觉醒历程：?$/i.test(text) || /^Awakening Journey:?$/i.test(text)) {
      skippingAwakeningBlock = true;
      continue;
    }

    if (skippingAwakeningBlock) {
      if (/^(?:\[\[(?:\/|role\s|r\s)|已铭记$|ROLE=|\[(?:VERIFIED|LIKELY|FOG)\])/i.test(text)) {
        continue;
      }
      if (/^(?:VERIFIED|LIKELY|FOG)\s*(?:（[^）]+）|\([^\)]+\))?\s*$/i.test(text)) {
        continue;
      }
      if (/^(?:-\s|•\s|\d+[.)]\s)/.test(text)) {
        continue;
      }
      if (/Origin World Tag:|Role Function:|Signature:|Key Relationship:|Last Known Scene:|Others:/i.test(text)) {
        continue;
      }
      if (/起源世界标签|角色职能|标志特征|关键关系|最后已知场景|其他:/i.test(text)) {
        continue;
      }
      skippingAwakeningBlock = false;
    }

    filtered.push(message);
  }

  return filtered;
};

const isReaderExcludedText = raw => {
  const text = String(raw || '').trim();
  if (!text) return true;
  if (/(?:^|\n|\s)(?:VERIFIED|LIKELY|FOG)\s*(?:（[^）]+）|\([^\)]+\))?(?:\n|$|\s)/i.test(text)) return true;
  if (/Please choose which memory to adjust[。.!！?？]?/i.test(text)) return true;
  if (/请选择要调整的记忆[。.!！?？]?/i.test(text)) return true;
  if (/Memory updated[。.!！?？]?/i.test(text)) return true;
  if (/记忆已更新[。.!！?？]?/i.test(text)) return true;
  if (/Memory deleted[。.!！?？]?/i.test(text)) return true;
  if (/角色记忆删除成功[。.!！?？]?/i.test(text)) return true;
  if (/^Awakening Journey[:：]?/i.test(text)) return true;
  if (/^觉醒历程[:：]?/i.test(text)) return true;
  if (/^還原記憶[:：]?/i.test(text)) return true;
  if (/^还原记忆[:：]?/i.test(text)) return true;
  if (/^記憶快照[:：]?/i.test(text)) return true;
  if (/^记忆快照[:：]?/i.test(text)) return true;
  if (/^Memory snapshots?[:：]?/i.test(text)) return true;
  if (/^Memory rewind[:：]?/i.test(text)) return true;
  if (/^Snapshot (?:created|imported|failed)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已创建|已导入|操作失败)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已建立|已匯入|操作失敗)[:：.]?/i.test(text)) return true;
  if (/^正在更新觉醒历程/i.test(text)) return true;
  if (/^觉醒历程已更新。?$/i.test(text)) return true;
  if (/^(?:未竟之事|最近篇章|Open Loops|Recent Arc)\s*$/i.test(text)) return true;
  if (/\[\[[^\]]+\]\]/.test(text)) return true;
  if (/adjust memory|调整记忆|删除记忆/i.test(text)) return true;
  return false;
};

const shouldExcludeFromSummary = message => {
  const text = String(message?.text || '').trim();
  if (!message || !text) return true;
  if (message.pending || message._localOnly || message._renderMode === 'commands') return true;
  if (message.sender !== 'user' && message.sender !== 'agent') return true;
  if (message.sender === 'user' && isSlashLikeRoleCommand(text)) return true;
  if (looksLikeCommandMenuText(text)) return true;
  if (/^已开启自动语音$/i.test(text)) return true;
  if (/^已关闭自动语音$/i.test(text)) return true;
  if (/^已开启实时语音(?:（并顺带开启自动语音）)?$/i.test(text)) return true;
  if (/^已关闭实时语音$/i.test(text)) return true;
  if (/导出记录|导入记录|读取记录/.test(text)) return true;
  if (/^导出记录成功[:：]/.test(text)) return true;
  if (/^导入记录成功\.?$/.test(text)) return true;
  if (/^导入记录失败[:：]/.test(text)) return true;
  if (/^要将这个角色恢复为初始记忆吗？/i.test(text)) return true;
  if (/^要恢复这条存档记忆吗？/i.test(text)) return true;
  if (/^要恢复链上记忆吗？/i.test(text)) return true;
  if (/^要恢復鏈上記憶嗎？/i.test(text)) return true;
  if (/^已恢复为初始记忆。?/i.test(text)) return true;
  if (/^已恢复存档记忆。?/i.test(text)) return true;
  if (/^\(On-chain memory restore failed\)$/i.test(text)) return true;
  if (/^（链上记忆恢复失败）$/i.test(text)) return true;
  if (/^On-chain memory restored\.?$/i.test(text)) return true;
  if (/^已恢复链上记忆。?$/i.test(text)) return true;
  if (/^(?:NAME|VERIFIED|LIKELY|FOG)：(?:✅|-)$/i.test(text)) return true;
  if (/^正在更新记忆/i.test(text)) return true;
  if (/^记忆已更新\.?$/i.test(text)) return true;
  if (/^(?:VERIFIED|LIKELY|FOG)\s*(?:（[^）]+）|\([^\)]+\))?$/i.test(text)) return true;
  if (/^(?:查看故事|总结故事|探索记录|换世界线|当前故事|剧情摘要)$/i.test(text)) return true;
  if (/^(?:View Story|Summarize Story|Records|Timeline|Current Story|Story Summary)$/i.test(text)) return true;
  if (/^还没有故事总结。?$/i.test(text)) return true;
  if (/^正在总结故事/i.test(text)) return true;
  if (/^故事总结失败$/i.test(text)) return true;
  if (/^故事总结已上链。?$/i.test(text)) return true;
  if (/^故事总结上链失败$/i.test(text)) return true;
  if (/^Role talk enabled\.?/i.test(text)) return true;
  if (/^Role talk 已开启/i.test(text)) return true;
  if (/点麦克风开始说一句/i.test(text)) return true;
  if (/^Awakening Journey[:：]?/i.test(text)) return true;
  if (/^觉醒历程[:：]?/i.test(text)) return true;
  if (/^還原記憶[:：]?/i.test(text)) return true;
  if (/^还原记忆[:：]?/i.test(text)) return true;
  if (/^記憶快照[:：]?/i.test(text)) return true;
  if (/^记忆快照[:：]?/i.test(text)) return true;
  if (/^Memory snapshots?[:：]?/i.test(text)) return true;
  if (/^Memory rewind[:：]?/i.test(text)) return true;
  if (/^Snapshot (?:created|imported|failed)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已创建|已导入|操作失败)[:：.]?/i.test(text)) return true;
  if (/^快照(?:已建立|已匯入|操作失敗)[:：.]?/i.test(text)) return true;
  if (/^正在更新觉醒历程/i.test(text)) return true;
  if (/^觉醒历程已更新。?$/i.test(text)) return true;
  return false;
};

export {
  shouldPersistRoleMessage,
  filterPersistableMessages,
  shouldHideHistoryText,
  isReaderExcludedText,
  filterRoleHistoryMessages,
  shouldExcludeFromSummary,
};
