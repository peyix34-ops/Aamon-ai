// Sağlayıcının model listesini canlı çeker, ücretsiz/ücretli diye ayırır, önerilen modeli başa koyar.
// Canlı liste alınamazsa küçük bir yedek liste kullanılır.
//
// Dürüst not: OpenRouter ücretsiz modelleri kesin işaretler. Groq, Gemini, OpenAI ve Claude
// API'leri "ücretsiz mi" bilgisini vermez, o yüzden aşağıdaki kurallarla tahmin ediyoruz.

const LIST_URLS = {
  groq: 'https://api.groq.com/openai/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
  openai: 'https://api.openai.com/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  claude: 'https://api.anthropic.com/v1/models?limit=100',
};

const fb = (...ids) => ids.map((id) => ({ id, label: id, free: false }));

const FALLBACK = {
  groq: fb('llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'),
  gemini: fb('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'),
  openai: fb('gpt-4o-mini', 'gpt-4.1-mini'),
  openrouter: [],
  claude: fb('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'),
};

// Kararsız sürümler (preview, tarihli kopyalar) listede aşağı iner
const UNSTABLE = /preview|experimental|\bexp\b|beta|\d{4}-\d{2}-\d{2}|-\d{8}$/i;
const PAID_PREFIXES = /^(anthropic|openai|google|deepseek|qwen|meta-llama|mistralai|x-ai)\//i;

const RULES = {
  groq: {
    isChat: (id) => !/whisper|tts|playai|orpheus|guard|safeguard|embed|compound/i.test(id),
    isFree: () => true,
    prefer: {
      free: [/llama-3\.3-70b/i, /gpt-oss-120b/i, /llama-4/i, /qwen/i, /gpt-oss/i],
      paid: [/gpt-oss-120b/i, /llama-3\.3-70b/i, /llama-4/i, /qwen/i, /gpt-oss/i],
    },
    notes: {
      free: 'Groq ücretsiz planında modeller aynı, ama dakikalık token limiti düşük. 429 alırsan bekle veya yeni sohbet aç.',
      paid: 'Groq ücretli (Dev) planında aynı modeller çok daha yüksek limitle çalışır.',
    },
  },
  gemini: {
    isChat: (id) =>
      /^gemini/i.test(id) &&
      !/embedding|imagen|veo|tts|image|live|audio|robotics|aqa|learnlm|native|computer-use/i.test(id),
    isFree: (m) => /flash/i.test(m.id),
    prefer: {
      free: [/flash(?!.*lite)/i, /lite/i],
      paid: [/pro/i, /flash(?!.*lite)/i, /lite/i],
    },
    notes: {
      free: 'Google ücretsiz katmanı genelde Flash modellerini kapsar. Kapsam ve limitler değişebilir, 429 alırsan başka modeli dene.',
      paid: 'Pro modeller daha güçlü ama ücretlidir (Google hesabında faturalandırma açık olmalı).',
    },
  },
  openai: {
    isChat: (id) =>
      /^(gpt-|o\d|chatgpt)/i.test(id) &&
      !/audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct|codex|whisper|computer-use|deep-research|davinci|babbage/i.test(id),
    isFree: () => false,
    prefer: { free: [], paid: [/mini/i, /^gpt-4\.1/i, /^gpt-4o/i, /^gpt-5/i] },
    notes: {
      free: 'OpenAI API genellikle ücretsiz katman sunmaz, hesabına bakiye yüklemen gerekir. Ücretli sekmesine bak.',
      paid: 'Ücretlidir. "mini" modeller en ucuzlarıdır.',
    },
  },
  claude: {
    isChat: () => true,
    isFree: () => false,
    prefer: { free: [], paid: [/haiku/i, /sonnet/i, /opus/i] },
    notes: {
      free: 'Claude API genellikle ücretsiz katman sunmaz, hesabına bakiye yüklemen gerekir. Ücretli sekmesine bak.',
      paid: 'Haiku en ucuzu, Sonnet ve Opus daha güçlü ama daha pahalıdır.',
    },
  },
  openrouter: {
    isChat: (id) => !/embed|image|audio|moderation|whisper|tts/i.test(id),
    isFree: (m) => m.free,
    filterPaid: (m) => !m.free && PAID_PREFIXES.test(m.id),
    cap: 50,
    prefer: {
      free: [/qwen.*coder/i, /deepseek/i, /llama.*70b|llama-3\.3/i, /gpt-oss/i, /gemini/i, /qwen/i],
      paid: [/anthropic\/claude/i, /openai\/gpt/i, /google\/gemini/i, /deepseek/i],
    },
    notes: {
      free: 'OpenRouter ücretsiz modelleri günlük istek limitiyle çalışır ve sık değişir.',
      paid: 'Ücretli modeller kullandığın kadar öder. Liste en bilinen sağlayıcılarla sınırlı.',
    },
  },
};

function normalize(provider, m) {
  if (!m || !m.id || m.active === false) return null;
  let id = String(m.id);
  if (provider === 'gemini') id = id.replace(/^models\//, '');

  const zero = (v) => v !== undefined && Number(v) === 0;
  const free =
    provider === 'openrouter'
      ? /:free$/.test(id) || (zero(m.pricing?.prompt) && zero(m.pricing?.completion))
      : false;

  return { id, label: m.display_name || m.name || id, free };
}

async function fetchList(provider, apiKey) {
  const headers = {};
  if (provider === 'claude') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(LIST_URLS[provider], { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const err = new Error(`Model listesi alınamadı (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
  return data.map((m) => normalize(provider, m)).filter(Boolean);
}

function compare(prefer) {
  const rank = (id) => {
    const i = prefer.findIndex((re) => re.test(id));
    return i < 0 ? prefer.length : i;
  };
  const version = (id) => {
    const m = id.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  };
  return (a, b) =>
    rank(a.id) - rank(b.id) ||
    Number(UNSTABLE.test(a.id)) - Number(UNSTABLE.test(b.id)) ||
    version(b.id) - version(a.id) ||
    a.id.localeCompare(b.id);
}

// tier: 'free' veya 'paid'
export async function getModels(provider, apiKey, tier) {
  const rule = RULES[provider];
  if (!rule) throw new Error('Bilinmeyen sağlayıcı');

  let all = null;
  if (apiKey || provider === 'openrouter') {
    try {
      all = await fetchList(provider, apiKey);
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        throw new Error('API anahtarı geçersiz, model listesi alınamadı');
      }
      all = null; // ağ hatası vb.: yedek listeye düş
    }
  }

  const live = Array.isArray(all) && all.length > 0;
  let list = (live ? all : FALLBACK[provider] || []).filter((m) => rule.isChat(m.id));

  if (tier === 'free') {
    list = list.filter((m) => rule.isFree(m));
  } else if (rule.filterPaid) {
    list = list.filter(rule.filterPaid);
  }

  list.sort(compare(rule.prefer[tier] || []));
  if (rule.cap) list = list.slice(0, rule.cap);

  return {
    models: list.map(({ id, label }) => ({ id, label })),
    recommended: list[0] ? list[0].id : null,
    live,
    note: rule.notes[tier],
  };
}
