export const SETTINGS_LANGUAGE_OPTIONS = [
  { settingsValue: 'en', settingsLabel: 'English', roleCode: 'en', roleLabel: 'English' },
  { settingsValue: 'zar_afr', settingsLabel: 'Afrikaans', roleCode: 'zar-afr', roleLabel: 'Afrikaans' },
  { settingsValue: 'zh_cn', settingsLabel: '简体中文', roleCode: 'zh-cn', roleLabel: '简体中文' },
  { settingsValue: 'zh_tw', settingsLabel: '繁體中文', roleCode: 'zh-tw', roleLabel: '繁體中文' },
  { settingsValue: 'hr_hr', settingsLabel: 'Hrvatski', roleCode: 'hr-hr', roleLabel: 'Hrvatski' },
  { settingsValue: 'cs_cz', settingsLabel: 'Čeština', roleCode: 'cs-cz', roleLabel: 'Čeština' },
  { settingsValue: 'da_dk', settingsLabel: 'Dansk', roleCode: 'da-dk', roleLabel: 'Dansk' },
  { settingsValue: 'de_de', settingsLabel: 'Deutsch', roleCode: 'de', roleLabel: 'Deutsch' },
  { settingsValue: 'es', settingsLabel: 'Español', roleCode: 'es', roleLabel: 'Español' },
  { settingsValue: 'el', settingsLabel: 'Ελληνικά', roleCode: 'el', roleLabel: 'Ελληνικά' },
  { settingsValue: 'it', settingsLabel: 'Italiano', roleCode: 'it', roleLabel: 'Italiano' },
  { settingsValue: 'fi_fi', settingsLabel: 'Suomi', roleCode: 'fi-fi', roleLabel: 'Suomi' },
  { settingsValue: 'fr_fr', settingsLabel: 'Français', roleCode: 'fr', roleLabel: 'Français' },
  { settingsValue: 'id_id', settingsLabel: 'Bahasa Indonesia', roleCode: 'id', roleLabel: 'Bahasa Indonesia' },
  { settingsValue: 'hu_hu', settingsLabel: 'Magyar', roleCode: 'hu-hu', roleLabel: 'Magyar' },
  { settingsValue: 'jp_jp', settingsLabel: '日本語', roleCode: 'ja', roleLabel: '日本語' },
  { settingsValue: 'nl_nl', settingsLabel: 'Nederlands', roleCode: 'nl-nl', roleLabel: 'Nederlands' },
  { settingsValue: 'nb_no', settingsLabel: 'Norsk Bokmål', roleCode: 'nb-no', roleLabel: 'Norsk Bokmål' },
  { settingsValue: 'pt_br', settingsLabel: 'Português (Brasil)', roleCode: 'pt-br', roleLabel: 'Português (Brasil)' },
  { settingsValue: 'pt_pt', settingsLabel: 'Português (Portugal)', roleCode: 'pt-pt', roleLabel: 'Português (Portugal)' },
  { settingsValue: 'ru', settingsLabel: 'Русский', roleCode: 'ru', roleLabel: 'Русский' },
  { settingsValue: 'sv_se', settingsLabel: 'Svenska', roleCode: 'sv-se', roleLabel: 'Svenska' },
  { settingsValue: 'th_th', settingsLabel: 'ไทย', roleCode: 'th', roleLabel: 'ไทย' },
  { settingsValue: 'vi_vn', settingsLabel: 'Tiếng Việt', roleCode: 'vi', roleLabel: 'Tiếng Việt' },
  { settingsValue: 'ua', settingsLabel: 'Українська', roleCode: 'ua', roleLabel: 'Українська' },
  { settingsValue: 'tr_tr', settingsLabel: 'Türkçe', roleCode: 'tr', roleLabel: 'Türkçe' },
  { settingsValue: 'zar_xho', settingsLabel: 'isiXhosa', roleCode: 'zar-xho', roleLabel: 'isiXhosa' },
];

export const buildSettingsLanguageItems = () =>
  SETTINGS_LANGUAGE_OPTIONS.map(item => ({
    label: item.settingsLabel,
    value: item.settingsValue,
    roleCode: item.roleCode,
    roleLabel: item.roleLabel,
  }));

export const findSettingsLanguageOption = value =>
  SETTINGS_LANGUAGE_OPTIONS.find(item => item.settingsValue === value) || null;

export const ROLE_LANGUAGE_OPTIONS = SETTINGS_LANGUAGE_OPTIONS.map(item => ({
  code: item.roleCode,
  label: item.roleLabel,
}));
