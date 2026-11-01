-- Reuse known earlier units so their bookings and contracts keep the same room ID.
-- Preserve existing rents, occupancy, and capacity when updating a unit.
do $$
declare
  unit record;
  room_id bigint;
  common_description constant text := 'Rumah petak di Padang yang disewakan tahunan dalam kondisi kosongan tanpa perabot. Setiap unit memiliki ruang tamu, ruang makan, ruang keluarga, 2 ruang tidur, kamar mandi, dapur, dan sumber air sumur bor. Anda dapat membawa perabot sendiri dan menata hunian sesuai kebutuhan keluarga.';
  common_facilities constant jsonb := '["Ruang tamu", "Ruang makan", "Ruang keluarga", "Ruang tidur 2", "Kamar mandi", "Dapur", "Sumur bor"]'::jsonb;
  common_photos constant jsonb := '[
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/tampak-depan.png",
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/ruang-keluarga.png",
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/kamar-tidur-1.png",
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/kamar-tidur-2.png",
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/dapur.png",
    "https://ftrsvjckycwkucxyxeow.supabase.co/storage/v1/object/public/room-photos/rumah/kamar-mandi.png"
  ]'::jsonb;
begin
  for unit in
    select * from (values
      ('RUMAH-001', 'KP-01', 'Rumah Petak A1', null, null),
      ('RUMAH-002', 'KP-02', 'Rumah Petak A2', null, null),
      ('RUMAH-003', 'KP-03', 'Rumah Petak B1', null, null),
      ('RUMAH-004', 'KP-04', 'Rumah Petak B2', null, null)
    ) as units(name, seed_code, seed_name, previous_code, previous_name)
  loop
    room_id := null;
    select id into room_id from public.rooms
    where kode_rumah = unit.name
    order by id limit 1;

    if room_id is null then
      select id into room_id from public.rooms
      where (kode_kamar = unit.seed_code and kode_rumah = unit.seed_name)
         or (kode_kamar = unit.previous_code and kode_rumah = unit.previous_name)
      order by id limit 1;
    end if;

    if room_id is null then
      insert into public.rooms (
        kode_kamar, kode_rumah, deskripsi, harga_sewa, status,
        lantai, kapasitas, fasilitas, foto
      ) values (
        unit.name, unit.name, common_description, 12000000, 'kosong',
        1, 4, common_facilities, common_photos
      );
    else
      update public.rooms set
        kode_rumah = unit.name,
        deskripsi = common_description,
        fasilitas = common_facilities,
        foto = common_photos
      where id = room_id;
    end if;
  end loop;
end;
$$;
