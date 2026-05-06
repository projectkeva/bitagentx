import { evaluateRoleModelConfig } from './rolemodel_check';

export async function ensureRoleModelReady(agent, options = {}) {
  const status = await evaluateRoleModelConfig(agent);
  if (status.ok) {
    return status;
  }

  const source = String(options?.source || '').trim() || 'role';
  const reason = String(status.reason || '').trim();
  const label = typeof agent.getRoleUiText === 'function'
    ? agent.getRoleUiText('roleModelCheckStatusLabel', {
        reason: typeof agent.getRoleUiText === 'function' ? agent.getRoleUiText(`roleModelReason_${reason}`) : reason,
      })
    : `Role model check: ${reason}`;

  if (typeof agent.replyFromAgent === 'function') {
    agent.replyFromAgent([
      label,
      '',
      `[[/rolemodel check|${agent.getRoleUiText('roleModelCheckEntry')}]]`,
      '',
      `[[/rolemodel|${agent.getRoleUiText('model')}]]`,
      '',
      source === 'namespace-button'
        ? `[[/role clear|${agent.getRoleUiText('back')}]]`
        : `[[/role|${agent.getRoleUiText('backToRole')}]]`,
    ].join('\n'));
  }

  return status;
}
