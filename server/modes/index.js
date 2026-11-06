// Mod yükleyici: server/modes/<klasör>/instructions.js dosyalarını otomatik bulur.
// Her instructions.js şunları export etmeli:
//   label          -> buton yazısı
//   defaultPrompt  -> kutuya dolan, kullanıcının değiştirebileceği hazır prompt
//   instructions   -> gizli, kapsamlı sistem talimatı (sohbete girmez)
//   order          -> (opsiyonel) buton sırası

import { readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { CORE_PROMPT } from './core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const modes = {};

for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const file = path.join(dir, entry.name, 'instructions.js');
  if (!existsSync(file)) continue;

  const m = await import(pathToFileURL(file).href);
  if (!m.label || !m.instructions) {
    console.warn(`[modes] ${entry.name}: label veya instructions eksik, atlandı`);
    continue;
  }

  modes[entry.name] = {
    id: entry.name,
    label: m.label,
    order: m.order ?? 99,
    defaultPrompt: m.defaultPrompt || '',
    instructions: m.instructions,
  };
}

// Arayüze sadece buton bilgisi gider, gizli talimat gitmez.
export function listModes() {
  return Object.values(modes)
    .sort((a, b) => a.order - b.order)
    .map(({ id, label, defaultPrompt }) => ({ id, label, defaultPrompt }));
}

export function buildSystemPrompt(modeId) {
  const mode = modes[modeId];
  if (!mode) return CORE_PROMPT;
  return `${CORE_PROMPT}\n\n---\n# AKTİF MOD: ${mode.label}\n${mode.instructions}`;
}
