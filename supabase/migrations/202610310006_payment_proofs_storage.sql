-- Payment receipts are private because they may contain sensitive banking data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload payment proofs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and public.current_app_role() in ('admin', 'pemilik')
);

create policy "Admins view payment proofs"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and public.current_app_role() in ('admin', 'pemilik')
);

create policy "Admins delete payment proofs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and public.current_app_role() in ('admin', 'pemilik')
);
