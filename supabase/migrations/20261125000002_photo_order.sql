-- The admin ranks a product's pictures: links in the order they are shown. Pictures not listed come after, Gelato's first.
alter table public.products add column photo_order text[] not null default '{}';

create or replace function public.merge_product_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pics jsonb;
begin
  if new.source <> 'gelato' or jsonb_array_length(new.gelato_photos) + jsonb_array_length(new.photos) = 0 then return new; end if;

  select coalesce(jsonb_agg(p order by array_position(new.photo_order, p->>'url') nulls last, grp, ord), '[]') into v_pics from (
    select g.p, 0 as grp, g.ord from jsonb_array_elements(new.gelato_photos) with ordinality g(p, ord)
    where not exists (select 1 from jsonb_array_elements(new.photos) o where o->>'url' = g.p->>'url')
    union all
    select o.p, case when o.p->>'src' = 'gelato' then 0 else 1 end, coalesce(g.ord, o.ord)
    from jsonb_array_elements(new.photos) with ordinality o(p, ord)
    left join lateral (select min(x.ord) as ord from jsonb_array_elements(new.gelato_photos) with ordinality x(p, ord)
                       where o.p->>'src' = 'gelato' and x.p->>'url' = o.p->>'url') g on true
    where coalesce(o.p->>'hidden', '') <> 'true'
      and (o.p->>'src' is distinct from 'gelato' or g.ord is not null)) t;

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

-- a colour's first picture should not wait 15 minutes
select cron.alter_job(jobid, schedule := '2-59/5 * * * *') from cron.job where jobname = 'sync-products';
