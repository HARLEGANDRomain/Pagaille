export type Status = 'lire' | 'cours' | 'fini' | 'pause' | 'abandon'

export interface Work {
  id: string
  title: string
  author: string
  genre: string
  ol_work_id: string | null
  /** Résumé (quatrième de couverture), rempli à la première lecture d'un livre. */
  synopsis?: string | null
}

export interface Edition {
  id: string
  work_id: string
  title: string | null
  language: string | null
  publisher: string | null
  format: 'poche' | 'broche' | 'relie' | 'ebook' | 'audio' | 'autre'
  pages: number | null
  isbn13: string | null
  cover_url: string | null
  published_year: number | null
}

export interface UserBook {
  id: string
  user_id: string
  work_id: string
  edition_id: string | null
  status: Status
  total_pages: number | null
  page: number
  progress: number | null
  rating: number | null
  added_at: string
  started_at: string | null
  closed_at: string | null
  /** Couverture choisie ou importée pour CET exemplaire (prioritaire sur celle de l'édition). */
  custom_cover_url?: string | null
  /** Genres choisis par la personne (3 au plus) ; vide = genre de l'œuvre. */
  genres?: string[]
  work: Work
  edition: Edition | null
}

export interface Profile {
  id: string
  display_name: string
  avatar_color: string
  tastes: string[]
  daily_minutes: number
  days_goal: number
  share_library: boolean
  avatar_url?: string | null
  equipped?: Equipped
}

export interface Equipped { shelf?: string; obj?: string; scene?: string; acc?: string }

export interface SessionRow {
  id: string
  user_book_id: string | null
  day: string
  minutes: number
  pages_read: number
  circle_id: string | null
  created_at: string
}

export interface Circle {
  id: string
  name: string
  invite_code: string
  weekly_goal_pages: number
  created_by: string
}

export interface Member {
  user_id: string
  role: 'owner' | 'member'
  display_name: string
  avatar_color: string
  avatar_url?: string | null
  /** Siège dans la pièce du cercle (0 à 11), null si pas encore assis. */
  seat?: number | null
}

export interface Message {
  id: number
  circle_id: string
  user_id: string
  body: string
  created_at: string
}

export interface WeekStat {
  user_id: string
  display_name: string
  pages: number
  minutes: number
  days: number
}

export interface FeedItem {
  user_book_id: string
  user_id: string
  display_name: string
  work_title: string
  status: Status
  closed_at: string
  cheer_count: number
  cheered_by_me: boolean
}

/** Résultat d'une recherche : une œuvre, avec l'édition la plus courante en tête. */
export interface WorkHit {
  olWorkId: string | null
  title: string
  author: string
  year: number | null
  genre: string
  /** Genres devinés (3 au plus), le premier = `genre`. */
  genres?: string[]
  pages: number | null
  coverUrl: string | null
  /** Résumé de l'éditeur, quand une source le fournit. */
  description?: string | null
  editionCount: number
  /** Éditions déjà connues (Google Books les renvoie avec la recherche) et celle mise en avant. */
  editions?: EditionHit[]
  primary?: EditionHit | null
}

export interface EditionHit {
  olEditionId: string | null
  title: string | null
  publisher: string | null
  format: Edition['format']
  pages: number | null
  isbn13: string | null
  coverUrl: string | null
  language: string | null
  year: number | null
}
