// Sohbet geçmişini token tahminine göre kırpar.
// En yeni mesajlar korunur, en eskiler atılır. Son mesaj her zaman gider.

// Türkçe + kod karışık metinde kabaca 3 karakter = 1 token
export function estimateTokens(text) {
  return Math.ceil(text.length / 3);
}

export function trimMessages(messages, budget) {
  const kept = [];
  let total = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(messages[i].content);
    if (kept.length > 0 && total + t > budget) break;
    kept.unshift(messages[i]);
    total += t;
  }

  // Konuşma her zaman kullanıcı mesajıyla başlamalı
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  return kept;
}
