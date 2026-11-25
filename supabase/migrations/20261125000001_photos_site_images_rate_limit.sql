-- Uploaded mockups with a colour each, website pictures editable from the admin, and write rate limits.

-- product photos ---------------------------------------------------------------
-- photo: { url, color, option, src?: 'gelato', main?: true, hidden?: true, check?: true }
alter table public.products
  -- written by the sync: what Gelato has
  add column gelato_photos jsonb not null default '[]' check (jsonb_typeof(gelato_photos) = 'array'),
  -- written by the admin: uploads, plus corrections of Gelato photos (src = 'gelato'); the sync never touches it
  add column photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array'),
  -- new Gelato product that still needs its mockups uploaded
  add column is_new boolean not null default false;
update public.products set is_new = true where source = 'gelato';

-- photo links of one colour (and one design option; photos without an option suit every option)
create function private.pick_photos(p_photos jsonb, p_color text, p_option text default null) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(u order by exact desc, n), '[]') from (
    select p->>'url' u, coalesce(bool_or(p->>'option' = p_option), false) exact, min(ord) n
    from jsonb_array_elements(p_photos) with ordinality x(p, ord)
    where p->>'color' = p_color and (p_option is null or p->>'option' is null or p->>'option' = p_option)
    group by 1) t
$$;

-- keeps variants[].images / by_option (what the shop, basket and orders read) in step with both photo lists
create function public.merge_product_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pics jsonb;
begin
  if new.source <> 'gelato' or jsonb_array_length(new.gelato_photos) + jsonb_array_length(new.photos) = 0 then return new; end if;

  select coalesce(jsonb_agg(p order by coalesce(p->>'main' = 'true', false) desc, grp, ord), '[]') into v_pics from (
    select g.p, 0 as grp, g.ord from jsonb_array_elements(new.gelato_photos) with ordinality g(p, ord)
    where not exists (select 1 from jsonb_array_elements(new.photos) o where o->>'url' = g.p->>'url')
    union all
    select o.p, case when o.p->>'src' = 'gelato' then 0 else 1 end, o.ord
    from jsonb_array_elements(new.photos) with ordinality o(p, ord)
    where coalesce(o.p->>'hidden', '') <> 'true'
      and (o.p->>'src' is distinct from 'gelato'
           or exists (select 1 from jsonb_array_elements(new.gelato_photos) g where g->>'url' = o.p->>'url'))) x;

  if jsonb_array_length(new.variants) = 0 then
    new.images := array(select u from (select p->>'url' u, min(ord) n from jsonb_array_elements(v_pics) with ordinality x(p, ord) group by 1) t order by n);
  else
    new.variants := (
      select jsonb_agg((v - 'by_option')
        || jsonb_build_object('images', private.pick_photos(v_pics, v->>'color'))
        || case when v ? 'option' then jsonb_build_object('by_option', coalesce((
             select jsonb_object_agg(s, private.pick_photos(v_pics, v->>'color', s))
             from jsonb_array_elements_text(v->'sizes') s
             where exists (select 1 from jsonb_array_elements(v_pics) p where p->>'color' = v->>'color' and p->>'option' = s)), '{}'))
           else '{}'::jsonb end order by ord)
      from jsonb_array_elements(new.variants) with ordinality x(v, ord));
  end if;
  return new;
end $$;
revoke execute on function public.merge_product_photos() from public, anon, authenticated;
create trigger products_photos before insert or update on public.products
  for each row execute function public.merge_product_photos();

-- test orders: show the photo of the chosen design
do $$
declare v_def text := pg_get_functiondef('public.place_test_order(jsonb,jsonb,text)'::regprocedure);
  v_new text := replace(v_def, 'coalesce(v_variant->''images''->>0,', 'coalesce(v_variant->''by_option''->v_size->>0, v_variant->''images''->>0,');
begin
  if v_new = v_def then raise exception 'place_test_order was not patched'; end if;
  execute v_new;
end $$;

-- website pictures: slot name -> uploaded link (missing = the picture shipped with the site) ----------------
alter table public.store_settings add column site_images jsonb not null default '{}'
  check (jsonb_typeof(site_images) = 'object' and pg_column_size(site_images) < 20000);
drop function public.shop_config();
create function public.shop_config()
returns table (shipping_flat numeric, free_shipping_over numeric, express_shipping numeric, checkout_mode text, site_images jsonb)
language sql stable security definer set search_path = '' as $$
  select shipping_flat, free_shipping_over, express_shipping, checkout_mode, site_images from public.store_settings where id = 1
$$;
grant execute on function public.shop_config() to anon, authenticated;

-- flood protection for everything that writes through the API ------------------------------------------------
create unlogged table private.rate_limits (
  key text not null, slot timestamptz not null, hits int not null default 1, primary key (key, slot));

-- runs before every API request; reads run in read-only transactions and are left to Supabase's own edge limits
create function public.check_request() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_user text := v_claims->>'sub';
  v_hits int;
begin
  if current_setting('transaction_read_only') = 'on' or v_claims->>'role' = 'service_role' then return; end if;
  insert into private.rate_limits as r (key, slot)
  values (coalesce('u:' || v_user, 'ip:' || coalesce(v_headers->>'cf-connecting-ip', split_part(v_headers->>'x-forwarded-for', ',', 1), 'unknown')),
          date_trunc('minute', now()))
  on conflict (key, slot) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- visitors: contact form + newsletter only, so 8 a minute is plenty
  if v_hits > (case when v_user is null then 8 else 120 end) then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', '429', 'message', 'Too many requests. Please wait a minute and try again.')::text,
      detail = json_build_object('status', 429, 'headers', json_build_object('Retry-After', '60'))::text;
  end if;
end $$;
revoke execute on function public.check_request() from public;
grant execute on function public.check_request() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';

select cron.schedule('clean-rate-limits', '23 * * * *', $$delete from private.rate_limits where slot < now() - interval '10 minutes'$$);
