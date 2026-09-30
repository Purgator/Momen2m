// What the in-app "what changed" note shows after an update. Per release, a
// few lines, one emoji + one short sentence per feature — glanceable, not
// exhaustive (the detailed notes live on the GitHub release). Both languages.
export const CHANGELOG = {
  en: {
    '1.26.0': [
      '🗺️ Four example quests (moving flat, exam week, race prep, spring-clean weekend) appear in "Ready to start" the first time you open Quests.',
      '🌅 Your wake and bed times from the setup are kept and shown in Setup ("Your day"); the quest reminder follows your real morning.',
      '🐛 Edit and Share from a running quest\'s sheet open again instead of closing everything.',
    ],
    '1.25.0': [
      '🔔 A daily quest reminder, an hour after your day starts (or the hour you pick in Setup), on days when tasks or a question wait — through the relay too.',
      '🔴 A dot on the Quests tab when something waits today; the active tab is highlighted.',
      '◀️ The phone\'s back button closes a sheet or returns to the previous tab instead of leaving the app.',
      '📌 The app reopens on the tab you left.',
    ],
    '1.24.0': [
      '💎 The quest sheet shows a progress bar with what the quest is worth right now and at most.',
      '🗺️ Lifetime quest points on the Progress tab.',
      '🔒 Once a step has started, its task list is set (names can still be fixed).',
      '📱 Share a quest as a QR code for the phone next to you; import pastes from the clipboard in one tap.',
    ],
    '1.23.0': [
      '🔁 A quest step walked twice (a question answering "again") is fresh each time and pays in full.',
      '🛌 Rest steps (no task) no longer count in a quest\'s completion; a quest must have a way to its end to be saved.',
      '↩️ Undoing a moment gives back exactly what it earned — pause progress included; a late completion can no longer be undone.',
      '🐛 Fixes: premade delete button, quest start toast for a later day, Escape in the step editor, paused days in the history chart, light-theme colours.',
    ],
    '1.22.0': [
      '🗺️ The Agenda is now called Quests.',
      '📤 Share a quest as a link — no file: whoever opens it gets a preview and adds it in one tap. Import also takes a pasted link or code.',
      '▶️ Starting a quest runs a copy: the saved one stays in "Ready to start". A running quest can be edited without touching it.',
      '🏳️ A running quest can be given up (no points) but not finished early; it pays when it ends.',
      '🔭 The quest sheet shows everything: steps done, the one running, the ones ahead with dates, and the next question. A "Coming up" list covers the week.',
      '↩️ A quest task just ticked can be taken back for 5 minutes.',
      '✨ Task emojis fill in as you type; the question editor is clearer.',
    ],
    '1.21.0': [
      '🗓️ New Agenda tab: plan a goal in steps of one or more days, each with its tasks, then start it on the day you choose.',
      '🧭 A step can end with a question whose answer decides the next step — your goal can branch.',
      '🏁 Points only there: +5 a task (+1 late), +10 a flawless step, and a big payoff when the goal ends. No boost, no pause, no penalty.',
      '🏅 Six new badges. The tab can be hidden from Setup.',
    ],
    '1.20.0': [
      '⏸️ Pauses: stop your moments for a few hours when the routine shifts — the ones inside are left out, at no cost.',
      '🎁 Earn one pause every 150 points, keep up to three, spend one to three at once (3 h each). Count and details in the top bar.',
    ],
    '1.19.0': [
      '💙 After three misses in a row, a warm little card greets you in the timeline — no advice, just kindness.',
      '⚡ A new boost now announces itself in a popup that explains it; tap OK or anywhere outside to close.',
    ],
    '1.18.0': [
      '📌 A one-time moment can be added as many times as you like, even while another copy is pending.',
      '💾 Saving a premade over one with the same emoji and name now asks before replacing it.',
    ],
    '1.17.2': ['🐛 A completed one-time moment no longer blocks re-adding it later; only a still-pending one does.'],
    '1.17.1': ['🐛 The rough-patch boost now triggers even if the app was closed when the misses happened.'],
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
    '1.26.0': [
      '🗺️ Quatre quêtes d’exemple (déménager, semaine d’examen, préparer une course, week-end grand ménage) apparaissent dans « Prêtes à démarrer » à la première ouverture des Quêtes.',
      '🌅 Tes heures de lever et de coucher de la configuration sont gardées et visibles dans les Réglages (« Ta journée ») ; le rappel des quêtes suit ton vrai matin.',
      '🐛 Modifier et Partager depuis la fiche d’une quête en cours s’ouvrent de nouveau au lieu de tout fermer.',
    ],
    '1.25.0': [
      '🔔 Un rappel de quêtes par jour, une heure après le début de ta journée (ou à l’heure choisie dans les Réglages), les jours où des tâches ou une question attendent — via le relais aussi.',
      '🔴 Un point sur l’onglet Quêtes quand quelque chose attend aujourd’hui ; l’onglet actif est mis en évidence.',
      '◀️ Le bouton retour du téléphone ferme une fenêtre ou revient à l’onglet précédent au lieu de quitter l’appli.',
      '📌 L’appli se rouvre sur l’onglet que tu as quitté.',
    ],
    '1.24.0': [
      '💎 La fiche d’une quête montre une barre d’avancement avec ce qu’elle vaut maintenant et au mieux.',
      '🗺️ Les points de quêtes cumulés dans l’onglet Progrès.',
      '🔒 Une fois une étape commencée, sa liste de tâches est figée (les noms se corrigent encore).',
      '📱 Partage une quête en QR code pour le téléphone d’à côté ; l’import colle le presse-papiers d’un geste.',
    ],
    '1.23.0': [
      '🔁 Une étape de quête parcourue deux fois (une question qui répond « encore ») repart de zéro et paie en entier.',
      '🛌 Les étapes de repos (sans tâche) ne comptent plus dans l’avancement ; une quête doit avoir une issue pour être enregistrée.',
      '↩️ Annuler un moment rend exactement ce qu’il avait rapporté — progression des pauses comprise ; un moment fait en retard ne s’annule plus.',
      '🐛 Corrections : bouton de suppression des prédéfinis, message de départ d’une quête pour un autre jour, Échap dans l’éditeur d’étape, jours en pause dans l’historique, couleurs du thème clair.',
    ],
    '1.22.0': [
      '🗺️ L’Agenda s’appelle maintenant Quêtes.',
      '📤 Partage une quête par un lien — sans fichier : qui l’ouvre en voit l’aperçu et l’ajoute d’un geste. L’import accepte aussi un lien ou un code collé.',
      '▶️ Démarrer une quête en lance une copie : celle enregistrée reste dans « Prêtes à démarrer ». Une quête en cours se modifie sans y toucher.',
      '🏳️ Une quête en cours peut être abandonnée (aucun point) mais pas terminée en avance ; elle paie à sa fin.',
      '🔭 La fiche d’une quête montre tout : étapes faites, celle en cours, celles à venir avec leurs dates, et la prochaine question. Une liste « À venir » couvre la semaine.',
      '↩️ Une tâche de quête tout juste cochée peut être annulée pendant 5 minutes.',
      '✨ L’emoji des tâches se remplit pendant la saisie ; l’éditeur de question est plus clair.',
    ],
    '1.21.0': [
      '🗓️ Nouvel onglet Agenda : planifie un objectif par étapes d’un ou plusieurs jours, chacune avec ses tâches, puis lance-le le jour de ton choix.',
      '🧭 Une étape peut se terminer par une question dont la réponse décide de la suite — ton objectif peut se ramifier.',
      '🏁 Des points seulement : +5 la tâche (+1 en retard), +10 l’étape sans faute, et une grosse récompense à la fin de l’objectif. Ni boost, ni pause, ni pénalité.',
      '🏅 Six nouveaux badges. L’onglet se masque depuis les Réglages.',
    ],
    '1.20.0': [
      '⏸️ Pauses : arrête tes moments quelques heures quand la routine change — ceux qui tombent dedans sont laissés de côté, sans rien coûter.',
      '🎁 Gagne une pause tous les 150 points, garde-en trois au plus, utilise une à trois d’un coup (3 h chacune). Le compte et les détails sont dans la barre du haut.',
    ],
    '1.19.0': [
      '💙 Après trois ratés d’affilée, une petite carte chaleureuse t’accueille dans la journée — pas de conseil, juste de la douceur.',
      '⚡ Un nouveau boost s’annonce dans une fenêtre qui l’explique ; touche OK ou n’importe où à côté pour fermer.',
    ],
    '1.18.0': [
      '📌 Un moment ponctuel peut être ajouté autant de fois que tu veux, même si une autre copie est en attente.',
      '💾 Enregistrer un prédéfini par-dessus un autre de même emoji et nom demande confirmation avant de le remplacer.',
    ],
    '1.17.2': ['🐛 Un moment ponctuel déjà fait ne bloque plus son ajout plus tard ; seul un moment encore en attente le fait.'],
    '1.17.1': ['🐛 Le boost « passage difficile » se déclenche maintenant même si l’appli était fermée au moment des ratés.'],
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
