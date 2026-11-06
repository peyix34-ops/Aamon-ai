// Sağlayıcı listesi + her sağlayıcıya akışlı (streaming) istek atan fonksiyonlar.
// Anahtar sadece istek sırasında kullanılır, hiçbir yere yazılmaz.

export const PROVIDERS = {
  groq: {
    label: 'Groq',
    type: 'openai',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHelp: 'console.groq.com',
  },
  gemini: {
    label: 'Google Gemini',
    type: 'openai',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.5-flash',
    keyHelp: 'aistudio.google.com',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    type: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    keyHelp: 'platform.openai.com',
  },
  openrouter: {
    label: 'OpenRouter',
    type: 'openai',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    keyHelp: 'openrouter.ai',
  },
  claude: {
    label: 'Claude (Anthropic)',
    type: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-haiku-5-5',
    keyHelp: 'console.anthropic.com',
  },
};

const STATUS_HINTS = {
  400: 'İstek hatalı (model adı yanlış olabilir)',
  401: 'API anahtarı geçersiz',
  403: 'Bu anahtarın yetkisi yok',
  404: 'Model bulunamadı (model adını kontrol et)',
  429: 'Limit doldu, biraz bekle veya başka sağlayıcı dene',
};

// Yukarıdan gelen SSE akışını satır satır okur, her JSON parçasını onData'ya verir.
async function readSSE(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;

      const data = line.slice(5).trim();
      if (data === '[DONE]') return;

      let obj;
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }
      onData(obj);
    }
  }
}

async function failFromResponse(label, response) {
  let detail = '';
  try {
    const raw = await response.text();
    try {
      const j = JSON.parse(raw);
      detail = j?.error?.message || j?.message || raw;
    } catch {
      detail = raw;
    }
  } catch {
    /* gövde okunamadı */
  }
  const hint = STATUS_HINTS[response.status] || 'Bilinmeyen hata';
  throw new Error(`${label} (${response.status}): ${hint}. ${String(detail).slice(0, 300)}`);
}

// OpenAI uyumlu: Groq, Gemini, OpenAI, OpenRouter
async function streamOpenAI(p, { apiKey, model, system, messages, signal, onText }) {
  const response = await fetch(p.url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!response.ok) await failFromResponse(p.label, response);

  await readSSE(response, (obj) => {
    const text = obj?.choices?.[0]?.delta?.content;
    if (text) onText(text);
  });
}

// Anthropic (Claude)
async function streamAnthropic(p, { apiKey, model, system, messages, signal, onText }) {
  const response = await fetch(p.url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: 8192,
      stream: true,
    }),
  });
  if (!response.ok) await failFromResponse(p.label, response);

  await readSSE(response, (obj) => {
    if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
      onText(obj.delta.text);
    } else if (obj.type === 'error') {
      throw new Error(`${p.label}: ${obj.error?.message || 'akış hatası'}`);
    }
  });
}

export async function streamChat({ provider, ...rest }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Bilinmeyen sağlayıcı');
  if (p.type === 'anthropic') return streamAnthropic(p, rest);
  return streamOpenAI(p, rest);
}
