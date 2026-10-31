-- Let any signed-in account submit a booking for itself, including accounts
-- that also have an admin role. Only available rooms can be requested.
drop policy if exists "Customers create their own bookings" on public.booking_requests;

create policy "Authenticated users create their own bookings"
on public.booking_requests
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.rooms
    where rooms.id = room_id
      and rooms.status = 'kosong'
  )
);
