import { STORY_MENU_MESSAGES } from "../data/agentrole_i18n";
import {
  NAMESPACE_UI_MESSAGES,
  normalizeNamespaceLang,
  resolveNamespaceUiLanguage
} from "../data/namespace_i18n";

const SETTINGS_UI_MESSAGES = {
  en: {
    header: "Settings",
    general: "General",
    security: "Security",
    network: "Network",
    about: "About",
    languageRestart:
      "After selecting a new language, restarting the app is required for the change to take effect."
  },
  "zh-cn": {
    header: "设置",
    general: "常规",
    security: "安全",
    network: "网络",
    about: "关于",
    languageRestart: "选择新语言后，需要重新启动应用程序才能使更改生效。"
  },
  "zh-tw": {
    header: "設定",
    general: "常規",
    security: "安全",
    network: "網路",
    about: "關於",
    languageRestart: "選擇新語言後，需要重新啟動應用程式才能使變更生效。"
  },
  ja: {
    header: "設定",
    general: "一般",
    security: "セキュリティ",
    network: "ネットワーク",
    about: "概要",
    languageRestart:
      "新しい言語を選択した後、変更を反映するにはアプリの再起動が必要です。"
  },
  ko: {
    header: "설정",
    general: "일반",
    security: "보안",
    network: "네트워크",
    about: "정보",
    languageRestart:
      "새 언어를 선택한 뒤 변경 사항을 적용하려면 앱을 다시 시작해야 합니다."
  },
  es: {
    header: "Configuración",
    general: "General",
    security: "Seguridad",
    network: "Red",
    about: "Acerca de",
    languageRestart:
      "Después de seleccionar un nuevo idioma, debes reiniciar la aplicación para que el cambio surta efecto."
  },
  fr: {
    header: "Réglages",
    general: "Général",
    security: "Sécurité",
    network: "Réseau",
    about: "À propos",
    languageRestart:
      "Après avoir choisi une nouvelle langue, vous devez redémarrer l’application pour appliquer le changement."
  },
  'zar-afr': {
    header: 'Instellings', general: 'Algemeen', security: 'Sekuriteit', network: 'Netwerk', about: 'Oor', languageRestart: 'Nadat jy ’n nuwe taal gekies het, moet die toepassing herbegin word voordat die verandering in werking tree.'
  },
  'hr-hr': {
    header: 'Postavke', general: 'Općenito', security: 'Sigurnost', network: 'Mreža', about: 'O aplikaciji', languageRestart: 'Nakon odabira novog jezika potrebno je ponovno pokrenuti aplikaciju kako bi promjena stupila na snagu.'
  },
  'cs-cz': {
    header: 'Nastavení', general: 'Obecné', security: 'Zabezpečení', network: 'Síť', about: 'O aplikaci', languageRestart: 'Po výběru nového jazyka je nutné aplikaci restartovat, aby se změna projevila.'
  },
  'da-dk': {
    header: 'Indstillinger', general: 'Generelt', security: 'Sikkerhed', network: 'Netværk', about: 'Om', languageRestart: 'Når du har valgt et nyt sprog, skal appen genstartes, før ændringen træder i kraft.'
  },
  de: {
    header: 'Einstellungen', general: 'Allgemein', security: 'Sicherheit', network: 'Netzwerk', about: 'Info', languageRestart: 'Nach Auswahl einer neuen Sprache muss die App neu gestartet werden, damit die Änderung wirksam wird.'
  },
  el: {
    header: 'Ρυθμίσεις', general: 'Γενικά', security: 'Ασφάλεια', network: 'Δίκτυο', about: 'Σχετικά', languageRestart: 'Αφού επιλέξετε νέα γλώσσα, απαιτείται επανεκκίνηση της εφαρμογής για να εφαρμοστεί η αλλαγή.'
  },
  it: {
    header: 'Impostazioni', general: 'Generali', security: 'Sicurezza', network: 'Rete', about: 'Informazioni', languageRestart: 'Dopo aver selezionato una nuova lingua, è necessario riavviare l’app perché la modifica abbia effetto.'
  },
  'fi-fi': {
    header: 'Asetukset', general: 'Yleiset', security: 'Suojaus', network: 'Verkko', about: 'Tietoja', languageRestart: 'Kun olet valinnut uuden kielen, sovellus on käynnistettävä uudelleen, jotta muutos tulee voimaan.'
  },
  'id-id': {
    header: 'Pengaturan', general: 'Umum', security: 'Keamanan', network: 'Jaringan', about: 'Tentang', languageRestart: 'Setelah memilih bahasa baru, aplikasi harus dimulai ulang agar perubahan berlaku.'
  },
  'hu-hu': {
    header: 'Beállítások', general: 'Általános', security: 'Biztonság', network: 'Hálózat', about: 'Névjegy', languageRestart: 'Új nyelv kiválasztása után újra kell indítani az alkalmazást, hogy a módosítás érvénybe lépjen.'
  },
  'nl-nl': {
    header: 'Instellingen', general: 'Algemeen', security: 'Beveiliging', network: 'Netwerk', about: 'Over', languageRestart: 'Na het kiezen van een nieuwe taal moet de app opnieuw worden gestart voordat de wijziging van kracht wordt.'
  },
  'nb-no': {
    header: 'Innstillinger', general: 'Generelt', security: 'Sikkerhet', network: 'Nettverk', about: 'Om', languageRestart: 'Etter at du har valgt et nytt språk, må appen startes på nytt for at endringen skal tre i kraft.'
  },
  'pt-br': {
    header: 'Configurações', general: 'Geral', security: 'Segurança', network: 'Rede', about: 'Sobre', languageRestart: 'Depois de selecionar um novo idioma, é necessário reiniciar o aplicativo para que a mudança tenha efeito.'
  },
  'pt-pt': {
    header: 'Definições', general: 'Geral', security: 'Segurança', network: 'Rede', about: 'Sobre', languageRestart: 'Depois de selecionar um novo idioma, é necessário reiniciar a aplicação para que a alteração produza efeito.'
  },
  ru: {
    header: 'Настройки', general: 'Общие', security: 'Безопасность', network: 'Сеть', about: 'О приложении', languageRestart: 'После выбора нового языка необходимо перезапустить приложение, чтобы изменения вступили в силу.'
  },
  'sv-se': {
    header: 'Inställningar', general: 'Allmänt', security: 'Säkerhet', network: 'Nätverk', about: 'Om', languageRestart: 'När du har valt ett nytt språk måste appen startas om för att ändringen ska börja gälla.'
  },
  'th-th': {
    header: 'การตั้งค่า', general: 'ทั่วไป', security: 'ความปลอดภัย', network: 'เครือข่าย', about: 'เกี่ยวกับ', languageRestart: 'หลังจากเลือกภาษาใหม่แล้ว จำเป็นต้องรีสตาร์ตแอปเพื่อให้การเปลี่ยนแปลงมีผล.'
  },
  vi: {
    header: 'Cài đặt', general: 'Chung', security: 'Bảo mật', network: 'Mạng', about: 'Giới thiệu', languageRestart: 'Sau khi chọn ngôn ngữ mới, cần khởi động lại ứng dụng để thay đổi có hiệu lực.'
  },
  ua: {
    header: 'Налаштування', general: 'Загальні', security: 'Безпека', network: 'Мережа', about: 'Про застосунок', languageRestart: 'Після вибору нової мови потрібно перезапустити застосунок, щоб зміни набули чинності.'
  },
  tr: {
    header: 'Ayarlar', general: 'Genel', security: 'Güvenlik', network: 'Ağ', about: 'Hakkında', languageRestart: 'Yeni bir dil seçtikten sonra değişikliğin etkili olması için uygulamayı yeniden başlatmanız gerekir.'
  },
  'zar-xho': {
    header: 'Iisetingi', general: 'Ngokubanzi', security: 'Ukhuseleko', network: 'Inethiwekhi', about: 'Malunga', languageRestart: 'Emva kokukhetha ulwimi olutsha, kufuneka uqale kwakhona i-app ukuze utshintsho lusebenze.'
  },
};

export const resolveSettingsUiLanguage = async () =>
  normalizeNamespaceLang(await resolveNamespaceUiLanguage(null));

export const getSettingsText = (key, lang) => {
  const normalized = normalizeNamespaceLang(lang || "en");
  const settings = SETTINGS_UI_MESSAGES[normalized] || SETTINGS_UI_MESSAGES.en;
  if (key === "header") {
    return settings.header || SETTINGS_UI_MESSAGES.en.header || "Settings";
  }
  if (key === "language") {
    return (
      STORY_MENU_MESSAGES[normalized]?.changeLanguage ||
      NAMESPACE_UI_MESSAGES[normalized]?.language ||
      STORY_MENU_MESSAGES.en?.changeLanguage ||
      NAMESPACE_UI_MESSAGES.en?.language ||
      "Language"
    );
  }
  if (key === "otherLanguages") {
    return (
      STORY_MENU_MESSAGES[normalized]?.moreLanguages ||
      STORY_MENU_MESSAGES.en?.moreLanguages ||
      "Other languages"
    );
  }
  return settings[key] || SETTINGS_UI_MESSAGES.en[key] || key;
};
