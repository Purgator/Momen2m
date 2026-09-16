// What the in-app "what changed" note shows after an update. Per release, a
// few lines, one emoji + one short sentence per feature — glanceable, not
// exhaustive (the detailed notes live on the GitHub release). Both languages.
export const CHANGELOG = {
  en: {
    '1.12.0': [
      '💾 Backups overwrite one file by default; dated files are a tick away next to the button.',
      '↩️ A just-added one-off moment can be undone for 10 seconds, at no cost.',
    ],
    '1.11.0': [
      '📋 Update notes now list every version you skipped, and can be hidden from the note itself.',
      '🎨 Re-running the setup shows what changes: green new, orange moved, red removed.',
      '✅ The setup only takes effect when you tap "Start my day".',
    ],
    '1.10.1': ['🎯 The guided setup only suggests moments that match your answers.'],
    '1.10.0': ['🧭 New guided setup: a few questions, and your first moments are placed around your day.'],
    '1.9.0': ['🔄 Smoother update check.', '📝 This "what changed" note after each update.'],
    '1.8.4': ['🔔 Background reminders can hold a full week again.'],
    '1.8.3': ['🐛 Fixed the time-slot mode switch not saving.'],
    '1.8.2': ['📌 One-off moments for later today or tomorrow.', '⏱️ Time slots as start + duration.'],
    '1.8.1': ['🔔 More reliable background reminders.'],
  },
  fr: {
    '1.12.0': [
      '💾 Les sauvegardes écrasent un seul fichier par défaut ; les fichiers datés sont à une case du bouton.',
      '↩️ Un moment ponctuel tout juste ajouté peut être annulé pendant 10 secondes, sans coût.',
    ],
    '1.11.0': [
      '📋 La note de mise à jour liste toutes les versions passées, et peut être masquée depuis la note.',
      '🎨 Relancer la configuration montre ce qui change : vert nouveau, orange déplacé, rouge retiré.',
      '✅ La configuration ne s’applique qu’en touchant « Commencer ma journée ».',
    ],
    '1.10.1': ['🎯 La configuration guidée ne suggère que les moments qui correspondent à tes réponses.'],
    '1.10.0': ['🧭 Nouvelle configuration guidée : quelques questions, et tes premiers moments sont placés dans ta journée.'],
    '1.9.0': ['🔄 Vérification des mises à jour plus fluide.', '📝 Cette note « nouveautés » après chaque mise à jour.'],
    '1.8.4': ['🔔 Les rappels en arrière-plan tiennent de nouveau une semaine entière.'],
    '1.8.3': ['🐛 Correction du mode des créneaux horaires qui ne s’enregistrait pas.'],
    '1.8.2': ['📌 Moments ponctuels pour plus tard aujourd’hui ou demain.', '⏱️ Créneaux en début + durée.'],
    '1.8.1': ['🔔 Rappels en arrière-plan plus fiables.'],
  },
};

export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Notes for every release after `from` up to and including `to`, newest
// first, so a user who skipped versions sees them all. `to` is always
// listed, with an empty line list if it has no entry.
export function versionsSince(from, to, lang) {
  const notes = CHANGELOG[lang] || CHANGELOG.en;
  const known = Object.keys(CHANGELOG.en)
    .filter((v) => compareVersions(v, to) <= 0 && (!from || compareVersions(v, from) > 0))
    .sort(compareVersions).reverse();
  if (!known.includes(to)) known.unshift(to);
  return known.map((v) => ({ v, lines: notes[v] || CHANGELOG.en[v] || [] }));
}
