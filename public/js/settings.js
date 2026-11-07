// Ayarlar penceresi: sağlayıcı menüsü, API anahtarı ve model adı.
// Pencere açılınca bir taslak (draft) üzerinde çalışılır; "Kaydet"e basılmazsa hiçbir şey değişmez.

import { state, getKey, saveSettings } from './state.js';

const $ = (id) => document.getElementById(id);
let draft = null;
let onChangeCb = () => {};

function providerInfo(id) {
  return state.providers.find((p) => p.id === id);
}

function fillProviderOptions() {
  const sel = $('providerSelect');
  sel.innerHTML = '';
  for (const p of state.providers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
}

function refreshFields() {
  const p = providerInfo(draft.provider);
  $('providerSelect').value = draft.provider;
  $('keyInput').value = draft.keys[draft.provider] || '';
  $('modelInput').value = draft.models[draft.provider] || '';
  $('modelInput').placeholder = p ? p.defaultModel : '';
  $('keyHelp').textContent = p && p.keyHelp ? `Anahtarı buradan alabilirsin: ${p.keyHelp}` : '';
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
}

export function openSettings() {
  draft = {
    provider: state.provider,
    keys: { ...state.keys },
    models: { ...state.models },
  };
  $('rememberCheck').checked = state.remember;
  refreshFields();
  $('settingsDialog').showModal();
}

export function hasKey() {
  return getKey().length >= 8;
}

// Anahtar yoksa ayarları açar, mesaj göndermeyi engellemek için false döner.
export function ensureKey() {
  if (hasKey()) return true;
  openSettings();
  return false;
}

export function initSettings(onChange) {
  onChangeCb = onChange || (() => {});

  fillProviderOptions();
  if (!providerInfo(state.provider) && state.providers[0]) {
    state.provider = state.providers[0].id;
  }

  $('settingsBtn').addEventListener('click', openSettings);
  $('cancelBtn').addEventListener('click', () => $('settingsDialog').close());

  $('providerSelect').addEventListener('change', (e) => {
    draft.provider = e.target.value;
    refreshFields();
  });

  $('keyInput').addEventListener('input', (e) => {
    draft.keys[draft.provider] = e.target.value.trim();
  });

  $('modelInput').addEventListener('input', (e) => {
    draft.models[draft.provider] = e.target.value.trim();
  });

  // Seçili sağlayıcının anahtarını hemen siler (kayıtlıysa depodan da gider)
  $('clearKeyBtn').addEventListener('click', () => {
    delete draft.keys[draft.provider];
    delete state.keys[draft.provider];
    saveSettings();
    $('keyInput').value = '';
    onChangeCb();
  });

  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.provider = draft.provider;
    state.keys = clean(draft.keys);
    state.models = clean(draft.models);
    state.remember = $('rememberCheck').checked;
    saveSettings();
    $('settingsDialog').close();
    onChangeCb();
  });
}
