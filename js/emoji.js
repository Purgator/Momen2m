// Suggests an emoji from a moment's name (English and French keywords).
// First match wins, so more specific entries come first.
const TABLE = [
  ['💊', ['medic', 'pill', 'médic', 'medoc', 'médoc', 'vitamin', 'traitement', 'treatment', 'cachet']],
  ['🪥', ['teeth', 'tooth', 'dents', 'brush', 'brosse']],
  ['💧', ['water', 'eau', 'hydrat', 'drink', 'boire', 'bois']],
  ['☕', ['coffee', 'café', 'cafe', 'break', 'pause']],
  ['🍵', ['tea', 'tisane', 'infusion']],
  ['🥐', ['breakfast', 'petit dej', 'petit-dej', 'petit déj', 'p’tit', 'ptit']],
  ['🍽️', ['lunch', 'déjeuner', 'dejeuner', 'meal', 'repas', 'eat', 'manger', 'mange', 'dishes', 'vaisselle']],
  ['🍲', ['dinner', 'dîner', 'diner', 'souper', 'supper', 'cook', 'cuisin']],
  ['🍎', ['fruit', 'snack', 'goûter', 'gouter', 'collation']],
  ['🥦', ['vegetable', 'légume', 'legume', 'salad', 'salade']],
  ['😴', ['sleep', 'dormir', 'sommeil', 'coucher', 'bed', 'lit', 'nap', 'sieste', 'dodo']],
  ['⏰', ['wake', 'réveil', 'reveil', 'lever', 'get up', 'debout', 'alarm']],
  ['🚿', ['shower', 'douche', 'bath', 'bain', 'wash', 'laver']],
  ['🏋️', ['gym', 'muscu', 'weights', 'lift', 'fitness']],
  ['🏃', ['run', 'jog', 'courir', 'course', 'footing', 'exercise', 'exercice', 'sport', 'workout', 'training', 'entraînement', 'entrainement']],
  ['🚴', ['bike', 'vélo', 'velo', 'cycl']],
  ['🏊', ['swim', 'nage', 'piscine', 'pool']],
  ['🧘', ['yoga', 'medit', 'médit', 'breath', 'respir', 'calm', 'relax', 'zen']],
  ['🤸', ['stretch', 'étir', 'etir', 'souplesse', 'mobility']],
  ['🚶', ['walk', 'marche', 'promen', 'balade', 'step', 'pas ']],
  ['🌳', ['outside', 'dehors', 'air', 'nature', 'park', 'parc', 'sun', 'soleil']],
  ['🐕', ['dog', 'chien', 'toutou']],
  ['🐈', ['cat', 'chat', 'minou']],
  ['🪴', ['plant', 'plante', 'garden', 'jardin', 'arros', 'water plants']],
  ['🧹', ['clean', 'tidy', 'rang', 'ménage', 'menage', 'nettoy', 'chores', 'aspirat', 'vacuum', 'balai']],
  ['🧺', ['laundry', 'lessive', 'linge', 'washing', 'wash clothes']],
  ['🛒', ['shop', 'courses', 'grocer', 'market', 'marché', 'achat', 'buy']],
  ['🗑️', ['trash', 'garbage', 'poubelle', 'bin', 'recycl']],
  ['📚', ['read', 'lire', 'lecture', 'book', 'livre']],
  ['📖', ['study', 'étud', 'etud', 'révis', 'revis', 'learn', 'appren', 'homework', 'devoirs', 'cours']],
  ['📝', ['plan', 'todo', 'to-do', 'list', 'liste', 'organi', 'review', 'bilan', 'agenda', 'note', 'write', 'écri', 'ecri']],
  ['📓', ['journal', 'diary', 'gratitude']],
  ['💼', ['work', 'travail', 'boulot', 'job', 'office', 'bureau', 'meeting', 'réunion', 'reunion']],
  ['📵', ['screen', 'écran', 'ecran', 'phone off', 'no phone', 'sans téléphone', 'déconnex', 'deconnex', 'digital']],
  ['📞', ['call', 'appel', 'phone', 'téléphon', 'telephon']],
  ['📧', ['mail', 'email', 'e-mail', 'inbox', 'courrier']],
  ['💸', ['bill', 'facture', 'pay', 'payer', 'budget', 'money', 'argent', 'bank', 'banque', 'compte']],
  ['🎵', ['music', 'musique', 'piano', 'guitar', 'guitare', 'chant', 'sing', 'practice', 'pratique']],
  ['🎨', ['draw', 'dessin', 'paint', 'peint', 'art', 'créa', 'crea']],
  ['🧑‍💻', ['code', 'dev', 'program', 'project', 'projet', 'side']],
  ['🧠', ['focus', 'concentr', 'deep', 'brain', 'think', 'réfléch', 'reflech']],
  ['👥', ['friend', 'ami', 'family', 'famille', 'social', 'parents', 'kids', 'enfant']],
  ['❤️', ['love', 'amour', 'date', 'partner', 'couple', 'hug', 'câlin', 'calin']],
  ['🎮', ['game', 'jeu', 'play', 'jouer', 'gaming']],
  ['🎬', ['movie', 'film', 'series', 'série', 'serie', 'tv', 'télé', 'tele']],
  ['🚗', ['drive', 'conduire', 'car', 'voiture', 'commute', 'trajet', 'bus', 'train', 'metro', 'métro']],
  ['🩺', ['doctor', 'docteur', 'médecin', 'medecin', 'rdv', 'appointment', 'dentist', 'dentiste', 'health', 'santé', 'sante']],
  ['🧴', ['skin', 'peau', 'cream', 'crème', 'creme', 'sunscreen', 'soin']],
  ['🎂', ['birthday', 'anniversaire', 'party', 'fête', 'fete']],
  ['🧾', ['admin', 'paper', 'papier', 'form', 'formulaire', 'document', 'impôt', 'impot', 'tax']],
  ['💤', ['rest', 'repos', 'chill', 'détente', 'detente']],
];

export function suggestEmoji(name) {
  const n = ' ' + (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  for (const [emoji, keys] of TABLE) {
    for (const k of keys) {
      const kk = k.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (n.includes(' ' + kk)) return emoji; // keyword must start a word
    }
  }
  return '✅';
}
