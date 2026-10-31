-- Public visitors can see rooms that are available or already occupied.
-- Maintenance units remain hidden from the customer catalog.
drop policy if exists "Available room catalog is public" on public.rooms;

create policy "Available room catalog is public"
on public.rooms
for select to anon, authenticated
using (status in ('kosong', 'terisi'));
