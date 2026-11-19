-- Résumé des livres (déjà appliqué sur le projet via la migration « works_synopsis »).
-- Colonne partagée sur l'œuvre : le résumé est cherché une fois, puis réutilisé par tout le monde.
alter table public.works add column if not exists synopsis text check (synopsis is null or char_length(synopsis) <= 4000);

-- set_work_synopsis(p_work, p_text) : remplit le résumé seulement s'il est vide, et seulement pour une personne
-- qui possède ce livre. Réservée aux comptes connectés (pas de droit pour « anon »).
