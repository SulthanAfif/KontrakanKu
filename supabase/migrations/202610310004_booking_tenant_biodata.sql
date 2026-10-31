-- Capture the tenant details at booking time so admins can create a complete
-- tenant record directly from an application.
alter table public.booking_requests
  add column if not exists nik text,
  add column if not exists alamat_asal text,
  add column if not exists kontak_darurat text,
  add column if not exists no_hp_darurat text;
