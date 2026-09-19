// What the in-app "what changed" note shows after an update. Per release, a
// few lines, one emoji + one short sentence per feature — glanceable, not
// exhaustive (the detailed notes live on the GitHub release). Both languages.
export const CHANGELOG = {
  en: {
    '1.17.0': [
      '⚡ The boost announcement is now hard to miss: a colored, sound-and-vibration toast with a "See" shortcut to the rules.',
      '👉 The "boost on" banner is now tappable and shows the rules.',
    ],
    '1.16.2': ['👉 Swipe left or right on the badges to change page.'],
    '1.16.1': ['💨 The "Quick hands" badge is now called "Flash" in French.'],
    '1.16.0': [
      '⚡ After three misses in a row, a 12-hour boost: every point earned is worth +50%.',
      '🩹 "Done late" now only gives back a quarter of the points; the miss still counts.',
      '💨 The "early" badges are about finishing quickly, and are named so.',
    ],
    '1.15.0': [
      '📋 New Moments tab: your moments, suggestions and premades live there; Setup keeps the settings.',
      '📅 One-time moments set for tomorrow now show under "Coming up".',
      '🩹 Missed a moment? "Done late" within a day lifts the penalty for a quarter of the points.',
      '🏅 Ten new badges, on pages.',
      '🕰️ Tips can now suggest moving a moment to the time you actually do it — only once the pattern is clear.',
      '💙 A word of encouragement after three misses in a row.',
    ],
    '1.14.0': [
      '✏️ Premade moments can now be edited or created straight from Setup, not only saved from quick-add.',
      '➕💾 The Add button shows a save icon too when "Save as premade" is ticked, making clear it does both.',
    ],
    '1.13.0': [
      '⭐ Save a one-time moment as premade and add it again in one tap; manage them in Setup.',
      '🔒 Two moments can no longer share the same emoji and name — except a repeating one and a one-time one, which now count as one in Progress.',
    ],
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
    '1.17.0': [
      '⚡ L’annonce du boost est plus visible : notification colorée avec son et vibration, et un raccourci « Voir » vers les règles.',
      '👉 Le bandeau « boost actif » est maintenant cliquable et montre les règles.',
    ],
    '1.16.2': ['👉 Glisse à gauche ou à droite sur les badges pour changer de page.'],
    '1.16.1': ['💨 Le badge « Mains rapides » devient « Flash ».'],
    '1.16.0': [
      '⚡ Après trois ratés d’affilée, un boost de 12 h : chaque point gagné vaut +50 %.',
      '🩹 « Fait en retard » ne rend plus qu’un quart des points ; le raté compte toujours.',
      '💨 Les badges « en avance » parlent de rapidité, et sont renommés en ce sens.',
    ],
    '1.15.0': [
      '📋 Nouvel onglet Moments : tes moments, suggestions et prédéfinis y vivent ; Réglages garde les réglages.',
      '📅 Les moments ponctuels prévus demain apparaissent sous « À venir ».',
      '🩹 Moment raté ? « Fait en retard » dans la journée lève la pénalité pour un quart des points.',
      '🏅 Dix nouveaux badges, par pages.',
      '🕰️ Les conseils peuvent proposer de déplacer un moment à l’heure où tu le fais vraiment — seulement quand le schéma est net.',
      '💙 Un mot d’encouragement après trois ratés d’affilée.',
    ],
    '1.14.0': [
      '✏️ Les moments prédéfinis peuvent maintenant être modifiés ou créés depuis Réglages, pas seulement enregistrés depuis l’ajout rapide.',
      '➕💾 Le bouton Ajouter montre aussi une icône d’enregistrement quand « Enregistrer comme prédéfini » est cochée.',
    ],
    '1.13.0': [
      '⭐ Enregistre un moment ponctuel comme prédéfini et rajoute-le en un geste ; gère-les dans Réglages.',
      '🔒 Deux moments ne peuvent plus partager le même emoji et nom — sauf un récurrent et un ponctuel, désormais comptés ensemble dans Progrès.',
    ],
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
