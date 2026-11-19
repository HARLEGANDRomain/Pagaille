/* Images envoyées par l'utilisateur (couvertures, photo de profil) : recadrées et compressées AVANT l'envoi,
   pour qu'une photo de téléphone de 4 Mo devienne un fichier d'environ 60 ko. */
import { supabase } from './supabase'

/** Recadre au centre au format demandé (2:3 pour une couverture, carré pour un avatar) puis compresse en WebP (JPEG en secours). */
export async function cropToBlob(file: File, w: number, h: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Cette image est trop lourde (25 Mo au plus).')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Impossible de lire cette image. Essaie une photo en JPEG ou en PNG.')
  }
  const ratio = w / h
  let sw = bmp.width, sh = bmp.height
  if (sw / sh > ratio) sw = sh * ratio
  else sh = sw / ratio
  const sx = (bmp.width - sw) / 2, sy = (bmp.height - sh) / 2
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const x = cv.getContext('2d')!
  x.imageSmoothingQuality = 'high'
  x.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/webp', 0.82))
  if (blob && blob.type === 'image/webp') return blob
  const jpg = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.85))
  if (!jpg) throw new Error('La conversion de l’image a échoué.')
  return jpg
}

/** Envoie l'image dans le dossier de la personne (`<uid>/…`) et renvoie son adresse publique. */
export async function uploadImage(bucket: 'covers' | 'avatars', uid: string, name: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${uid}/${name}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Efface une image qu'on a soi-même envoyée (sans effet pour une adresse externe, comme une couverture Google). */
export async function removeOwnImage(url: string | null | undefined) {
  if (!url) return
  const m = /\/storage\/v1\/object\/public\/(covers|avatars)\/(.+)$/.exec(url)
  if (!m) return
  await supabase.storage.from(m[1]).remove([decodeURIComponent(m[2])]).catch(() => {})
}
