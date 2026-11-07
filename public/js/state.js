// Uygulamanın ortak durumu ve cihazdaki ayar kaydı.
// Anahtarlar sadece "hatırla" işaretliyse localStorage'a (kullanıcının kendi cihazı) yazılır.

const SETTINGS_KEY = 'aamon.settings';
const KEYS_KEY = 'aamon.keys';

export const state = {
  providers: [],      // sunucudan gelen sağlayıcı listesi
  modes: [],          // sunucudan gelen mod butonları
  provider: 'groq',   // seçili sağlayıcı
  models: {},         // sağlayıcı -> kullanıcının yazdığı model adı
  keys: {},           // sağlayıcı -> API anahtarı
  remember: false,    // anahtar cihazda hatırlansın mı
  messages: [],       // [{role, content}] sohbet geçmişi
  activeMode: null,   // seçili modun id'si
  busy: false,        // cevap geliyor mu
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* gizli sekme veya dolu depo: sessizce geç */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* önemli değil */
  }
}

export function loadSettings() {
  const s = read(SETTINGS_KEY) || {};
  if (s.provider) state.provider = s.provider;
  state.models = s.models || {};
  state.remember = !!s.remember;
  state.keys = state.remember ? read(KEYS_KEY) || {} : {};
}

export function saveSettings() {
  write(SETTINGS_KEY, {
    provider: state.provider,
    models: state.models,
    remember: state.remember,
  });
  if (state.remember) write(KEYS_KEY, state.keys);
  else remove(KEYS_KEY); // hatırlama kapalıysa eski kayıtlı anahtarlar da silinir
}

export function getKey() {
  return state.keys[state.provider] || '';
}

export function getModel() {
  const custom = (state.models[state.provider] || '').trim();
  if (custom) return custom;
  const p = state.providers.find((x) => x.id === state.provider);
  return p ? p.defaultModel : '';
}

export function resetChat() {
  state.messages = [];
  state.activeMode = null;
}
