-- Delivery is never free: the price depends on where it goes (further = more) and how many items are in the parcel.
-- store_settings.shipping_zones = [{ name, countries: ['GB', …], standard, express, extra }] in USD;
-- extra = added for each item after the first. Edited in Admin > Settings.

alter table public.store_settings add column shipping_zones jsonb not null default '[]'
  check (jsonb_typeof(shipping_zones) = 'array');

update public.store_settings set free_shipping_over = 0, shipping_zones = '[
  {"name": "United Kingdom", "countries": ["GB"], "standard": 5.95, "express": 12.95, "extra": 1.50},
  {"name": "Ireland and nearby Europe", "countries": ["IE", "FR", "BE", "NL", "DE"], "standard": 7.95, "express": 16.95, "extra": 2.00},
  {"name": "Rest of Europe", "countries": ["ES", "IT", "PT", "AT", "DK", "SE", "NO", "FI", "PL", "CH"], "standard": 9.95, "express": 19.95, "extra": 2.50},
  {"name": "USA and Canada", "countries": ["US", "CA"], "standard": 11.95, "express": 24.95, "extra": 3.00},
  {"name": "Australia and New Zealand", "countries": ["AU", "NZ"], "standard": 14.95, "express": 29.95, "extra": 3.50}
]' where id = 1;

-- the one place that knows the delivery price (Stripe checkout + test orders); null = we don't deliver there
create or replace function public.shipping_cost(p_country text, p_items int, p_method text) returns numeric
language sql stable set search_path = '' as $$
  select round((case when p_method = 'express' then (z->>'express')::numeric else (z->>'standard')::numeric end)
               + greatest(coalesce(p_items, 1) - 1, 0) * coalesce((z->>'extra')::numeric, 0), 2)
  from public.store_settings s, jsonb_array_elements(s.shipping_zones) z
  where s.id = 1 and z->'countries' ? upper(p_country)
  limit 1
$$;
revoke execute on function public.shipping_cost(text, int, text) from public, anon, authenticated;
grant execute on function public.shipping_cost(text, int, text) to service_role;

-- test orders use the same price (number of items = total quantity)
do $$ begin
  execute replace(pg_get_functiondef('public.place_test_order(jsonb,jsonb,text)'::regprocedure),
    'v_shipping := public.shipping_cost(v_subtotal, p_shipping_method);',
    'v_shipping := public.shipping_cost(v_addr->>''country'', (select sum((i->>''quantity'')::int)::int from jsonb_array_elements(v_lines) i), p_shipping_method);
  if v_shipping is null then raise exception ''Sorry, we do not deliver to that country yet.'' using errcode = ''22023''; end if;');
end $$;

-- the shop shows the zones (prices before checkout, and on the delivery page).
-- shipping_flat / free_shipping_over / express_shipping stay in the result until the old shop build is replaced
drop function public.shop_config();
create function public.shop_config()
 returns table(shipping_flat numeric, free_shipping_over numeric, express_shipping numeric, checkout_mode text, site_images jsonb, shipping_zones jsonb)
 language sql stable security definer set search_path = ''
as $$ select shipping_flat, free_shipping_over, express_shipping, checkout_mode, site_images, shipping_zones from public.store_settings where id = 1 $$;
grant execute on function public.shop_config() to anon, authenticated, service_role;
