-- Public bucket for product images (ML publish needs HTTPS URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read (public URLs for Mercado Livre)
drop policy if exists product_images_storage_select on storage.objects;
create policy product_images_storage_select
  on storage.objects
  for select
  using (bucket_id = 'product-images');
