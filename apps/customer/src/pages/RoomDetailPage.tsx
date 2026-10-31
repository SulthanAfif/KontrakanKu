import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { RoomGallery } from "@/components/RoomGallery";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Room = { id: number; kode_kamar: string; kode_rumah: string; deskripsi: string | null; harga_sewa: number; lantai: number; kapasitas: number; fasilitas: string[] | null; foto: string[] | null; status: "kosong" | "terisi" };

export function RoomDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    void supabase.from("rooms").select("id, kode_kamar, kode_rumah, deskripsi, harga_sewa, lantai, kapasitas, fasilitas, foto, status").eq("id", id).in("status", ["kosong", "terisi"]).maybeSingle().then(({ data }) => {
      if (isMounted) {
        setRoom(data as Room | null);
        setLoading(false);
      }
    });

    return () => { isMounted = false; };
  }, [id]);

  async function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !id) {
      return;
    }

    setError("");
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const nationalId = String(formData.get("nik") ?? "").replace(/\D/g, "");
    if (nationalId.length !== 16) {
      setBusy(false);
      setError("NIK harus terdiri dari 16 angka.");
      return;
    }
    const { error: bookingError } = await supabase.from("booking_requests").insert({
      user_id: user.id,
      room_id: Number(id),
      nama_lengkap: String(formData.get("nama_lengkap") ?? "").trim(),
      nik: nationalId,
      no_hp: String(formData.get("no_hp") ?? "").trim(),
      email: user.email,
      alamat_asal: String(formData.get("alamat_asal") ?? "").trim(),
      kontak_darurat: String(formData.get("kontak_darurat") ?? "").trim(),
      no_hp_darurat: String(formData.get("no_hp_darurat") ?? "").trim(),
      tanggal_mulai_diinginkan: String(formData.get("tanggal_mulai_diinginkan") ?? "") || null,
      pesan: String(formData.get("pesan") ?? "").trim() || null,
    });
    setBusy(false);

    if (bookingError) {
      setError(`Pengajuan gagal dikirim: ${bookingError.message}`);
      return;
    }
    navigate("/akun?booking=sent");
  }

  if (!isSupabaseConfigured) {
    return <main className="account-content"><div className="setup-note"><strong>Supabase belum dikonfigurasi.</strong><span>Lengkapi apps/customer/.env.local untuk melihat detail rumah petak.</span></div></main>;
  }
  if (loading) {
    return <main className="account-content"><p className="auth-copy">Memuat detail rumah petak...</p></main>;
  }
  if (!room) {
    return <main className="account-content"><h1>Rumah petak tidak ditemukan</h1><p className="auth-copy">Unit ini mungkin sudah tidak tersedia.</p><Link to="/">Kembali ke beranda</Link></main>;
  }

  return (
    <main className="detail-layout">
      <section className="detail-main">
        <RoomGallery photos={room.foto} className="detail-photo" alt={`Foto rumah petak ${room.kode_rumah}`}><span className={room.status === "kosong" ? "available-pill" : "occupied-pill"}>{room.status === "kosong" ? "Kosongan · tersedia" : "Sudah terisi"}</span></RoomGallery>
        <p className="eyebrow">RUMAH PETAK {room.kode_kamar}</p><h1>{room.kode_rumah}</h1>
        <p className="detail-description">{room.deskripsi || "Rumah petak disewakan kosongan tanpa perabot. Siap Anda tata sesuai kebutuhan."}</p>
        {room.status === "kosong" ? <p className="detail-description"><strong>Disewakan kosongan:</strong> unit tidak dilengkapi perabot atau furnitur.</p> : null}
        <div className="detail-facts"><span>Lantai {room.lantai}</span><span>Kapasitas {room.kapasitas} orang</span></div>
        <h2>Fasilitas</h2>
        {room.fasilitas?.length ? <ul className="facility-list">{room.fasilitas.map((facility) => <li key={facility}>{facility}</li>)}</ul> : <p className="detail-description">Hubungi kami untuk informasi fasilitas.</p>}
      </section>
      <aside className="booking-card">
        {room.status === "terisi" ? <><p className="eyebrow">STATUS UNIT</p><h2>Rumah petak ini sudah terisi</h2><p className="auth-copy">Lihat pilihan rumah petak lain yang masih tersedia.</p><Link className="primary-button" to="/#kamar">Lihat pilihan lain <span>↗</span></Link></> : <>
        <p className="eyebrow">MULAI DARI</p>
        <strong className="detail-price">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(room.harga_sewa))}<small> / tahun</small></strong>
        <h2>Ajukan sewa rumah petak ini</h2>
        {error ? <p className="error-message">{error}</p> : null}
        {!user ? <><p className="auth-copy">Masuk atau buat akun untuk mengirim pengajuan sewa.</p><Link className="primary-button" to="/login" state={{ next: `/kamar/${room.id}` }}>Masuk untuk mengajukan <span>↗</span></Link></> : (
          <form onSubmit={(event) => void handleBooking(event)}>
            <p className="eyebrow">BIODATA PENYEWA</p>
            <label>Nama lengkap<input name="nama_lengkap" defaultValue={user.user_metadata.name ?? ""} required /></label>
            <label>NIK (16 angka)<input name="nik" inputMode="numeric" autoComplete="off" maxLength={16} pattern="[0-9]{16}" title="Masukkan tepat 16 angka" required /></label>
            <label>Email akun<input type="email" value={user.email ?? ""} readOnly /></label>
            <label>Nomor telepon<input type="tel" name="no_hp" required /></label>
            <label>Alamat asal<textarea name="alamat_asal" rows={2} autoComplete="street-address" required /></label>
            <label>Nama kontak darurat<input name="kontak_darurat" required /></label>
            <label>Nomor kontak darurat<input type="tel" name="no_hp_darurat" required /></label>
            <label>Rencana mulai sewa<input type="date" name="tanggal_mulai_diinginkan" /></label>
            <label>Pesan untuk pengelola<textarea name="pesan" rows={3} /></label>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Mengirim..." : "Kirim pengajuan"} <span>↗</span></button>
          </form>
        )}
        </>}
      </aside>
    </main>
  );
}
