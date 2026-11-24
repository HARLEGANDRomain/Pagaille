/** Traduit les erreurs de la base en phrases qui disent quoi faire. */
export function explain(e: unknown): string {
  const err = e as { message?: string; code?: string } | null
  const m = err?.message ?? ''
  if (m.includes('code_invalide')) return 'Ce code d’invitation n’existe pas. Vérifie-le avec la personne qui te l’a donné.'
  if (m.includes('cercle_complet')) return 'Ce cercle est complet (12 membres au maximum).'
  if (m.includes('non_connecte')) return 'Ta session a expiré. Reconnecte-toi.'
  if (m.includes('reserve_au_proprietaire')) return 'Seul le propriétaire du cercle peut faire ça.'
  if (m.includes('jour_dans_le_futur')) return 'La date de cette lecture est dans le futur.'
  if (m.includes('edition_incoherente')) return 'Cette édition n’appartient pas à ce livre.'
  if (/mime type/i.test(m)) return 'Ce format d’image n’est pas accepté. Utilise une photo en JPEG, PNG ou WebP.'
  if (/maximum allowed size|Payload too large/i.test(m)) return 'Cette image est trop lourde, même compressée.'
  if (/could not find the function|PGRST202/i.test(m) || err?.code === 'PGRST202')
    return 'Cette fonction n’est pas encore installée sur le serveur : la mise à jour de la base est en attente.'
  if (m.includes('Pas assez de signets') || m.includes('déjà cet article') || m.includes('pas encore acheté') || m.includes('exemplaires de cet objet') || m.includes('Variante')) return m.replace(/\.$/, '') + '.'
  if (err?.code === '23505') return 'Cet élément existe déjà.'
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Pas de connexion. Réessaie dès que le réseau revient.'
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit'))
    return 'Trop d’e-mails envoyés pour l’instant. Attends quelques minutes avant de redemander un code.'
  if (m.includes('Token has expired') || m.includes('invalid')) return 'Ce code est invalide ou périmé. Demande-en un nouveau.'
  return m || 'Une erreur est survenue. Réessaie.'
}
