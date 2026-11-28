-- The shop build that read the flat delivery settings is gone: remove them from shop_config and drop the old price function.
drop function if exists public.shipping_cost(numeric, text);

drop function public.shop_config();
create function public.shop_config()
 returns table(shipping_zones jsonb, checkout_mode text, site_images jsonb)
 language sql stable security definer set search_path = ''
as $$ select shipping_zones, checkout_mode, site_images from public.store_settings where id = 1 $$;
grant execute on function public.shop_config() to anon, authenticated, service_role;
