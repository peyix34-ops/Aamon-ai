// Mesajları ekrana basar. Yapay zekanın cevabı önce temizlenir (HTML kaçışı),
// sonra küçük bir Markdown dönüştürücüden geçer: kod bloğu, başlık, liste, kalın yazı.

const $ = (id) => document.getElementById(id);
let stick = true; // kullanıcı en altta mı? Altındaysa akış sırasında otomatik kaydır.

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Satır içi biçim: `kod` ve **kalın**. Kod parçalarının içine dokunulmaz.
function inline(raw) {
  return esc(raw)
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${part.slice(1, -1)}</code>`;
      }
      return part.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    })
    .join('');
}

function codeBlock(lang, lines) {
  const label = esc(lang || 'kod');
  return (
    '<div class="code-block">' +
    `<div class="code-head"><span>${label}</span>` +
    '<button class="copy-btn" type="button">Kopyala</button></div>' +
    `<pre><code>${esc(lines.join('\n'))}</code></pre></div>`
  );
}

export function renderMarkdown(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let para = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }

  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    }
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Kod bloğu: kapanmamışsa (akış sürerken) sona kadar kod sayılır
    if (trimmed.startsWith('```')) {
      flushPara();
      flushList();
      const lang = trimmed.slice(3).trim().split(/\s+/)[0];
      const code = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        code.push(lines[i]);
        i++;
      }
      html.push(codeBlock(lang, code));
      continue;
    }

    if (trimmed === '') {
      flushPara();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushList();
      const tag = heading[1].length <= 2 ? 'h2' : 'h3';
      html.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((bullet || numbered)[1]);
      continue;
    }

    flushList();
    para.push(trimmed);
  }

  flushPara();
  flushList();
  return html.join('');
}

// --- Ekrana mesaj ekleme ---

export function addMessage(role, text = '') {
  $('welcome')?.classList.add('hidden');

  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const body = document.createElement('div');
  body.className = 'msg-body';
  if (text) body.textContent = text;
  el.appendChild(body);

  $('messages').appendChild(el);
  scrollToBottom(true);
  return { el, body };
}

export function renderInto(body, text) {
  body.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

export function showTyping(body) {
  body.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
}

// Mesajın altına buton satırı ekler, satırı geri verir
export function addActions(msgEl) {
  const row = document.createElement('div');
  row.className = 'msg-actions';
  msgEl.appendChild(row);
  scrollToBottom();
  return row;
}

export function clearMessages() {
  document.querySelectorAll('#messages .msg').forEach((n) => n.remove());
  $('welcome')?.classList.remove('hidden');
}

export function scrollToBottom(force = false) {
  const box = $('messages');
  if (force || stick) {
    box.scrollTop = box.scrollHeight;
    stick = true;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Eski tarayıcılar için yedek yöntem
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* kopyalanamadı */
    }
    ta.remove();
    return ok;
  }
}

// Sayfa açılışında bir kez çağrılır: kaydırma takibi + kopyala butonları
export function initRender() {
  const box = $('messages');

  box.addEventListener('scroll', () => {
    stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  });

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (!code) return;
    const ok = await copyText(code.textContent);
    btn.textContent = ok ? 'Kopyalandı' : 'Kopyalanamadı';
    setTimeout(() => (btn.textContent = 'Kopyala'), 1500);
  });
}
