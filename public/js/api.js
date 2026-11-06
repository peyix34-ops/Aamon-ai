// Sunucuyla konuşan katman. Arayüz kodu fetch'i doğrudan kullanmaz, buradan geçer.

// Render ücretsiz planda uyuyor. Sayfa açılınca sunucuyu uyandırır,
// kullanıcı yazarken beklemesi azalır.
export function wakeServer() {
  fetch('/health').catch(() => {});
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sunucudan veri alınamadı');
  return res.json();
}

export const getProviders = () => getJSON('/api/providers');
export const getModes = () => getJSON('/api/modes');

// Cevabı parça parça okur. Her metin parçası onText'e gelir.
// İptal için signal (AbortController) verilebilir.
// Başarıyla bittiyse true döner.
export async function streamChat({ provider, apiKey, model, mode, messages, signal, onText }) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, model, mode, messages }),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Sunucuya ulaşılamadı. Sunucu uyanıyor olabilir, 30-60 saniye sonra tekrar dene.');
  }

  if (!res.ok) {
    let msg = `Sunucu hatası (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      /* gövde JSON değil */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new Error('Bağlantı koptu. Cevap yarım kalmış olabilir, tekrar dene.');
      }
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // ": ping" gibi yorum satırlarında data: yoktur, atlanır
        const line = block.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let obj;
        try {
          obj = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (obj.error) throw new Error(obj.error);
        if (obj.t) onText(obj.t);
        if (obj.done) finished = true;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return finished;
}
