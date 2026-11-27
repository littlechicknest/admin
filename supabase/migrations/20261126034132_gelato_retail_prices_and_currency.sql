-- Shop sells at the retail price set in Gelato (skus[].price, USD). Cost + global margin is only a fallback when no price is set.
alter table public.store_settings add column if not exists usd_rates jsonb not null default '{}'::jsonb;
comment on column public.store_settings.usd_rates is 'USD per unit of each display currency, e.g. {"GBP":1.41}; written by sync-products from Gelato''s rate';

create or replace function public.sku_unit_price(s jsonb, p_margin int)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(nullif((s->>'price')::numeric, 0), round((s->>'cost')::numeric * (1 + p_margin / 100.0), 2))
$$;

create or replace function public.sku_price(p public.products, p_color text, p_size text, p_margin integer)
returns numeric language sql immutable set search_path = '' as $$
  select case when p.source = 'manual' then p.manual_price else (
    select public.sku_unit_price(s, p_margin) from jsonb_array_elements(p.skus) s
    where s->>'color' is not distinct from p_color and s->>'size' is not distinct from p_size limit 1) end
$$;

create or replace function public.shop_products()
returns table(id uuid, title text, description text, category text, price numeric, prices jsonb, variants jsonb, images text[], size_guide jsonb, is_featured boolean, created_at timestamptz, rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.description, p.category,
         case when p.source = 'manual' then public.product_price(p.source, p.base_price, p.manual_price, s.global_margin_percent)
              else coalesce(sp.lo, public.product_price(p.source, p.base_price, p.manual_price, s.global_margin_percent)) end,
         coalesce(sp.map, '{}'),
         p.variants, p.images, p.size_guide, p.is_featured, p.created_at,
         round(r.avg, 1), coalesce(r.cnt, 0)::int
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

-- for the shop's currency switch (display only; checkout charges USD)
create or replace function public.shop_rates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select usd_rates from public.store_settings where id = 1
$$;
grant execute on function public.shop_rates() to anon, authenticated;
