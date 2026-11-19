import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Configuration manquante : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_KEY dans .env')
}

// Seule la clé publique (publishable / anon) a sa place ici. Jamais la clé « service_role » :
// tout ce qui est dans l'appli est lisible par n'importe quel visiteur.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export { explain } from './explain'
