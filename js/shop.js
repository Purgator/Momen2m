// The Rewards tab: a purse of coins earned with points, spent on treats the
// user defines (a coffee, a take-out…). Rendering and the treat sheet only —
// the coin rules live in engine.js, behaviour in app.js via data-action.
// The tab hides behind settings.shop, unlocked by a secret gesture in Setup.
import { t } from './i18n.js';
import { state, save, uid } from './store.js';
import { esc, $, $$, shake } from './dom.js';
import { openSheet, closeSheet } from './sheet.js';
import { tabbar } from './ui.js';
import { suggestEmoji } from './emoji.js';
import { fmtWhenShort } from './time.js';
import { COIN_XP, canBuy, coinsFor } from './engine.js';

export const SHOP_PRICES = [10, 20, 30, 50, 75, 100, 150, 200];
const BOUGHT_SHOWN = 6;

export function shopOn() { return state.settings.shop === true; }
export const treats = () => state.game.treats || [];
export function findTreat(id) { return treats().find((x) => x.id === id); }

// The first opening fills the shop with three presets, in the user's language.
export function seedTreats() {
  if (treats().length) return 0;
  state.game.treats = t('shopPresets').map((p) => ({ id: uid(), ...p }));
  save();
  return state.game.treats.length;
}

// The cheapest treat still out of reach: what the purse is filling up for.
export function nextTreat() {
  const coins = state.game.coins || 0;
  return treats().filter((x) => x.price > coins).sort((a, b) => a.price - b.price)[0] || null;
}

// What a completion is worth in coins, for the "+N 🪙" on the done toast.
export function coinsOf(pts) { return shopOn() ? coinsFor(pts) : 0; }

export function renderShop() {
  const g = state.game;
  const coins = g.coins || 0;
  const list = treats();
  const next = nextTreat();

  const purseSub = next
    ? `<div class="xpbar"><div class="xpfill" style="width:${Math.min(100, Math.round((coins / next.price) * 100))}%"></div></div>
       <div class="s">${t('shopNextTreat', { n: next.price - coins, treat: esc(next.emoji) + ' ' + esc(next.name) })}</div>`
    : `<div class="s">${list.length ? t('shopAllAffordable') : t('shopEarnRule', { n: COIN_XP })}</div>`;

  const rows = list.map((r) => {
    const ok = canBuy(r);
    return `<div class="item treat ${ok ? '' : 'off'}" data-action="treat-edit" data-id="${r.id}">
      <div class="emo">${esc(r.emoji)}</div>
      <div><div class="name">${esc(r.name)}</div><div class="sub">${ok ? t('shopAffordable') : t('shopMissing', { n: r.price - coins })}</div></div>
      <button class="btn small ${ok ? 'primary' : ''}" data-action="treat-buy" data-id="${r.id}" ${ok ? '' : 'disabled'} aria-label="${t('shopBuy')} · ${r.price}">🪙 ${r.price}</button></div>`;
  }).join('');

  const bought = (g.bought || []).slice(-BOUGHT_SHOWN).reverse();
  const boughtHtml = bought.map((b) => `<div class="lrow"><span>${esc(b.emoji)} ${esc(b.name)}</span><span class="muted">🪙 ${b.price} · ${fmtWhenShort(b.at)}</span></div>`).join('');

  return `<div class="screen shop">
    <h1>${t('shopTitle')}</h1>
    <div class="card pad purse" data-action="explain" data-topic="coins" data-tip="${esc(t('tipCoins', { n: coins }))}">
      <div class="v">🪙 ${coins}</div>
      <div class="l">${t('shopPurse')}</div>
      ${purseSub}
    </div>

    <div class="section">
      <h2>${t('shopTreats')} <button class="btn small" data-action="treat-add">➕ ${t('shopAdd')}</button></h2>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><div class="emo">🎁</div><h2>${t('shopEmpty')}</h2><p>${t('shopEmptyHint')}</p></div>`}
      <p class="hint" style="margin-top:10px">${t('shopHint', { n: COIN_XP })}</p>
    </div>

    ${bought.length ? `<div class="section"><h2>${t('shopBought')} <small class="muted">${t('shopBoughtCount', { n: g.treatsBought || bought.length })}</small></h2><div class="card">${boughtHtml}</div></div>` : ''}
  </div>
  ${tabbar('shop')}`;
}

// Add or edit a treat: emoji + name + price. A new one offers ideas to tap.
export function openTreatSheet(treat, onSave, onDelete) {
  const x = treat || { name: '', emoji: '🎁', price: 50 };
  let price = x.price;
  const ideas = treat ? [] : t('shopIdeas');
  const el = openSheet(`
    <h2>🎁 ${treat ? t('shopEditTreat') : t('shopNewTreat')}</h2>
    ${ideas.length ? `<div class="field"><label>${t('shopIdeasLabel')}</label>
      <div class="chips" data-ideas>${ideas.map((i, k) => `<button class="chip" data-idea="${k}">${esc(i.emoji)} ${esc(i.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label>${t('shopTreatName')}</label>
      <div class="row"><input class="input emoji-in" data-f="emoji" value="${esc(x.emoji)}" maxlength="4" aria-label="${t('emoji')}">
      <input class="input" data-f="name" value="${esc(x.name)}" placeholder="${t('shopNamePlaceholder')}" autocomplete="off" enterkeyhint="done"></div></div>
    <div class="field"><label>${t('shopPrice')}</label>
      <div class="chips" data-price>${SHOP_PRICES.map((p) => `<button class="chip ${p === price ? 'on' : ''}" data-p="${p}">🪙 ${p}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><input class="input" type="number" min="1" max="9999" step="1" data-f="price" value="${price}" aria-label="${t('shopPrice')}"><span class="hint" data-worth></span></div></div>
    <div class="btnrow">
      ${treat ? `<button class="btn danger" data-del>🗑️ ${t('delete')}</button>` : `<button class="btn ghost" data-cancel>✖️ ${t('cancel')}</button>`}
      <button class="btn primary" data-save>💾 ${t('save')}</button>
    </div>`);
  const nameIn = $('[data-f="name"]', el), emojiIn = $('[data-f="emoji"]', el), priceIn = $('[data-f="price"]', el), worth = $('[data-worth]', el);
  let autoEmoji = !x.name;
  const showWorth = () => { worth.textContent = price >= 1 ? t('shopWorth', { pts: price * COIN_XP }) : ''; };
  const syncPrice = () => { $$('[data-p]', el).forEach((c) => c.classList.toggle('on', Number(c.dataset.p) === price)); showWorth(); };
  nameIn.addEventListener('input', () => { if (autoEmoji) emojiIn.value = suggestEmoji(nameIn.value); });
  emojiIn.addEventListener('input', () => { autoEmoji = !emojiIn.value.trim(); });
  const ideasBox = $('[data-ideas]', el);
  if (ideasBox) ideasBox.addEventListener('click', (e) => {
    const c = e.target.closest('[data-idea]'); if (!c) return;
    const i = ideas[Number(c.dataset.idea)];
    nameIn.value = i.name; emojiIn.value = i.emoji; autoEmoji = false;
    price = i.price; priceIn.value = price; syncPrice();
    $$('[data-idea]', ideasBox).forEach((y) => y.classList.toggle('on', y === c));
  });
  $('[data-price]', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-p]'); if (!c) return;
    price = Number(c.dataset.p); priceIn.value = price; syncPrice();
  });
  priceIn.addEventListener('input', () => { price = Math.round(Number(priceIn.value)) || 0; syncPrice(); });
  showWorth();
  const cancel = $('[data-cancel]', el); if (cancel) cancel.addEventListener('click', closeSheet);
  $('[data-save]', el).addEventListener('click', () => {
    const name = nameIn.value.trim();
    if (!name) { shake(nameIn); return; }
    if (!(price >= 1)) { shake(priceIn); return; }
    onSave({ name, emoji: emojiIn.value.trim() || suggestEmoji(name), price });
    closeSheet();
  });
  const del = $('[data-del]', el); if (del) del.addEventListener('click', () => { closeSheet(); onDelete(); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-save]', el).click(); });
  if (!treat) setTimeout(() => nameIn.focus(), 300);
}
