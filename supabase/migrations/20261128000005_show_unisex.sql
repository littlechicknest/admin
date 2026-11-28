-- The owner can hide the shop's Unisex category; Unisex products still show under Men and Women.
alter table public.store_settings add column if not exists show_unisex boolean not null default true;

drop function public.shop_config();
create function public.shop_config()
 returns table(shipping_zones jsonb, checkout_mode text, site_images jsonb, show_unisex boolean)
 language sql stable security definer set search_path = ''
as $$ select shipping_zones, checkout_mode, site_images, show_unisex from public.store_settings where id = 1 $$;
grant execute on function public.shop_config() to anon, authenticated, service_role;
