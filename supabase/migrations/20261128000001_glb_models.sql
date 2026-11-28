-- 3D previews are now .glb files the admin uploads (no more Gelato viewer links).
-- products.models = colour -> public link of the .glb in Storage ('' = every colour / product without colours).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-models', 'product-models', true, 52428800, array['model/gltf-binary'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "product-models: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-models' and (select private.is_admin()));
create policy "product-models: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'product-models' and (select private.is_admin()));
create policy "product-models: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-models' and (select private.is_admin()));
create policy "product-models: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-models' and (select private.is_admin()));

-- old Gelato viewer links can no longer be shown
update public.products set models = '{}' where models <> '{}';
