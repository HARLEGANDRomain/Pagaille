/* Les genres : 34 genres rangés en 6 familles, pour que la liste reste lisible malgré sa taille.
   Un livre peut avoir jusqu'à 3 genres (« Fantasy » + « Young adult », par exemple). */

export interface GenreFamily { family: string; genres: string[] }

export const GENRE_FAMILIES: GenreFamily[] = [
  { family: 'Fiction', genres: ['Littérature contemporaine', 'Classiques', 'Roman historique', 'Romance', 'New romance', 'Romantasy', 'Feel-good', 'Humour', 'Nouvelles', 'Poésie', 'Théâtre'] },
  { family: 'Imaginaire', genres: ['Fantasy', 'Science-fiction', 'Dystopie', 'Fantastique', 'Horreur'] },
  { family: 'Suspense', genres: ['Polar', 'Thriller', 'Roman noir'] },
  { family: 'Âges', genres: ['Jeunesse', 'Young adult'] },
  { family: 'Images', genres: ['BD', 'Manga', 'Comics', 'Roman graphique'] },
  { family: 'Non-fiction', genres: ['Essai', 'Biographie et mémoires', 'Histoire', 'Philosophie', 'Sciences', 'Psychologie et développement personnel', 'Société et politique', 'Art et design', 'Voyage'] },
]

export const GENRES: string[] = GENRE_FAMILIES.flatMap((f) => f.genres)
export const DEFAULT_GENRE = 'Littérature contemporaine'
export const MAX_GENRES = 3

/** Anciens noms (avant la v2) vers les nouveaux. */
const LEGACY: Record<string, string> = { Roman: 'Littérature contemporaine', SF: 'Science-fiction', Design: 'Art et design' }
export const upgradeGenre = (g: string) => LEGACY[g] ?? g

/** Libellé court pour les puces étroites. */
export const SHORT: Record<string, string> = {
  'Littérature contemporaine': 'Contemporain',
  'Psychologie et développement personnel': 'Psycho & dév. perso',
  'Biographie et mémoires': 'Biographies',
  'Société et politique': 'Société',
}
export const short = (g: string) => SHORT[g] ?? g

/* Deviner les genres à partir des catégories Google Books (souvent en anglais, format « Fiction / Horror »)
   ou des sujets Open Library. L'ordre compte : les plus spécifiques d'abord. */
const HINTS: [RegExp, string][] = [
  [/romantasy|romantic fantasy/i, 'Romantasy'],
  [/new adult|new romance|dark romance/i, 'New romance'],
  [/\bromance\b|love stor|sentiment/i, 'Romance'],
  [/manga/i, 'Manga'],
  [/comic|super ?hero/i, 'Comics'],
  [/graphic novel|roman graphique/i, 'Roman graphique'],
  [/bande dessin|\bbd\b|cartoons/i, 'BD'],
  [/dystop/i, 'Dystopie'],
  [/science[- ]fiction|\bsf\b|space opera|cyberpunk/i, 'Science-fiction'],
  [/fantasy|fantasy fiction|heroic/i, 'Fantasy'],
  [/horror|horreur|épouvante|epouvante|terreur/i, 'Horreur'],
  [/fantastique|supernatural|ghost|paranormal/i, 'Fantastique'],
  [/thriller|suspense/i, 'Thriller'],
  [/noir\b|hard-?boiled/i, 'Roman noir'],
  [/detective|mystery|crime|polar|policier|murder/i, 'Polar'],
  [/historical fiction|roman historique/i, 'Roman historique'],
  [/young adult|\bya\b|adolescen|teen/i, 'Young adult'],
  [/juvenile|children|jeunesse|enfant/i, 'Jeunesse'],
  [/humou?r|comedy|satire/i, 'Humour'],
  [/feel[- ]good|uplifting/i, 'Feel-good'],
  [/short stor|nouvelles/i, 'Nouvelles'],
  [/poetry|poésie|poesie|poems/i, 'Poésie'],
  [/drama|théâtre|theatre|plays/i, 'Théâtre'],
  [/classic|classique/i, 'Classiques'],
  [/biograph|autobiograph|memoir|mémoires/i, 'Biographie et mémoires'],
  [/self-help|psycholog|développement personnel|personal growth/i, 'Psychologie et développement personnel'],
  [/philosoph/i, 'Philosophie'],
  [/\bhistory\b|histoire/i, 'Histoire'],
  [/political|politique|social science|sociolog|société/i, 'Société et politique'],
  [/\bscience\b|physics|biology|mathemat|nature/i, 'Sciences'],
  [/design|typograph|usability|\bart\b|architecture|photograph/i, 'Art et design'],
  [/travel|voyage/i, 'Voyage'],
  [/essay|essai/i, 'Essai'],
]

export function guessGenres(subjects: string[] = [], max = MAX_GENRES): string[] {
  const joined = subjects.slice(0, 20).join(' | ')
  const out: string[] = []
  for (const [re, g] of HINTS) {
    if (out.length >= max) break
    if (re.test(joined) && !out.includes(g)) out.push(g)
  }
  if (!out.length && /fiction|roman|novel/i.test(joined)) out.push(DEFAULT_GENRE)
  return out.length ? out : [DEFAULT_GENRE]
}

/** Genres d'un exemplaire : ceux choisis par la personne, sinon celui de l'œuvre. */
export const genresOf = (b: { genres?: string[] | null; work: { genre: string } }) =>
  b.genres && b.genres.length ? b.genres : [upgradeGenre(b.work.genre)]

/** Pour Découvrir : un mot-clé Google Books (catégories anglaises) par genre. */
export const GOOGLE_SUBJECT: Record<string, string> = {
  'Littérature contemporaine': 'fiction', Classiques: 'classics', 'Roman historique': 'historical fiction', Romance: 'romance',
  'New romance': 'new adult', Romantasy: 'romantasy', 'Feel-good': 'feel good', Humour: 'humor', Nouvelles: 'short stories',
  Poésie: 'poetry', Théâtre: 'drama', Fantasy: 'fantasy', 'Science-fiction': 'science fiction', Dystopie: 'dystopian',
  Fantastique: 'supernatural', Horreur: 'horror', Polar: 'mystery', Thriller: 'thriller', 'Roman noir': 'noir',
  Jeunesse: 'juvenile fiction', 'Young adult': 'young adult fiction', BD: 'bandes dessinées', Manga: 'manga', Comics: 'comics',
  'Roman graphique': 'graphic novels', Essai: 'essays', 'Biographie et mémoires': 'biography', Histoire: 'history',
  Philosophie: 'philosophy', Sciences: 'science', 'Psychologie et développement personnel': 'self-help',
  'Société et politique': 'political science', 'Art et design': 'design', Voyage: 'travel',
}
