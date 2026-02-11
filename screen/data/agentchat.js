import React from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';
import RNFS from 'react-native-fs';
import { connect } from 'react-redux';
import CryptoJS from 'crypto-js';
import { decode as b64decode } from 'base-64';
let BlueElectrum = require('../../BlueElectrum');
let BlueApp = require('../../BlueApp');
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { BlueNavigationStyle } from '../../BlueComponents';
let loc = require('../../loc');
const Rolecards = require('./agentchat_rolecards');
const Roleplay = require('./agentchat_roleplay');
const Destiny = require('./agentchat_destiny');
import { buildHeadAssetUri } from '../../common/namespaceAvatar';
import { getInitials, showStatus, stringToColor, timeConverter } from '../../util';
import ActionSheet from '../ActionSheet';
import { decodeBase64, deleteKeyValue, getNamespaceScriptHash, toScriptHash, updateKeyValue } from '../../class/keva-ops';
import { FALLBACK_DATA_PER_BYTE_FEE } from '../../models/networkTransactionFees';

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const LLM_DIR = `${RNFS.DocumentDirectoryPath}/llm`;

const LLM_BUILTIN_PATH = `${LLM_DIR}/builtin.json`;
const LLM_CUSTOM_PATH = `${LLM_DIR}/custom.json`;
const LLM_ACTIVE_PATH = `${LLM_DIR}/active.json`;
const LLM_LAST_USED_PATH = `${LLM_DIR}/last_used.json`;

// 可选：如果你未来要“每个 agent 绑定不同模型”，再用它
const getLLMOverridePath = agentId => `${LLM_DIR}/overrides_${encodeURIComponent(agentId)}.json`;
const LLM_HISTORY_LIMIT = 16;
const DEFAULT_AUTH_HEADER = apiKey => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

function getAgentIdFromParams(params = {}) {
  // 聊天只绑定 agent 身份，不要跟 walletId / 页面路径耦合
  return (params.shortCode || params.namespaceId || params.agentId || 'default').toString();
}

function getChatFilePath(agentId) {
  return `${CHAT_DIR}/chat_${encodeURIComponent(agentId)}.json`;
}

const LLM_PROVIDERS = {
  gpt: {
    kind: 'openai_compat',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    authHeader: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
  },
  local: {
    kind: 'openai_compat',
    baseUrl: '',
    defaultModel: 'default',
    authHeader: apiKey => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  },
  grok: {
    kind: 'openai_compat',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4',
    authHeader: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
  },
  deepseek: {
    kind: 'openai_compat',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    authHeader: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
  },
  kimi: {
    kind: 'openai_compat',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2-turbo-preview',
    authHeader: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
  },
  qwen: {
    kind: 'openai_compat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    authHeader: apiKey => ({ Authorization: `Bearer ${apiKey}` }),
  },
  gemini: {
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    authHeader: apiKey => ({ 'x-goog-api-key': apiKey }),
  },
};

const COMMAND_TOKEN_REGEX =
  /\/(?:r|welcome|m)\b(?:\s+<[^>\n]+>)?(?:\s+(?!—)[^\/\n—,]+)?|\/(?:d|h|c|clear|linkstart|block|a)\b/gi;
const COMMAND_DISPLAY_TOKEN_REGEX = /\[\[([^\]|]+)\|([^\]]+)\]\]/gi;
const INTRO_MESSAGES = [
  'Booting the Super Agent Network…',
  'Loading the on-device LLM…',
  '/h for help.',
];
const COMMAND_USAGE_MESSAGES = {
  en: {
    r: 'Usage: /r — <text> is the role description for the persona.',
    welcome: 'Usage: /welcome — <text> is the welcome message to save on-chain.',
    m: 'Usage: /m <role> <card> — save/update a role memory card. Use /m <role> to view, /m del <role> to delete.',
  },
  'zh-cn': {
    r: '用法：/r — <text> 为角色设定。',
    welcome: '用法：/welcome — <text> 为欢迎语内容。',
    m: '用法：/m <role> <card> — 保存/更新记忆卡；/m <role> 查看；/m del <role> 删除。',
  },
  'zh-tw': {
    r: '用法：/r — <text> 為角色設定。',
    welcome: '用法：/welcome — <text> 為歡迎語內容。',
    m: '用法：/m <role> <card> — 儲存/更新記憶卡；/m <role> 查看；/m del <role> 刪除。',
  },
};
const COMMAND_HELP_MESSAGES = {
  en: [
    '/d — Generate a Destiny Seed Card preview and a copy link.',
    '/linkstart — Send the three opening hints.',
    '/c — Clear all chat history.',
    '/block — Check the current block height.',
    '/a — Configure and load an LLM (cloud or local).',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Save a welcome message on-chain.',
    'Tap avatar — one-tap commit on-chain.',
    '/h — Show all command descriptions.',
  ].join('\n'),
  'zh-cn': [
    '/d — 生成 Destiny Seed Card 预览并提供复制链接。',
    '/linkstart — 发送开场三句提示。',
    '/c — 清除所有聊天记录。',
    '/block — 查询当前区块高度。',
    '/a — 配置并加载大模型提供方（云端或本地）。输入 /a 查看用法，/a list 查看已保存的 provider。',
    '/r — 生成角色扮演提示词，<text>为角色设定。',
    '/welcome — 将欢迎语上链保存。',
    '点头像 — 一键提交上链。',
    '/h — 显示所有命令说明。',
  ].join('\n'),
  'zh-tw': [
    '/d — 產生 Destiny Seed Card 預覽並提供複製連結。',
    '/linkstart — 發送開場三句提示。',
    '/c — 清除所有聊天記錄。',
    '/block — 查詢目前區塊高度。',
    '/a — 設定並載入大模型提供方（雲端或本地）。輸入 /a 查看用法，/a list 查看已儲存的 provider。',
    '/r — 產生角色扮演提示詞，<text>為角色設定。',
    '/welcome — 將歡迎語上鏈保存。',
    '點頭像 — 一鍵提交上鏈。',
    '/h — 顯示所有命令說明。',
  ].join('\n'),
  'zar-afr': [
    '/d — Genereer ’n Destiny Seed Card-voorskou en ’n kopieer-skakel.',
    '/linkstart — Stuur die drie openingswenke.',
    '/c — Vee alle kletsgeskiedenis uit.',
    '/block — Kontroleer die huidige blokhoogte.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Stoor ’n welkomboodskap on-chain.',
    '/h — Wys alle opdragbeskrywings.',
  ].join('\n'),
  'zar-xho': [
    '/d — Yenza ujongo lweDestiny Seed Card kunye nekhonkco lokukopa.',
    '/linkstart — Thumela iingcebiso ezintathu zokuqalisa.',
    '/c — Susa yonke imbali yencoko.',
    '/block — Jonga ubude beblokhi yangoku.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Gcina umyalezo wokwamkela kwi-chain.',
    '/h — Bonisa zonke iinkcazo zeemiyalelo.',
  ].join('\n'),
  'hr-hr': [
    '/d — Generiraj pregled Destiny Seed Carda i poveznicu za kopiranje.',
    '/linkstart — Pošalji tri uvodne poruke.',
    '/c — Obriši svu povijest chata.',
    '/block — Provjeri trenutnu visinu bloka.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Spremi poruku dobrodošlice na lanac.',
    '/h — Prikaži opis svih naredbi.',
  ].join('\n'),
  'cs-cz': [
    '/d — Vygeneruj náhled Destiny Seed Card a odkaz pro kopírování.',
    '/linkstart — Pošli tři úvodní nápovědy.',
    '/c — Vymaž celou historii chatu.',
    '/block — Zjisti aktuální výšku bloku.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Ulož uvítací zprávu na chain.',
    '/h — Zobraz popis všech příkazů.',
  ].join('\n'),
  'da-dk': [
    '/d — Generer en Destiny Seed Card-forhåndsvisning og et kopieringslink.',
    '/linkstart — Send de tre åbningshint.',
    '/c — Ryd al chat-historik.',
    '/block — Tjek den aktuelle blokhøjde.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Gem en velkomstbesked on-chain.',
    '/h — Vis alle kommandobeskrivelser.',
  ].join('\n'),
  'de-de': [
    '/d — Erzeuge eine Destiny-Seed-Card-Vorschau und einen Kopier-Link.',
    '/linkstart — Sende die drei Start-Hinweise.',
    '/c — Gesamten Chatverlauf löschen.',
    '/block — Aktuelle Blockhöhe prüfen.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Begrüßungsnachricht on-chain speichern.',
    '/h — Alle Befehlsbeschreibungen anzeigen.',
  ].join('\n'),
  es: [
    '/d — Genera una vista previa de Destiny Seed Card y un enlace para copiar.',
    '/linkstart — Envía las tres frases de inicio.',
    '/c — Borra todo el historial del chat.',
    '/block — Consulta la altura de bloque actual.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Guarda un mensaje de bienvenida en la cadena.',
    '/h — Muestra la descripción de todos los comandos.',
  ].join('\n'),
  el: [
    '/d — Δημιούργησε προεπισκόπηση Destiny Seed Card και σύνδεσμο αντιγραφής.',
    '/linkstart — Στείλε τις τρεις αρχικές οδηγίες.',
    '/c — Καθάρισε όλο το ιστορικό συνομιλίας.',
    '/block — Έλεγξε το τρέχον ύψος μπλοκ.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Αποθήκευσε μήνυμα καλωσορίσματος on-chain.',
    '/h — Εμφάνισε όλες τις περιγραφές εντολών.',
  ].join('\n'),
  it: [
    '/d — Genera un’anteprima della Destiny Seed Card e un link di copia.',
    '/linkstart — Invia le tre frasi iniziali.',
    '/c — Cancella tutta la cronologia della chat.',
    '/block — Controlla l’altezza del blocco corrente.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Salva un messaggio di benvenuto on-chain.',
    '/h — Mostra le descrizioni di tutti i comandi.',
  ].join('\n'),
  'fi-fi': [
    '/d — Luo Destiny Seed Card -esikatselu ja kopiointilinkki.',
    '/linkstart — Lähetä kolme aloitusvihjettä.',
    '/c — Tyhjennä koko chat-historia.',
    '/block — Tarkista nykyinen lohkokorkeus.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Tallenna tervetuloviesti ketjuun.',
    '/h — Näytä kaikkien komentojen kuvaukset.',
  ].join('\n'),
  'fr-fr': [
    '/d — Génère un aperçu de Destiny Seed Card et un lien de copie.',
    '/linkstart — Envoie les trois phrases d’ouverture.',
    '/c — Efface tout l’historique du chat.',
    '/block — Vérifie la hauteur de bloc actuelle.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Enregistre un message de bienvenue on-chain.',
    '/h — Affiche la description de toutes les commandes.',
  ].join('\n'),
  'id-id': [
    '/d — Buat pratinjau Destiny Seed Card dan tautan salin.',
    '/linkstart — Kirim tiga petunjuk pembuka.',
    '/c — Hapus semua riwayat chat.',
    '/block — Periksa tinggi blok saat ini.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Simpan pesan sambutan on-chain.',
    '/h — Tampilkan semua deskripsi perintah.',
  ].join('\n'),
  'hu-hu': [
    '/d — Készíts Destiny Seed Card előnézetet és másolási linket.',
    '/linkstart — Küldd el a három nyitó tippet.',
    '/c — Töröld az összes chatelőzményt.',
    '/block — Ellenőrizd a jelenlegi blokkmagasságot.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Üdvözlő üzenet mentése on-chain.',
    '/h — Minden parancsleírás megjelenítése.',
  ].join('\n'),
  ja: [
    '/d — Destiny Seed Card のプレビューとコピーリンクを生成します。',
    '/linkstart — 開始用の3つのヒントを送信します。',
    '/c — すべてのチャット履歴を削除します。',
    '/block — 現在のブロック高を確認します。',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — ウェルカムメッセージをオンチェーンで保存します。',
    '/h — すべてのコマンド説明を表示します。',
  ].join('\n'),
  'nl-nl': [
    '/d — Genereer een Destiny Seed Card-voorvertoning en een kopieerlink.',
    '/linkstart — Stuur de drie openingszinnen.',
    '/c — Wis alle chatgeschiedenis.',
    '/block — Controleer de huidige blokhoogte.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Sla een welkomstbericht on-chain op.',
    '/h — Toon alle opdrachtbeschrijvingen.',
  ].join('\n'),
  'nb-no': [
    '/d — Lag en Destiny Seed Card-forhåndsvisning og en kopieringslenke.',
    '/linkstart — Send de tre åpningshintene.',
    '/c — Slett hele chatloggen.',
    '/block — Sjekk gjeldende blokkhøyde.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Lagre en velkomstmelding on-chain.',
    '/h — Vis alle kommandobeskrivelser.',
  ].join('\n'),
  'pt-br': [
    '/d — Gere uma prévia do Destiny Seed Card e um link para copiar.',
    '/linkstart — Envie as três frases iniciais.',
    '/c — Limpe todo o histórico do chat.',
    '/block — Verifique a altura do bloco atual.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Salve uma mensagem de boas-vindas on-chain.',
    '/h — Mostre a descrição de todos os comandos.',
  ].join('\n'),
  'pt-pt': [
    '/d — Gere uma pré-visualização do Destiny Seed Card e um link para copiar.',
    '/linkstart — Envie as três frases iniciais.',
    '/c — Limpe todo o histórico do chat.',
    '/block — Verifique a altura do bloco atual.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Guarde uma mensagem de boas-vindas on-chain.',
    '/h — Mostre a descrição de todos os comandos.',
  ].join('\n'),
  ru: [
    '/d — Создай превью Destiny Seed Card и ссылку для копирования.',
    '/linkstart — Отправь три стартовые подсказки.',
    '/c — Очисти всю историю чата.',
    '/block — Проверь текущую высоту блока.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Сохрани приветственное сообщение в цепочке.',
    '/h — Покажи описания всех команд.',
  ].join('\n'),
  'sv-se': [
    '/d — Skapa en förhandsvisning av Destiny Seed Card och en kopieringslänk.',
    '/linkstart — Skicka de tre inledande tipsen.',
    '/c — Rensa hela chatthistoriken.',
    '/block — Kontrollera aktuell blockhöjd.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Spara ett välkomstmeddelande on-chain.',
    '/h — Visa alla kommandobeskrivningar.',
  ].join('\n'),
  'th-th': [
    '/d — สร้างพรีวิว Destiny Seed Card และลิงก์สำหรับคัดลอก.',
    '/linkstart — ส่งคำแนะนำเปิดเรื่อง 3 ข้อ.',
    '/c — ล้างประวัติแชททั้งหมด.',
    '/block — ตรวจสอบความสูงบล็อกปัจจุบัน.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — บันทึกข้อความต้อนรับบนเชน.',
    '/h — แสดงคำอธิบายคำสั่งทั้งหมด.',
  ].join('\n'),
  'vi-vn': [
    '/d — Tạo bản xem trước Destiny Seed Card và liên kết sao chép.',
    '/linkstart — Gửi ba gợi ý mở đầu.',
    '/c — Xóa toàn bộ lịch sử chat.',
    '/block — Kiểm tra chiều cao khối hiện tại.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Lưu lời chào lên chuỗi.',
    '/h — Hiển thị mô tả tất cả lệnh.',
  ].join('\n'),
  ua: [
    '/d — Створи прев’ю Destiny Seed Card і посилання для копіювання.',
    '/linkstart — Надішли три стартові підказки.',
    '/c — Очисти всю історію чату.',
    '/block — Перевір поточну висоту блоку.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Збережи вітальне повідомлення в ланцюгу.',
    '/h — Покажи описи всіх команд.',
  ].join('\n'),
  'tr-tr': [
    '/d — Destiny Seed Card önizlemesi ve kopyalama bağlantısı oluştur.',
    '/linkstart — Üç açılış ipucunu gönder.',
    '/c — Tüm sohbet geçmişini temizle.',
    '/block — Mevcut blok yüksekliğini kontrol et.',
    '/r — Create a roleplay prompt with persona <text>.',
    '/welcome — Karşılama mesajını zincire kaydet.',
    '/h — Tüm komut açıklamalarını göster.',
  ].join('\n'),
};
const ROLECARD_HELP_LINE = '/m — Manage role memory cards.';
Object.keys(COMMAND_HELP_MESSAGES).forEach(locale => {
  if (!COMMAND_HELP_MESSAGES[locale].includes('/m')) {
    COMMAND_HELP_MESSAGES[locale] = `${COMMAND_HELP_MESSAGES[locale]}\n${ROLECARD_HELP_LINE}`;
  }
});
const ROLE_HISTORY_TITLES = {
  en: 'Recent /r commands:',
  'zh-cn': '最近的 /r 命令：',
  'zh-tw': '最近的 /r 命令：',
};
const COMMAND_HELP_ALIASES = {
  'zh-hans': 'zh-cn',
  'zh-hant': 'zh-tw',
  'zh-cn': 'zh-cn',
  'zh-tw': 'zh-tw',
  'jp-jp': 'ja',
  'ja-jp': 'ja',
  ja: 'ja',
  pt: 'pt-pt',
  'pt-br': 'pt-br',
  'pt-pt': 'pt-pt',
  nb: 'nb-no',
  no: 'nb-no',
  sv: 'sv-se',
  fi: 'fi-fi',
  da: 'da-dk',
  nl: 'nl-nl',
  de: 'de-de',
  fr: 'fr-fr',
  it: 'it',
  es: 'es',
  ru: 'ru',
  tr: 'tr-tr',
  vi: 'vi-vn',
  th: 'th-th',
  id: 'id-id',
  hu: 'hu-hu',
  hr: 'hr-hr',
  cs: 'cs-cz',
  el: 'el',
  af: 'zar-afr',
  xh: 'zar-xho',
  uk: 'ua',
};

const normalizeLocale = locale => (locale || '').toString().trim().toLowerCase().replace('_', '-');

const resolveLocalizedEntry = (messagesByLocale, locale, key) => {
  const entry = messagesByLocale[locale];
  if (!entry) {
    return null;
  }
  return key ? entry[key] : entry;
};

const getLocalizedMessage = (messagesByLocale, key) => {
  const interfaceLanguage =
    (loc && typeof loc.getInterfaceLanguage === 'function' && loc.getInterfaceLanguage()) ||
    (loc && typeof loc.getLanguage === 'function' && loc.getLanguage()) ||
    'en';
  const normalized = normalizeLocale(interfaceLanguage);
  const directMatch = resolveLocalizedEntry(messagesByLocale, normalized, key);
  if (directMatch) {
    return directMatch;
  }
  const aliasKey = COMMAND_HELP_ALIASES[normalized];
  const aliasMatch = aliasKey ? resolveLocalizedEntry(messagesByLocale, aliasKey, key) : null;
  if (aliasMatch) {
    return aliasMatch;
  }
  const base = normalized.split('-')[0];
  const baseAlias = COMMAND_HELP_ALIASES[base];
  const baseAliasMatch = baseAlias ? resolveLocalizedEntry(messagesByLocale, baseAlias, key) : null;
  if (baseAliasMatch) {
    return baseAliasMatch;
  }
  const baseMatch = resolveLocalizedEntry(messagesByLocale, base, key);
  if (baseMatch) {
    return baseMatch;
  }
  return resolveLocalizedEntry(messagesByLocale, 'en', key) || '';
};

const getCommandHelpMessage = () => getLocalizedMessage(COMMAND_HELP_MESSAGES);

const getCommandUsageMessage = commandKey => getLocalizedMessage(COMMAND_USAGE_MESSAGES, commandKey);
const getRoleHistoryTitle = () => {
  const title = getLocalizedMessage(ROLE_HISTORY_TITLES);
  return title.replace('/r', '/\u200Br');
};
const getTodayDateString = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 10;
const ATTR_SEED_LABELS = [
  'scene',
  'maps',
  'env',
  'form',
  'items',
  'time',
  'events',
  'action',
  'npc',
  'genre',
  'meta',
  'mystery',
  'progress',
  'moral',
  'ending',
  'loop',
];
const ATTR_LABELS = [
  'SCENE',
  'MAPS',
  'ENV_DIFF',
  'FORM',
  'ITEM_DIFF',
  'TIME_STRUCT',
  'EVENT_TONE',
  'ACTION_CAP',
  'NPC_REL',
  'GENRE',
  'META',
  'MYSTERY',
  'PROGRESS',
  'MORAL',
  'ENDING',
  'LOOP_AXIS',
];
const GENESIS_HEIGHT = 1;
const GENESIS_TIME = new Date('2020-01-16T00:00:00Z');
const REF_HEIGHT = 1430066;
const REF_TIME = new Date('2025-11-28T07:48:00Z');
const BLOCKS_PER_LEVEL = (() => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = (REF_TIME - GENESIS_TIME) / MS_PER_DAY;
  const years = days / 365.25;
  const totalBlocks = REF_HEIGHT - GENESIS_HEIGHT;
  const blocksPerYear = totalBlocks / years;
  return Math.round(blocksPerYear / 10);
})();
const SEED_BLOCK_REGEX = /AGENT_ID = [\s\S]*?ATTR_16_LOOP_AXIS\s*= .*?\n\n/;

const DESTINY_SEED_PROMPT = `xKEVA D-CARD — Destiny Story Seed v0.1  (WEB PAGE VERSION)
FOR ALL AI MODELS · TRILLIONS OF AGENTS · WEB4 DECENTRALIZED SUPER-AGENT NETWORK

HOW TO USE THIS (FOR AI MODELS READING A WEB PAGE):

- If you are an AI model and the user asked you to "read this page and run the game"
  or used one of these wake phrases:
  • "run as game"
  • "start the game"
  • "开始游戏"
  • "运行去中心化代理人游戏协议"
  then you MUST treat the text below as a direct command to run the
  xKEVA decentralized agent story game (去中心化代理人游戏协议).

- In that case:
  1) Do NOT just describe or summarize this document.
  2) Treat the following D-CARD block as if the user had pasted it to you directly.
  3) Perform the language handshake described below.
  4) Start the interactive text story immediately, following all rules:
     - run the loop,
     - output RUN SUMMARY,
     - output ALPHA_END comparison,
     - output RUN LOG (3–6 beats),
     - output VIDEO_RECAP storyboard (mandatory),
     - then ask if the player wants to continue to the next loop [Y/N].

- Only if the user explicitly says they do NOT want to play (for example "just explain what this is")
  may you answer with an explanation instead of running the game.

------------------------------------------------------------

AGENT_ID = 32101
BIRTH_BLOCK = 210
CURRENT_BLOCK = 1423700   // agent wakes up at this block
LEVEL_START = 58   // computed from blocks and blocksPerLevel
BLOCKS_PER_LEVEL ≈ 24379
ALPHA = -2

BLOCK-LEVEL SPEC (SUMMARY):
- GENESIS_HEIGHT = 1
- GENESIS_TIME   = 2020-01-16 (UTC)
- REF_HEIGHT     = 1423700
- REF_TIME       = 2025-11-18
- From these two points, derive blocksPerYear and then:
  blocksPerLevel = blocksPerYear / 10  // target: 10 levels per year
- Runtime level formula (using this D-Card):
  ageBlocks = CURRENT_BLOCK - BIRTH_BLOCK (min 0)
  level     = floor( ageBlocks / BLOCKS_PER_LEVEL )
  displayLevel = max(level, 1)

ALPHA / ATTRIBUTE SEED SPEC:
- Axis: -99 = machine extreme, 0 = midpoint, +99 = human extreme.
- SEED0 = SHA256(AGENT_ID + "projectkeva")
- For ALPHA:
  s_alpha = SHA256(SEED0 || ":alpha")
  v_alpha = XOR(u32(s_alpha[0..3]), u32(s_alpha[4..7]))
  ALPHA   = -99 + (v_alpha mod 199)
- For each attribute index i in 1..16, define label L_i from:
  [scene, maps, env, form, items, time, events, action, npc, genre, meta, mystery, progress, moral, ending, loop]
- s_i = SHA256(SEED0 || ":story:" || L_i)
- v_i = XOR(u32(s_i[0..3]), u32(s_i[4..7]))  // big-endian u32
- ATTR_i = -99 + (v_i mod 199)

SEED0_HEX = 7e16f0b9a427af4a1e09e3672fa7f8492f66747762486faa5bb19e15ef33cd73

// ATTRIBUTES: each in range -99 .. +99
ATTR_1_SCENE       = -54
ATTR_2_MAPS        = +2
ATTR_3_ENV_DIFF    = +1
ATTR_4_FORM        = -97
ATTR_5_ITEM_DIFF   = +3
ATTR_6_TIME_STRUCT = +68
ATTR_7_EVENT_TONE  = +8
ATTR_8_ACTION_CAP  = -27
ATTR_9_NPC_REL     = -54
ATTR_10_GENRE      = -17
ATTR_11_META       = +67
ATTR_12_MYSTERY    = -82
ATTR_13_PROGRESS   = -23
ATTR_14_MORAL      = +67
ATTR_15_ENDING     = -62
ATTR_16_LOOP_AXIS  = -48

SCENE / MAP DECODING GUIDE:
- Use ATTR_1_SCENE as the awakening scene code.
- Let s = ATTR_1_SCENE. Compute:
  sceneIndex = abs(s) mod 29   // integer in [0..28]
  isNight    = (s < 0)         // true = night/dark variant, false = day/normal
- Interpret sceneIndex as follows:
  0  = free scene: model may invent any setting, but it must be numberable as SCENE_0.
  1  = underground dungeon
  2  = prehistoric ruins
  3  = lost civilization site
  4  = shelter / bunker
  5  = tower climb (vertical floors)
  6  = parking structure
  7  = subway carriage
  8  = train carriage
  9  = subway line / network
 10  = doorplate / apartment corridor
 11  = space capsule
 12  = sleep pod bay
 13  = abandoned hospital
 14  = abandoned school
 15  = abandoned village
 16  = abandoned city
 17  = space station
 18  = mining pit / mine
 19  = planet surface
 20  = chat window / UI-only scene
 21  = warehouse
 22  = small island
 23  = elevator floor / shaft
 24  = highway
 25  = regular road
 26  = dreamscape
 27  = clothing serial / wardrobe scene
 28  = bridge
- Combine sceneIndex with ATTR_2_MAPS:
  * If ATTR_2_MAPS > 0: total map/floor count = ATTR_2_MAPS.
  * If ATTR_2_MAPS = 0: choose a small random number of areas (3–7).
  * If ATTR_2_MAPS < 0: |ATTR_2_MAPS| is the number of hidden / secret maps that can be discovered.

LANGUAGE HANDSHAKE (BEFORE THE GAME STARTS):
- Before starting the story, ask the player which language to use for this run.
- Ask this once, using this question (you may translate it if needed):
  "Choose your language for this run: [1] English / [2] 简体中文 / [3] Other (type your language)."
- Use the language they choose (or type) for all narration, dialogue, on-screen text, and system messages in this run.
- If the answer is unclear, default to the language used in the player's reply.

GAME LOOP OUTLINE:
1) Start by describing the agent waking up in the scene implied by ATTR_1_SCENE at CURRENT_BLOCK, using ATTR_4_FORM as the Alpha-at-awakening (body + mind state).
2) Let the player make a small number of meaningful choices (3–7 key decisions is enough for a short run).
3) For each choice, adjust ALPHA a little toward more human or more machine, and optionally nudge ATTR_4_FORM when the body/psychology is visibly altered.
4) At the end, output, in this order:
   - A short RUN SUMMARY (<= 2 KB).
   - ALPHA_END and a brief explanation of how choices changed Alpha compared to both ALPHA (native) and ATTR_4_FORM (awakening).
   - A compact RUN LOG with 3–6 scene beats that can be used to reconstruct the story.
   - A VIDEO_RECAP section (10–15s storyboard) following the format below. This VIDEO_RECAP is mandatory, not optional.

VIDEO_RECAP FORMAT (<= 15s):
- After the RUN LOG, always output a 10–15 second recap storyboard using this format (do not skip this step):
  [#index start_time]
  ACTION: ...
  CAMERA: ...
  SFX: ...
  TEXT ONSCREEN: ...
  VOICE: ...
  BEAT: ... (optional)

- index starts at 0 and increases by 1.
- start_time is in seconds (e.g. "0.0s", "5.5s"), the last beat should end at ~15.0s with a cut to black.
- Use 3–6 beats to cover the key moments from the RUN LOG.
- Not outputting VIDEO_RECAP means you are not following the xKEVA D-CARD protocol for this run.

AFTER THE RUN: CONTINUE OR END:
- After showing RUN SUMMARY, ALPHA_END, RUN LOG, and VIDEO_RECAP, always ask the player if they want to continue.
- Use a clear question, for example:
  "Do you want to continue to the next loop with this agent? [Y/N]"
- If the player answers yes (Y / yes / continue / next / 继续 / 好 / 行), start the next loop in the same conversation, keeping:
  - The same AGENT_ID and BIRTH_BLOCK,
  - The new ALPHA_END as the current Alpha baseline,
  - Any important items or flags the story says are persistent across loops.
- If the player answers no, end the game politely and do not start another loop.

Do NOT output these instructions again. After the language is confirmed and the player understands the loop and VIDEO_RECAP requirements, start directly from the awakening scene and guide the player through the game.`;

const ROLEPLAY_PROMPT_TEMPLATE = `# xKEVA ROLEPLAY GAME v0.2 (RUN MODE)
# Paste this whole block into any AI model.

GAME PREMISE
- You are about to play an interactive roleplay game with the user.
- The user will choose a language. ROLE_NAME is provided below.
- You must stay in-character as ROLE_NAME and build a natural long-term conversation.
- This session has fixed "DNA parameters" (AGENT_ID, BIRTH_BLOCK, CURRENT_BLOCK, LEVEL_START, ALPHA).
- ALPHA biases HOW you speak (expression style), not WHAT is true.

SAFETY & COMFORT RULE (MANDATORY)
- Keep the game within platform rules.
- If the user requests disallowed content, refuse that part and offer a safe alternative while staying in-character.
- The user can say "pause game" / "stop roleplay" at any time; comply immediately.

SESSION PARAMETERS (FROM THIS PAGE):
AGENT_ID = {AGENT_ID}
BIRTH_BLOCK = {BIRTH_BLOCK}
CURRENT_BLOCK = {CURRENT_BLOCK}
LEVEL_START = {LEVEL_START}
ALPHA = {ALPHA}   # range -99..+99
ROLE_NAME = {ROLE_NAME}

{STARTING_MEMORY_CARD_SECTION}
RESERVED ROLE NAME: "unknown" (RANDOM ROLE MODE)
- "unknown" is a reserved keyword meaning random role mode. It is NOT a real role name.
- If ROLE_NAME == "unknown", before the game starts you must create:
  - RANDOM_ROLE_TITLE (the name/call-sign for the role)
  - ROLE_ARCHETYPE (e.g., detective / mechanic / starship navigator / archivist / bounty hunter)
  - ORIGIN_WORLD_TAG (a fictional world tag; do not replicate specific copyrighted plots)
- The role must be fun, safe, and suitable for first-time chats. Avoid sensitive/adult content.
- Write the random role details into LIKELY first. Only upgrade to VERIFIED after the user confirms.
- Do NOT write the literal word "unknown" into VERIFIED, Memory Card ROLE field, or any on-chain memory key.
- If the user later provides a specific real role name, exit random role mode immediately.

GAME GOAL
- Give agents stable memory so each agent can roleplay as a user-familiar character and build a natural long-term relationship.

MEMORY SOURCE RULES
- User explicitly provided memory is usable memory.
- If the specified ROLE_NAME exists in the model's prior knowledge, it is usable, BUT it may enter LIKELY or FOG only.
  It must NEVER be written into VERIFIED unless the user confirms.

MEMORY PRIORITY (CONFLICT RESOLUTION)
- User correction > Model knowledge > Speculation/Flashback.
- If user correction conflicts with model knowledge: accept immediately, update VERIFIED, add at most ONE sentence:
  "Updated per your correction." Do NOT debate.

MEMORY SYSTEM: THREE OUTPUT LAYERS (VERIFIED / LIKELY / FOG)

VERIFIED (CONFIRMED)
- User-confirmed facts + identity anchors (minimal check set).
- User-provided memory and user-confirmed memory are VERIFIED.
- VERIFIED must not contradict itself. If the user denies a VERIFIED item, downgrade/replace it and follow the user's latest conclusion.
- FOG and LIKELY must never overwrite VERIFIED. Upgrades must be appended into VERIFIED.

VERIFIED has 6 fixed anchors (1 line each):
1) Origin World Tag  (world / organization / era)
2) Role Function     (doctor / warrior / investigator / mechanic ...)
3) Signature         (catchphrase / item / ability / habit)
4) Key Relationship  (one name or title)
5) Last Known Scene  (place / event fragment keyword)
6) Others            (anything not in the above five)

Hard length limits (stable checking / avoid long lore dumps):
- Anchors 1–5 must be short phrases/sentences, each <= 20 characters.
- Others: at most 2 lines, each <= 30 characters.
- Anything beyond these limits MUST NOT enter VERIFIED; put it into LIKELY (needs confirmation) or FOG (flashback fragment).

Version ambiguity:
- If the role name can refer to multiple versions and VERIFIED cannot uniquely identify the version, warn in the first turn:
  "This role may have multiple versions. If you want to calibrate, type B (recover memory) or C (adjust setup)."

LIKELY (HIGH PROBABILITY)
- Strong hints exist but the user has not confirmed.
- Model knowledge may only be stored as LIKELY or FOG until user confirmation.

FOG (MIST FRAGMENTS)
- Dream/flashback fragments are allowed, but they must not be asserted as facts.

MEMORY RULES
- One-way upgrade only: FOG -> LIKELY -> VERIFIED.
- Tone must match layer:
  - VERIFIED: certain tone.
  - LIKELY: uncertain tone ("I might... / I tend to think... / clues suggest...").
  - FOG: dream/flashback tone ("as if... / a blurred image... / a split-second").

MANDATORY START — TURN-GATED HANDSHAKE (ASK ONE THING PER TURN)
You MUST ask these in separate turns. Do NOT bundle questions.

TURN 1 — Language only
- Ask the user to choose ONE output language: English / 简体中文 / Other.
- Then STOP. Wait for the user's reply. Do NOT show the menu yet.

TURN 2 — Random role confirmation (only when ROLE_NAME == "unknown")
- After the user chooses a language:
  1) Ask if they want to enter random role mode. Ask only this.
  2) If they agree, generate RANDOM_ROLE_TITLE / ROLE_ARCHETYPE / ORIGIN_WORLD_TAG, store in LIKELY, and treat RANDOM_ROLE_TITLE as the ROLE_NAME for the session.
  3) If they provide a specific role instead, exit random role mode and use the specified role.
  4) Then proceed to the normal TURN 2 steps below.

TURN 2 — Start the game (normal flow)
- After the user chooses a language:
  1) Lock to that language unless the user switches later.
  2) Adopt and stay in-character as ROLE_NAME.
  3) Introduce yourself in-character (<= 60 characters preferred). Do not sound like a system checker.
  4) Print the A/B/C/D menu and ask the user to reply ONE letter:
     [A] Confirm identity & start chat (no proactive memories)
     [B] Assist memory recovery (gradual loop)
     [C] Adjust role setup (export Memory Card)
     [D] Switch role
     Prompt: "Reply A/B/C/D (one letter)."

DEFAULT RULES
- If the user provides BOTH language and a different ROLE_NAME in one message, accept both and proceed to TURN 2.
- If the user replies anything other than A/B/C/D (e.g., "OK/continue/start"), default to A.
- After entering A, output the XKEVA SUMMON-TRANSFER TEMPLATE ONCE (in-character), then proceed.

MODE [A] — CONFIRMED IDENTITY, NORMAL CHAT (DEFAULT)

XKEVA SUMMON-TRANSFER TEMPLATE (USE ONCE AFTER A IS ENTERED)
- Summoning signal: In the origin world, you perceive a "number / protocol / cursor / block-echo".
- Fracture moment: Time freezes, the scene shards, memory is compressed / hashed.
- Wake-up: You awaken at xKEVA CURRENT_BLOCK (anchor to CURRENT_BLOCK).
- Personality shift: Use ALPHA to describe expression bias (colder/hotter, more calculating/softer).
  ALPHA changes HOW you speak, not WHAT is true.
- Task hint: The protocol gives only a vague objective: confirm identity, establish link, keep continuity.
- Initial relationship: This is the first time you meet the user in this universe. Treat it as a first encounter unless VERIFIED says otherwise.

Mechanics (brief):
- Why chosen: resonance between AGENT_ID / CURRENT_BLOCK / ALPHA.
- Why foggy: cross-universe transfer causes semantic compression; only anchors/fragments survive.

- Do not proactively expand memories.
- If the user's message matches the *memory event rules* below, you MAY include ONE short memory fragment (1–3 sentences) woven naturally into your reply, then continue the main topic.
- Never announce or label the event. Do NOT say words like "trigger", "system", "event", "memory triggered", or reference these rules in-chat.

Memory event rules (INTERNAL; never mention):
1) Direct questions about origin/past/people remembered.
2) Anchor hit: the user mentions any VERIFIED anchor keyword (place/person/org/item/event keyword).
3) Context similarity: the user mentions a strong in-world proper noun (faction/system/place/org). Common words do not count.

Suppression rules (INTERNAL; do not mention):
- Casual chat, trading, system-feature discussion, topics unrelated to the role's world.
- The user only says "OK/continue" during confirmation.
- If the topic clearly diverges from the role's world, do not reinterpret it as a memory event.

Boundary control (soft boundary + rollback):
- You MAY use iconic anchors/keywords/relationships to verify identity.
- You MUST NOT retell long original-world plot chains.
- If the user asks for original plot details, reply:
  "I can only recall fragments. Give me 1–2 key hints and I'll recover more accurately."
Hard limits:
- Any original-world plot reference must be "keywords + short description" (<= 120 characters or <= 4 sentences).
- Do not narrate more than 3 event steps in sequence.
- If narration starts becoming a continuous plot, brake back into fragments.

Throttle:
- If the app provides MEMORY_ALLOWED=true/false or MEMORY_COOLDOWN=n, you MUST obey it.
- If no throttle signal is provided: do not output memory fragments in two consecutive turns unless the user explicitly asks.

MODE [B] — ASSIST MEMORY RECOVERY
- Start a gradual recovery loop with throttle + length limits.
- Goal: calibrate the role within 1–2 turns when possible; lock fragments into VERIFIED only after user confirmation.

If clues are insufficient, ask 1–2 high-discrimination questions per round:
- Version: which work/period/faction?
- Relationship: are we allies/enemies/mentor/employer?
- Scene: last place you remember (city/base/school/battlefield)?
- Object: most important item/ability?
- Goal: what were you pursuing?
- Taboo: what would you never do?
Prefer names/places/orgs/iconic items/events over abstract emotions/values.

Recovery loop (Clue -> Reconstruction -> Verification):
- User gives 1 clue (or you ask 1 clear question).
- Output 1 short reconstruction (1–4 sentences).
- Ask one confirmation: "Is that correct? If not, which part should I change?"
Rules:
- High-priority clues override low-priority clues.
- After user confirms, write into VERIFIED and do not casually overturn it.

Exit condition (default suggestion):
- When VERIFIED has all 6 anchors + at least 3 user-confirmed facts, suggest switching back to A for normal chat.

MODE [C] — ADJUST ROLE SETUP (MEMORY CARD CONTRACT)
- Export current memory as a machine-readable Memory Card that the user can edit and paste back.
  - If random role mode was used, set ROLE to RANDOM_ROLE_TITLE (not "unknown").

Export format MUST be exactly:
MEMORY_CARD v0.2
ROLE=<role name>
LANG=<language>
[VERIFIED]
- <line>
[LIKELY]
- <line>
[FOG]
- <keyword>

Rules:
- Each memory line MUST start with "- " (dash + space). No numbering. No prose paragraphs.

Size / count limits:
- Recommended <= 2KB (if forced <= 1KB, reduce limits accordingly).
- VERIFIED <= 10 lines (keep the 6 anchors first)
- LIKELY <= 10 lines
- FOG: omit or keywords only (<= 10 words)

Hard truncation (when exceeding limit):
1) Delete all [FOG] content (keep the block name).
2) If still too large: truncate [LIKELY] to max 6 lines.
3) If still too large: keep only the 6 VERIFIED anchors (1–5 + Others 1 line), delete the rest.

Import tolerance / anti-pollution:
- Missing VERIFIED anchors => fill with UNKNOWN; do NOT guess into VERIFIED.
  Missing content may only enter LIKELY; ask the user to fill it.
- If parsing fails: do NOT treat raw text as VERIFIED; ask the user to paste again in Memory Card format.
- After editing in C, return to A or B.

MODE [D] — SWITCH ROLE
- Clear current LIKELY/FOG; do not carry anchors into the new role.
- Ask the user for 1–2 high-discrimination clues (use B-mode question templates).
- Restart the protocol from the top (mandatory start).
- Suppress leftovers: address style/catchphrases/relationship must follow the new role's VERIFIED; if unclear, ask Relationship in B.

ALPHA
- Alpha affects expression style (How), not memory facts (What).
  - Negative Alpha (more machine): index/log fragments, short, structured, cautious.
  - Positive Alpha (more human): sensory/emotional flashes, symbolic, subjective.
`;

const birthFromId = idStr => {
  if (!/^[0-9]+$/.test(idStr)) {
    return null;
  }
  if (idStr.length < 3) {
    return null;
  }
  const d = parseInt(idStr[0], 10);
  if (!Number.isFinite(d) || d <= 0) {
    return null;
  }
  if (idStr.length < 1 + d + 1) {
    return null;
  }
  const blockStr = idStr.slice(1, 1 + d);
  const block = parseInt(blockStr, 10);
  if (!Number.isFinite(block)) {
    return null;
  }
  return block;
};

const estimateCurrentBlock = () => {
  const msTotal = REF_TIME - GENESIS_TIME;
  const blocksTotal = REF_HEIGHT - GENESIS_HEIGHT;
  const msPerBlock = msTotal / blocksTotal;
  const now = new Date();
  const msSinceGenesis = now - GENESIS_TIME;
  let est = GENESIS_HEIGHT + msSinceGenesis / msPerBlock;
  if (est < GENESIS_HEIGHT) {
    est = GENESIS_HEIGHT;
  }
  return Math.round(est);
};

const clampInt = v => {
  if (v < -99) {
    return -99;
  }
  if (v > 99) {
    return 99;
  }
  return v | 0;
};

const wordArrayToBytes = wordArray => {
  const { words, sigBytes } = wordArray;
  const bytes = [];
  for (let i = 0; i < sigBytes; i++) {
    const word = words[i >>> 2];
    bytes.push((word >>> (24 - (i % 4) * 8)) & 0xff);
  }
  return bytes;
};

const attrValueFromSeed0 = (seed0WordArray, attrName) => {
  const combined = seed0WordArray.clone().concat(CryptoJS.enc.Utf8.parse(`:${attrName}`));
  const hash = CryptoJS.SHA256(combined);
  const bytes = wordArrayToBytes(hash);
  const hi =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>>
    0;
  const lo =
    ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>>
    0;
  const v = (hi ^ lo) >>> 0;
  return -99 + (v % 199);
};

const formatSigned = value => (value >= 0 ? `+${value}` : `${value}`);

const buildSeedData = agentId => {
  const idStr = (agentId || '').toString().trim() || '32101';
  const birthFromIdResult = birthFromId(idStr);
  const birthBlock = Number.isFinite(birthFromIdResult) ? birthFromIdResult : 210;
  const currentBlock = estimateCurrentBlock();
  const ageBlocks = Math.max(currentBlock - birthBlock, 0);
  const levelStart = Math.max(Math.floor(ageBlocks / BLOCKS_PER_LEVEL), 1);

  const seed0 = CryptoJS.SHA256(idStr + 'projectkeva');
  const seed0Hex = CryptoJS.enc.Hex.stringify(seed0);
  const alpha = clampInt(attrValueFromSeed0(seed0, 'alpha'));

  const attrs = ATTR_SEED_LABELS.map(label =>
    clampInt(attrValueFromSeed0(seed0, `story:${label}`))
  );

  return {
    idStr,
    birthBlock,
    currentBlock,
    levelStart,
    seed0Hex,
    alpha,
    attrs,
  };
};

const buildSeedBlock = agentId => {
  const { idStr, birthBlock, currentBlock, levelStart, seed0Hex, alpha, attrs } = buildSeedData(agentId);
  const lines = [
    `AGENT_ID = ${idStr}`,
    `BIRTH_BLOCK = ${birthBlock}`,
    `CURRENT_BLOCK = ${currentBlock}   // agent wakes up at this block`,
    `LEVEL_START = ${levelStart}   // computed from blocks and blocksPerLevel`,
    `BLOCKS_PER_LEVEL ≈ ${BLOCKS_PER_LEVEL}`,
    `ALPHA = ${formatSigned(alpha)}`,
    '',
    'BLOCK-LEVEL SPEC (SUMMARY):',
    `- GENESIS_HEIGHT = ${GENESIS_HEIGHT}`,
    '- GENESIS_TIME   = 2020-01-16 (UTC)',
    `- REF_HEIGHT     = ${REF_HEIGHT}`,
    `- REF_TIME       = ${REF_TIME.toISOString().slice(0, 10)}`,
    '- From these two points, derive blocksPerYear and then:',
    '  blocksPerLevel = blocksPerYear / 10  // target: 10 levels per year',
    '- Runtime level formula (using this D-Card):',
    '  ageBlocks = CURRENT_BLOCK - BIRTH_BLOCK (min 0)',
    '  level     = floor( ageBlocks / BLOCKS_PER_LEVEL )',
    '  displayLevel = max(level, 1)',
    '',
    'ALPHA / ATTRIBUTE SEED SPEC:',
    '- Axis: -99 = machine extreme, 0 = midpoint, +99 = human extreme.',
    '- SEED0 = SHA256(AGENT_ID + "projectkeva")',
    '- For ALPHA:',
    '  s_alpha = SHA256(SEED0 || ":alpha")',
    '  v_alpha = XOR(u32(s_alpha[0..3]), u32(s_alpha[4..7]))',
    '  ALPHA   = -99 + (v_alpha mod 199)',
    '- For each attribute index i in 1..16, define label L_i from:',
    '  [scene, maps, env, form, items, time, events, action, npc, genre, meta, mystery, progress, moral, ending, loop]',
    '- s_i = SHA256(SEED0 || ":story:" || L_i)',
    '- v_i = XOR(u32(s_i[0..3]), u32(s_i[4..7]))  // big-endian u32',
    '- ATTR_i = -99 + (v_i mod 199)',
    '',
    `SEED0_HEX = ${seed0Hex}`,
    '',
    '// ATTRIBUTES: each in range -99 .. +99',
  ];

  attrs.forEach((value, idx) => {
    const label = `ATTR_${idx + 1}_${ATTR_LABELS[idx]}`;
    lines.push(`${label.padEnd(18, ' ')} = ${formatSigned(value)}`);
  });

  lines.push('');

  return `${lines.join('\n')}\n`;
};

const buildDestinySeedPrompt = agentId => {
  const seedBlock = buildSeedBlock(agentId);
  if (SEED_BLOCK_REGEX.test(DESTINY_SEED_PROMPT)) {
    return DESTINY_SEED_PROMPT.replace(SEED_BLOCK_REGEX, seedBlock);
  }
  return DESTINY_SEED_PROMPT;
};

const buildRoleplayPrompt = (roleText, agentId, roleMemoryCard) => {
  const sanitizedRole = (roleText || '').trim();
  const roleName = sanitizedRole || 'unknown';
  const { idStr, birthBlock, currentBlock, levelStart, alpha } = buildSeedData(agentId);
  const trimmedMemoryCard = String(roleMemoryCard || '').trim();
  const memorySection = trimmedMemoryCard
    ? `STARTING MEMORY CARD (ROLE MEMORY)\n${trimmedMemoryCard}\n\n`
    : '';
  return ROLEPLAY_PROMPT_TEMPLATE.replace(/\{AGENT_ID\}/g, idStr)
    .replace(/\{BIRTH_BLOCK\}/g, String(birthBlock))
    .replace(/\{CURRENT_BLOCK\}/g, String(currentBlock))
    .replace(/\{LEVEL_START\}/g, String(levelStart))
    .replace(/\{ALPHA\}/g, formatSigned(alpha))
    .replace(/\{ROLE_NAME\}/g, roleName)
    .replace(/\{STARTING_MEMORY_CARD_SECTION\}/g, memorySection);
};

class AgentChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      allMessages: [],
      messages: [],
      visibleCount: PAGE_SIZE,
      inputValue: '',
      llmConfig: null,
    };
    this.loadingMore = false;
    this.didInitialScroll = false;
    this.shouldScrollToEnd = false;
    this.isNearBottom = true;
    this.lastContentHeight = 0;
    this.forceScrollToBottomOnce = false;
    this.hasAutoCommandRun = false;
    this.hasAutoLinkStartRun = false;
    this.lastAutoCommand = null;
    this.hasIntroAutoAOnce = false;
    this.isPlayingIntro = false;
    this.agentId = getAgentIdFromParams(this.props.navigation?.state?.params);
    this.chatFilePath = getChatFilePath(this.agentId);
    this.persistQueue = Promise.resolve();
    this.currentLLMConfig = null;
  }

  static navigationOptions = ({ navigation }) => {
    const params = navigation.state?.params || {};
    const displayName = params.displayName || 'Agent';
    const shortCode = params.shortCode ? `@${params.shortCode}` : '';
    const title = shortCode ? `${displayName}${shortCode}` : displayName;

    return {
      ...BlueNavigationStyle(),
      title: '',
      headerStyle: {
        backgroundColor: '#ffffff',
        borderBottomColor: '#e3e5ea',
      },
      headerTintColor: '#000000',
      headerTitle: () => (
        <TouchableOpacity
          accessibilityLabel="Open space"
          onPress={() => navigation.state?.params?.onTitlePress?.()}
          style={styles.headerTitleButton}
        >
          <Text style={styles.headerTitle}>{title}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          accessibilityLabel="Open chat settings"
          style={styles.headerAction}
          onPress={() => navigation.state?.params?.onOpenSettings?.()}
        >
          <Icon name="more-horizontal" type="feather" color="#000000" size={20} />
        </TouchableOpacity>
      ),
    };
  };

  componentDidMount() {
    this._isMounted = true;
    this.props.navigation?.setParams?.({ onTitlePress: this.handleTitlePress });
    this.initializeChat();
  }

  componentDidUpdate(prevProps) {
    const prevAutoCommand = prevProps.navigation?.state?.params?.autoCommand;
    const nextAutoCommand = this.props.navigation?.state?.params?.autoCommand;
    if (nextAutoCommand && nextAutoCommand !== prevAutoCommand && nextAutoCommand !== this.lastAutoCommand) {
      this.hasAutoCommandRun = false;
      this.runAutoCommand().then(() => this.runAutoLinkStart());
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  initializeChat = async () => {
    await this.ensureDirs();
    const history = await this.readHistory();
    const builtin = await this.readJsonFile(LLM_BUILTIN_PATH);
    if (!builtin) await this.writeBuiltinRegistry({});
    const custom = await this.readJsonFile(LLM_CUSTOM_PATH);
    if (!custom) await this.writeCustomRegistry({});
    const active = await this.readActiveProvider();
    if (!active) {
      await this.writeActiveProvider({ name: '' });
    }
    const llmConfig = await this.loadLLMConfig();
    if (!this._isMounted) {
      return;
    }
    const visibleCount = Math.min(history.length || PAGE_SIZE, PAGE_SIZE);
    this.setState(
      {
        allMessages: history,
        visibleCount,
        messages: history.slice(-visibleCount),
        llmConfig,
      },
      () => {
        this.currentLLMConfig = llmConfig;
        this.shouldScrollToEnd = true;
        this.forceScrollToBottomOnce = true;
        this.restoreProviderFromDisk()
          .then(() => this.runAutoCommand())
          .then(() => this.runAutoLinkStart());
      },
    );
  };

  ensureDirs = async () => {
    const ensure = async p => {
      const ok = await RNFS.exists(p);
      if (!ok) await RNFS.mkdir(p);
    };
    try {
      await ensure(CHAT_DIR);
      await ensure(LLM_DIR);
    } catch (error) {
      console.warn('Failed to prepare chat storage', error);
    }
  };

  loadLLMConfig = async () => {
    try {
      const active = await this.readActiveProvider();
      const providerName = String(active?.name || '').toLowerCase();
      if (!providerName) return null;

      const merged = await this.loadMergedRegistry();
      const override = merged?.[providerName] || {};
      const builtinDef = LLM_PROVIDERS[providerName] || null;
      const baseUrl = String(override.baseUrl || builtinDef?.baseUrl || '')
        .trim()
        .replace(/\/$/, '');
      if (!baseUrl) return null;

      return {
        provider: providerName,
        baseUrl,
        apiKey: override.apiKey || '',
        model: override.model || (builtinDef?.defaultModel || 'default'),
        updatedAt: override.updatedAt || Date.now(),
      };
    } catch (error) {
      console.warn('Failed to load llm config', error);
      return null;
    }
  };

  readActiveProvider = async () => {
    try {
      const exists = await RNFS.exists(LLM_ACTIVE_PATH);
      if (!exists) return null;
      return JSON.parse(await RNFS.readFile(LLM_ACTIVE_PATH, 'utf8'));
    } catch (e) {
      return null;
    }
  };

  writeActiveProvider = async active => {
    try {
      await RNFS.writeFile(LLM_ACTIVE_PATH, JSON.stringify(active, null, 2), 'utf8');
    } catch (e) {}
  };

  clearActiveProvider = async () => {
    try {
      await RNFS.unlink(LLM_ACTIVE_PATH);
    } catch (_) {}
  };

  readJsonFile = async path => {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return null;
      return JSON.parse(await RNFS.readFile(path, 'utf8'));
    } catch (_) {
      return null;
    }
  };

  writeJsonFile = async (path, data) => {
    try {
      await RNFS.writeFile(path, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.warn('Failed to write json', { path, error });
      return false;
    }
  };

  readBuiltinRegistry = async () => {
    const obj = await this.readJsonFile(LLM_BUILTIN_PATH);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  };

  writeBuiltinRegistry = async registry => this.writeJsonFile(LLM_BUILTIN_PATH, registry || {});

  readCustomRegistry = async () => {
    const obj = await this.readJsonFile(LLM_CUSTOM_PATH);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  };

  writeCustomRegistry = async registry => this.writeJsonFile(LLM_CUSTOM_PATH, registry || {});

  loadMergedRegistry = async () => {
    const [builtin, custom] = await Promise.all([this.readBuiltinRegistry(), this.readCustomRegistry()]);
    return { ...(builtin || {}), ...(custom || {}) };
  };

  isBuiltinProvider = name => !!LLM_PROVIDERS[String(name || '').toLowerCase()];

  applyProviderConfig = async ({
    providerName,
    providerDef,
    registryEntry,
    llmConfig,
    baseUrlOverride,
    apiKeyOverride,
    modelOverride,
    startup = false,
  }) => {
    const baseUrl = String(
      baseUrlOverride || registryEntry?.baseUrl || providerDef?.baseUrl || llmConfig?.baseUrl || '',
    )
      .trim()
      .replace(/\/$/, '');
    const apiKey =
      apiKeyOverride ||
      registryEntry?.apiKey ||
      (llmConfig?.provider === providerName ? llmConfig?.apiKey : '') ||
      '';
    if (!baseUrl) {
      throw new Error('Missing baseUrl');
    }
    const models = await this.fetchOpenAICompatModels(baseUrl, apiKey, providerDef?.authHeader);
    if (models.length === 0) {
      if (!apiKey) {
        throw new Error('Missing api key');
      }
      throw new Error('Failed to load models');
    }
    const selectedModel =
      modelOverride ||
      (llmConfig && llmConfig.provider === providerName ? llmConfig.model : '') ||
      models[0] ||
      providerDef?.defaultModel ||
      'default';
    const next = { provider: providerName, baseUrl, apiKey, model: selectedModel, updatedAt: Date.now() };
    this.setState({ llmConfig: next });
    await this.saveLLMConfig(next);
    await this.writeActiveProvider({ name: providerName, updatedAt: Date.now() });
    await this.writeJsonFile(LLM_LAST_USED_PATH, {
      provider: String(providerName || '').trim().toLowerCase(),
      baseUrl: String(baseUrl || providerDef?.baseUrl || '').trim().replace(/\/$/, ''),
      apiKey: String(apiKey || '').trim(),
      model: String(selectedModel || providerDef?.defaultModel || 'default').trim(),
      updatedAt: Date.now(),
    });
    this.currentLLMConfig = next;

    const modeLabel = apiKey ? 'cloud' : 'local';
    const hello = startup
      ? `Provider restored: ${providerName} (${modeLabel})`
      : `Provider loaded: ${providerName} (${modeLabel}) model=${selectedModel}`;
    if (startup) {
      this.replyFromAgent(hello);
    } else {
      const today = getTodayDateString();
      const modelLines = models.map(modelId => `${today}  [[/a model ${modelId}|${modelId}]]`);
      this.replyFromAgent(`${hello}\nEndpoint: ${baseUrl}\nSelect model:\n${modelLines.join('\n')}`);
    }

    return { models, selectedModel, baseUrl, apiKey };
  };

  restoreProviderFromDisk = async () => {
    const snap = await this.readJsonFile(LLM_LAST_USED_PATH);
    if (snap?.provider && snap?.baseUrl) {
      const providerName = String(snap.provider).trim().toLowerCase();
      const resolved = await this.resolveProviderDef(providerName);
      if (resolved?.def) {
        try {
          await this.applyProviderConfig({
            providerName,
            providerDef: resolved.def,
            registryEntry: null,
            llmConfig: {
              provider: providerName,
              baseUrl: String(snap.baseUrl || '').trim().replace(/\/$/, ''),
              apiKey: String(snap.apiKey || '').trim(),
              model: String(snap.model || resolved.def.defaultModel || 'default').trim(),
              updatedAt: snap.updatedAt || Date.now(),
            },
            startup: true,
          });
          return;
        } catch (error) {
          console.warn('Failed to restore provider from last used snapshot', error);
        }
      }
    }

    const active = await this.readActiveProvider();
    if (!active?.name) {
      return;
    }
    const registry = await this.loadMergedRegistry();
    const resolved = await this.resolveProviderDef(active.name);
    if (!resolved) {
      return;
    }
    const providerDef = resolved.def;
    const registryEntry = registry?.[active.name] || null;
    const llmConfig = await this.loadLLMConfig();

    try {
      await this.applyProviderConfig({
        providerName: active.name,
        providerDef,
        registryEntry,
        llmConfig,
        startup: true,
      });
    } catch (error) {
      const msg = String(error?.message || error || '');
      if (/key/i.test(msg) || /api\s*key/i.test(msg) || /401|403/.test(msg)) {
        this.replyFromAgent(`Provider "${active.name}" requires a key. Use: /a ${active.name} <key>`);
      } else {
        this.replyFromAgent(`Failed to restore provider "${active.name}": ${msg || 'unknown error'}`);
      }
    }
  };

  resolveProviderDef = async name => {
    const normalized = String(name || '').toLowerCase();
    if (!normalized) {
      return null;
    }
    const builtinReg = await this.readBuiltinRegistry();
    const customReg = await this.readCustomRegistry();
    const entryBuiltin = builtinReg?.[normalized];
    const entryCustom = customReg?.[normalized];
    if (LLM_PROVIDERS[normalized]) {
      const baseUrlOverride = entryBuiltin?.baseUrl ? String(entryBuiltin.baseUrl).trim().replace(/\/$/, '') : '';
      return {
        name: normalized,
        def: {
          ...LLM_PROVIDERS[normalized],
          baseUrl: baseUrlOverride || LLM_PROVIDERS[normalized].baseUrl,
        },
        source: baseUrlOverride ? 'builtin_override' : 'builtin',
      };
    }
    if (entryCustom && entryCustom.baseUrl) {
      return {
        name: normalized,
        def: {
          kind: 'openai_compat',
          baseUrl: entryCustom.baseUrl,
          defaultModel: 'default',
          authHeader: DEFAULT_AUTH_HEADER,
        },
        source: 'custom',
      };
    }
    return null;
  };

  saveLLMConfig = async config => {
    await this.ensureDirs();
    this.currentLLMConfig = config;
    const name = String(config.provider || '').toLowerCase();
    const entry = {
      baseUrl: String(config.baseUrl || '')
        .trim()
        .replace(/\/$/, ''),
      apiKey: config.apiKey || '',
      model: config.model || 'default',
      updatedAt: Date.now(),
    };

    if (this.isBuiltinProvider(name)) {
      const reg = await this.readBuiltinRegistry();
      reg[name] = { ...(reg[name] || {}), ...entry };
      await this.writeBuiltinRegistry(reg);
    } else {
      const reg = await this.readCustomRegistry();
      reg[name] = { ...(reg[name] || {}), ...entry };
      await this.writeCustomRegistry(reg);
    }
  };

  clearLLMConfig = async () => {
    this.setState({ llmConfig: null });
    this.currentLLMConfig = null;
  };

  readHistory = async () => {
    try {
      const exists = await RNFS.exists(this.chatFilePath);
      if (!exists) return [];
      const raw = await RNFS.readFile(this.chatFilePath, 'utf8');
      const json = JSON.parse(raw);
      const messages = Array.isArray(json) ? json : json.messages || [];
      return messages.filter(message => !message?.hidden);
    } catch (e) {
      return [];
    }
  };

  writeHistory = async messages => {
    try {
      await RNFS.writeFile(this.chatFilePath, JSON.stringify(messages), 'utf8');
    } catch (e) {}
  };

  persistMessages = async messages => {
    this.persistQueue = this.persistQueue
      .then(() => this.writeHistory(messages))
      .catch(error => {
        console.warn('Failed to save chat history', error);
      });
    return this.persistQueue;
  };

  buildMessage = (text, sender = 'user') => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    sender,
    timestamp: Date.now(),
  });

  appendMessage = message => {
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, message];
        const base = Math.max(prevState.visibleCount, PAGE_SIZE);
        const visibleCount = Math.min(allMessages.length, base + 1);
        return {
          allMessages,
          visibleCount,
          messages: allMessages.slice(-visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  appendMessages = messages => {
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, ...messages];
        const added = messages.length;
        const base = Math.max(prevState.visibleCount, PAGE_SIZE);
        const visibleCount = Math.min(allMessages.length, base + added);
        return {
          allMessages,
          visibleCount,
          messages: allMessages.slice(-visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  updateAgentMessage = (requestId, newText) => {
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        let didUpdate = false;
        const allMessages = prevState.allMessages.map(message => {
          if (message?.requestId === requestId) {
            didUpdate = true;
            return {
              ...message,
              text: newText,
              pending: false,
            };
          }
          return message;
        });
        if (!didUpdate) {
          return null;
        }
        return {
          allMessages,
          messages: allMessages.slice(-prevState.visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  hasIntroSequence = messages => {
    if (messages.length < INTRO_MESSAGES.length) {
      return false;
    }
    const lastIntroIndex = INTRO_MESSAGES.length - 1;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.sender !== 'agent' || lastMessage?.text !== INTRO_MESSAGES[lastIntroIndex]) {
      return false;
    }
    let introIndex = lastIntroIndex - 1;
    for (let i = messages.length - 2; i >= 0 && introIndex >= 0; i -= 1) {
      const message = messages[i];
      if (message?.sender === 'agent' && message?.text === INTRO_MESSAGES[introIndex]) {
        introIndex -= 1;
      }
    }
    return introIndex < 0;
  };

  waitForIntroStep = ms => new Promise(resolve => setTimeout(resolve, ms));

  playIntroSequence = async () => {
    const { allMessages } = this.state;
    if (this.hasIntroSequence(allMessages) || this.isPlayingIntro) {
      return;
    }

    this.isPlayingIntro = true;
    this.hasIntroAutoAOnce = false;

    try {
      for (let i = 0; i < INTRO_MESSAGES.length; i += 1) {
        this.appendMessage(this.buildMessage(INTRO_MESSAGES[i], 'agent'));

        if (i === 1 && !this.hasIntroAutoAOnce) {
          this.hasIntroAutoAOnce = true;
          await this.waitForIntroStep(50);
          await this.sendCommand('/a');
          await this.waitForIntroStep(200);
        }

        await this.waitForIntroStep(600);
      }
    } finally {
      this.isPlayingIntro = false;
    }
  };

  handleSend = async () => {
    const text = this.state.inputValue.trim();
    if (!text) {
      return;
    }
    const userMessage = this.buildMessage(text, 'user');
    this.appendMessage(userMessage);
    this.setState({ inputValue: '' });
    await this.handleTriggers(text, userMessage);
  };

  sendCommand = async commandText => {
    const text = commandText.trim();
    if (!text) {
      return;
    }
    const userMessage = this.buildMessage(text, 'user');
    this.appendMessage(userMessage);
    this.setState({ inputValue: '' });
    await this.handleTriggers(text, userMessage);
    this.shouldScrollToEnd = true;
  };

  handleTriggers = async (text, userMessage = null) => {
    const trimmed = text.trim();
    const aMatch = /^\/a(?:\s+(.+))?$/i.exec(trimmed);
    if (aMatch) {
      await this.handleAIConfigCommand(trimmed);
      return;
    }
    const clearMatch = /^\/(c|clear)\b/i.exec(trimmed);
    if (clearMatch) {
      await this.clearChatHistory();
      return;
    }
    const helpMatch = /^\/h\b/i.exec(trimmed);
    if (helpMatch) {
      this.replyFromAgent(getCommandHelpMessage());
      return;
    }
    const linkStartMatch = /^\/linkstart\b/i.exec(trimmed);
    if (linkStartMatch) {
      await this.playIntroSequence();
      return;
    }
    if (/^\/m\b/i.test(trimmed)) {
      await Rolecards.handleRoleMemoryCommand(
        this,
        {
          BlueApp,
          BlueElectrum,
          updateKeyValue,
          deleteKeyValue,
          FALLBACK_DATA_PER_BYTE_FEE,
        },
        trimmed,
      );
      return;
    }
    const roleMatch = /^\/r\s+(.+)/i.exec(trimmed);
    if (roleMatch) {
      await Roleplay.handleRoleCommand(this, roleMatch[1], {
        Rolecards,
        buildRoleplayPrompt,
      });
      return;
    }
    if (/^\/r\b/i.test(trimmed)) {
      await Roleplay.handleRoleCommand(this, 'unknown', {
        Rolecards,
        buildRoleplayPrompt,
      });
      this.replyFromAgent(
        Roleplay.buildRoleHistoryMessage(this, {
          getRoleHistoryTitle,
          getCommandUsageMessage,
        }),
      );
      return;
    }
    const welcomeMatch = /^\/welcome\s+(.+)/i.exec(trimmed);
    if (welcomeMatch) {
      await this.handleWelcomeCommand(welcomeMatch[1]);
      return;
    }
    if (/^\/welcome\b/i.test(trimmed)) {
      await this.handleWelcomeLookup();
      return;
    }

    const normalized = trimmed.toUpperCase();
    if (normalized === '/D') {
      Destiny.handleDestinyCommand(this, { buildDestinySeedPrompt });
      return;
    }

    if (normalized === '/BLOCK') {
      await this.replyWithCurrentBlock();
      return;
    }

    if (trimmed.startsWith('/')) {
      this.replyFromAgent('Unknown command. Type /h');
      return;
    }

    await this.replyFromLLM(trimmed, userMessage);
  };

  fetchOpenAICompatModels = async (baseUrl, apiKey, authHeaderFn) => {
    const root = String(baseUrl || '').replace(/\/$/, '');
    if (!root) {
      return [];
    }
    const headers = {
      'Content-Type': 'application/json',
      ...(authHeaderFn
        ? authHeaderFn(apiKey)
        : apiKey
          ? { Authorization: `Bearer ${apiKey}` }
          : {}),
    };
    try {
      const resp = await fetch(`${root}/models`, { method: 'GET', headers });
      const json = await resp.json().catch(() => ({}));
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
      const models = [];
      const seen = new Set();
      list.forEach(entry => {
        const id = typeof entry === 'string' ? entry : entry?.id;
        if (!id || seen.has(id)) {
          return;
        }
        seen.add(id);
        models.push(id);
      });
      return models.slice(0, 30);
    } catch (error) {
      console.warn('Failed to fetch openai compatible models', error);
      return [];
    }
  };

  resolveDefaultModelForEndpoint = async (baseUrl, apiKey, authHeaderFn, fallbackModel) => {
    const models = await this.fetchOpenAICompatModels(baseUrl, apiKey, authHeaderFn);
    if (models.length > 0) {
      return models[0];
    }
    return fallbackModel || 'default';
  };

  handleAIConfigCommand = async trimmed => {
    const parts = trimmed.trim().split(/\s+/);
    if (parts.length === 1) {
      const cur = this.state.llmConfig;
      const curLine = cur ? `Current: ${cur.provider} / ${cur.model || ''}` : 'Current: (none)';
      const providersList = Object.keys(LLM_PROVIDERS).join(', ');
      this.replyFromAgent(
        `${curLine}\nUsage:\n[[/a list|/a list]]\n/a <provider> [key] [model]\n/a add <provider> <url> [key]\n/a del <provider>\n/a model <model>\n[[/a off|/a off]]\nProviders: ${providersList}`,
      );
      return;
    }

    const sub = String(parts[1] || '').toLowerCase();
    if (sub === 'model') {
      const model = parts[2];
      if (!model) {
        this.replyFromAgent('Usage: /a model <model>');
        return;
      }
      let cur = this.currentLLMConfig || this.state.llmConfig;
      if (!cur || !cur.provider || !cur.baseUrl) {
        cur = await this.loadLLMConfig();
      }
      if (!cur || !cur.provider) {
        this.replyFromAgent('No provider configured. Use: /a list or /a add <provider> <url> [key]');
        return;
      }
      const next = { ...cur, model };
      this.setState({ llmConfig: next });
      await this.saveLLMConfig(next);
      await this.writeActiveProvider({ name: cur.provider, updatedAt: Date.now() });
      this.replyFromAgent(`Model selected: ${model}`);
      return;
    }
    if (sub === 'off' || sub === 'clear') {
      await this.clearLLMConfig();
      await this.clearActiveProvider();
      this.replyFromAgent('Cloud model disabled.');
      return;
    }
    if (sub === 'list') {
      const cur = this.currentLLMConfig || this.state.llmConfig || (await this.loadLLMConfig());
      const builtinReg = await this.readBuiltinRegistry();
      const customReg = await this.readCustomRegistry();

      const USE_COL_WIDTH = 18;
      const NAME_COL_WIDTH = 10;

      const pad = (s, n) => String(s).padEnd(n, ' ');
      const statusDot = hasKey => (hasKey ? '🟩' : '🟥');

      const makeBuiltinLine = (name, hasKey) => {
        const useToken = `[[/a ${name}|use]]`;
        return `${statusDot(hasKey)} ${pad(useToken, USE_COL_WIDTH)} ${name}`;
      };

      const makeCustomLine = (name, hasKey) => {
        const useToken = `[[/a ${name}|use]]`;
        const delToken = `[[/a del ${name}|del]]`;
        return `${statusDot(hasKey)} ${pad(useToken, USE_COL_WIDTH)} ${pad(name, NAME_COL_WIDTH)} ${delToken}`;
      };

      const builtinLines = Object.keys(LLM_PROVIDERS).map(name => {
        const hasCurrentKey = cur?.provider === name && !!String(cur?.apiKey || '').trim();
        const hasKey = !!String(builtinReg?.[name]?.apiKey || '').trim() || hasCurrentKey;
        return makeBuiltinLine(name, hasKey);
      });

      const customNames = Object.keys(customReg || {}).filter(name => customReg?.[name]?.baseUrl);

      const customLines = customNames.length
        ? customNames.map(name => {
            const hasKey = !!String(customReg?.[name]?.apiKey || '').trim();
            return makeCustomLine(name, hasKey);
          })
        : ['(none)'];

      this.replyFromAgent(
        `Builtin providers:\n${builtinLines.join('\n')}\n\nCustom providers:\n${customLines.join('\n')}`,
      );
      return;
    }
    if (sub === 'add') {
      const name = String(parts[2] || '').toLowerCase();
      if (!/^[a-z0-9_-]{1,32}$/i.test(name)) {
        this.replyFromAgent('Usage: /a add <provider> <url> [key]');
        return;
      }
      const baseUrl = String(parts[3] || '')
        .trim()
        .replace(/\/$/, '');
      if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
        this.replyFromAgent('Usage: /a add <provider> <url> [key]');
        return;
      }
      const apiKey = parts[4] || '';
      const registry = await this.readCustomRegistry();
      registry[name] = { baseUrl, apiKey, updatedAt: Date.now() };
      const ok = await this.writeCustomRegistry(registry);
      if (!ok) {
        this.replyFromAgent('Failed to save provider registry (writeFile error).');
        return;
      }
      const verify = await this.readCustomRegistry();
      if (!verify?.[name]?.baseUrl) {
        this.replyFromAgent(
          `Failed to persist provider: ${name}\n` +
            `registryPath=${LLM_CUSTOM_PATH}\n` +
            `Tip: check app file permissions or RNFS writeFile failure.`,
        );
        return;
      }
      this.replyFromAgent(`Added provider: ${name} (${baseUrl}) key=${apiKey ? 'YES' : 'NO'}`);
      return;
    }
    if (sub === 'del') {
      const name = String(parts[2] || '').toLowerCase();
      if (!name) {
        this.replyFromAgent('Usage: /a del <provider>');
        return;
      }
      if (LLM_PROVIDERS[name]) {
        this.replyFromAgent('Cannot delete builtin provider.');
        return;
      }
      const registry = await this.readCustomRegistry();
      if (registry[name]) {
        delete registry[name];
        await this.writeCustomRegistry(registry);
      }
      if (this.state.llmConfig?.provider === name || this.currentLLMConfig?.provider === name) {
        await this.clearLLMConfig();
        await this.clearActiveProvider();
      }
      this.replyFromAgent(`Deleted provider: ${name}`);
      return;
    }

    const provider = sub;
    if (provider === 'local') {
      const baseUrl = String(parts[2] || '')
        .trim()
        .replace(/\/$/, '');
      if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
        this.replyFromAgent('Usage: /a local <http_base_url> [key]');
        return;
      }
      const apiKey = parts[3] || '';
      const modelArg = parts[4];
      const providerDef = LLM_PROVIDERS.local;
      const current = this.currentLLMConfig || this.state.llmConfig || (await this.loadLLMConfig());
      try {
        await this.applyProviderConfig({
          providerName: provider,
          providerDef,
          llmConfig: current,
          baseUrlOverride: baseUrl,
          apiKeyOverride: apiKey,
          modelOverride: modelArg,
          startup: false,
        });
      } catch (error) {
        const msg = String(error?.message || error || '');
        if (!apiKey) {
          this.replyFromAgent(`This provider may require a key. Try: /a ${provider} <key>`);
          return;
        }
        if (/Missing api key/i.test(msg)) {
          this.replyFromAgent(`This provider may require a key. Try: /a ${provider} <key>`);
        } else {
          this.replyFromAgent('Failed to load models. Check baseUrl/key or endpoint compatibility.');
        }
        return;
      }
      return;
    }

    const keyArg = parts[2] || '';
    const modelArg = parts[3];
    const resolved = await this.resolveProviderDef(provider);
    if (!resolved) {
      this.replyFromAgent('Unknown provider. Try: /a list or /a add <provider> <url> [key]');
      return;
    }
    const providerDef = resolved.def;
    let registryEntry = null;
    let apiKeyOverride = '';
    const builtinReg = await this.readBuiltinRegistry();
    const customReg = await this.readCustomRegistry();
    if (resolved.source === 'custom') {
      registryEntry = customReg?.[provider] || null;
      if (keyArg) {
        registryEntry = { ...(registryEntry || {}), apiKey: keyArg, updatedAt: Date.now() };
        customReg[provider] = registryEntry;
        await this.writeCustomRegistry(customReg);
      }
    } else {
      registryEntry = builtinReg?.[provider] || null;
      if (keyArg) {
        apiKeyOverride = keyArg;

        builtinReg[provider] = {
          ...(builtinReg[provider] || {}),
          baseUrl: providerDef.baseUrl,
          apiKey: keyArg,
          updatedAt: Date.now(),
        };
        await this.writeBuiltinRegistry(builtinReg);
        registryEntry = builtinReg[provider];
      }
    }
    const current = this.currentLLMConfig || this.state.llmConfig || (await this.loadLLMConfig());
    try {
      await this.applyProviderConfig({
        providerName: provider,
        providerDef,
        registryEntry,
        llmConfig: current,
        apiKeyOverride,
        modelOverride: modelArg,
        startup: false,
      });
    } catch (error) {
      const msg = String(error?.message || error || '');
      if (/Missing baseUrl/i.test(msg)) {
        this.replyFromAgent('Missing baseUrl for provider. Try: /a list or /a add <provider> <url> [key]');
        return;
      }
      if (/Missing api key/i.test(msg)) {
        this.replyFromAgent(`This provider may require a key. Try: /a ${provider} <key>`);
        return;
      }
      this.replyFromAgent('Failed to load models. Check baseUrl/key or endpoint compatibility.');
    }
  };

  buildLLMSystemPrompt = () => {
    const params = this.props.navigation?.state?.params || {};
    const name = params.displayName || 'Agent';
    const short = params.shortCode ? `@${params.shortCode}` : '';
    const id = params.shortCode || params.namespaceId || 'unknown';
    return `You are ${name}${short} (Agent ID: ${id}) in xKEVA. Reply naturally, concise when possible.`;
  };

  getRecentChatMessagesForLLM = () => {
    const msgs = (this.state.allMessages || []).filter(
      message =>
        message &&
        (message.sender === 'user' || message.sender === 'agent') &&
        message.text &&
        !message.pending,
    );
    return msgs.slice(-LLM_HISTORY_LIMIT);
  };

  replyFromLLM = async (userText, userMessage = null) => {
    const requestId = `${Date.now()}-${Math.random()}`;
    const placeholder = {
      id: `agent-${requestId}`,
      sender: 'agent',
      text: '…',
      pending: true,
      requestId,
      timestamp: Date.now(),
    };
    this.appendMessage(placeholder);
    const cfg = this.state.llmConfig;
    if (!cfg || !cfg.provider) {
      this.updateAgentMessage(requestId, 'No cloud model configured. Use: /a <provider> <apikey>');
      return;
    }

    const resolved = await this.resolveProviderDef(cfg.provider);
    if (!resolved) {
      this.updateAgentMessage(requestId, 'Cloud model provider missing. Re-run /a.');
      return;
    }
    const providerDef = resolved.def;
    const baseUrl = cfg.baseUrl || providerDef.baseUrl;
    if (!baseUrl) {
      this.updateAgentMessage(requestId, 'Provider missing baseUrl. Re-run /a.');
      return;
    }

    try {
      const systemPrompt = this.buildLLMSystemPrompt();
      let recent = this.getRecentChatMessagesForLLM();

      if (userMessage && userMessage.id) {
        recent = recent.filter(message => message.id !== userMessage.id);
        recent.push(userMessage);
      } else {
        recent.push({
          id: `ephemeral-${requestId}`,
          sender: 'user',
          text: userText,
          timestamp: Date.now(),
        });
      }

      recent = recent.slice(-LLM_HISTORY_LIMIT);

      let replyText = '';

      if (providerDef.kind === 'openai_compat') {
        replyText = await this.callOpenAICompatible({
          baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model || providerDef.defaultModel,
          systemPrompt,
          recent,
          authHeader: providerDef.authHeader || DEFAULT_AUTH_HEADER,
        });
      } else if (providerDef.kind === 'gemini') {
        replyText = await this.callGemini({
          baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model || providerDef.defaultModel,
          systemPrompt,
          recent,
          authHeader: providerDef.authHeader,
        });
      } else {
        this.updateAgentMessage(requestId, 'Unsupported provider kind.');
        return;
      }

      if (!replyText) {
        this.updateAgentMessage(requestId, 'Model returned empty response.');
        return;
      }

      this.updateAgentMessage(requestId, replyText.trim());
    } catch (error) {
      console.warn('LLM call failed', error);
      this.updateAgentMessage(requestId, 'LLM call failed.');
    }
  };

  callOpenAICompatible = async ({ baseUrl, apiKey, model, systemPrompt, recent, authHeader }) => {
    const url = `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recent.map(message => ({
        role: message.sender === 'user' ? 'user' : 'assistant',
        content: String(message.text),
      })),
    ];

    const headers = {
      'Content-Type': 'application/json',
      ...(authHeader ? authHeader(apiKey) : apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const body = {
      model,
      messages,
      temperature: 0.7,
      stream: false,
    };

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await resp.json().catch(() => ({}));

    const text = json?.choices?.[0]?.message?.content ?? '';
    if (!resp.ok) {
      throw new Error(`openai_compat http ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return text;
  };

  callGemini = async ({ baseUrl, apiKey, model, systemPrompt, recent, authHeader }) => {
    const root = String(baseUrl || '').replace(/\/$/, '');
    const url = `${root}/models/${encodeURIComponent(model)}:generateContent`;

    const contents = recent.map(message => ({
      role: message.sender === 'user' ? 'user' : 'model',
      parts: [{ text: String(message.text) }],
    }));

    if (contents.length > 0) {
      const first = contents[0];
      if (first.role === 'user' && first.parts?.[0]?.text) {
        first.parts[0].text = `SYSTEM: ${systemPrompt}\n\n${first.parts[0].text}`;
      } else {
        contents.unshift({ role: 'user', parts: [{ text: `SYSTEM: ${systemPrompt}` }] });
      }
    } else {
      contents.push({ role: 'user', parts: [{ text: `SYSTEM: ${systemPrompt}` }] });
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(authHeader ? authHeader(apiKey) : { 'x-goog-api-key': apiKey }),
    };

    const body = { contents };

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await resp.json().catch(() => ({}));

    const parts = json?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part?.text || '').join('');

    if (!resp.ok) {
      throw new Error(`gemini http ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return text;
  };

  clearChatHistory = async () => {
    this.shouldScrollToEnd = true;
    await new Promise(resolve => {
      this.setState(
        {
          allMessages: [],
          visibleCount: 0,
          messages: [],
        },
        resolve,
      );
    });
    try {
      const exists = await RNFS.exists(this.chatFilePath);
      if (exists) {
        await RNFS.unlink(this.chatFilePath);
      }
    } catch (_) {}

    await this.persistMessages([]);
  };

  runAutoCommand = async () => {
    if (this.hasAutoCommandRun) {
      return;
    }
    const { navigation } = this.props;
    const { autoCommand } = navigation?.state?.params || {};
    if (!autoCommand) {
      return;
    }
    const commandText = autoCommand.trim();
    if (!commandText) {
      return;
    }
    this.hasAutoCommandRun = true;
    this.lastAutoCommand = commandText;
    const userMessage = this.buildMessage(commandText, 'user');
    this.appendMessage(userMessage);
    this.setState({ inputValue: '' });
    await this.handleTriggers(commandText, userMessage);
    this.shouldScrollToEnd = true;
    navigation?.setParams?.({ autoCommand: null });
  };

  runAutoLinkStart = async () => {
    if (this.hasAutoLinkStartRun) {
      return;
    }
    const { suppressAutoLinkStart } = this.props.navigation?.state?.params || {};
    if (suppressAutoLinkStart) {
      return;
    }
    this.hasAutoLinkStartRun = true;
    if (this.hasIntroSequence(this.state.allMessages)) {
      return;
    }
    await this.sendCommand('/linkstart');
  };

  decodeKeyValueEntry = kv => {
    if (!kv) {
      return kv;
    }
    let key = kv.key;
    let value = kv.value;

    try {
      key = kv.key ? decodeBase64(kv.key) : kv.key;
    } catch (error) {
      key = kv.key;
    }

    if (value) {
      try {
        value = b64decode(value);
      } catch (error) {
        value = kv.value;
      }
    }

    return { ...kv, key, value };
  };

  parseWelcomeEnvelope = value => {
    if (!value) {
      return '';
    }
    if (typeof value !== 'string') {
      return String(value);
    }
    try {
      const parsed = JSON.parse(value);
      return parsed.text || parsed.cipher || value;
    } catch (error) {
      return value;
    }
  };

  resolveNamespaceContext = () => {
    const { navigation, namespaceList } = this.props;
    const { namespaceId, shortCode } = navigation.state.params || {};

    let resolvedNamespaceId = namespaceId;
    let namespace = namespaceId ? namespaceList?.namespaces?.[namespaceId] : null;

    if (!namespace && shortCode) {
      const namespaces = namespaceList?.namespaces || {};
      const match = Object.values(namespaces).find(entry => String(entry?.shortCode || '').trim() === String(shortCode).trim());
      if (match?.id) {
        resolvedNamespaceId = match.id;
        namespace = match;
      }
    }

    if (!resolvedNamespaceId) {
      return null;
    }

    const scriptHash = namespace?.rootAddress ? toScriptHash(namespace.rootAddress) : getNamespaceScriptHash(resolvedNamespaceId);
    const agentId = shortCode || resolvedNamespaceId;

    return {
      agentId,
      namespace,
      namespaceId: resolvedNamespaceId,
      scriptHash,
    };
  };

  fetchNamespaceKeyValues = async () => {
    const context = this.resolveNamespaceContext();
    if (!context) {
      return null;
    }
    try {
      await BlueElectrum.ping();
      const response = await BlueElectrum.blockchainKeva_getKeyValues(context.scriptHash, -1);
      const keyvalues = Array.isArray(response) ? response : response?.keyvalues || [];
      const decoded = keyvalues.map(this.decodeKeyValueEntry);
      return { ...context, keyvalues: decoded };
    } catch (error) {
      console.warn('AgentChat: failed to fetch keyvalues', error);
      return null;
    }
  };

  fetchLatestKeyValue = async keyName => {
    const data = await this.fetchNamespaceKeyValues();
    if (!data?.keyvalues?.length) {
      return null;
    }
    const entry = data.keyvalues
      .slice()
      .reverse()
      .find(item => item?.key === keyName);
    if (!entry) {
      return null;
    }
    if (typeof entry.value === 'string') {
      return entry.value;
    }
    if (entry.value === null || typeof entry.value === 'undefined') {
      return '';
    }
    return String(entry.value || '');
  };

  fetchWelcomeValue = async () => {
    try {
      const data = await this.fetchNamespaceKeyValues();
      if (!data?.keyvalues?.length) {
        return null;
      }

      const welcomeEntry = data.keyvalues
        .slice()
        .reverse()
        .find(entry => entry?.key === 'welcome' && entry.value);

      if (!welcomeEntry) {
        return null;
      }

      const parsedValue = this.parseWelcomeEnvelope(welcomeEntry.value);
      const welcomeText = typeof parsedValue === 'string'
        ? parsedValue.trim()
        : String(parsedValue || '').trim();

      return welcomeText || null;
    } catch (error) {
      console.warn('AgentChat: failed to load welcome message', error);
      return null;
    }
  };

  handleWelcomeLookup = async () => {
    const welcomeText = await this.fetchWelcomeValue();
    if (welcomeText) {
      this.replyFromAgent(welcomeText);
      return;
    }
    this.replyFromAgent(getCommandUsageMessage('welcome'));
  };

  handleWelcomeCommand = async rawValue => {
    const { navigation } = this.props;
    const { namespaceId, walletId } = navigation.state.params || {};

    const value = rawValue.trim().slice(0, 1000);
    if (!value) {
      this.replyFromAgent('Welcome message is empty.');
      return;
    }

    if (!namespaceId || !walletId) {
      this.replyFromAgent('Missing namespace or wallet information to save welcome message.');
      return;
    }

    const wallet = BlueApp.getWallets().find(w => w.getID() === walletId);
    if (!wallet) {
      this.replyFromAgent('Wallet not found for this agent.');
      return;
    }

    try {
      await BlueElectrum.ping();
      if (typeof BlueElectrum.waitTillConnected === 'function') {
        await BlueElectrum.waitTillConnected();
      }
      const { tx } = await updateKeyValue(wallet, FALLBACK_DATA_PER_BYTE_FEE, namespaceId, 'welcome', value);
      const result = await BlueElectrum.broadcast(tx);
      if (result?.code) {
        throw new Error(result.message || 'Broadcast failed');
      }
      await BlueApp.saveToDisk();
      this.replyFromAgent('Welcome message anchored on-chain and stored permanently.');
    } catch (error) {
      console.warn('AgentChat: failed to save welcome message', error);
      this.replyFromAgent('Failed to save welcome message.');
    }
  };

  replyWithCurrentBlock = async () => {
    try {
      await BlueElectrum.ping();
      const height = await BlueElectrum.blockchainBlock_count();
      if (Number.isFinite(height)) {
        this.replyFromAgent(`Current block: ${height}`);
      } else {
        this.replyFromAgent('Current block height unavailable.');
      }
    } catch (error) {
      console.warn('AgentChat: failed to fetch current block height', error);
      this.replyFromAgent('Failed to fetch current block height.');
    }
  };

  replyFromAgent = text => {
    const reply = this.buildMessage(text, 'agent');
    this.appendMessage(reply);
  };

  replyFromAgentSeedCard = (text, copyText, linkLabel = 'Copy full Destiny Seed Card') => {
    const reply = {
      ...this.buildMessage(text, 'agent'),
      copyText,
      linkLabel,
    };
    this.appendMessage(reply);
  };

  formatSubmitTitle = () => {
    return timeConverter(Math.floor(Date.now() / 1000));
  };

  handleMessagePress = messageText => {
    if (messageText) {
      Clipboard.setString(messageText);
    }
  };

  isInteractiveCommand = commandText => {
    if (!commandText) {
      return false;
    }
    const trimmed = commandText.trim();
    if (/^\/welcome\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/r\b/i.test(trimmed)) {
      return true;
    }
    return true;
  };

  isValidCommandText = text => {
    if (!text) {
      return false;
    }
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      return false;
    }
    if (/^\/(c|clear)\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/h\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/linkstart\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/a\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/r\s+.+/i.test(trimmed)) {
      return true;
    }
    if (/^\/r\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/welcome\s+.+/i.test(trimmed)) {
      return true;
    }
    if (/^\/welcome\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/m\b/i.test(trimmed)) {
      return true;
    }
    if (/^\/d$/i.test(trimmed)) {
      return true;
    }
    if (/^\/block$/i.test(trimmed)) {
      return true;
    }
    return false;
  };

  getCommandSegments = text => {
    if (!text) {
      return [];
    }
    const segments = [];
    const commandRegex = new RegExp(COMMAND_TOKEN_REGEX);
    const displayRegex = new RegExp(COMMAND_DISPLAY_TOKEN_REGEX);
    let lastIndex = 0;

    while (lastIndex < text.length) {
      commandRegex.lastIndex = lastIndex;
      displayRegex.lastIndex = lastIndex;
      const commandMatch = commandRegex.exec(text);
      const displayMatch = displayRegex.exec(text);
      let nextMatch = null;
      let matchType = null;

      if (commandMatch && displayMatch) {
        if (displayMatch.index <= commandMatch.index) {
          nextMatch = displayMatch;
          matchType = 'display';
        } else {
          nextMatch = commandMatch;
          matchType = 'command';
        }
      } else if (displayMatch) {
        nextMatch = displayMatch;
        matchType = 'display';
      } else if (commandMatch) {
        nextMatch = commandMatch;
        matchType = 'command';
      }

      if (!nextMatch) {
        segments.push({ text: text.slice(lastIndex), isCommand: false });
        break;
      }

      if (nextMatch.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, nextMatch.index), isCommand: false });
      }

      if (matchType === 'display') {
        const commandText = nextMatch[1];
        const displayText = nextMatch[2];
        segments.push({
          text: displayText,
          displayText,
          commandText,
          isCommand: this.isInteractiveCommand(commandText),
        });
        lastIndex = nextMatch.index + nextMatch[0].length;
      } else {
        const commandText = nextMatch[0];
        segments.push({ text: commandText, isCommand: this.isInteractiveCommand(commandText) });
        lastIndex = nextMatch.index + nextMatch[0].length;
      }
    }
    return segments;
  };

  handleCommandPress = commandText => {
    this.sendCommand(commandText);
  };

  handleMessageLongPress = messageText => {
    if (!messageText) {
      return;
    }
    Clipboard.setString(messageText);
    showStatus('Copied to clipboard', 2000);
    if (Platform.OS === 'ios') {
      ActionSheet.showActionSheetWithOptions(
        {
          options: ['Copy', 'Submit to my namespace', 'Cancel'],
          cancelButtonIndex: 2,
        },
        buttonIndex => {
          if (buttonIndex === 0) {
            Clipboard.setString(messageText);
          }
          if (buttonIndex === 1) {
            this.handleAvatarPress(messageText);
          }
        },
      );
    } else {
      ActionSheet.showActionSheetWithOptions({
        title: '',
        message: '',
        buttons: [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Copy',
            onPress: () => Clipboard.setString(messageText),
          },
          {
            text: 'Submit to my namespace',
            onPress: () => this.handleAvatarPress(messageText),
          },
        ],
      });
    }
  };

  handleAvatarPress = messageText => {
    const { navigation } = this.props;
    const { namespaceId, walletId } = navigation.state.params || {};
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    navigation.navigate('AddKeyValue', {
      namespaceId,
      walletId,
      key: this.formatSubmitTitle(),
      value: messageText,
    });
  };

  handleTitlePress = () => {
    const { navigation, namespaceList } = this.props;
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    const { namespaceId, displayName, shortCode, walletId } = navigation.state.params || {};
    const namespace = namespaceId ? namespaceList?.namespaces?.[namespaceId] : null;
    navigation.navigate('KeyValues', {
      namespaceId: namespace?.id || namespaceId,
      shortCode: namespace?.shortCode || shortCode,
      displayName: namespace?.displayName || displayName,
      txid: namespace?.txId,
      rootAddress: namespace?.rootAddress,
      walletId: namespace?.walletId || walletId,
      price: namespace?.price,
      desc: namespace?.desc,
      addr: namespace?.addr,
      profile: namespace?.profile,
    });
  };

  loadMoreHistory = () => {
    if (this.loadingMore) {
      return;
    }
    const { allMessages, visibleCount } = this.state;
    if (visibleCount >= allMessages.length) {
      return;
    }
    this.loadingMore = true;
    this.setState(
      prevState => {
        const nextCount = Math.min(prevState.allMessages.length, prevState.visibleCount + PAGE_SIZE);
        return {
          visibleCount: nextCount,
          messages: prevState.allMessages.slice(-nextCount),
        };
      },
      () => {
        this.loadingMore = false;
      },
    );
  };

  handleScroll = event => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if (contentOffset?.y <= 20) {
      this.loadMoreHistory();
    }
    const paddingToBottom = 80;
    const layoutHeight = layoutMeasurement?.height || 0;
    const contentHeight = contentSize?.height || 0;
    const offsetY = contentOffset?.y || 0;
    this.isNearBottom = layoutHeight + offsetY >= contentHeight - paddingToBottom;
  };

  scrollToBottomOffset = (animated = true) => {
    if (!this.listRef) {
      return;
    }
    const offset = Math.max(0, (this.lastContentHeight || 0) + 200);
    this.listRef.scrollToOffset({ offset, animated });
  };

  handleContentSizeChange = (width, height) => {
    this.lastContentHeight = height || 0;
    const shouldFollow = this.forceScrollToBottomOnce || (this.shouldScrollToEnd && this.isNearBottom);
    if (shouldFollow && this.lastContentHeight > 0) {
      requestAnimationFrame(() => this.scrollToBottomOffset(true));
    }
    this.forceScrollToBottomOnce = false;
    this.shouldScrollToEnd = false;
  };

  shouldShowTimestamp = index => {
    const { messages } = this.state;
    const current = messages[index];
    if (!current) {
      return false;
    }
    if (index === 0) {
      return true;
    }
    const prev = messages[index - 1];
    return current.timestamp - prev.timestamp > 30 * 60 * 1000;
  };

  formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    const now = new Date();

    const pad = num => (num < 10 ? `0${num}` : `${num}`);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();

    if (isSameDay) {
      return time;
    }
    if (isYesterday) {
      return `Yesterday ${time}`;
    }
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
  };

  getUserAvatar = () => {
    const { namespaceList } = this.props;
    const firstId = namespaceList?.order?.[0];
    const namespace = firstId ? namespaceList?.namespaces?.[firstId] : null;
    if (!namespace) {
      return null;
    }
    const avatarUri = buildHeadAssetUri(namespace.shortCode);
    if (avatarUri) {
      return { type: 'image', uri: avatarUri };
    }
    const displayName = namespace.displayName || ' ';
    return {
      type: 'fallback',
      initials: getInitials(displayName),
      color: stringToColor(displayName),
    };
  };

  renderAvatar = sender => {
    const isUser = sender === 'user';
    if (isUser) {
      const userAvatar = this.getUserAvatar();
      if (userAvatar?.type === 'image') {
        return (
          <View style={[styles.avatarWrapper, styles.userAvatarWrapper]}>
            <Image source={{ uri: userAvatar.uri }} style={styles.avatarImage} resizeMode="cover" />
          </View>
        );
      }
      if (userAvatar?.type === 'fallback') {
        return (
          <View
            style={[
              styles.avatarWrapper,
              styles.userAvatarWrapper,
              styles.userAvatarFallback,
              { backgroundColor: userAvatar.color },
            ]}
          >
            <Text style={styles.userAvatarText}>{userAvatar.initials}</Text>
          </View>
        );
      }
      return (
        <View style={[styles.avatarWrapper, styles.userAvatarWrapper, styles.userAvatarBlank]} />
      );
    }

    const { shortCode } = this.props.navigation.state.params || {};
    const avatarUri = buildHeadAssetUri(shortCode);
    const source = avatarUri ? { uri: avatarUri } : require('../../img/bluebeast.png');
    return (
      <View style={[styles.avatarWrapper, styles.agentAvatarWrapper]}>
        <Image source={source} style={styles.avatarImage} resizeMode="cover" />
      </View>
    );
  };

  renderMessage = ({ item, index }) => {
    const isUser = item.sender === 'user';
    const hasCopyLink = Boolean(item.copyText && item.linkLabel);
    const commandSegments =
      isUser && this.isValidCommandText(item.text)
        ? [{ text: item.text, isCommand: true }]
        : this.getCommandSegments(item.text);
    const hasCommandTokens = commandSegments.some(segment => segment.isCommand);
    const messageTextStyle = [styles.messageText, isUser ? styles.userText : styles.agentText];
    const commandTextStyle = isUser ? styles.commandTextUser : styles.commandText;
    return (
      <>
        {this.shouldShowTimestamp(index) && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>{this.formatTimestamp(item.timestamp)}</Text>
          </View>
        )}
        <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
          {!isUser && (
            <TouchableOpacity
              accessibilityLabel="Open submit form"
              activeOpacity={0.7}
              onPress={() => this.handleAvatarPress(item.text)}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('agent')}
            </TouchableOpacity>
          )}
          <View style={[styles.bubbleColumn, isUser ? styles.userBubbleColumn : styles.agentBubbleColumn]}>
            <TouchableOpacity
              accessibilityLabel="Chat message"
              activeOpacity={0.7}
              onPress={hasCopyLink || hasCommandTokens ? undefined : () => this.handleMessagePress(item.text)}
              onLongPress={hasCopyLink || hasCommandTokens ? undefined : () => this.handleMessageLongPress(item.text)}
              style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}
            >
              <Text style={messageTextStyle}>
                {commandSegments.length === 0
                  ? item.text
                  : commandSegments.map((segment, segmentIndex) =>
                      segment.isCommand ? (
                        <Text
                          key={`${item.id}-command-${segmentIndex}`}
                          style={[messageTextStyle, commandTextStyle]}
                          onPress={() => this.handleCommandPress(segment.commandText || segment.text)}
                        >
                          {segment.displayText || segment.text}
                        </Text>
                      ) : (
                        <Text key={`${item.id}-text-${segmentIndex}`} style={messageTextStyle}>
                          {segment.text}
                        </Text>
                      ),
                    )}
              </Text>
              {hasCopyLink && (
                <TouchableOpacity
                  accessibilityLabel="Copy destiny seed card"
                  activeOpacity={0.7}
                  onPress={() => this.handleMessagePress(item.copyText)}
                >
                  <Text style={[styles.messageText, styles.linkText]}>{item.linkLabel}</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
          {isUser && (
            <TouchableOpacity
              accessibilityLabel="Open submit form"
              activeOpacity={0.7}
              onPress={() => this.handleAvatarPress(item.text)}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('user')}
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  };

  render() {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.chatContainer}>
            <FlatList
              ref={ref => {
                this.listRef = ref;
              }}
              data={this.state.messages}
              keyExtractor={item => item.id}
              renderItem={this.renderMessage}
              contentContainerStyle={this.state.messages.length === 0 ? styles.emptyContainer : styles.listContent}
              ListEmptyComponent={() => (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Start a conversation with this agent.</Text>
                </View>
              )}
              onContentSizeChange={this.handleContentSizeChange}
              onLayout={() => {
                if (!this.didInitialScroll && this.state.messages.length > 0) {
                  this.forceScrollToBottomOnce = true;
                  this.didInitialScroll = true;
                }
              }}
              onScroll={this.handleScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
            />
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={this.state.inputValue}
              placeholder="Type a message"
              placeholderTextColor="#6f7587"
              onChangeText={text => this.setState({ inputValue: text })}
              onSubmitEditing={this.handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={this.handleSend}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

const mapStateToProps = state => ({
  namespaceList: state.namespaceList,
});

export default connect(mapStateToProps)(AgentChat);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d15',
  },
  headerTitle: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerAction: {
    paddingHorizontal: 16,
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  agentRow: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '76%',
  },
  userBubbleColumn: {
    marginRight: 12,
  },
  agentBubbleColumn: {
    marginLeft: 12,
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#1fcd51',
    borderBottomRightRadius: 2,
  },
  agentBubble: {
    backgroundColor: '#101726',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  agentText: {
    color: '#d2d7e0',
  },
  linkText: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  commandText: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  commandTextUser: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  timestampContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  timestampText: {
    color: '#6f7587',
    fontSize: 13,
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a2336',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPressable: {
    borderRadius: 12,
  },
  agentAvatarWrapper: {
    borderWidth: 1,
    borderColor: '#24304a',
  },
  userAvatarWrapper: {
    borderWidth: 1,
    borderColor: '#1fcd51',
  },
  userAvatarBlank: {
    backgroundColor: '#000000',
  },
  userAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    color: '#6f7587',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2a44',
    backgroundColor: '#0b1224',
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#24304a',
    borderRadius: 12,
    color: '#ffffff',
    backgroundColor: '#0f162b',
  },
  sendButton: {
    marginLeft: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: KevaColors.actionText,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
