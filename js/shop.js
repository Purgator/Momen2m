// The Rewards tab: spend coins on treats you define. Rendering and sheets only.
import { t } from './i18n.js';
import { state } from './store.js';
import { esc } from './dom.js';
import { openSheet, closeSheet } from './sheet.js';
import { toast } from './toast.js';
import { tabbar } from './ui.js';
import { suggestEmoji } from './emoji.js';
import * as E from './engine.js';
import { uid } from './store.js';

// Default treats seeded on first unlock
const DEFAULT_TREATS = [
  { id: 'default-video', emoji: '🎬', name: { en: 'Watch 15 min of videos', fr: 'Regarder 15 min de vidéos' }, price: 20 },
  { id: 'default-coffee', emoji: '☕', name: { en: 'Buy a coffee', fr: 'Acheter un café' }, price: 50 },
  { id: 'default-takeout', emoji: '🍕', name: { en: 'Grab some takeout', fr: 'Commander à emporter' }, price: 100 },
];

function seedTreats() {
  const g = state.game;
  if (!g.treats || !g.treats.length) {
    g.treats = DEFAULT_TREATS.map((t) => ({ ...t, id: uid() }));
    E.save();
  }
}

function treatName(treat) {
  const lang = state.lang;
  if (typeof treat.name === 'object' && treat.name !== null) {
    return treat.name[lang] || treat.name.en || treat.name.fr || '';
  }
  return treat.name || '';
}

export function renderShop(now) {
  seedTreats();
  const g = state.game;
  const coins = g.coins || 0;
  const treats = g.treats || [];

  const treatHtml = treats.map((treat) => {
    const canAfford = coins >= treat.price;
    return `<div class="treat ${canAfford ? '' : 'poor'}">
      <div class="treat-head">
        <span class="emo">${esc(treat.emoji || '🎁')}</span>
        <div class="name">${esc(treatName(treat))}</div>
        <div class="price">🪙 ${treat.price}</div>
      </div>
      <div class="btnrow">
        <button class="btn small primary" data-action="treat-buy" data-id="${treat.id}" ${canAfford ? '' : 'disabled'}>
          ${t('treatBuy')}
        </button>
        <button class="btn small" data-action="treat-edit" data-id="${treat.id}">✏️ ${t('edit')}</button>
        <button class="btn small ghost" data-action="treat-del" data-id="${treat.id}">${t('delete')}</button>
      </div>
    </div>`;
  }).join('');

  return `<div class="screen shop">
    <h1>🏪 ${t('tabShop')}</h1>
    <p class="hint">${t('shopIntro')}</p>
    <div class="coin-balance">🪙 ${coins} ${t('shopCoins')}</div>
    <div class="section">
      ${treatHtml || `<p class="hint">${t('shopEmpty')}</p>`}
    </div>
    <div class="btnrow" style="margin-top:16px">
      <button class="btn primary" data-action="treat-new">➕ ${t('treatNew')}</button>
    </div>
  </div>${tabbar('shop')}`;
}

// ---- treat editor sheet -------------------------------------------------------

function treatSheetContent(draft) {
  const lang = state.lang;
  const nameKey = lang === 'fr' ? 'nameFr' : 'nameEn';
  const nameVal = typeof draft.name === 'object' && draft.name !== null
    ? (draft.name[lang] || '')
    : (draft.name || '');
  return `<div class="sheet-fields">
    <label class="field">
      <span>${t('treatEmoji')}</span>
      <div class="input-row"><input class="text short" id="treat-emoji" value="${esc(draft.emoji || '')}" maxlength="4" inputmode="text" autocomplete="off" />
        <button class="btn small ghost" data-action="treat-emoji-picker">${t('emojiPicker')}</button></div>
    </label>
    <label class="field">
      <span>${t('treatName')}</span>
      <input class="text" id="treat-name" value="${esc(nameVal)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>${t('treatPrice')}</span>
      <input class="text short" id="treat-price" type="number" min="1" max="9999" value="${esc(String(draft.price || 10))}" inputmode="numeric" autocomplete="off" />
    </label>
  </div>`;
}

export function openTreatSheet(draft, { onSave }) {
  const isNew = !draft || !draft.id;
  const title = isNew ? t('treatNew') : t('treatEdit');
  openSheet({
    title,
    body: treatSheetContent(draft || { emoji: '🎁', name: '', price: 10 }),
    actions: [
      { label: t('cancel'), cls: 'ghost', action: 'sheet-close' },
      { label: isNew ? t('save') : t('update'), cls: 'primary', action: 'treat-save', dataset: { onSave } },
    ],
  });
  // Focus after sheet opens
  setTimeout(() => {
    const nameInput = document.getElementById('treat-name');
    if (nameInput) nameInput.focus();
  }, 100);
}

export function handleTreatSave(btn, draft, onSave) {
  const emoji = (document.getElementById('treat-emoji')?.value || '🎁').slice(0, 4);
  const name = (document.getElementById('treat-name')?.value || '').trim();
  const price = parseInt(document.getElementById('treat-price')?.value || '10', 10);

  if (!name) {
    shake(document.getElementById('treat-name'));
    return;
  }
  if (isNaN(price) || price < 1) {
    shake(document.getElementById('treat-price'));
    return;
  }

  const lang = state.lang;
  const treat = {
    id: draft.id || uid(),
    emoji,
    name: { en: lang === 'en' ? name : (typeof draft.name === 'object' ? draft.name.en || '' : draft.name || ''), fr: lang === 'fr' ? name : (typeof draft.name === 'object' ? draft.name.fr || '' : draft.name || '') },
    price,
  };

  onSave(treat);
  closeSheet();
  toast(`${emoji} ${t('treatSaved')}`, 'good');
}

export { suggestEmoji };

