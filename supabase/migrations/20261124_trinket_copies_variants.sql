-- Exemplaires et variantes des objets (24/11/2026). Règles identiques à src/lib/trinkets/variants.ts.
-- 1. Un objet (« obj-… ») s'achète jusqu'à 3 fois. Clés du registre : 'buy:obj-chat' (1er exemplaire, inchangé),
--    puis 'buy:obj-chat#2', 'buy:obj-chat#3'. La vue owned_items (substr(key, 5)) liste donc déjà un id par exemplaire.
-- 2. Chaque exemplaire a une variante (couleur) ; les variantes rares demandent un palier de série atteint
--    (clé 'streak:<lundi>:<semaines>' présente dans le registre).
-- 3. Correctif : la contrainte du registre plafonnait un gain à 200 signets ; les paliers de série à 12, 26 et
--    52 semaines (300, 500, 1000) étaient refusés. Plafond porté à 1000.

-- 3. Plafond des gains
alter table public.signet_ledger drop constraint signet_ledger_delta_check;
alter table public.signet_ledger add constraint signet_ledger_delta_check check (delta >= -500 and delta <= 1000 and delta <> 0);

-- 1. Achat : plusieurs exemplaires pour les objets
create or replace function public.buy_item(p_item text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_uid uuid := auth.uid(); v_price int := public.shop_price(p_item); v_bal int; v_key text; v_n int;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if v_price is null then raise exception 'Article inconnu'; end if;
  if v_price = 0 then return 0; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  v_key := 'buy:' || p_item;
  if exists (select 1 from public.signet_ledger where user_id = v_uid and key = v_key) then
    if p_item not like 'obj-%' then raise exception 'Tu as déjà cet article'; end if;
    select min(n) into v_n from generate_series(2, 3) n
      where not exists (select 1 from public.signet_ledger where user_id = v_uid and key = 'buy:' || p_item || '#' || n);
    if v_n is null then raise exception 'Tu as déjà 3 exemplaires de cet objet'; end if;
    v_key := 'buy:' || p_item || '#' || v_n;
  end if;
  select coalesce(sum(delta), 0) into v_bal from public.signet_ledger where user_id = v_uid;
  if v_bal < v_price then raise exception 'Pas assez de signets'; end if;
  insert into public.signet_ledger (user_id, key, delta) values (v_uid, v_key, -v_price);
  return v_bal - v_price;
end $function$;

-- 2. Variantes
-- Semaines de série requises pour une variante (0 : de base), null si la variante n'existe pas.
create or replace function public.trinket_variant_weeks(p_item text, p_variant text)
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_item || ':' || p_variant
    when 'obj-chat:noir' then 0 when 'obj-chat:roux' then 0 when 'obj-chat:gris' then 0 when 'obj-chat:siamois' then 26
    when 'obj-bougie:creme' then 0 when 'obj-bougie:rouge' then 0 when 'obj-bougie:sauge' then 0 when 'obj-bougie:bleue' then 2
    when 'obj-sablier:dore' then 0 when 'obj-sablier:bleu' then 0 when 'obj-sablier:noir' then 0 when 'obj-sablier:aube' then 4
    when 'obj-plante:terre' then 0 when 'obj-plante:bleu' then 0 when 'obj-plante:blanc' then 0 when 'obj-plante:automne' then 8
    when 'obj-globe:classique' then 0 when 'obj-globe:ancien' then 0 when 'obj-globe:nuit' then 0 when 'obj-globe:or' then 12
    else null end
$function$;

create table if not exists public.trinket_variants (
  user_id uuid not null references auth.users(id) on delete cascade,
  copy_id text not null check (char_length(copy_id) <= 40),
  variant text not null check (char_length(variant) <= 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, copy_id)
);
alter table public.trinket_variants enable row level security;
-- Lecture de ses propres variantes ; aucune écriture directe : tout passe par set_variant().
create policy trinket_variants_select on public.trinket_variants for select using (user_id = (select auth.uid()));

create or replace function public.set_variant(p_copy text, p_variant text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_uid uuid := auth.uid(); v_item text := split_part(p_copy, '#', 1); v_weeks int;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  v_weeks := public.trinket_variant_weeks(v_item, p_variant);
  if v_weeks is null then raise exception 'Variante inconnue'; end if;
  if not exists (select 1 from public.signet_ledger where user_id = v_uid and key = 'buy:' || p_copy) then
    raise exception 'Exemplaire pas encore acheté';
  end if;
  if v_weeks > 0 and not exists (
    select 1 from public.signet_ledger
    where user_id = v_uid and key like 'streak:%' and split_part(key, ':', 3) ~ '^[0-9]+$' and split_part(key, ':', 3)::int >= v_weeks
  ) then
    raise exception 'Variante rare : il faut une série de % semaines', v_weeks;
  end if;
  insert into public.trinket_variants (user_id, copy_id, variant) values (v_uid, p_copy, p_variant)
    on conflict (user_id, copy_id) do update set variant = excluded.variant, updated_at = now();
  return p_variant;
end $function$;

revoke all on function public.set_variant(text, text) from public, anon;
grant execute on function public.set_variant(text, text) to authenticated;
