-- Unisex products: pictures tagged "male" / "female" so the shop's Men and Women pages show only theirs.
-- 3D previews: products.models = colour -> Gelato 3D viewer link (the admin re-hosts its design picture so the link never expires).
-- photo: { url, color, option, gender?: 'male' | 'female', src?: 'gelato', hidden?: true, check?: true }

alter table public.products
  add column models jsonb not null default '{}' check (jsonb_typeof(models) = 'object');

-- photo links of one colour for one look: our own uploads only (Gelato's plain mockup is left out), the other gender left out
create function private.pick_look(p_photos jsonb, p_color text, p_skip text) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(u order by n), '[]') from (
    select p->>'url' u, min(ord) n
    from jsonb_array_elements(p_photos) with ordinality x(p, ord)
    where p->>'color' = p_color and p->>'src' is distinct from 'gelato' and p->>'gender' is distinct from p_skip
    group by 1) t
$$;

create or replace function public.merge_product_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pics jsonb;
begin
  if new.source <> 'gelato' or jsonb_array_length(new.gelato_photos) + jsonb_array_length(new.photos) = 0 then return new; end if;

  select coalesce(jsonb_agg(p order by array_position(new.photo_order, p->>'url') nulls last, grp, ord), '[]') into v_pics from (
    select g.p || '{"src":"gelato"}', 0 as grp, g.ord from jsonb_array_elements(new.gelato_photos) with ordinality g(p, ord)
    where not exists (select 1 from jsonb_array_elements(new.photos) o where o->>'url' = g.p->>'url')
    union all
    select o.p, case when o.p->>'src' = 'gelato' then 0 else 1 end, coalesce(g.ord, o.ord)
    from jsonb_array_elements(new.photos) with ordinality o(p, ord)
    left join lateral (select min(x.ord) as ord from jsonb_array_elements(new.gelato_photos) with ordinality x(p, ord)
                       where o.p->>'src' = 'gelato' and x.p->>'url' = o.p->>'url') g on true
    where coalesce(o.p->>'hidden', '') <> 'true'
      and (o.p->>'src' is distinct from 'gelato' or g.ord is not null)) t(p, grp, ord);

  if jsonb_array_length(new.variants) = 0 then
    new.images := array(select u from (select p->>'url' u, min(ord) n from jsonb_array_elements(v_pics) with ordinality x(p, ord) group by 1) t order by n);
  else
    new.variants := (
      select jsonb_agg((v - 'by_option' - 'men' - 'women' - 'model')
        || jsonb_build_object('images', private.pick_photos(v_pics, v->>'color'))
        || case when v ? 'option' then jsonb_build_object('by_option', coalesce((
             select jsonb_object_agg(s, private.pick_photos(v_pics, v->>'color', s))
             from jsonb_array_elements_text(v->'sizes') s
             where exists (select 1 from jsonb_array_elements(v_pics) p where p->>'color' = v->>'color' and p->>'option' = s)), '{}'))
           else '{}'::jsonb end
        -- only colours that have pictures of people get a men / women list
        || case when exists (select 1 from jsonb_array_elements(v_pics) p where p->>'color' = v->>'color' and p->>'gender' in ('male', 'female'))
             then jsonb_build_object('men', private.pick_look(v_pics, v->>'color', 'female'), 'women', private.pick_look(v_pics, v->>'color', 'male'))
             else '{}'::jsonb end
        order by ord)
      from jsonb_array_elements(new.variants) with ordinality x(v, ord));
  end if;
  return new;
end $$;

-- the shop gets the 3D links (colour -> link, '' for a product without colours)
drop function public.shop_products();
create function public.shop_products()
 returns table(id uuid, title text, description text, category text, price numeric, prices jsonb, variants jsonb, images text[], size_guide jsonb, is_featured boolean, created_at timestamptz, rating_avg numeric, rating_count integer, models jsonb)
 language sql stable security definer set search_path = ''
as $$
  select p.id, p.title, p.description, p.category,
         case when p.source = 'manual' then public.product_price(p.source, p.base_price, p.manual_price, s.global_margin_percent)
              else coalesce(sp.lo, public.product_price(p.source, p.base_price, p.manual_price, s.global_margin_percent)) end,
         coalesce(sp.map, '{}'),
         p.variants, p.images, p.size_guide, p.is_featured, p.created_at,
         round(r.avg, 1), coalesce(r.cnt, 0)::int, p.models
  from public.products p
  cross join public.store_settings s
  left join lateral (
    select jsonb_object_agg(concat(k->>'color', '|', k->>'size'), public.sku_unit_price(k, s.global_margin_percent)) as map,
           min(public.sku_unit_price(k, s.global_margin_percent)) as lo
    from jsonb_array_elements(p.skus) k) sp on true
  left join lateral (
    select avg(rating) as avg, count(*) as cnt from public.reviews
    where product_id = p.id and is_approved) r on true
  where p.is_active and s.id = 1
$$;
grant execute on function public.shop_products() to anon, authenticated, service_role;
