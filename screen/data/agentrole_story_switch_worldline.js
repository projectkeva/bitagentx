export const getRoleStorySwitchWorldlineCommand = () => '/role story switch-worldline';

export const buildRoleStorySwitchWorldlineMenuMessage = ({ getRoleUiText }) => (
  `[[${getRoleStorySwitchWorldlineCommand()}|${getRoleUiText('switchWorldline') || getRoleUiText('storySwitchWorldlineFallback') || 'Switch worldline'}]]`
);
