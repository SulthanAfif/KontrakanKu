import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

type Booking = { id: number; status: string; created_at: string; rooms: { kode_kamar: string; kode_rumah: string } | null };
type Payment = { id: number; periode: string; jumlah: number; tanggal_jatuh_tempo: string; status: string };
type Contract = { id: number; nomor_kontrak: string; tanggal_mulai: string; tanggal_berakhir: string; status: string; rooms: { kode_kamar: string; kode_rumah: string } | null; payments: Payment[] | null };
type Tenant = { contracts: Contract[] | null };
type Setting = { key: string; value: string | null };

const statusLabel: Record<string, string> = { pending: "Menunggu", diproses: "Diproses", diterima: "Diterima", ditolak: "Ditolak" };

function currency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

export function AccountPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    void Promise.all([
      supabase.from("booking_requests").select("id, status, created_at, rooms(kode_kamar, kode_rumah)").order("created_at", { ascending: false }),
      supabase.from("tenants").select("id, contracts(id, nomor_kontrak, tanggal_mulai, tanggal_berakhir, status, rooms(kode_kamar, kode_rumah), payments(id, periode, jumlah, tanggal_jatuh_tempo, status))"),
      supabase.from("settings").select("key,value").in("key", ["contact_whatsapp_link", "contact_whatsapp"]),
    ]).then(([bookingResult, tenantResult, settingsResult]) => {
      if (!isMounted) return;
      setBookings((bookingResult.data ?? []) as unknown as Booking[]);
      const tenants = (tenantResult.data ?? []) as unknown as Tenant[];
      setContracts(tenants.flatMap((tenant) => tenant.contracts ?? []));
      const contactSettings = Object.fromEntries(((settingsResult.data ?? []) as Setting[]).map(({ key, value }) => [key, value ?? ""]));
      setWhatsapp(contactSettings.contact_whatsapp_link || contactSettings.contact_whatsapp || "");
    });
    return () => { isMounted = false; };
  }, []);

  const whatsappNumber = whatsapp.replace(/\D/g, "").replace(/^0/, "62");

  function paymentWhatsappLink(payment: Payment, contract: Contract) {
    const room = contract.rooms ? `${contract.rooms.kode_rumah} (${contract.rooms.kode_kamar})` : "rumah petak";
    const message = `Halo, saya ${user?.user_metadata.name ?? user?.email ?? "penyewa"}. Saya ingin melakukan pembayaran sewa rumah petak ${room}. Tagihan periode ${payment.periode} sebesar ${currency(Number(payment.jumlah))}, jatuh tempo ${payment.tanggal_jatuh_tempo}. Mohon kirimkan cara pembayaran.`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  return (
    <section className="account-content">
      <p className="eyebrow">AKUN PELANGGAN</p>
      <h1>Halo, {user?.user_metadata.name ?? user?.email}</h1>
      <p className="auth-copy">Pantau pengajuan dan informasi rumah petak Anda.</p>
      {searchParams.get("booking") ? <p className="success-message">Pengajuan sewa rumah petak berhasil dikirim.</p> : null}
      <div className="account-heading"><h2>Pengajuan saya</h2><Link to="/#kamar">Cari rumah petak ↗</Link></div>
      {bookings.length ? <div className="booking-list">{bookings.map((booking) => <article className="booking-row" key={booking.id}><div><strong>{booking.rooms?.kode_rumah ?? "Rumah petak"} · {booking.rooms?.kode_kamar ?? ""}</strong><span>Diajukan {new Date(booking.created_at).toLocaleDateString("id-ID")}</span></div><span className={`status-pill status-${booking.status}`}>{statusLabel[booking.status] ?? booking.status}</span></article>)}</div> : <div className="empty-state">Anda belum memiliki pengajuan sewa rumah petak.</div>}
      {contracts.length ? <><div className="account-heading"><h2>Kontrak & pembayaran</h2></div><div className="booking-list">{contracts.map((contract) => <article className="contract-row" key={contract.id}>
        <div className="contract-heading"><div><strong>{contract.rooms?.kode_rumah ?? "Rumah petak"} · {contract.rooms?.kode_kamar ?? ""}</strong><span>Kontrak {contract.nomor_kontrak} · {contract.tanggal_mulai} – {contract.tanggal_berakhir}</span></div><span className="status-pill">{contract.status}</span></div>
        {contract.payments?.length ? <div className="payment-list">{contract.payments.map((payment) => <div className="payment-row" key={payment.id}>
          <span>{payment.periode} · jatuh tempo {payment.tanggal_jatuh_tempo}</span>
          <strong>{currency(Number(payment.jumlah))}</strong>
          <span className={`status-pill status-${payment.status}`}>{payment.status === "lunas" ? "Lunas" : payment.status === "terlambat" ? "Terlambat" : "Belum bayar"}</span>
          {payment.status !== "lunas" ? whatsappNumber ? <a className="primary-button payment-whatsapp" href={paymentWhatsappLink(payment, contract)} target="_blank" rel="noreferrer">Bayar via WhatsApp ↗</a> : <span className="auth-copy">Hubungi pengelola untuk nomor WhatsApp pembayaran.</span> : null}
        </div>)}</div> : null}
      </article>)}</div></> : null}
    </section>
  );
}
