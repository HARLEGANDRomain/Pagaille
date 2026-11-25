-- Pièce de vie du cercle, étape (a) (25/11/2026) : chaque membre peut choisir un siège dans la pièce.
-- 12 sièges (0 à 11), un membre par siège. La présence « en train de lire » passe par Realtime (rien en base) ;
-- l'étagère commune reprend circle_feed(). Les sièges se lisent avec la règle existante members_select.

alter table public.circle_members add column if not exists seat smallint check (seat between 0 and 11);
create unique index if not exists circle_members_seat_uniq on public.circle_members (circle_id, seat) where seat is not null;

-- S'asseoir (p_seat de 0 à 11) ou se lever (p_seat null). Erreurs : non_connecte, pas_membre, siege_inconnu, siege_pris.
create or replace function public.choose_seat(p_circle uuid, p_seat integer)
 returns smallint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'non_connecte'; end if;
  if not exists (select 1 from public.circle_members where circle_id = p_circle and user_id = v_uid) then raise exception 'pas_membre'; end if;
  if p_seat is not null and (p_seat < 0 or p_seat > 11) then raise exception 'siege_inconnu'; end if;
  if p_seat is not null and exists (select 1 from public.circle_members where circle_id = p_circle and seat = p_seat and user_id <> v_uid) then
    raise exception 'siege_pris';
  end if;
  update public.circle_members set seat = p_seat where circle_id = p_circle and user_id = v_uid;
  return p_seat;
exception when unique_violation then
  raise exception 'siege_pris'; -- deux personnes au même instant
end $function$;

revoke all on function public.choose_seat(uuid, integer) from public, anon;
grant execute on function public.choose_seat(uuid, integer) to authenticated;
