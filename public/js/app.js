// Başlangıç noktası: ayarları yükler, sunucudan sağlayıcı ve mod listesini alır, her şeyi bağlar.

import { wakeServer, getProviders, getModes } from './api.js';
import { state, loadSettings } from './state.js';
import { initSettings, hasKey, openSettings } from './settings.js';
import { initRender, addMessage } from './render.js';
import { initButtons } from './buttons.js';
import { initChat } from './chat.js';

async function boot() {
  wakeServer();
  loadSettings();
  initRender();

  // Render ücretsiz planda sunucu uyuyorsa ilk istek 30-60 sn sürebilir
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Sunucuya bağlanılıyor... İlk açılışta 30-60 saniye sürebilir.';
  document.getElementById('welcome')?.appendChild(note);

  try {
    const [providers, modes] = await Promise.all([getProviders(), getModes()]);
    state.providers = providers;
    state.modes = modes;
  } catch {
    note.remove();
    addMessage('error', 'Sunucuya bağlanılamadı. Birkaç saniye bekleyip sayfayı yenile.');
    return;
  }

  note.remove();

  initSettings(() => {});
  initButtons();
  initChat();

  // İlk kullanımda anahtar yoksa ayarlar kendiliğinden açılır
  if (!hasKey()) openSettings();
}

boot();
