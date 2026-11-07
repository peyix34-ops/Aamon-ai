// Mod butonları: yazı alanının üstündeki sabit sıra + kod içeren cevapların altındaki sıra.
// Butona dokunmak hazır prompt'u kutuya doldurur ve modu aktif eder.
// Gönderince mod sunucuya gider, sunucu gizli talimatı kendisi ekler.

import { state } from './state.js';
import { addActions } from './render.js';

const $ = (id) => document.getElementById(id);

function makeChip(mode) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.mode = mode.id;
  b.textContent = mode.label;
  return b;
}

// Metnin sonundaki hazır prompt'ları siler, kullanıcının kendi yazdığı kısmı korur.
function stripDefault(text) {
  let t = text.trim();
  for (const m of state.modes) {
    const d = (m.defaultPrompt || '').trim();
    if (d && t.endsWith(d)) t = t.slice(0, -d.length).trim();
  }
  return t;
}

function updateBar() {
  document.querySelectorAll('.chip[data-mode]').forEach((c) => {
    c.classList.toggle('active', c.dataset.mode === state.activeMode);
  });

  const hint = $('modeHint');
  const mode = state.modes.find((m) => m.id === state.activeMode);
  if (mode) {
    hint.textContent = `Aktif mod: ${mode.label}. Prompt'u değiştirebilirsin. Kapatmak için butona tekrar dokun.`;
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function setMode(id) {
  const mode = state.modes.find((m) => m.id === id);
  if (!mode) return;

  const input = $('input');

  // Aynı butona tekrar dokunmak modu kapatır
  if (state.activeMode === id) {
    input.value = stripDefault(input.value);
    state.activeMode = null;
    input.dispatchEvent(new Event('input'));
    updateBar();
    return;
  }

  const base = stripDefault(input.value);
  input.value = base ? `${base}\n\n${mode.defaultPrompt}` : mode.defaultPrompt;
  state.activeMode = id;

  input.dispatchEvent(new Event('input')); // kutu boyunu güncelle
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  updateBar();
}

export function clearMode() {
  state.activeMode = null;
  updateBar();
}

// Mesaj gönderilemediğinde modu geri verir (kutuya dokunmaz)
export function restoreMode(id) {
  state.activeMode = id || null;
  updateBar();
}

// Cevabın altına mod butonlarını koyar. Eski cevapların butonları kalkar.
export function addModeChips(msgEl) {
  document.querySelectorAll('.msg-actions').forEach((n) => n.remove());
  const row = addActions(msgEl);
  for (const mode of state.modes) row.appendChild(makeChip(mode));
  updateBar();
}

export function initButtons() {
  const bar = $('modeBar');
  bar.innerHTML = '';

  if (!state.modes.length) {
    bar.classList.add('hidden');
    return;
  }

  for (const mode of state.modes) bar.appendChild(makeChip(mode));

  // Hem üst sıradaki hem cevap altındaki butonlar için tek dinleyici
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-mode]');
    if (chip) setMode(chip.dataset.mode);
  });

  updateBar();
}
