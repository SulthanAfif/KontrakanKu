-- Update the seeded public address to match the homepage map location.
update public.settings
set value = 'Kota Padang, Sumatera Barat, Indonesia',
    updated_at = now()
where key = 'contact_address'
  and value = 'Jakarta, Indonesia';
