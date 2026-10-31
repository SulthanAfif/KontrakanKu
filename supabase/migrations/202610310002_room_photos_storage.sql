-- Public room photos; only admins and property owners can upload or remove files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-photos',
  'room-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload room photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'room-photos'
  and public.current_app_role() in ('admin', 'pemilik')
);

create policy "Admins delete room photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'room-photos'
  and public.current_app_role() in ('admin', 'pemilik')
);
