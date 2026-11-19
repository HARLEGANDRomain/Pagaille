-- Appliquée le 19/11/2026 sur le projet Supabase « Pagaille » (oetpbsnglqljjmkwipgv). Copie pour mémoire.
-- 1. Couverture propre à l'exemplaire et genres personnels (3 au plus)
alter table public.user_books add column if not exists custom_cover_url text check (custom_cover_url is null or char_length(custom_cover_url) <= 600);
alter table public.user_books add column if not exists genres text[] not null default '{}' check (cardinality(genres) <= 3);
-- 2. Photo de profil
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 600);
-- 3. Nouveaux noms de genres (Roman → Littérature contemporaine, SF → Science-fiction, Design → Art et design)
-- 4. Boutique : achats uniquement via buy_item() (prix et solde vérifiés en base), équipement via equip_item(),
--    trigger profiles_guard_equipped, insertion directe d'un achat dans signet_ledger interdite.
-- 5. ping() pour la tâche GitHub qui garde la base éveillée
-- 6. Table book_cache (cache de la fonction « books », RLS sans politique : service_role seulement)
-- 7. Buckets publics « covers » (1 Mo) et « avatars » (512 ko), écriture limitée au dossier <uid>/
-- Le détail exact est dans l'historique des migrations Supabase (v2_covers_avatars_genres_shop).
