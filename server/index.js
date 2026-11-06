import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROVIDERS, streamChat } from './providers.js';
import { buildSystemPrompt, listModes } from './modes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const MAX_MESSAGES = 30; // basit bağlam kırpma, sonra geliştireceğiz
const MAX_CHARS = 200000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Render'ın sağlık kontrolü
app.get('/health', (req, res) => res.send('ok'));

// Arayüzdeki sağlayıcı menüsü için
app.get('/api/providers', (req, res) => {
  res.json(
    Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      label: p.label,
      defaultModel: p.defaultModel,
      keyHelp: p.keyHelp,
    }))
  );
});

// Arayüzdeki butonlar için (etiket + düzenlenebilir hazır prompt)
app.get('/api/modes', (req, res) => res.json(listModes()));

function validate(body) {
  const { provider, apiKey, messages } = body || {};
  if (!PROVIDERS[provider]) return 'Geçersiz sağlayıcı';
  if (typeof apiKey !== 'string' || apiKey.length < 8) return 'API anahtarı eksik';
  if (!Array.isArray(messages) || messages.length === 0) return 'Mesaj yok';
  const bad = messages.some(
    (m) => !['user', 'assistant'].includes(m?.role) || typeof m?.content !== 'string'
  );
  if (bad) return 'Mesaj formatı hatalı';
  return null;
}

function trimMessages(messages) {
  let list = messages.slice(-MAX_MESSAGES);
  let total = list.reduce((n, m) => n + m.content.length, 0);
  while (list.length > 1 && total > MAX_CHARS) {
    total -= list[0].content.length;
    list = list.slice(1);
  }
  // Konuşma her zaman kullanıcı mesajıyla başlamalı
  while (list.length > 1 && list[0].role !== 'user') list = list.slice(1);
  return list;
}

app.post('/api/chat', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const { provider, apiKey, model, mode, messages } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    await streamChat({
      provider,
      apiKey,
      model: (model && String(model).trim()) || PROVIDERS[provider].defaultModel,
      system: buildSystemPrompt(mode),
      messages: trimMessages(messages),
      signal: controller.signal,
      onText: (t) => send({ t }),
    });
    send({ done: true });
  } catch (e) {
    if (!controller.signal.aborted) {
      // Anahtar hata mesajında sızmasın
      const safe = String(e.message || 'Hata').split(apiKey).join('***');
      send({ error: safe });
    }
  } finally {
    clearInterval(ping);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aamon çalışıyor: ${PORT}`));
