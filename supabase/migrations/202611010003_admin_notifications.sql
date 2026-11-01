create extension if not exists pg_net with schema extensions;

create table public.admin_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id bigint references public.booking_requests(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, booking_id)
);
create index admin_notifications_user_created_idx on public.admin_notifications(user_id, id desc);
create index admin_notifications_unread_idx on public.admin_notifications(user_id) where read_at is null;

create table public.admin_push_tokens (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sound_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create index admin_push_tokens_user_idx on public.admin_push_tokens(user_id);

-- Request IDs allow operators to inspect delivery responses in net._http_response.
create table public.admin_push_deliveries (
  id bigint generated always as identity primary key,
  notification_id bigint references public.admin_notifications(id) on delete set null,
  request_id bigint not null,
  created_at timestamptz not null default now()
);
alter table public.admin_notifications enable row level security;
alter table public.admin_push_tokens enable row level security;
alter table public.admin_push_deliveries enable row level security;

revoke all on public.admin_notifications, public.admin_push_tokens, public.admin_push_deliveries from anon, authenticated;
grant select on public.admin_notifications to authenticated;
grant update(read_at) on public.admin_notifications to authenticated;
grant select, insert, update, delete on public.admin_push_tokens to authenticated;

create policy "Admins read their notifications" on public.admin_notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.current_app_role() in ('admin', 'pemilik'));
create policy "Admins mark their notifications read" on public.admin_notifications for update to authenticated
  using (user_id = (select auth.uid()) and public.current_app_role() in ('admin', 'pemilik'))
  with check (user_id = (select auth.uid()) and public.current_app_role() in ('admin', 'pemilik'));
create policy "Admins manage their device tokens" on public.admin_push_tokens for all to authenticated
  using (user_id = (select auth.uid()) and public.current_app_role() in ('admin', 'pemilik'))
  with check (user_id = (select auth.uid()) and public.current_app_role() in ('admin', 'pemilik'));

create function public.send_admin_notification_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  device record;
  request_id bigint;
begin
  -- A push transport failure must never reject a customer's booking.
  for device in
    select t.token, t.sound_enabled from public.admin_push_tokens t
    join public.profiles p on p.id = t.user_id
    where t.user_id = new.user_id and p.role in ('admin', 'pemilik')
  loop
    begin
      select net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'to', device.token, 'title', new.title, 'body', new.body,
          'sound', case when device.sound_enabled then 'default' else null end,
          'channelId', case when device.sound_enabled then 'booking-alerts' else 'booking-silent' end,
          'priority', 'high', 'ttl', 3600,
          'data', jsonb_build_object('notificationId', new.id, 'bookingId', new.booking_id, 'screen', 'Booking')
        )
      ) into request_id;
      insert into public.admin_push_deliveries(notification_id, request_id) values (new.id, request_id);
    exception when others then
      raise warning 'Admin push could not be queued (SQLSTATE %)', sqlstate;
    end;
  end loop;
  return new;
end;
$$;

create function public.notify_admins_of_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_notifications(user_id, booking_id, title, body)
  select id, new.id, 'Pengajuan sewa baru', 'Ada pengajuan sewa baru. Buka admin untuk meninjaunya.'
  from public.profiles where role in ('admin', 'pemilik');
  return new;
end;
$$;
revoke all on function public.send_admin_notification_push() from public, anon, authenticated;
revoke all on function public.notify_admins_of_booking() from public, anon, authenticated;

create trigger booking_notify_admins after insert on public.booking_requests
  for each row execute function public.notify_admins_of_booking();
create trigger admin_notification_send_push after insert on public.admin_notifications
  for each row execute function public.send_admin_notification_push();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications'
    ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;
