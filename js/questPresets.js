// Example quests, added to "Ready to start" the first time the Quests tab is
// opened — something to try, edit or delete rather than a blank page.
import { state, save } from './store.js';
import { pick } from './i18n.js';
import * as P from './plans.js';

// Steps refer to each other by index; `next` -1 ends the quest.
export const QUEST_PRESETS = [
  {
    id: 'move', emoji: '🏠', name: { en: 'Moving flat', fr: 'Déménager' },
    steps: [
      { title: { en: 'Sort and pack', fr: 'Trier et emballer' }, days: 3, tasks: [['📦', { en: 'Order boxes', fr: 'Commander des cartons' }], ['🧹', { en: 'Sort one room', fr: 'Trier une pièce' }], ['📚', { en: 'Pack the books', fr: 'Emballer les livres' }]], next: 1 },
      { title: { en: 'Paperwork', fr: 'Démarches' }, days: 2, tasks: [['📮', { en: 'Change of address', fr: 'Changement d’adresse' }], ['🌐', { en: 'Move the internet', fr: 'Transférer internet' }], ['🏦', { en: 'Tell the bank', fr: 'Prévenir la banque' }]], next: 2 },
      { title: { en: 'Moving day', fr: 'Jour J' }, days: 1, tasks: [['🚚', { en: 'Load the van', fr: 'Charger le camion' }], ['🔑', { en: 'Hand over the keys', fr: 'Rendre les clés' }]],
        ask: { q: { en: 'Everything in?', fr: 'Tout est passé ?' }, options: [[{ en: 'Yes', fr: 'Oui' }, 3], [{ en: 'One more trip', fr: 'Encore un voyage' }, 2]] } },
      { title: { en: 'Settle in', fr: 'S’installer' }, days: 1, tasks: [['🛏️', { en: 'Set up the bed', fr: 'Monter le lit' }], ['☕', { en: 'Unpack the essentials', fr: 'Déballer l’essentiel' }]], next: -1 },
    ],
  },
  {
    id: 'exam', emoji: '📚', name: { en: 'Exam week', fr: 'Semaine d’examen' },
    steps: [
      { title: { en: 'Review', fr: 'Réviser' }, days: 3, tasks: [['📖', { en: 'Review one chapter', fr: 'Revoir un chapitre' }], ['🗂️', { en: 'Make flash cards', fr: 'Faire des fiches' }], ['📝', { en: 'One past paper', fr: 'Un sujet d’annales' }]], next: 1 },
      { title: { en: 'Practice', fr: 'S’entraîner' }, days: 2, tasks: [['⏱️', { en: 'Timed mock exam', fr: 'Examen blanc chronométré' }], ['🔧', { en: 'Fix the weak spots', fr: 'Reprendre les points faibles' }]],
        ask: { q: { en: 'Feeling ready?', fr: 'Tu te sens prêt ?' }, options: [[{ en: 'Yes', fr: 'Oui' }, 2], [{ en: 'Not yet', fr: 'Pas encore' }, 1]] } },
      { title: { en: 'Rest and go', fr: 'Repos et c’est parti' }, days: 1, tasks: [['🎒', { en: 'Pack the bag', fr: 'Préparer le sac' }], ['😴', { en: 'Early night', fr: 'Coucher tôt' }]], next: -1 },
    ],
  },
  {
    id: 'race', emoji: '🏃', name: { en: 'Race prep', fr: 'Préparer une course' },
    steps: [
      { title: { en: 'Build', fr: 'Construire' }, days: 3, tasks: [['👟', { en: 'Easy run, 30 min', fr: 'Course tranquille, 30 min' }], ['🧘', { en: 'Stretch', fr: 'Étirements' }]], next: 1 },
      { title: { en: 'Sharpen', fr: 'Affûter' }, days: 2, tasks: [['⚡', { en: 'Intervals', fr: 'Fractionné' }], ['🏞️', { en: 'Long run', fr: 'Sortie longue' }]],
        ask: { q: { en: 'Legs fresh?', fr: 'Les jambes sont fraîches ?' }, options: [[{ en: 'Yes', fr: 'Oui' }, 3], [{ en: 'Tired', fr: 'Fatiguées' }, 2]] } },
      { title: { en: 'Rest day', fr: 'Jour de repos' }, days: 1, tasks: [], next: 3 },
      { title: { en: 'Taper', fr: 'Relâcher' }, days: 1, tasks: [['🚶', { en: 'Short jog', fr: 'Petit footing' }], ['🎽', { en: 'Lay out the gear', fr: 'Préparer la tenue' }]], next: 4 },
      { title: { en: 'Race day', fr: 'Jour de course' }, days: 1, tasks: [['🔥', { en: 'Warm up', fr: 'Échauffement' }], ['🏁', { en: 'Run the race', fr: 'Courir la course' }]], next: -1 },
    ],
  },
  {
    id: 'clean', emoji: '🧽', name: { en: 'Spring-clean weekend', fr: 'Week-end grand ménage' },
    steps: [
      { title: { en: 'Saturday', fr: 'Samedi' }, days: 1, tasks: [['👕', { en: 'Declutter the wardrobe', fr: 'Trier la garde-robe' }], ['🪟', { en: 'Windows', fr: 'Les vitres' }]], next: 1 },
      { title: { en: 'Sunday', fr: 'Dimanche' }, days: 1, tasks: [['🍳', { en: 'Kitchen deep clean', fr: 'Cuisine à fond' }], ['🎁', { en: 'Donate a bag', fr: 'Donner un sac' }]], next: -1 },
    ],
  },
];

export function buildPreset(def) {
  const p = P.newPlan();
  p.name = pick(def.name); p.emoji = def.emoji; p.preset = def.id;
  p.blocks = def.steps.map(() => P.newBlock());
  const ref = (i) => (i >= 0 && p.blocks[i] ? p.blocks[i].id : null);
  def.steps.forEach((s, i) => {
    const b = p.blocks[i];
    b.title = pick(s.title); b.days = s.days;
    b.tasks = s.tasks.map(([emoji, name]) => ({ ...P.newTask(), emoji, name: pick(name) }));
    if (s.ask) b.decision = { question: pick(s.ask.q), options: s.ask.options.map(([label, next]) => ({ label: pick(label), next: ref(next) })) };
    else b.next = ref(s.next);
  });
  p.root = p.blocks[0].id;
  return p;
}

// Once, on the first visit. Returns how many were added.
export function seedOnce() {
  if (state.game.questsSeeded) return 0;
  state.game.questsSeeded = true;
  const fresh = QUEST_PRESETS.map(buildPreset);
  state.plans = (state.plans || []).concat(fresh);
  save();
  return fresh.length;
}
