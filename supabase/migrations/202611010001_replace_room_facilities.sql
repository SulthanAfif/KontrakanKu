-- Replace the previous facilities for all existing rental units.
update public.rooms
set fasilitas = '["Ruang tamu", "Ruang makan", "Ruang keluarga", "Ruang tidur 2", "Kamar mandi", "Dapur", "Sumur bor"]'::jsonb;
