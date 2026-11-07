// Sohbet motoru: mesaj gönderir, cevabı akış halinde ekrana basar, durdurur, hataları gösterir.

import { state, getKey, getModel, resetChat } from './state.js';
import { streamChat } from './api.js';
import { ensureKey } from './settings.js';
import { addMessage, renderInto, showTyping, clearMessages } from './render.js';
import { clearMode, restoreMode, addModeChips } from './buttons.js';

const $ = (id) => document.getElementById(id);

let controller = null;
let epoch = 0; // "Yeni sohbet" basılınca artar, eski isteklerin geç gelen sonucunu çöpe atar

function autoGrow() {
  const ta = $('input');
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.4)}px`;
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('sendBtn');
  btn.textContent = busy ? 'Durdur' : 'Gönder';
  btn.classList.toggle('stop', busy);
}

// Tek bir cevabı sunucudan alır ve ekrana basar.
// Döner: { text, error, aborted, el }
async function runAssistant(mode) {
  document.querySelectorAll('.msg-actions').forEach((n) => n.remove());

  const { el, body } = addMessage('assistant');
  showTyping(body);

  controller = new AbortController();
  setBusy(true);

  let full = '';
  let raf = 0;
  let error = '';
  let aborted = false;

  const paint = () => {
    raf = 0;
    renderInto(body, full);
  };

  try {
    const finished = await streamChat({
      provider: state.provider,
      apiKey: getKey(),
      model: getModel(),
      mode,
      messages: state.messages,
      signal: controller.signal,
      onText: (t) => {
        full += t;
        if (!raf) raf = requestAnimationFrame(paint); // her parçada değil, ekran yenilemesinde çiz
      },
    });
    if (!finished) error = 'Bağlantı erken kapandı, cevap yarım kalmış olabilir.';
  } catch (e) {
    if (e.name === 'AbortError') aborted = true;
    else error = e.message || 'Bilinmeyen hata';
  } finally {
    if (raf) cancelAnimationFrame(raf);
    setBusy(false);
    controller = null;
  }

  if (!full && !error && !aborted) {
    error = 'Model boş cevap döndürdü. Model adını ayarlardan kontrol et.';
  }

  if (full) renderInto(body, full);
  else el.remove();

  return { text: full, error, aborted, el };
}

async function send() {
  const input = $('input');
  const text = input.value.trim();
  if (!text) return;
  if (!ensureKey()) return; // anahtar yoksa ayarlar açılır, yazdığın metin kutuda kalır

  const mode = state.activeMode;
  const myEpoch = epoch;

  state.messages.push({ role: 'user', content: text });
  const { el: userEl } = addMessage('user', text);

  input.value = '';
  autoGrow();
  clearMode();

  const result = await runAssistant(mode);
  if (myEpoch !== epoch) return; // bu arada yeni sohbet açıldı

  // Hiç cevap gelmediyse mesajı geri al, kutuya koy: tekrar göndermek tek dokunuş olsun
  if (!result.text) {
    state.messages.pop();
    userEl.remove();
    input.value = text;
    autoGrow();
    restoreMode(mode);
    if (result.error) addMessage('error', result.error);
    return;
  }

  state.messages.push({ role: 'assistant', content: result.text });

  if (result.error) addMessage('error', result.error);

  // Kod içeren cevabın altına analiz/hata/eksik/mantık butonları
  if (/```/.test(result.text)) addModeChips(result.el);
}

function newChat() {
  if (state.messages.length && !confirm('Sohbet silinsin mi?')) return;
  epoch++;
  if (controller) controller.abort();
  resetChat();
  clearMessages();
  clearMode();
  $('input').value = '';
  autoGrow();
}

export function initChat() {
  const input = $('input');

  input.addEventListener('input', autoGrow);

  // Bilgisayarda Enter gönderir (Shift+Enter alt satır). Telefonda Enter alt satıra geçer.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    e.preventDefault();
    if (!state.busy) send();
  });

  $('sendBtn').addEventListener('click', () => {
    if (state.busy) {
      if (controller) controller.abort();
    } else {
      send();
    }
  });

  $('newChatBtn').addEventListener('click', newChat);
  autoGrow();
}
