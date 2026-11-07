import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROVIDERS, streamChat } from './providers.js';
import { buildSystemPrompt, listModes } from './modes/index.js';
import { trimMessages } from './trim.js';
import { getModels } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Anahtar hata mesajlarında sızmasın
const redact = (msg, key) => (key ? String(msg).split(key).join('***') : String(msg));

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

// Ücretsiz / ücretli model listesi. Anahtar sadece sağlayıcının model listesi için kullanılır.
app.post('/api/models', async (req, res) => {
  const { provider, apiKey, tier } = req.body || {};
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Geçersiz sağlayıcı' });

  const key = typeof apiKey === 'string' ? apiKey : '';
  try {
    res.json(await getModels(provider, key, tier === 'paid' ? 'paid' : 'free'));
  } catch (e) {
    res.status(502).json({ error: redact(e.message || 'Hata', key) });
  }
});

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

app.post('/api/chat', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const { provider, apiKey, model, mode, messages } = req.body;
  const p = PROVIDERS[provider];

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
      model: (model && String(model).trim()) || p.defaultModel,
      system: buildSystemPrompt(mode),
      messages: trimMessages(messages, p.historyBudget),
      // Kod yazarken ve hata ararken düşünme seviyesi orta, sadece analizde düşük
      effort: mode === 'analiz-et' ? 'low' : 'medium',
      signal: controller.signal,
      onText: (t) => send({ t }),
    });
    send({ done: true });
  } catch (e) {
    if (!controller.signal.aborted) {
      send({ error: redact(e.message || 'Hata', apiKey) });
    }
  } finally {
    clearInterval(ping);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aamon çalışıyor: ${PORT}`));
