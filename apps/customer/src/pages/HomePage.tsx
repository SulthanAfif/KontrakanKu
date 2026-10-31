import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RoomGallery } from "@/components/RoomGallery";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const googleMapsStreetViewUrl = "https://www.google.com/maps/@-0.9424087,100.4279601,78a,45.4y,128.34h,93.98t/data=!3m7!1e1!3m5!1sW9RHZsKlCOxwCyGZMz0bRw!2e0!7i16384!8i8192";

type Room = {
  id: number;
  kode_kamar: string;
  kode_rumah: string;
  deskripsi: string | null;
  harga_sewa: number;
  lantai: number;
  kapasitas: number;
  fasilitas: string[] | null;
  foto: string[] | null;
  status: "kosong" | "terisi";
};

const faqs = [
  {
    question: "Apa artinya rumah petak disewakan kosongan?",
    answer: "Unit disewakan tanpa perabot dan tanpa furnitur. Anda bebas menata sendiri sesuai kebutuhan, sehingga hunian terasa lebih personal dan nyaman.",
  },
  {
    question: "Berapa lama masa sewa dan bagaimana perhitungannya?",
    answer: "Sewa dihitung per tahun. Harga yang tampil di setiap rumah petak adalah biaya sewa untuk satu tahun penuh, sehingga Anda bisa merencanakan biaya hunian dengan lebih mudah.",
  },
  {
    question: "Bagaimana cara mengajukan sewa?",
    answer: "Pilih rumah petak yang Anda suka, tekan tombol lihat detail, lalu masuk atau buat akun. Setelah itu isi biodata singkat dan kirim pengajuan. Pengelola akan menindaklanjuti pengajuan Anda.",
  },
  {
    question: "Apakah saya bisa survei lokasi terlebih dahulu?",
    answer: "Bisa. Kami menyarankan Anda melihat langsung rumah petak dan lingkungannya sebelum memutuskan. Hubungi pengelola melalui WhatsApp untuk mengatur jadwal survei.",
  },
  {
    question: "Bagaimana cara melakukan pembayaran?",
    answer: "Setelah pengajuan diterima dan kontrak dibuat, tagihan tahunan akan muncul di halaman akun Anda. Pembayaran dilakukan melalui transfer, lalu hubungi pengelola untuk konfirmasi.",
  },
  {
    question: "Apa saja syarat yang perlu disiapkan?",
    answer: "Anda perlu menyiapkan KTP dengan NIK 16 angka, nomor telepon aktif, alamat asal, serta nama dan nomor kontak darurat. Data ini digunakan untuk pembuatan kontrak sewa.",
  },
  {
    question: "Apakah harga sewa sudah termasuk listrik dan air?",
    answer: "Ketentuan listrik dan air dapat berbeda pada setiap unit. Silakan tanyakan langsung kepada pengelola saat survei atau melalui WhatsApp agar informasinya jelas sebelum menyewa.",
  },
  {
    question: "Bisakah pengajuan sewa dibatalkan?",
    answer: "Jika pengajuan belum diproses, Anda dapat menghubungi pengelola untuk membatalkannya. Setelah kontrak berjalan, pembatalan mengikuti kesepakatan yang tertulis pada kontrak.",
  },
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
}

function whatsappNumber(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "").replace(/^0/, "62");
}

export function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [contact, setContact] = useState<Record<string, string>>({});
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;
    void supabase
      .from("rooms")
      .select("id, kode_kamar, kode_rumah, deskripsi, harga_sewa, lantai, kapasitas, fasilitas, foto, status")
      .in("status", ["kosong", "terisi"])
      .order("harga_sewa", { ascending: true })
      .limit(8)
      .then(({ data }) => {
        if (isMounted) {
          setRooms((data ?? []) as Room[]);
          setLoading(false);
        }
      });

    void supabase.from("settings").select("key,value").then(({ data }) => {
      if (isMounted) setContact(Object.fromEntries((data ?? []).map(({ key, value }) => [key, value ?? ""])));
    });

    // Catat kunjungan halaman untuk statistik admin (abaikan error jika tabel belum ada)
    void supabase.from("page_views").insert({
      path: "/",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
    }).then(() => undefined).catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  const availableCount = rooms.filter((room) => room.status === "kosong").length;
  const occupiedCount = rooms.filter((room) => room.status === "terisi").length;
  const chatNumber = whatsappNumber(contact.contact_whatsapp_link || contact.contact_whatsapp);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rooms.length, loading]);

  return (
    <>
      <section className="hero">
        <div className="hero-content" data-reveal="left">
          <p className="eyebrow">RUMAH PETAK, HIDUP LEBIH TENANG</p>
          <h1>Temukan rumah petak<br />untuk <em>ditinggali.</em></h1>
          <p className="hero-copy">Rumah petak terawat di Padang untuk disewa tahunan dengan proses yang jelas dan transparan. Setiap unit disewakan dalam kondisi kosongan tanpa perabot, sehingga Anda bebas menata ruang sesuai kebutuhan keluarga. Cocok bagi yang mencari hunian tenang, dekat fasilitas umum, dan ingin merencanakan biaya sewa untuk satu tahun penuh.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#kamar">Jelajahi rumah petak <span aria-hidden="true">↗</span></a>
            <a className="secondary-button" href="#faq">Baca pertanyaan umum</a>
          </div>
          <div className="hero-highlights">
            <span>Sewa tahunan</span>
            <span>Unit kosongan</span>
            <span>Bisa survei lokasi</span>
            <span>Proses jelas</span>
          </div>
          <div className="hero-proof">
            <span className="proof-dot" />
            {isSupabaseConfigured
              ? availableCount > 0
                ? `${availableCount} rumah petak tersedia · Padang`
                : `${rooms.length} rumah petak terdaftar · Padang`
              : "Pilihan rumah petak terverifikasi di Padang"}
          </div>
        </div>
        <div className="hero-art" aria-label="Ilustrasi rumah dan tanaman" role="img" data-reveal="right">
          <div className="sun" />
          <div className="house"><div className="roof" /><div className="house-body"><div className="window" /><div className="door" /></div></div>
          <div className="plant plant-one">♧</div><div className="plant plant-two">♧</div>
          <div className="art-note">Tempat pulang<br /><strong>yang baru.</strong></div>
        </div>
      </section>

      <section className="listing" id="kamar">
        <div className="section-heading" data-reveal>
          <div><p className="eyebrow">PILIHAN UNTUK ANDA</p><h2>Rumah petak</h2></div>
          <span className="listing-count">{isSupabaseConfigured ? `${availableCount} tersedia · ${occupiedCount} terisi` : "Katalog segera hadir"}</span>
        </div>
        {!isSupabaseConfigured ? (
          <div className="setup-note"><strong>Supabase belum dikonfigurasi.</strong><span>Isi URL dan publishable key di <code>apps/customer/.env.local</code>.</span></div>
        ) : loading ? (
          <div className="empty-state">Memuat rumah petak...</div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">Belum ada rumah petak untuk ditampilkan saat ini. Silakan cek kembali nanti.</div>
        ) : (
          <div className="room-grid">
            {rooms.map((room) => (
              <article className="room-card" key={room.id} data-reveal style={{ transitionDelay: `${(rooms.indexOf(room) % 3) * 90}ms` }}>
                <RoomGallery photos={room.foto} className="room-photo" alt={`Foto rumah petak ${room.kode_rumah}`}><span className={room.status === "kosong" ? "available-pill" : "occupied-pill"}>{room.status === "kosong" ? "Tersedia - kosongan" : "Sudah terisi"}</span><span className="room-code">{room.kode_kamar}</span></RoomGallery>
                <div className="room-info">
                  <div className="room-title"><h3>{room.kode_rumah}</h3><span>Lantai {room.lantai} · {room.kapasitas} orang</span></div>
                  <p>{room.deskripsi || "Rumah petak disewakan kosongan tanpa perabot. Siap Anda tata sesuai kebutuhan."}</p>
                  {room.fasilitas?.length ? <div className="room-tags">{room.fasilitas.slice(0, 3).map((facility) => <span key={facility}>{facility}</span>)}</div> : null}
                  <div className="room-bottom"><strong>{formatPrice(Number(room.harga_sewa))}<small> / tahun</small></strong><Link to={`/kamar/${room.id}`} aria-label={`Lihat kamar ${room.kode_kamar}`}>↗</Link></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="location-section" id="lokasi" data-reveal>
        <div className="location-copy">
          <p className="eyebrow">TEMUKAN LOKASI</p>
          <h2>Lihat lingkungan rumah petak</h2>
          <p>{contact.contact_address || "Kota Padang, Sumatera Barat, Indonesia"}. Jelajahi lokasi dan suasana sekitar melalui Google Maps.</p>
          <a className="primary-button" href={googleMapsStreetViewUrl} target="_blank" rel="noreferrer">Buka Street View <span aria-hidden="true">↗</span></a>
        </div>
        <div className="map-frame">
          <iframe title="Peta lokasi rumah petak di Google Maps" src="https://maps.google.com/maps?q=-0.9424087,100.4279601&z=16&output=embed" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>

      <section className="about" id="tentang" data-reveal>
        <p className="eyebrow">SEWA TANPA RIBET</p><h2>Semua yang Anda butuhkan,<br />sejak hari pertama.</h2>
        <div className="features" data-reveal>
          <div><span>01</span><h3>Proses yang jelas</h3><p>Lihat detail lengkap rumah petak, ajukan sewa, dan pantau status pengajuan dari akun Anda dalam beberapa langkah sederhana tanpa harus bolak-balik menghubungi pengelola.</p></div>
          <div><span>02</span><h3>Hunian terawat</h3><p>Setiap unit dijaga kebersihan dan kondisinya sebelum ditempati, sehingga Anda bisa langsung menata ruang sesuai kebutuhan keluarga tanpa harus memperbaiki banyak hal.</p></div>
          <div><span>03</span><h3>Dukungan langsung</h3><p>Tim pengelola siap membantu melalui WhatsApp jika Anda memiliki pertanyaan tentang unit, jadwal survei, atau proses kontrak dan pembayaran tahunan.</p></div>
          <div><span>04</span><h3>Survei lokasi langsung</h3><p>Kami sangat menyarankan Anda melihat rumah petak dan lingkungannya secara langsung sebelum memutuskan. Jadwalkan survei agar lebih yakin dengan pilihan Anda.</p>{chatNumber ? <a className="feature-link" href={`https://wa.me/${chatNumber}?text=${encodeURIComponent("Halo, saya ingin menjadwalkan survei lokasi rumah petak.")}`} target="_blank" rel="noreferrer">Jadwalkan survei ↗</a> : <a className="feature-link" href="#lokasi">Lihat lokasi ↗</a>}</div>
        </div>
      </section>

      <section className="faq-section" id="faq" data-reveal>
        <div className="faq-layout">
          <div className="faq-intro">
            <p className="eyebrow">PERTANYAAN UMUM</p>
            <h2>Masih ada yang<br />ingin ditanyakan?</h2>
            <p>Jawaban singkat untuk hal yang paling sering ditanyakan calon penyewa. Jika belum terjawab, kami siap membantu.</p>
            {chatNumber ? (
              <a className="primary-button" href={`https://wa.me/${chatNumber}?text=${encodeURIComponent("Halo, saya ingin bertanya tentang rumah petak.")}`} target="_blank" rel="noreferrer">Tanya pengelola <span aria-hidden="true">↗</span></a>
            ) : (
              <a className="primary-button" href="#lokasi">Lihat kontak <span aria-hidden="true">↗</span></a>
            )}
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div className={`faq-item${isOpen ? " is-open" : ""}`} key={faq.question}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : index)}>
                    <span>{faq.question}</span>
                    <span className="faq-icon" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen ? <p>{faq.answer}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer><Link className="brand brand-lockup" to="/" aria-label="KontrakanKu beranda"><img className="brand-logo" src="/logo.png" alt="" /><span className="brand-wordmark">KontrakanKu</span></Link><p>{contact.contact_address || "Kota Padang, Sumatera Barat, Indonesia"}{contact.contact_hours ? ` · ${contact.contact_hours}` : ""}</p><div className="footer-contact">{contact.contact_email ? <a href={`mailto:${contact.contact_email}`}>{contact.contact_email}</a> : null}{chatNumber ? <a href={`https://wa.me/${chatNumber}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}<a href="#faq">FAQ</a><span>© 2026 Kontrakanku</span></div></footer>
    </>
  );
}
