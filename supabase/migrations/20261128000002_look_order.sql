-- Men / Women pictures of a Unisex colour: that gender's own pictures first (so the shop's thumbnail shows a man / a woman),
-- then pictures with nobody in them. Gelato's plain mockup and the other gender stay out.
create or replace function private.pick_look(p_photos jsonb, p_color text, p_skip text) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(u order by nobody, n), '[]') from (
    select p->>'url' u, bool_and(p->>'gender' is null) nobody, min(ord) n
    from jsonb_array_elements(p_photos) with ordinality x(p, ord)
    where p->>'color' = p_color and p->>'src' is distinct from 'gelato' and p->>'gender' is distinct from p_skip
    group by 1) t
$$;

-- rebuild every product's lists
update public.products set photos = photos where category = 'Unisex';
