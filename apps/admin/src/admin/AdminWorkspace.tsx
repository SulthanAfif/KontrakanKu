import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";

const customerUrl = process.env.EXPO_PUBLIC_CUSTOMER_URL || "http://localhost:5173";

type Tab = "Ringkasan" | "Rumah Petak" | "Penyewa" | "Booking" | "Kontrak" | "Pembayaran" | "Pengaturan";
type RoomStatus = "kosong" | "terisi" | "maintenance";
type Room = { id: number; kode_kamar: string; kode_rumah: string; deskripsi: string | null; harga_sewa: number; status: RoomStatus; lantai: number; kapasitas: number; fasilitas: string[]; foto: string[] };
type Tenant = { id: number; user_id: string | null; nama_lengkap: string; nik: string; no_hp: string; email: string | null; alamat_asal: string | null; kontak_darurat: string | null; no_hp_darurat: string | null; status: "aktif" | "nonaktif" };
type Booking = { id: number; user_id: string; room_id: number; nama_lengkap: string; nik: string | null; no_hp: string; email: string | null; alamat_asal: string | null; kontak_darurat: string | null; no_hp_darurat: string | null; tanggal_mulai_diinginkan: string | null; pesan: string | null; status: "pending" | "diproses" | "diterima" | "ditolak"; created_at: string; rooms: { kode_kamar: string; kode_rumah: string } | null };
type Contract = { id: number; nomor_kontrak: string; room_id: number; tenant_id: number; tanggal_mulai: string; tanggal_berakhir: string; harga_sewa: number; deposit: number; status: "aktif" | "berakhir" | "dibatalkan"; catatan: string | null };
type Payment = { id: number; contract_id: number; periode: string; jumlah: number; tanggal_jatuh_tempo: string; tanggal_bayar: string | null; status: "belum_bayar" | "lunas" | "terlambat"; metode_bayar: string | null; bukti_transfer: string | null; catatan: string | null };
type Setting = { key: string; value: string | null };
type Choice = { value: string; label: string };

const tabs: Tab[] = ["Ringkasan", "Rumah Petak", "Penyewa", "Booking", "Kontrak", "Pembayaran", "Pengaturan"];
const tabLabels: Record<Tab, string> = { Ringkasan: "Beranda admin", "Rumah Petak": "Rumah Petak", Penyewa: "Penyewa", Booking: "Pengajuan sewa", Kontrak: "Kontrak sewa", Pembayaran: "Tagihan & pembayaran", Pengaturan: "Kontak & pengaturan" };
const tabGuidance: Record<Tab, string> = {
  Ringkasan: "Ikuti panduan singkat di bawah untuk mulai mengelola rumah petak.",
  "Rumah Petak": "Tambahkan unit, isi harga sewa tahunan, lalu unggah foto dan pilih fasilitas.",
  Penyewa: "Simpan biodata orang yang menyewa. Data ini diperlukan sebelum membuat kontrak.",
  Booking: "Tinjau pengajuan calon penyewa. Buat data penyewa sebelum membuat kontrak.",
  Kontrak: "Pilih rumah petak dan penyewa. Tagihan tahunan akan dibuat otomatis saat kontrak aktif disimpan.",
  Pembayaran: "Lihat tagihan tahunan, catat pembayaran, dan unggah foto bukti bayar bila ada.",
  Pengaturan: "Atur nomor WhatsApp, email, alamat, dan jam layanan yang tampil di sisi customer.",
};
const roomStatuses: RoomStatus[] = ["kosong", "terisi", "maintenance"];
const roomStatusLabels: Record<RoomStatus, string> = { kosong: "Tersedia", terisi: "Terisi", maintenance: "Perbaikan" };
const facilityOptions = ["Ruang tamu", "Ruang makan", "Ruang keluarga", "Ruang tidur 2", "Kamar mandi", "Dapur", "Sumur bor"];
const contractStatuses: Contract["status"][] = ["aktif", "berakhir", "dibatalkan"];
const paymentStatuses: Payment["status"][] = ["belum_bayar", "lunas", "terlambat"];
const paymentStatusLabels: Record<Payment["status"], string> = { belum_bayar: "Belum dibayar", lunas: "Lunas", terlambat: "Terlambat" };
const contractStatusLabels: Record<Contract["status"], string> = { aktif: "Berjalan", berakhir: "Selesai", dibatalkan: "Dibatalkan" };
const bookingStatusLabels: Record<Booking["status"], string> = { pending: "Menunggu", diproses: "Sedang diproses", diterima: "Diterima", ditolak: "Ditolak" };
const settingDefinitions = [
  { key: "contact_whatsapp", label: "Nomor WhatsApp pengelola" },
  { key: "contact_whatsapp_link", label: "Nomor WhatsApp tujuan tombol chat" },
  { key: "contact_email", label: "Email kontak" },
  { key: "contact_address", label: "Alamat" },
  { key: "contact_hours", label: "Jam layanan" },
];

const emptyRoom = (): Omit<Room, "id"> => ({ kode_kamar: "", kode_rumah: "", deskripsi: "", harga_sewa: 0, status: "kosong", lantai: 1, kapasitas: 1, fasilitas: [], foto: [] });
const emptyTenant = (): Omit<Tenant, "id"> => ({ user_id: null, nama_lengkap: "", nik: "", no_hp: "", email: "", alamat_asal: "", kontak_darurat: "", no_hp_darurat: "", status: "aktif" });
const emptyContract = (): Omit<Contract, "id"> => { const startDate = todayIso(); return { nomor_kontrak: "", room_id: 0, tenant_id: 0, tanggal_mulai: startDate, tanggal_berakhir: addOneYear(startDate), harga_sewa: 0, deposit: 0, status: "aktif", catatan: "" }; };
const emptyPayment = (): Omit<Payment, "id"> => ({ contract_id: 0, periode: new Date().getFullYear().toString(), jumlah: 0, tanggal_jatuh_tempo: todayIso(), tanggal_bayar: null, status: "belum_bayar", metode_bayar: "", bukti_transfer: "", catatan: "" });

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function addOneYear(dateValue: string) {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]) + 1;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${match[2]}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function friendlyDate(value: string | null | undefined) {
  if (!value) return "belum ditentukan";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function generateContractNumber(contracts: Contract[]) {
  const year = new Date().getFullYear();
  const prefix = `KON-${year}-`;
  const numbers = contracts
    .map((contract) => contract.nomor_kontrak)
    .filter((nomor) => typeof nomor === "string" && nomor.startsWith(prefix))
    .map((nomor) => Number(nomor.slice(prefix.length)))
    .filter((num) => Number.isInteger(num) && num > 0);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function parseRentAmount(input: string) {
  const value = input.trim().toLowerCase().replace(/^rp\.?\s*/, "").replace(/\s*rupiah$/, "").replace(/\s*\/?\s*tahun$/, "");
  const match = value.match(/^([\d.,]+)\s*(juta|jt|ribu|rb)?$/);
  if (!match) return 0;
  const suffix = match[2];
  let numeric = match[1];
  if (suffix) {
    numeric = numeric.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const amount = Number(numeric);
    return Number.isFinite(amount) ? Math.round(amount * (suffix === "juta" || suffix === "jt" ? 1_000_000 : 1_000)) : 0;
  }
  numeric = numeric.replace(/\D/g, "");
  const amount = Number(numeric);
  return Number.isFinite(amount) ? amount : 0;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: "default" | "numeric" | "email-address" | "phone-pad" | "url"; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} placeholder={placeholder ?? label} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} autoCapitalize={keyboardType === "email-address" || keyboardType === "url" ? "none" : undefined} /></View>;
}

function Choices({ label, options, value, onChange }: { label: string; options: Choice[]; value: string; onChange: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{options.map((option) => <TouchableOpacity key={option.value} style={[styles.choice, value === option.value && styles.choiceActive]} onPress={() => onChange(option.value)}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></TouchableOpacity>)}</ScrollView></View>;
}

function Button({ label, onPress, secondary, danger, disabled, large }: { label: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean; large?: boolean }) {
  return <TouchableOpacity disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, disabled && styles.buttonDisabled, large && styles.buttonLarge]} onPress={onPress}><Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, danger && styles.buttonDangerText, large && styles.buttonTextLarge]}>{label}</Text></TouchableOpacity>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={styles.panel}><View style={styles.panelHeading}><Text style={styles.panelTitle}>{title}</Text>{subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}</View>{children}</View>;
}

function DashboardCharts({ rooms, payments }: { rooms: Room[]; payments: Payment[] }) {
  const segments = [
    { label: "Terisi", value: rooms.filter((room) => room.status === "terisi").length, color: "#315c45" },
    { label: "Tersedia", value: rooms.filter((room) => room.status === "kosong").length, color: "#8fb79a" },
    { label: "Perawatan", value: rooms.filter((room) => room.status === "maintenance").length, color: "#d9b58b" },
  ];
  const total = rooms.length;
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = payments.filter((payment) => payment.status === "lunas" && payment.tanggal_bayar?.slice(0, 7) === key).reduce((sum, payment) => sum + Number(payment.jumlah), 0);
    return { key, label: new Intl.DateTimeFormat("id-ID", { month: "short" }).format(date), amount };
  });
  const maxAmount = Math.max(...months.map((month) => month.amount), 1);

  return <View style={styles.chartGrid}>
    <Panel title="Kondisi rumah petak" subtitle={`${total} unit terdaftar`}>
      {total ? <><View style={styles.stackedBar}>{segments.filter((segment) => segment.value > 0).map((segment) => <View key={segment.label} style={{ width: `${(segment.value / total) * 100}%`, height: "100%", backgroundColor: segment.color }} />)}</View><View style={styles.legend}>{segments.map((segment) => <View key={segment.label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: segment.color }]} /><Text style={styles.legendText}>{segment.label} · {segment.value}</Text></View>)}</View></> : <Text style={styles.empty}>Belum ada data unit.</Text>}
    </Panel>
    <Panel title="Pembayaran lunas" subtitle="Pemasukan tercatat · 6 bulan terakhir">
      <View style={styles.barChart}>{months.map((month) => <View key={month.key} style={styles.barColumn}><Text style={styles.barValue}>{month.amount ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1 }).format(month.amount) : "—"}</Text><View style={styles.barTrack}><View style={[styles.barFill, { height: `${month.amount ? Math.max((month.amount / maxAmount) * 100, 8) : 0}%` }]} /></View><Text style={styles.barLabel}>{month.label}</Text></View>)}</View>
    </Panel>
  </View>;
}

function SimpleMenuButton({ icon, label, detail, onPress }: { icon: string; label: string; detail: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.simpleMenuButton} onPress={onPress}>
    <Text style={styles.simpleMenuIcon}>{icon}</Text>
    <Text style={styles.simpleMenuLabel}>{label}</Text>
    <Text style={styles.simpleMenuDetail}>{detail}</Text>
  </TouchableOpacity>;
}

export function AdminWorkspace({ onSignOut, userEmail, notificationOpenId = 0, notificationRefreshId = 0 }: { onSignOut: () => void; userEmail?: string; notificationOpenId?: number; notificationRefreshId?: number }) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 1050;
  const [activeTab, setActiveTab] = useState<Tab>("Ringkasan");
  useEffect(() => {
    if (notificationOpenId) { setSimpleMode(false); setActiveTab("Booking"); setSearch(""); }
  }, [notificationOpenId]);
  useEffect(() => {
    if (notificationRefreshId || notificationOpenId) setRefresh((value) => value + 1);
  }, [notificationRefreshId, notificationOpenId]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [simpleMode, setSimpleMode] = useState(true);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [autoNote, setAutoNote] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const loadedOnce = useRef(false);
  const acceptingRef = useRef<number | null>(null);

  const [roomDraft, setRoomDraft] = useState(emptyRoom());
  const [roomPriceInput, setRoomPriceInput] = useState("");
  const [roomCapacityInput, setRoomCapacityInput] = useState("1");
  const [editingRoom, setEditingRoom] = useState<number | null>(null);
  const [roomImages, setRoomImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [tenantDraft, setTenantDraft] = useState(emptyTenant());
  const [editingTenant, setEditingTenant] = useState<number | null>(null);
  const [contractDraft, setContractDraft] = useState(emptyContract());
  const [editingContract, setEditingContract] = useState<number | null>(null);
  const [paymentDraft, setPaymentDraft] = useState(emptyPayment());
  const [editingPayment, setEditingPayment] = useState<number | null>(null);
  const [paymentProofImage, setPaymentProofImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pageViewCount, setPageViewCount] = useState(0);
  const [pageViewToday, setPageViewToday] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      if (!loadedOnce.current) setLoading(true);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const results = await Promise.all([
        supabase.from("rooms").select("id,kode_kamar,kode_rumah,deskripsi,harga_sewa,status,lantai,kapasitas,fasilitas,foto").order("kode_kamar"),
        supabase.from("tenants").select("id,user_id,nama_lengkap,nik,no_hp,email,alamat_asal,kontak_darurat,no_hp_darurat,status").order("nama_lengkap"),
        supabase.from("booking_requests").select("id,user_id,room_id,nama_lengkap,nik,no_hp,email,alamat_asal,kontak_darurat,no_hp_darurat,tanggal_mulai_diinginkan,pesan,status,created_at,rooms(kode_kamar,kode_rumah)").order("created_at", { ascending: false }),
        supabase.from("contracts").select("id,nomor_kontrak,room_id,tenant_id,tanggal_mulai,tanggal_berakhir,harga_sewa,deposit,status,catatan").order("tanggal_mulai", { ascending: false }),
        supabase.from("payments").select("id,contract_id,periode,jumlah,tanggal_jatuh_tempo,tanggal_bayar,status,metode_bayar,bukti_transfer,catatan").order("tanggal_jatuh_tempo", { ascending: true }),
        supabase.from("settings").select("key,value").order("key"),
        supabase.from("page_views").select("id", { count: "exact", head: true }),
        supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      ]);
      if (!mounted) return;
      const errors = results.filter((result) => result.error).map((result) => result.error?.message).filter(Boolean);
      if (errors.length) setNotice(`Sebagian data gagal dimuat: ${errors[0]}`);

      const loadedRooms = (results[0].data ?? []) as Room[];
      const loadedTenants = (results[1].data ?? []) as Tenant[];
      const loadedBookings = (results[2].data ?? []) as unknown as Booking[];
      const loadedContracts = (results[3].data ?? []) as Contract[];
      const loadedPayments = (results[4].data ?? []) as Payment[];
      const loadedSettings = (results[5].data ?? []) as Setting[];

      // Automatic housekeeping so the admin never has to update statuses by hand:
      // late invoices are flagged, finished contracts are closed, and their rooms freed.
      const today = todayIso();
      const latePayments = loadedPayments.filter((payment) => payment.status === "belum_bayar" && payment.tanggal_jatuh_tempo < today);
      const expiredContracts = loadedContracts.filter((contract) => contract.status === "aktif" && contract.tanggal_berakhir < today);
      const stillActiveRooms = new Set(loadedContracts.filter((contract) => contract.status === "aktif" && contract.tanggal_berakhir >= today).map((contract) => contract.room_id));
      const roomsToFree = Array.from(new Set(expiredContracts.map((contract) => contract.room_id))).filter((roomId) => !stillActiveRooms.has(roomId));

      let nextRooms = loadedRooms;
      let nextContracts = loadedContracts;
      let nextPayments = loadedPayments;

      if (latePayments.length) {
        const { error } = await supabase.from("payments").update({ status: "terlambat" }).in("id", latePayments.map((payment) => payment.id));
        if (!error) nextPayments = loadedPayments.map((payment) => latePayments.some((late) => late.id === payment.id) ? { ...payment, status: "terlambat" as const } : payment);
      }
      if (expiredContracts.length) {
        const { error } = await supabase.from("contracts").update({ status: "berakhir" }).in("id", expiredContracts.map((contract) => contract.id));
        if (!error) nextContracts = loadedContracts.map((contract) => expiredContracts.some((expired) => expired.id === contract.id) ? { ...contract, status: "berakhir" as const } : contract);
      }
      if (roomsToFree.length) {
        const { error } = await supabase.from("rooms").update({ status: "kosong" }).in("id", roomsToFree).eq("status", "terisi");
        if (!error) nextRooms = loadedRooms.map((room) => roomsToFree.includes(room.id) && room.status === "terisi" ? { ...room, status: "kosong" as const } : room);
      }

      if (!mounted) return;
      setRooms(nextRooms);
      setTenants(loadedTenants);
      setBookings(loadedBookings);
      setContracts(nextContracts);
      setPayments(nextPayments);
      setSettings(loadedSettings);
      setSettingsDraft(Object.fromEntries(loadedSettings.map((item) => [item.key, item.value ?? ""])));
      setPageViewCount(results[6]?.count ?? 0);
      setPageViewToday(results[7]?.count ?? 0);
      setAutoNote(latePayments.length || expiredContracts.length
        ? `${latePayments.length} tagihan ditandai terlambat dan ${expiredContracts.length} kontrak selesai diperbarui otomatis.`
        : "");
      setLastUpdated(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
      loadedOnce.current = true;
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [refresh]);

  // Keep the data fresh without asking the admin to press a refresh button.
  useEffect(() => {
    const timer = setInterval(() => setRefresh((value) => value + 1), 45_000);
    return () => clearInterval(timer);
  }, []);

  const filteredRooms = useMemo(() => rooms.filter((item) => `${item.kode_kamar} ${item.kode_rumah} ${item.status}`.toLowerCase().includes(search.toLowerCase())), [rooms, search]);
  const filteredTenants = useMemo(() => tenants.filter((item) => `${item.nama_lengkap} ${item.nik} ${item.no_hp}`.toLowerCase().includes(search.toLowerCase())), [tenants, search]);
  const filteredBookings = useMemo(() => bookings.filter((item) => `${item.nama_lengkap} ${item.nik ?? ""} ${item.no_hp} ${item.email ?? ""} ${item.status}`.toLowerCase().includes(search.toLowerCase())), [bookings, search]);
  const filteredContracts = useMemo(() => contracts.filter((item) => `${item.nomor_kontrak} ${tenants.find((tenant) => tenant.id === item.tenant_id)?.nama_lengkap ?? ""}`.toLowerCase().includes(search.toLowerCase())), [contracts, tenants, search]);
  const filteredPayments = useMemo(() => payments.filter((item) => `${item.periode} ${item.status} ${contracts.find((contract) => contract.id === item.contract_id)?.nomor_kontrak ?? ""}`.toLowerCase().includes(search.toLowerCase())), [payments, contracts, search]);

  const pendingBookings = bookings.filter((booking) => booking.status === "pending" || booking.status === "diproses");
  const unpaidPayments = payments.filter((payment) => payment.status !== "lunas");
  const occupiedRooms = rooms.filter((room) => room.status === "terisi").length;

  function done(message: string) {
    setNotice(message);
    setSaving(false);
    setRefresh((value) => value + 1);
  }

  function openCustomerSite() {
    if (Platform.OS === "web") {
      window.open(customerUrl, "_blank", "noopener,noreferrer");
      return;
    }
    void Linking.openURL(customerUrl);
  }

  function failed(error: { message: string; code?: string }, duplicateMessage: string) {
    setSaving(false);
    setNotice(error.code === "23505" ? duplicateMessage : error.message);
  }

  async function chooseRoomImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 8, quality: 0.8, base64: Platform.OS !== "web" });
      if (!result.canceled) setRoomImages((current) => [...current, ...result.assets].slice(0, 8));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Tidak dapat membuka pemilih gambar.");
    }
  }

  async function choosePaymentProof() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.85, base64: Platform.OS !== "web" });
      if (!result.canceled) setPaymentProofImage(result.assets[0] ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Tidak dapat membuka pemilih foto bukti bayar.");
    }
  }

  async function viewPaymentProof(path: string) {
    if (!supabase) return;
    if (path.startsWith("http")) {
      if (Platform.OS === "web") window.open(path, "_blank", "noopener,noreferrer");
      else void Linking.openURL(path);
      return;
    }
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { setNotice(error?.message ?? "Bukti bayar tidak dapat dibuka."); return; }
    if (Platform.OS === "web") window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else void Linking.openURL(data.signedUrl);
  }

  async function saveRoom() {
    if (!supabase) return;
    const rentAmount = parseRentAmount(roomPriceInput);
    if (!roomDraft.kode_rumah.trim() || rentAmount <= 0 || !Number.isInteger(Number(roomCapacityInput)) || Number(roomCapacityInput) < 1) {
      setNotice("Nama rumah petak dan harga sewa wajib diisi, kapasitas minimal 1 orang.");
      return;
    }
    setSaving(true);
    let photoUrls = [...(roomDraft.foto ?? [])];
    const uploadedPaths: string[] = [];
    for (const roomImage of roomImages) {
      if (roomImage.fileSize && roomImage.fileSize > 5 * 1024 * 1024) { setSaving(false); setNotice("Ukuran setiap foto maksimal 5 MB."); return; }
      const originalExtension = roomImage.fileName?.split(".").pop()?.toLowerCase();
      const mimeType = Platform.OS !== "web" && roomImage.base64 ? "image/jpeg" : roomImage.mimeType ?? (originalExtension === "png" ? "image/png" : originalExtension === "webp" ? "image/webp" : "image/jpeg");
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) { setSaving(false); setNotice("Format gambar harus JPG, PNG, atau WebP."); return; }
    }
    for (const roomImage of roomImages) {
      const originalExtension = roomImage.fileName?.split(".").pop()?.toLowerCase();
      const mimeType = Platform.OS !== "web" && roomImage.base64 ? "image/jpeg" : roomImage.mimeType ?? (originalExtension === "png" ? "image/png" : originalExtension === "webp" ? "image/webp" : "image/jpeg");
      const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const storagePath = `rooms/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
      try {
        const body = Platform.OS === "web" && roomImage.file ? roomImage.file : roomImage.base64 ? decode(roomImage.base64) : await (await fetch(roomImage.uri)).arrayBuffer();
        const { data, error } = await supabase.storage.from("room-photos").upload(storagePath, body, { contentType: mimeType, cacheControl: "3600", upsert: false });
        if (error) throw error;
        uploadedPaths.push(data.path);
        photoUrls.push(supabase.storage.from("room-photos").getPublicUrl(data.path).data.publicUrl);
      } catch (error) {
        if (uploadedPaths.length) await supabase.storage.from("room-photos").remove(uploadedPaths);
        setSaving(false);
        setNotice(error instanceof Error ? `Foto gagal diunggah: ${error.message}` : "Foto gagal diunggah.");
        return;
      }
    }
    const existingCodes = new Set(rooms.filter((room) => room.id !== editingRoom).map((room) => room.kode_kamar.toLowerCase()));
    let generatedCode = roomDraft.kode_kamar.trim();
    if (!generatedCode) {
      let sequence = 1;
      do { generatedCode = `RP-${String(sequence++).padStart(3, "0")}`; } while (existingCodes.has(generatedCode.toLowerCase()));
    }
    const payload = { ...roomDraft, kode_kamar: generatedCode, kode_rumah: roomDraft.kode_rumah.trim(), harga_sewa: rentAmount, lantai: Number(roomDraft.lantai), kapasitas: Number(roomCapacityInput), deskripsi: roomDraft.deskripsi?.trim() || null, foto: photoUrls, fasilitas: roomDraft.fasilitas.filter((facility) => facilityOptions.includes(facility)) };
    const result = editingRoom ? await supabase.from("rooms").update(payload).eq("id", editingRoom) : await supabase.from("rooms").insert(payload);
    if (result.error) {
      if (uploadedPaths.length) await supabase.storage.from("room-photos").remove(uploadedPaths);
      failed(result.error, "Kode kamar atau kode rumah tersebut sudah digunakan.");
      return;
    }
    setRoomDraft(emptyRoom()); setRoomPriceInput(""); setRoomCapacityInput("1"); setRoomImages([]); setEditingRoom(null); done(editingRoom ? "Data rumah petak diperbarui." : "Rumah petak berhasil ditambahkan.");
  }

  async function setRoomStatus(room: Room, status: RoomStatus) {
    if (!supabase) return;
    const { error } = await supabase.from("rooms").update({ status }).eq("id", room.id);
    if (error) { setNotice(error.message); return; }
    done(`Status ${room.kode_kamar} diubah menjadi ${status}.`);
  }

  async function saveTenant() {
    if (!supabase) return;
    if (!tenantDraft.nama_lengkap.trim() || !tenantDraft.nik.trim() || !tenantDraft.no_hp.trim()) { setNotice("Nama, NIK, dan nomor telepon wajib diisi."); return; }
    setSaving(true);
    const payload = { ...tenantDraft, nama_lengkap: tenantDraft.nama_lengkap.trim(), nik: tenantDraft.nik.trim(), no_hp: tenantDraft.no_hp.trim(), email: tenantDraft.email?.trim() || null, alamat_asal: tenantDraft.alamat_asal?.trim() || null, kontak_darurat: tenantDraft.kontak_darurat?.trim() || null, no_hp_darurat: tenantDraft.no_hp_darurat?.trim() || null };
    const result = editingTenant ? await supabase.from("tenants").update(payload).eq("id", editingTenant) : await supabase.from("tenants").insert(payload);
    if (result.error) { failed(result.error, "NIK ini sudah terdaftar."); return; }
    setTenantDraft(emptyTenant()); setEditingTenant(null); done(editingTenant ? "Data penyewa diperbarui." : "Data penyewa ditambahkan.");
  }

  async function updateBooking(booking: Booking, status: Booking["status"]) {
    if (!supabase) return;
    const { error } = await supabase.from("booking_requests").update({ status }).eq("id", booking.id);
    if (error) { setNotice(error.message); return; }
    done(`Pengajuan ${booking.nama_lengkap} diperbarui menjadi ${status}.`);
  }

  async function createTenantFromBooking(booking: Booking) {
    setTenantDraft({ ...emptyTenant(), user_id: booking.user_id, nama_lengkap: booking.nama_lengkap, nik: booking.nik ?? "", no_hp: booking.no_hp, email: booking.email ?? "", alamat_asal: booking.alamat_asal ?? "", kontak_darurat: booking.kontak_darurat ?? "", no_hp_darurat: booking.no_hp_darurat ?? "" });
    setEditingTenant(null);
    setActiveTab("Penyewa");
    setNotice("Lengkapi NIK dan data penyewa, lalu simpan.");
  }

  async function acceptBookingAndCreateContract(booking: Booking) {
    if (!supabase) return;
    setSaving(true);
    const existingTenant = tenants.find((tenant) => tenant.user_id === booking.user_id) || tenants.find((tenant) => tenant.nik && booking.nik && tenant.nik === booking.nik);
    let tenantId: number;
    if (!existingTenant) {
      const payload = {
        user_id: booking.user_id,
        nama_lengkap: booking.nama_lengkap.trim(),
        nik: (booking.nik ?? "").replace(/\D/g, "") || "",
        no_hp: booking.no_hp.trim(),
        email: booking.email?.trim() || null,
        alamat_asal: booking.alamat_asal?.trim() || null,
        kontak_darurat: booking.kontak_darurat?.trim() || null,
        no_hp_darurat: booking.no_hp_darurat?.trim() || null,
        status: "aktif" as const,
      };
      if (payload.nik.length !== 16) { setSaving(false); setNotice("NIK calon penyewa harus 16 angka. Lengkapi data di pengajuan atau buat penyewa manual terlebih dahulu."); return; }
      const { data, error } = await supabase.from("tenants").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); failed(error ?? { message: "Gagal menyimpan data penyewa." }, "NIK ini sudah terdaftar. Coba hubungkan ke penyewa yang ada."); return; }
      tenantId = data.id;
    } else {
      tenantId = existingTenant.id;
      const payload = {
        nama_lengkap: booking.nama_lengkap.trim(),
        nik: (booking.nik ?? existingTenant.nik).replace(/\D/g, ""),
        no_hp: booking.no_hp.trim(),
        email: booking.email?.trim() || existingTenant.email,
        alamat_asal: booking.alamat_asal?.trim() || existingTenant.alamat_asal,
        kontak_darurat: booking.kontak_darurat?.trim() || existingTenant.kontak_darurat,
        no_hp_darurat: booking.no_hp_darurat?.trim() || existingTenant.no_hp_darurat,
        status: "aktif" as const,
      };
      if (payload.nik && payload.nik.length !== 16) { setSaving(false); setNotice("NIK calon penyewa harus 16 angka."); return; }
      await supabase.from("tenants").update(payload).eq("id", tenantId);
    }
    const { error: updateBookingError } = await supabase.from("booking_requests").update({ status: "diterima" }).eq("id", booking.id);
    if (updateBookingError) { setSaving(false); setNotice(updateBookingError.message); return; }
    const room = rooms.find((item) => item.id === booking.room_id);
    const startDate = booking.tanggal_mulai_diinginkan || new Date().toISOString().slice(0, 10);
    setContractDraft({ ...emptyContract(), room_id: booking.room_id, tenant_id: tenantId, nomor_kontrak: generateContractNumber(contracts), tanggal_mulai: startDate, tanggal_berakhir: addOneYear(startDate), harga_sewa: room?.harga_sewa ?? 0, deposit: 0, status: "aktif" });
    setEditingContract(null);
    setActiveTab("Kontrak");
    setSaving(false);
    setRefresh((value) => value + 1);
    setNotice("Pengajuan diterima. Penyewa siap, kontrak sudah terisi otomatis. Simpan kontrak untuk membuat tagihan tahunan.");
  }

  async function autoAcceptBooking(booking: Booking) {
    if (!supabase || acceptingRef.current !== null) return;
    acceptingRef.current = booking.id;
    setAcceptingId(booking.id);
    setNotice("");
    try {
      const nik = (booking.nik ?? "").replace(/\D/g, "");
      const existingTenant = tenants.find((tenant) => tenant.user_id === booking.user_id) || (nik ? tenants.find((tenant) => tenant.nik === nik) : undefined);
      if (!existingTenant && nik.length !== 16) {
        setNotice("NIK pengaju belum lengkap (harus 16 angka). Buka mode lengkap untuk melengkapi NIK, lalu terima pengajuan.");
        return;
      }
      const room = rooms.find((item) => item.id === booking.room_id);
      if (!room) {
        setNotice("Rumah petak pada pengajuan ini tidak ditemukan. Muat ulang data lalu coba lagi.");
        return;
      }
      if (contracts.some((contract) => contract.room_id === booking.room_id && contract.status === "aktif")) {
        setNotice("Rumah petak ini sudah memiliki kontrak aktif. Selesaikan kontrak lama terlebih dahulu.");
        return;
      }

      let tenantId = existingTenant?.id ?? 0;
      if (existingTenant) {
        await supabase.from("tenants").update({
          nama_lengkap: booking.nama_lengkap.trim(),
          no_hp: booking.no_hp.trim(),
          email: booking.email?.trim() || existingTenant.email,
          alamat_asal: booking.alamat_asal?.trim() || existingTenant.alamat_asal,
          kontak_darurat: booking.kontak_darurat?.trim() || existingTenant.kontak_darurat,
          no_hp_darurat: booking.no_hp_darurat?.trim() || existingTenant.no_hp_darurat,
          status: "aktif",
        }).eq("id", existingTenant.id);
      } else {
        const { data, error } = await supabase.from("tenants").insert({
          user_id: booking.user_id,
          nama_lengkap: booking.nama_lengkap.trim(),
          nik,
          no_hp: booking.no_hp.trim(),
          email: booking.email?.trim() || null,
          alamat_asal: booking.alamat_asal?.trim() || null,
          kontak_darurat: booking.kontak_darurat?.trim() || null,
          no_hp_darurat: booking.no_hp_darurat?.trim() || null,
          status: "aktif",
        }).select("id").single();
        if (error || !data) {
          setNotice(error?.code === "23505" ? "NIK ini sudah terdaftar sebagai penyewa. Buka mode lengkap untuk menghubungkan data." : error?.message ?? "Data penyewa gagal disimpan.");
          return;
        }
        tenantId = data.id;
      }

      const startDate = booking.tanggal_mulai_diinginkan || todayIso();
      const endDate = addOneYear(startDate) || addOneYear(todayIso());
      const { data: contractRow, error: contractError } = await supabase.from("contracts").insert({
        nomor_kontrak: generateContractNumber(contracts),
        room_id: booking.room_id,
        tenant_id: tenantId,
        tanggal_mulai: startDate,
        tanggal_berakhir: endDate,
        harga_sewa: room.harga_sewa,
        deposit: 0,
        status: "aktif",
        catatan: `Dibuat otomatis dari pengajuan tanggal ${new Date(booking.created_at).toLocaleDateString("id-ID")}.`,
      }).select("id").single();
      if (contractError || !contractRow) {
        setNotice(contractError?.code === "23505" ? "Nomor kontrak bentrok. Tekan terima sekali lagi untuk mencoba nomor berikutnya." : contractError?.message ?? "Kontrak gagal dibuat.");
        return;
      }
      // Keep the annual invoices automatic even if the database trigger has not run yet.
      const invoiceRows: { contract_id: number; periode: string; jumlah: number; tanggal_jatuh_tempo: string; status: "belum_bayar" | "terlambat" }[] = [];
      let chargeDate: string = startDate;
      let guard = 0;
      while (chargeDate && chargeDate < endDate && guard < 30) {
        invoiceRows.push({
          contract_id: contractRow.id,
          periode: String(Number(chargeDate.slice(0, 4))),
          jumlah: room.harga_sewa,
          tanggal_jatuh_tempo: chargeDate,
          status: chargeDate < todayIso() ? "terlambat" : "belum_bayar",
        });
        chargeDate = addOneYear(chargeDate);
        guard += 1;
      }
      if (invoiceRows.length) await supabase.from("payments").upsert(invoiceRows, { onConflict: "contract_id,periode", ignoreDuplicates: true });
      await supabase.from("booking_requests").update({ status: "diterima" }).eq("id", booking.id);
      await supabase.from("rooms").update({ status: "terisi" }).eq("id", booking.room_id);
      setNotice(`Selesai otomatis: ${booking.nama_lengkap} diterima, kontrak dibuat, dan tagihan tahunan sudah disiapkan.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan saat memproses pengajuan. Coba lagi.");
    } finally {
      acceptingRef.current = null;
      setAcceptingId(null);
    }
  }

  async function saveContract() {
    if (!supabase) return;
    if (!contractDraft.room_id) { setNotice("Pilih rumah petak untuk kontrak ini."); return; }
    if (!contractDraft.tenant_id) { setNotice(tenantChoices.length ? "Pilih penyewa untuk kontrak ini." : "Belum ada penyewa aktif. Tambahkan data penyewa terlebih dahulu."); return; }
    if (!contractDraft.tanggal_mulai || !contractDraft.tanggal_berakhir || Number(contractDraft.harga_sewa) <= 0) { setNotice("Lengkapi tanggal mulai, tanggal berakhir, dan harga sewa."); return; }
    if (contractDraft.tanggal_berakhir < contractDraft.tanggal_mulai) { setNotice("Tanggal akhir harus setelah tanggal mulai."); return; }
    const conflict = contracts.some((item) => item.id !== editingContract && item.room_id === Number(contractDraft.room_id) && item.status === "aktif" && contractDraft.status === "aktif");
    if (conflict) { setNotice("Kamar sudah memiliki kontrak aktif."); return; }
    setSaving(true);
    const nomorKontrak = contractDraft.nomor_kontrak.trim() || generateContractNumber(contracts);
    const payload = { ...contractDraft, nomor_kontrak: nomorKontrak, room_id: Number(contractDraft.room_id), tenant_id: Number(contractDraft.tenant_id), harga_sewa: Number(contractDraft.harga_sewa), deposit: Number(contractDraft.deposit) || 0, catatan: contractDraft.catatan?.trim() || null };
    const result = editingContract ? await supabase.from("contracts").update(payload).eq("id", editingContract) : await supabase.from("contracts").insert(payload);
    if (result.error) { failed(result.error, "Nomor kontrak ini sudah digunakan."); return; }
    const roomStatus: RoomStatus = contractDraft.status === "aktif" ? "terisi" : "kosong";
    const { error: roomError } = await supabase.from("rooms").update({ status: roomStatus }).eq("id", Number(contractDraft.room_id));
    setContractDraft(emptyContract()); setEditingContract(null);
    done(roomError ? `Kontrak tersimpan, tetapi status rumah petak gagal diperbarui: ${roomError.message}` : editingContract ? "Kontrak diperbarui dan tagihan tahunan disinkronkan otomatis." : "Kontrak tersimpan dan tagihan tahunan dibuat otomatis.");
  }

  async function savePayment() {
    if (!supabase) return;
    if (!paymentDraft.contract_id || !paymentDraft.periode.trim() || !paymentDraft.tanggal_jatuh_tempo || Number(paymentDraft.jumlah) <= 0) { setNotice("Pilih kontrak dan isi periode, jumlah, serta tanggal jatuh tempo."); return; }
    setSaving(true);
    let proofPath = paymentDraft.bukti_transfer?.trim() || null;
    let uploadedProofPath: string | null = null;
    if (paymentProofImage) {
      if (paymentProofImage.fileSize && paymentProofImage.fileSize > 5 * 1024 * 1024) { setSaving(false); setNotice("Ukuran foto bukti maksimal 5 MB."); return; }
      const originalExtension = paymentProofImage.fileName?.split(".").pop()?.toLowerCase();
      const mimeType = Platform.OS !== "web" && paymentProofImage.base64 ? "image/jpeg" : paymentProofImage.mimeType ?? (originalExtension === "png" ? "image/png" : originalExtension === "webp" ? "image/webp" : "image/jpeg");
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) { setSaving(false); setNotice("Foto bukti harus JPG, PNG, atau WebP."); return; }
      const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const path = `payments/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
      try {
        const body = Platform.OS === "web" && paymentProofImage.file ? paymentProofImage.file : paymentProofImage.base64 ? decode(paymentProofImage.base64) : await (await fetch(paymentProofImage.uri)).arrayBuffer();
        const { data, error } = await supabase.storage.from("payment-proofs").upload(path, body, { contentType: mimeType, cacheControl: "3600", upsert: false });
        if (error) throw error;
        uploadedProofPath = data.path;
        proofPath = data.path;
      } catch (error) {
        setSaving(false);
        setNotice(error instanceof Error ? `Foto bukti gagal diunggah: ${error.message}` : "Foto bukti gagal diunggah.");
        return;
      }
    }
    const previousProofPath = paymentDraft.bukti_transfer;
    const payload = { ...paymentDraft, contract_id: Number(paymentDraft.contract_id), jumlah: Number(paymentDraft.jumlah), periode: paymentDraft.periode.trim(), tanggal_bayar: paymentDraft.status === "lunas" ? paymentDraft.tanggal_bayar || todayIso() : null, metode_bayar: paymentDraft.metode_bayar?.trim() || null, bukti_transfer: proofPath, catatan: paymentDraft.catatan?.trim() || null };
    const result = editingPayment ? await supabase.from("payments").update(payload).eq("id", editingPayment) : await supabase.from("payments").insert(payload);
    if (result.error) { if (uploadedProofPath) await supabase.storage.from("payment-proofs").remove([uploadedProofPath]); failed(result.error, "Tagihan untuk periode ini sudah ada di kontrak tersebut."); return; }
    if (uploadedProofPath && previousProofPath && !previousProofPath.startsWith("http") && previousProofPath !== uploadedProofPath) await supabase.storage.from("payment-proofs").remove([previousProofPath]);
    setPaymentDraft(emptyPayment()); setPaymentProofImage(null); setEditingPayment(null); done(editingPayment ? "Tagihan diperbarui." : "Tagihan berhasil dibuat.");
  }

  async function markPayment(payment: Payment, status: Payment["status"]) {
    if (!supabase) return;
    const { error } = await supabase.from("payments").update({ status, tanggal_bayar: status === "lunas" ? todayIso() : null }).eq("id", payment.id);
    if (error) { setNotice(error.message); return; }
    done(status === "lunas" ? "Pembayaran ditandai lunas." : `Status pembayaran diubah menjadi ${status}.`);
  }

  async function saveSettings() {
    if (!supabase) return;
    setSaving(true);
    const rows = settingDefinitions.map(({ key }) => ({ key, value: settingsDraft[key] ?? "" }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) { setSaving(false); setNotice(error.message); return; }
    setSettings(rows); done("Pengaturan kontak berhasil disimpan.");
  }

  function editRoom(room: Room) { setRoomDraft({ ...room, fasilitas: (room.fasilitas ?? []).filter((facility) => facilityOptions.includes(facility)), foto: room.foto ?? [] }); setRoomPriceInput(String(room.harga_sewa)); setRoomCapacityInput(String(room.kapasitas)); setRoomImages([]); setEditingRoom(room.id); }
  function editTenant(tenant: Tenant) { setTenantDraft({ ...tenant }); setEditingTenant(tenant.id); }
  function editContract(contract: Contract) { setContractDraft({ ...contract }); setEditingContract(contract.id); }
  function editPayment(payment: Payment) { setPaymentDraft({ ...payment }); setPaymentProofImage(null); setEditingPayment(payment.id); }

  const stats = [
    { label: "Total kamar", value: rooms.length, detail: `${occupiedRooms} sedang terisi`, marker: "01" },
    { label: "Penyewa aktif", value: tenants.filter((tenant) => tenant.status === "aktif").length, detail: `${tenants.length} data terdaftar`, marker: "02" },
    { label: "Pengajuan masuk", value: pendingBookings.length, detail: "Menunggu tindak lanjut", marker: "03" },
    { label: "Tagihan terbuka", value: unpaidPayments.length, detail: "Belum lunas", marker: "04" },
    { label: "Kunjungan website", value: pageViewCount, detail: `${pageViewToday} hari ini`, marker: "05" },
  ];

  const roomForm = <Panel title={editingRoom ? "Edit rumah petak" : "Tambah rumah petak baru"} subtitle="Kelola informasi dan ketersediaan unit. Unit disewakan kosongan tanpa perabot.">
    <View style={styles.formGrid}><Field label="Nama rumah petak *" value={roomDraft.kode_rumah} onChangeText={(v) => setRoomDraft({ ...roomDraft, kode_rumah: v })} placeholder="Contoh: Petak Melati" /><Field label="Harga sewa / tahun *" value={roomPriceInput} onChangeText={setRoomPriceInput} placeholder="Contoh: 15000000 atau 15 juta" /><Field label="Lantai" value={String(roomDraft.lantai)} onChangeText={(v) => setRoomDraft({ ...roomDraft, lantai: Number(v) || 1 })} keyboardType="numeric" /><Field label="Kapasitas orang" value={roomCapacityInput} onChangeText={setRoomCapacityInput} keyboardType="numeric" placeholder="Contoh: 1" /><Field label="Deskripsi" value={roomDraft.deskripsi ?? ""} onChangeText={(v) => setRoomDraft({ ...roomDraft, deskripsi: v })} multiline />
      <View style={styles.field}><Text style={styles.fieldLabel}>Fasilitas</Text><View style={styles.facilityGrid}>{facilityOptions.map((facility) => { const checked = roomDraft.fasilitas.includes(facility); return <TouchableOpacity key={facility} accessibilityRole="checkbox" accessibilityState={{ checked }} style={[styles.facilityChoice, checked && styles.facilityChoiceActive]} onPress={() => setRoomDraft({ ...roomDraft, fasilitas: checked ? roomDraft.fasilitas.filter((item) => item !== facility) : [...roomDraft.fasilitas, facility] })}><View style={[styles.checkbox, checked && styles.checkboxActive]}>{checked ? <Text style={styles.checkboxCheck}>✓</Text> : null}</View><Text style={[styles.facilityText, checked && styles.facilityTextActive]}>{facility}</Text></TouchableOpacity>; })}</View></View>
    </View>
    <Choices label="Ketersediaan rumah petak" value={roomDraft.status} onChange={(v) => setRoomDraft({ ...roomDraft, status: v as RoomStatus })} options={roomStatuses.map((status) => ({ value: status, label: roomStatusLabels[status] }))} />
    <View style={styles.uploadBox}>{roomDraft.foto.length || roomImages.length ? <View style={styles.photoThumbRow}>{roomDraft.foto.map((uri, index) => <Image key={`saved-${uri}-${index}`} source={{ uri }} style={styles.photoThumb} resizeMode="cover" />)}{roomImages.map((image, index) => <Image key={`new-${image.uri}-${index}`} source={{ uri: image.uri }} style={styles.photoThumb} resizeMode="cover" />)}</View> : <Text style={styles.helper}>Pilih sampai 8 foto. JPG, PNG, atau WebP; maksimal 5 MB per foto.</Text>}<View style={styles.formActions}><Button label={roomImages.length ? "Tambah foto lagi" : "Pilih beberapa foto"} secondary onPress={() => void chooseRoomImage()} />{roomImages.length ? <Button label="Hapus pilihan foto baru" secondary onPress={() => setRoomImages([])} /> : null}</View></View>
    <View style={styles.formActions}><Button label={saving ? "Menyimpan..." : editingRoom ? "Simpan perubahan" : "Tambah rumah petak"} onPress={() => void saveRoom()} disabled={saving} />{editingRoom ? <Button label="Batal edit" secondary onPress={() => { setEditingRoom(null); setRoomDraft(emptyRoom()); setRoomPriceInput(""); setRoomCapacityInput("1"); setRoomImages([]); }} /> : null}</View>
  </Panel>;

  const tenantForm = <Panel title={editingTenant ? "Edit penyewa" : "Tambah penyewa"} subtitle="Isi identitas penyewa dan kontak darurat.">
    <View style={styles.formGrid}><Field label="Nama lengkap *" value={tenantDraft.nama_lengkap} onChangeText={(v) => setTenantDraft({ ...tenantDraft, nama_lengkap: v })} /><Field label="NIK *" value={tenantDraft.nik} onChangeText={(v) => setTenantDraft({ ...tenantDraft, nik: v })} keyboardType="numeric" /><Field label="Nomor telepon *" value={tenantDraft.no_hp} onChangeText={(v) => setTenantDraft({ ...tenantDraft, no_hp: v })} keyboardType="phone-pad" /><Field label="Email" value={tenantDraft.email ?? ""} onChangeText={(v) => setTenantDraft({ ...tenantDraft, email: v })} keyboardType="email-address" /><Field label="Alamat asal" value={tenantDraft.alamat_asal ?? ""} onChangeText={(v) => setTenantDraft({ ...tenantDraft, alamat_asal: v })} multiline /><Field label="Nama kontak darurat" value={tenantDraft.kontak_darurat ?? ""} onChangeText={(v) => setTenantDraft({ ...tenantDraft, kontak_darurat: v })} /><Field label="Nomor kontak darurat" value={tenantDraft.no_hp_darurat ?? ""} onChangeText={(v) => setTenantDraft({ ...tenantDraft, no_hp_darurat: v })} keyboardType="phone-pad" /></View>
    <Choices label="Status penyewa" value={tenantDraft.status} onChange={(v) => setTenantDraft({ ...tenantDraft, status: v as Tenant["status"] })} options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} />
    <View style={styles.formActions}><Button label={saving ? "Menyimpan..." : editingTenant ? "Simpan perubahan" : "Tambah penyewa"} onPress={() => void saveTenant()} disabled={saving} />{editingTenant ? <Button label="Batal edit" secondary onPress={() => { setEditingTenant(null); setTenantDraft(emptyTenant()); }} /> : null}</View>
  </Panel>;

  const contractChoices: Choice[] = contracts.map((item) => ({ value: String(item.id), label: item.nomor_kontrak }));
  const roomChoices: Choice[] = rooms.filter((room) => room.status === "kosong" || room.id === contractDraft.room_id).map((room) => ({ value: String(room.id), label: `${room.kode_kamar} · ${room.kode_rumah}` }));
  const tenantChoices: Choice[] = tenants.filter((tenant) => tenant.status === "aktif").map((tenant) => ({ value: String(tenant.id), label: tenant.nama_lengkap }));

  const contractForm = <Panel title={editingContract ? "Ubah kontrak sewa" : "Buat kontrak sewa"} subtitle="Pilih rumah petak dan penyewa. Saat kontrak disimpan sebagai berjalan, rumah petak otomatis ditandai terisi dan tagihan sewa tahunan dibuat.">
    <View style={styles.formGrid}><Field label="Nomor kontrak (otomatis)" value={contractDraft.nomor_kontrak} onChangeText={(v) => setContractDraft({ ...contractDraft, nomor_kontrak: v })} placeholder="Kosongkan untuk dibuat otomatis" /><Field label="Tanggal mulai *" value={contractDraft.tanggal_mulai} onChangeText={(v) => setContractDraft({ ...contractDraft, tanggal_mulai: v, tanggal_berakhir: addOneYear(v) })} placeholder="YYYY-MM-DD" /><Field label="Tanggal berakhir *" value={contractDraft.tanggal_berakhir} onChangeText={(v) => setContractDraft({ ...contractDraft, tanggal_berakhir: v })} placeholder="YYYY-MM-DD" /><Field label="Sewa per tahun *" value={String(contractDraft.harga_sewa || "")} onChangeText={(v) => setContractDraft({ ...contractDraft, harga_sewa: Number(v) || 0 })} keyboardType="numeric" /><Field label="Deposit" value={String(contractDraft.deposit || "")} onChangeText={(v) => setContractDraft({ ...contractDraft, deposit: Number(v) || 0 })} keyboardType="numeric" /><Field label="Catatan" value={contractDraft.catatan ?? ""} onChangeText={(v) => setContractDraft({ ...contractDraft, catatan: v })} multiline /></View>
    <Choices label="Pilih kamar *" value={String(contractDraft.room_id || "")} onChange={(v) => { const room = rooms.find((item) => item.id === Number(v)); setContractDraft({ ...contractDraft, room_id: Number(v), harga_sewa: room?.harga_sewa ?? contractDraft.harga_sewa }); }} options={roomChoices} />
    {tenantChoices.length ? <Choices label="Pilih penyewa *" value={String(contractDraft.tenant_id || "")} onChange={(v) => setContractDraft({ ...contractDraft, tenant_id: Number(v) })} options={tenantChoices} /> : <View style={styles.noTenant}><Text style={styles.helper}>Belum ada penyewa aktif. Buat data penyewa dulu agar bisa dipilih dalam kontrak.</Text><Button label="Tambah penyewa" secondary onPress={() => { setTenantDraft(emptyTenant()); setEditingTenant(null); setActiveTab("Penyewa"); setNotice("Isi data penyewa dan simpan, lalu kembali ke Kontrak. Isian kontrak tetap tersimpan."); }} /></View>}
    <Choices label="Status kontrak" value={contractDraft.status} onChange={(v) => setContractDraft({ ...contractDraft, status: v as Contract["status"] })} options={contractStatuses.map((status) => ({ value: status, label: contractStatusLabels[status] }))} />
    <View style={styles.formActions}><Button label={saving ? "Menyimpan..." : editingContract ? "Simpan perubahan" : "Buat kontrak"} onPress={() => void saveContract()} disabled={saving} />{editingContract ? <Button label="Batal edit" secondary onPress={() => { setEditingContract(null); setContractDraft(emptyContract()); }} /> : null}</View>
  </Panel>;

  const paymentForm = <Panel title={editingPayment ? "Ubah tagihan" : "Tambah tagihan khusus"} subtitle="Tagihan sewa tahunan dibuat otomatis saat kontrak berjalan disimpan. Gunakan formulir ini hanya untuk koreksi atau biaya tambahan.">
    <Choices label="Pilih kontrak *" value={String(paymentDraft.contract_id || "")} onChange={(v) => { const contract = contracts.find((item) => item.id === Number(v)); setPaymentDraft({ ...paymentDraft, contract_id: Number(v), jumlah: contract?.harga_sewa ?? paymentDraft.jumlah }); }} options={contractChoices} />
    <View style={styles.formGrid}><Field label="Periode *" value={paymentDraft.periode} onChangeText={(v) => setPaymentDraft({ ...paymentDraft, periode: v })} placeholder="Contoh: 2026" /><Field label="Jumlah *" value={String(paymentDraft.jumlah || "")} onChangeText={(v) => setPaymentDraft({ ...paymentDraft, jumlah: Number(v) || 0 })} keyboardType="numeric" /><Field label="Jatuh tempo *" value={paymentDraft.tanggal_jatuh_tempo} onChangeText={(v) => setPaymentDraft({ ...paymentDraft, tanggal_jatuh_tempo: v })} placeholder="YYYY-MM-DD" /><Field label="Tanggal bayar" value={paymentDraft.tanggal_bayar ?? ""} onChangeText={(v) => setPaymentDraft({ ...paymentDraft, tanggal_bayar: v || null })} placeholder="YYYY-MM-DD" /><Field label="Metode bayar" value={paymentDraft.metode_bayar ?? ""} onChangeText={(v) => setPaymentDraft({ ...paymentDraft, metode_bayar: v })} placeholder="Transfer, tunai, ..." /></View>
    <View style={styles.uploadBox}>{paymentProofImage ? <Image source={{ uri: paymentProofImage.uri }} style={styles.uploadPreview} resizeMode="cover" /> : paymentDraft.bukti_transfer ? <Text style={styles.helper}>Bukti bayar sudah tersimpan.</Text> : <Text style={styles.helper}>JPG, PNG, atau WebP. Maksimal 5 MB. File bersifat privat.</Text>}<View style={styles.formActions}><Button label={paymentProofImage || paymentDraft.bukti_transfer ? "Pilih / ganti foto bukti" : "Upload foto bukti bayar"} secondary onPress={() => void choosePaymentProof()} />{paymentDraft.bukti_transfer ? <Button label="Lihat bukti tersimpan" secondary onPress={() => void viewPaymentProof(paymentDraft.bukti_transfer!)} /> : null}{paymentProofImage ? <Button label="Hapus pilihan foto" secondary onPress={() => setPaymentProofImage(null)} /> : null}</View></View>
    <Choices label="Status pembayaran" value={paymentDraft.status} onChange={(v) => setPaymentDraft({ ...paymentDraft, status: v as Payment["status"] })} options={paymentStatuses.map((status) => ({ value: status, label: paymentStatusLabels[status] }))} />
    <View style={styles.formActions}><Button label={saving ? "Menyimpan..." : editingPayment ? "Simpan perubahan" : "Buat tagihan"} onPress={() => void savePayment()} disabled={saving} />{editingPayment ? <Button label="Batal edit" secondary onPress={() => { setEditingPayment(null); setPaymentDraft(emptyPayment()); setPaymentProofImage(null); }} /> : null}</View>
  </Panel>;

  async function deleteRoom(room: Room) {
    const client = supabase;
    if (!client) return;
    const hasContract = contracts.some((c) => c.room_id === room.id && c.status === "aktif");
    if (hasContract) {
      Alert.alert("Tidak bisa dihapus", "Rumah petak ini masih punya kontrak aktif.");
      return;
    }
    Alert.alert("Hapus rumah petak?", `Yakin hapus ${room.kode_rumah}? Data tidak bisa dikembalikan.`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => {
        void (async () => {
          setSaving(true);
          const { error } = await client.from("rooms").delete().eq("id", room.id);
          if (error) { failed(error, "Gagal menghapus rumah petak."); return; }
          done("Rumah petak berhasil dihapus.");
          setRefresh((v) => v + 1);
        })();
      }},
    ]);
  }

  async function deleteTenant(tenant: Tenant) {
    const client = supabase;
    if (!client) return;
    Alert.alert("Hapus penyewa?", `Yakin hapus ${tenant.nama_lengkap}?`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => {
        void (async () => {
          setSaving(true);
          const { error } = await client.from("tenants").delete().eq("id", tenant.id);
          if (error) { failed(error, "Gagal menghapus penyewa."); return; }
          done("Penyewa berhasil dihapus.");
          setRefresh((v) => v + 1);
        })();
      }},
    ]);
  }

  function renderRooms() {
    return <>{roomForm}<Panel title="Daftar rumah petak" subtitle={`${filteredRooms.length} unit · Harga sewa dihitung per tahun`}><Field label="Cari rumah petak" value={search} onChangeText={setSearch} placeholder="Nama rumah petak atau ketersediaan" />{filteredRooms.map((room) => { const contractActive = contracts.some((contract) => contract.room_id === room.id && contract.status === "aktif"); return <View key={room.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{room.kode_kamar} <Text style={styles.rowMuted}>/ {room.kode_rumah}</Text></Text><Text style={styles.rowMeta}>{currency(room.harga_sewa)} / tahun · Lantai {room.lantai} · Maks. {room.kapasitas} orang</Text><Text style={styles.rowMeta}>{room.deskripsi || "Belum ada keterangan tambahan."}</Text></View><View style={styles.rowActions}><Text style={[styles.badge, room.status === "kosong" ? styles.badgeGreen : room.status === "terisi" ? styles.badgeBlue : styles.badgeGray]}>{roomStatusLabels[room.status]}</Text><Button label="Ubah data" secondary onPress={() => editRoom(room)} /><Button label={room.status === "maintenance" ? "Tandai tersedia" : "Tandai perbaikan"} secondary disabled={contractActive} onPress={() => void setRoomStatus(room, room.status === "maintenance" ? "kosong" : "maintenance")} /><Button label="Hapus" danger disabled={contractActive} onPress={() => void deleteRoom(room)} /></View></View>; })}{!filteredRooms.length ? <Text style={styles.empty}>Belum ada rumah petak. Tambahkan melalui formulir di atas.</Text> : null}</Panel></>;
  }

  function renderTenants() {
    return <>{tenantForm}<Panel title="Daftar penyewa" subtitle={`${filteredTenants.length} orang terdaftar`}><Field label="Cari penyewa" value={search} onChangeText={setSearch} placeholder="Nama, NIK, atau nomor telepon" />{filteredTenants.map((tenant) => <View key={tenant.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{tenant.nama_lengkap}</Text><Text style={styles.rowMeta}>NIK {tenant.nik} · {tenant.no_hp}</Text><Text style={styles.rowMeta}>{tenant.email || tenant.alamat_asal || "Kontak tambahan belum diisi"}</Text></View><View style={styles.rowActions}><Text style={[styles.badge, tenant.status === "aktif" ? styles.badgeGreen : styles.badgeGray]}>{tenant.status === "aktif" ? "Aktif" : "Tidak aktif"}</Text><Button label="Ubah data" secondary onPress={() => editTenant(tenant)} /><Button label={tenant.status === "aktif" ? "Nonaktifkan" : "Aktifkan"} secondary onPress={() => { setTenantDraft({ ...tenant, status: tenant.status === "aktif" ? "nonaktif" : "aktif" }); setEditingTenant(tenant.id); }} /><Button label="Hapus" danger onPress={() => void deleteTenant(tenant)} /></View></View>)}{!filteredTenants.length ? <Text style={styles.empty}>Belum ada data penyewa.</Text> : null}</Panel></>;
  }

  function renderBookings() {
    return <Panel title="Pengajuan sewa" subtitle={`${pendingBookings.length} perlu ditindaklanjuti`}><Field label="Cari pengajuan" value={search} onChangeText={setSearch} placeholder="Nama, nomor telepon, email, status" />{filteredBookings.map((booking) => <View key={booking.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{booking.nama_lengkap} <Text style={styles.rowMuted}>· {booking.rooms?.kode_kamar ?? `Kamar ${booking.room_id}`}</Text></Text><Text style={styles.rowMeta}>{booking.no_hp} · {booking.email ?? "Tanpa email"}</Text><Text style={styles.rowMeta}>NIK: {booking.nik ?? "Belum diisi"} · Alamat: {booking.alamat_asal ?? "Belum diisi"}</Text><Text style={styles.rowMeta}>Kontak darurat: {booking.kontak_darurat ?? "Belum diisi"} · {booking.no_hp_darurat ?? ""}</Text><Text style={styles.rowMeta}>Mulai: {booking.tanggal_mulai_diinginkan || "Belum ditentukan"} · Diajukan {new Date(booking.created_at).toLocaleDateString("id-ID")}</Text>{booking.pesan ? <Text style={styles.rowMeta}>Pesan: {booking.pesan}</Text> : null}</View><View style={styles.rowActions}><Text style={[styles.badge, booking.status === "diterima" ? styles.badgeGreen : booking.status === "ditolak" ? styles.badgeRed : styles.badgeBlue]}>{bookingStatusLabels[booking.status]}</Text>{booking.status === "pending" || booking.status === "diproses" ? <><Button label="Proses" secondary onPress={() => void updateBooking(booking, "diproses")} /><Button label="Terima & Buat Kontrak" onPress={() => void acceptBookingAndCreateContract(booking)} disabled={saving} /><Button label="Tolak" danger onPress={() => void updateBooking(booking, "ditolak")} /></> : booking.status === "diterima" ? <Button label="Buat Kontrak Lagi" secondary onPress={() => void acceptBookingAndCreateContract(booking)} disabled={saving} /> : null}<Button label="Buat data penyewa" secondary onPress={() => void createTenantFromBooking(booking)} /></View></View>)}{!filteredBookings.length ? <Text style={styles.empty}>Belum ada pengajuan.</Text> : null}</Panel>;
  }

  function renderContracts() {
    return <>{contractForm}<Panel title="Daftar kontrak sewa" subtitle={`${filteredContracts.length} kontrak`}><Field label="Cari kontrak sewa" value={search} onChangeText={setSearch} placeholder="Nomor kontrak atau nama penyewa" />{filteredContracts.map((contract) => { const room = rooms.find((item) => item.id === contract.room_id); const tenant = tenants.find((item) => item.id === contract.tenant_id); return <View key={contract.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{contract.nomor_kontrak}</Text><Text style={styles.rowMeta}>{tenant?.nama_lengkap ?? "Penyewa"} · {room?.kode_kamar ?? "Rumah petak"}</Text><Text style={styles.rowMeta}>{contract.tanggal_mulai} sampai {contract.tanggal_berakhir} · {currency(contract.harga_sewa)} / tahun</Text><Text style={styles.rowMeta}>Uang jaminan: {currency(contract.deposit)}</Text></View><View style={styles.rowActions}><Text style={[styles.badge, contract.status === "aktif" ? styles.badgeGreen : styles.badgeGray]}>{contractStatusLabels[contract.status]}</Text><Button label="Ubah kontrak" secondary onPress={() => editContract(contract)} /><Button label="Lihat tagihan" secondary onPress={() => { setSearch(contract.nomor_kontrak); setActiveTab("Pembayaran"); }} /></View></View>; })}{!filteredContracts.length ? <Text style={styles.empty}>Belum ada kontrak sewa.</Text> : null}</Panel></>;
  }

  function renderPayments() {
    return <>{paymentForm}<Panel title="Daftar tagihan sewa" subtitle={`${filteredPayments.length} tagihan`}><Field label="Cari tagihan" value={search} onChangeText={setSearch} placeholder="Tahun, status, atau nama penyewa" />{filteredPayments.map((payment) => { const contract = contracts.find((item) => item.id === payment.contract_id); const room = rooms.find((item) => item.id === contract?.room_id); const tenant = tenants.find((item) => item.id === contract?.tenant_id); return <View key={payment.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>Tagihan tahun {payment.periode} <Text style={styles.rowMuted}>· {contract?.nomor_kontrak ?? "Kontrak"}</Text></Text><Text style={styles.rowMeta}>{tenant?.nama_lengkap ?? "Penyewa"} · {room?.kode_kamar ?? "Rumah petak"}</Text><Text style={styles.rowMeta}>{currency(payment.jumlah)} · batas bayar {payment.tanggal_jatuh_tempo}</Text><Text style={styles.rowMeta}>Tanggal dibayar: {payment.tanggal_bayar ?? "Belum dibayar"} {payment.metode_bayar ? `· ${payment.metode_bayar}` : ""}</Text></View><View style={styles.rowActions}><Text style={[styles.badge, payment.status === "lunas" ? styles.badgeGreen : payment.status === "terlambat" ? styles.badgeRed : styles.badgeBlue]}>{paymentStatusLabels[payment.status]}</Text><Button label="Ubah tagihan" secondary onPress={() => editPayment(payment)} />{payment.status !== "lunas" ? <Button label="Catat sudah dibayar" onPress={() => void markPayment(payment, "lunas")} /> : null}</View></View>; })}{!filteredPayments.length ? <Text style={styles.empty}>Belum ada tagihan.</Text> : null}</Panel></>;
  }

  function renderSettings() {
    return <Panel title="Pengaturan kontak publik" subtitle="Informasi ini dipakai customer untuk menghubungi pengelola."><View style={styles.settingsForm}>{settingDefinitions.map((item) => <Field key={item.key} label={item.label} value={settingsDraft[item.key] ?? ""} onChangeText={(value) => setSettingsDraft({ ...settingsDraft, [item.key]: value })} />)}</View><View style={styles.formActions}><Button label={saving ? "Menyimpan..." : "Simpan pengaturan"} onPress={() => void saveSettings()} disabled={saving} /></View>{!settings.length ? <Text style={styles.helper}>Pengaturan akan dibuat saat pertama kali disimpan.</Text> : null}</Panel>;
  }

  function renderOverview() {
    return <><View style={styles.statsGrid}>{stats.map((stat) => <View key={stat.label} style={[styles.statCard, wide && styles.statCardWide]}><View style={styles.statTop}><Text style={styles.statLabel}>{stat.label}</Text><Text style={styles.statMarker}>{stat.marker}</Text></View><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statDetail}>{stat.detail}</Text></View>)}</View><View style={styles.quickGuide}><Text style={styles.guideTitle}>Mulai dari sini</Text><Text style={styles.guideIntro}>Ikuti tiga langkah ini untuk mulai menerima penyewa.</Text><View style={styles.guideGrid}><View style={styles.guideStep}><Text style={styles.guideNumber}>01</Text><Text style={styles.guideStepTitle}>Tambahkan rumah petak</Text><Text style={styles.guideText}>Isi harga sewa per tahun, fasilitas, dan foto.</Text><Button label="Tambah rumah petak" secondary onPress={() => setActiveTab("Rumah Petak")} /></View><View style={styles.guideStep}><Text style={styles.guideNumber}>02</Text><Text style={styles.guideStepTitle}>Periksa pengajuan sewa</Text><Text style={styles.guideText}>Tinjau biodata calon penyewa, lalu setujui atau tolak pengajuannya.</Text><Button label="Lihat pengajuan" secondary onPress={() => setActiveTab("Booking")} /></View><View style={styles.guideStep}><Text style={styles.guideNumber}>03</Text><Text style={styles.guideStepTitle}>Buat kontrak sewa</Text><Text style={styles.guideText}>Pilih rumah petak dan penyewa. Tagihan tahunan dibuat otomatis.</Text><Button label="Buat kontrak" secondary onPress={() => setActiveTab("Kontrak")} /></View></View></View><DashboardCharts rooms={rooms} payments={payments} /><Panel title="Pengajuan sewa terbaru" subtitle="Permintaan sewa yang dikirim dari sisi customer">{bookings.slice(0, 5).map((booking) => <View key={booking.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{booking.nama_lengkap} · {booking.rooms?.kode_kamar ?? "Rumah petak"}</Text><Text style={styles.rowMeta}>{booking.no_hp} · {new Date(booking.created_at).toLocaleDateString("id-ID")}</Text></View><Text style={[styles.badge, booking.status === "diterima" ? styles.badgeGreen : booking.status === "ditolak" ? styles.badgeRed : styles.badgeBlue]}>{bookingStatusLabels[booking.status]}</Text></View>)}{!bookings.length ? <Text style={styles.empty}>Belum ada pengajuan sewa.</Text> : null}<View style={styles.formActions}><Button label="Lihat semua pengajuan" secondary onPress={() => setActiveTab("Booking")} /><Button label="Buat kontrak sewa" onPress={() => setActiveTab("Kontrak")} /></View></Panel><Panel title="Tagihan perlu perhatian" subtitle="Tagihan yang belum dibayar atau sudah melewati batas waktu">{payments.filter((payment) => payment.status !== "lunas").slice(0, 5).map((payment) => <View key={payment.id} style={styles.dataRow}><View style={styles.rowMain}><Text style={styles.rowTitle}>{payment.periode} · {contracts.find((item) => item.id === payment.contract_id)?.nomor_kontrak ?? "Kontrak"}</Text><Text style={styles.rowMeta}>{currency(payment.jumlah)} · batas bayar {payment.tanggal_jatuh_tempo}</Text></View><Text style={[styles.badge, payment.status === "terlambat" ? styles.badgeRed : styles.badgeBlue]}>{paymentStatusLabels[payment.status]}</Text></View>)}{!unpaidPayments.length ? <Text style={styles.empty}>Semua tagihan sudah dibayar.</Text> : null}<Button label="Lihat tagihan" secondary onPress={() => setActiveTab("Pembayaran")} /></Panel></>;
  }

  const simpleNotice = notice || autoNote;

  function renderSimple() {
    const hour = new Date().getHours();
    const greeting = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
    const dateLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    const taskCount = pendingBookings.length + unpaidPayments.length;
    const emptyRooms = rooms.filter((room) => room.status === "kosong").length;

    return <>
      <View style={styles.simpleTopbar}>
        <View style={styles.simpleBrandRow}>
          <Image source={require("../../assets/logo.png")} style={styles.simpleLogo} resizeMode="contain" />
          <View>
            <Text style={styles.simpleBrand}>KontrakanKu</Text>
            <Text style={styles.simpleBrandCaption}>{dateLabel}</Text>
          </View>
        </View>
        <View style={styles.simpleTopActions}>
          <Button label="Mode lengkap" secondary large onPress={() => setSimpleMode(false)} />
          <Button label="Muat ulang" secondary large onPress={() => setRefresh((value) => value + 1)} />
          <Button label="Keluar" secondary large onPress={onSignOut} />
        </View>
      </View>

      <View style={styles.simpleHero}>
        <Text style={styles.simpleGreeting}>{greeting}, Bapak/Ibu 👋</Text>
        <Text style={styles.simpleHeroTitle}>{taskCount ? `Ada ${taskCount} hal yang perlu ditindaklanjuti.` : "Semua sudah beres hari ini."}</Text>
        <Text style={styles.simpleHeroText}>Cukup tekan tombol besar di bawah. Sisanya dikerjakan otomatis oleh sistem.</Text>
        <View style={styles.simpleStats}>
          <View style={styles.simpleStat}><Text style={styles.simpleStatValue}>{pendingBookings.length}</Text><Text style={styles.simpleStatLabel}>Pengajuan baru</Text></View>
          <View style={styles.simpleStat}><Text style={styles.simpleStatValue}>{unpaidPayments.length}</Text><Text style={styles.simpleStatLabel}>Tagihan belum dibayar</Text></View>
          <View style={styles.simpleStat}><Text style={styles.simpleStatValue}>{emptyRooms}</Text><Text style={styles.simpleStatLabel}>Rumah kosong</Text></View>
        </View>
      </View>

      {simpleNotice ? <TouchableOpacity onPress={() => { setNotice(""); setAutoNote(""); }} style={styles.simpleNotice}><Text style={styles.simpleNoticeText}>{simpleNotice}</Text><Text style={styles.simpleNoticeClose}>×</Text></TouchableOpacity> : null}

      <Text style={styles.simpleSectionTitle}>1 · Terima pengajuan sewa</Text>
      {pendingBookings.length ? <>
        {pendingBookings.slice(0, 6).map((booking) => {
          const room = rooms.find((item) => item.id === booking.room_id);
          const busy = acceptingId === booking.id;
          return <View key={booking.id} style={styles.simpleCard}>
            <View style={styles.simpleCardHeader}>
              <Text style={styles.simpleCardTitle}>{booking.nama_lengkap}</Text>
              <Text style={styles.simpleBadge}>{booking.status === "diproses" ? "Sedang diproses" : "Menunggu"}</Text>
            </View>
            <Text style={styles.simpleCardMeta}>{room ? `${room.kode_rumah} · ${room.kode_kamar}` : "Rumah petak"} · mulai {friendlyDate(booking.tanggal_mulai_diinginkan)}</Text>
            <Text style={styles.simpleCardMeta}>Telepon: {booking.no_hp}</Text>
            {booking.alamat_asal ? <Text style={styles.simpleCardMeta}>Alamat: {booking.alamat_asal}</Text> : null}
            {booking.kontak_darurat ? <Text style={styles.simpleCardMeta}>Kontak darurat: {booking.kontak_darurat} · {booking.no_hp_darurat ?? "-"}</Text> : null}
            {booking.pesan ? <Text style={styles.simpleCardNote}>“{booking.pesan}”</Text> : null}
            <View style={styles.simpleActions}>
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void autoAcceptBooking(booking)} style={[styles.bigButton, busy && styles.bigButtonDisabled]}>
                <Text style={styles.bigButtonText}>{busy ? "Sedang memproses..." : "✓ Terima otomatis"}</Text>
                <Text style={styles.bigButtonHint}>Penyewa, kontrak, dan tagihan dibuat otomatis</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => void updateBooking(booking, "ditolak")} style={styles.bigButtonSecondary}>
                <Text style={styles.bigButtonSecondaryText}>Tolak</Text>
              </TouchableOpacity>
            </View>
          </View>;
        })}
        {pendingBookings.length > 6 ? <Text style={styles.simpleMore}>Masih ada {pendingBookings.length - 6} pengajuan lain. Buka mode lengkap untuk melihat semuanya.</Text> : null}
      </> : <View style={styles.simpleEmpty}><Text style={styles.simpleEmptyTitle}>Tidak ada pengajuan baru</Text><Text style={styles.simpleEmptyText}>Pengajuan dari calon penyewa akan muncul otomatis di sini.</Text></View>}

      <Text style={styles.simpleSectionTitle}>2 · Catat pembayaran</Text>
      {unpaidPayments.length ? <>
        {unpaidPayments.slice(0, 6).map((payment) => {
          const contract = contracts.find((item) => item.id === payment.contract_id);
          const room = rooms.find((item) => item.id === contract?.room_id);
          const tenant = tenants.find((item) => item.id === contract?.tenant_id);
          const overdue = payment.status === "terlambat" || payment.tanggal_jatuh_tempo < todayIso();
          return <View key={payment.id} style={[styles.simpleCard, overdue && styles.simpleCardUrgent]}>
            <View style={styles.simpleCardHeader}>
              <Text style={styles.simpleCardTitle}>{tenant?.nama_lengkap ?? "Penyewa"}</Text>
              <Text style={[styles.simpleBadge, overdue ? styles.simpleBadgeDanger : styles.simpleBadgeInfo]}>{overdue ? "Terlambat" : "Belum bayar"}</Text>
            </View>
            <Text style={styles.simpleCardMeta}>{room ? `${room.kode_rumah} · ${room.kode_kamar}` : "Rumah petak"} · periode {payment.periode}</Text>
            <Text style={styles.simpleCardAmount}>{currency(payment.jumlah)}</Text>
            <Text style={styles.simpleCardMeta}>Jatuh tempo {friendlyDate(payment.tanggal_jatuh_tempo)}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => void markPayment(payment, "lunas")} style={styles.bigButton}>
              <Text style={styles.bigButtonText}>✓ Sudah dibayar</Text>
              <Text style={styles.bigButtonHint}>Tanggal pembayaran dicatat otomatis hari ini</Text>
            </TouchableOpacity>
          </View>;
        })}
        {unpaidPayments.length > 6 ? <Text style={styles.simpleMore}>Masih ada {unpaidPayments.length - 6} tagihan lain. Buka mode lengkap untuk melihat semuanya.</Text> : null}
      </> : <View style={styles.simpleEmpty}><Text style={styles.simpleEmptyTitle}>Semua tagihan lunas</Text><Text style={styles.simpleEmptyText}>Tagihan baru akan muncul otomatis saat kontrak sewa berjalan.</Text></View>}

      <Text style={styles.simpleSectionTitle}>Menu cepat</Text>
      <View style={styles.simpleMenuGrid}>
        <SimpleMenuButton icon="🏠" label="Tambah rumah petak" detail="Daftarkan unit baru" onPress={() => { setSimpleMode(false); setActiveTab("Rumah Petak"); setSearch(""); }} />
        <SimpleMenuButton icon="👤" label="Data penyewa" detail={`${tenants.length} orang terdaftar`} onPress={() => { setSimpleMode(false); setActiveTab("Penyewa"); setSearch(""); }} />
        <SimpleMenuButton icon="📄" label="Kontrak sewa" detail={`${contracts.length} kontrak`} onPress={() => { setSimpleMode(false); setActiveTab("Kontrak"); setSearch(""); }} />
        <SimpleMenuButton icon="⚙️" label="Kontak & pengaturan" detail="WhatsApp, email, alamat" onPress={() => { setSimpleMode(false); setActiveTab("Pengaturan"); setSearch(""); }} />
      </View>

      <Text style={styles.simpleFooter}>Data diperbarui otomatis setiap 45 detik{lastUpdated ? ` · terakhir ${lastUpdated}` : ""} · {userEmail ?? "Akun admin"}</Text>
    </>;
  }

  if (simpleMode) {
    return <View style={styles.simpleShell}>
      <ScrollView style={styles.main} contentContainerStyle={styles.simpleContent}>
        {loading ? <View style={styles.loading}><ActivityIndicator color="#315c45" /><Text style={styles.helper}>Memuat data...</Text></View> : renderSimple()}
      </ScrollView>
    </View>;
  }

  const activeContent = activeTab === "Ringkasan" ? renderOverview() : activeTab === "Rumah Petak" ? renderRooms() : activeTab === "Penyewa" ? renderTenants() : activeTab === "Booking" ? renderBookings() : activeTab === "Kontrak" ? renderContracts() : activeTab === "Pembayaran" ? renderPayments() : renderSettings();

  return <View style={styles.shell}>
    {wide ? <View style={styles.sidebar}><View style={styles.brand}><View style={styles.brandIcon}><Image source={require("../../assets/logo.png")} style={styles.brandImage} resizeMode="contain" /></View><View><Text style={styles.brandName}>KontrakanKu</Text><Text style={styles.brandCaption}>PENGELOLAAN RUMAH PETAK</Text></View></View><Text style={styles.navHeading}>MENU UTAMA</Text>{tabs.map((tab, index) => <TouchableOpacity key={tab} style={[styles.navItem, activeTab === tab && styles.navActive]} onPress={() => { setActiveTab(tab); setSearch(""); }}><Text style={[styles.navIndex, activeTab === tab && styles.navIndexActive]}>{String(index + 1).padStart(2, "0")}</Text><Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{tabLabels[tab]}</Text></TouchableOpacity>)}<View style={styles.sidebarBottom}><Text style={styles.userEmail}>{userEmail ?? "Akun admin"}</Text><Button label="Keluar" secondary onPress={onSignOut} /></View></View> : null}
    <ScrollView style={styles.main} contentContainerStyle={[styles.mainContent, wide && styles.mainContentWide]}>
      <View style={styles.topbar}><View><Text style={styles.eyebrow}>KONTRAKANKU / ADMIN</Text><Text style={styles.pageTitle}>{tabLabels[activeTab]}</Text><Text style={styles.pageSubtitle}>{tabGuidance[activeTab]}</Text></View><View style={styles.topActions}><Button label="← Mode sederhana" onPress={() => setSimpleMode(true)} /><Button label="Lihat tampilan customer ↗" secondary onPress={openCustomerSite} /><Button label="Muat ulang data" secondary onPress={() => setRefresh((value) => value + 1)} />{!wide ? <Button label="Keluar" secondary onPress={onSignOut} /> : null}</View></View>
      {!wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNav}>{tabs.map((tab) => <TouchableOpacity key={tab} style={[styles.mobileNavItem, activeTab === tab && styles.mobileNavActive]} onPress={() => { setActiveTab(tab); setSearch(""); }}><Text style={[styles.mobileNavText, activeTab === tab && styles.mobileNavTextActive]}>{tabLabels[tab]}</Text></TouchableOpacity>)}</ScrollView> : null}
      {notice ? <TouchableOpacity onPress={() => setNotice("")} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Text style={styles.noticeClose}>×</Text></TouchableOpacity> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color="#315c45" /><Text style={styles.helper}>Memuat data...</Text></View> : activeContent}
      <Text style={styles.footer}>KONTRAKANKU · PANEL PENGELOLAAN</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: "#f5f7f5" },
  sidebar: { width: 252, backgroundColor: "#17251f", paddingHorizontal: 20, paddingVertical: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 5, paddingBottom: 31, borderBottomWidth: 1, borderBottomColor: "#2b3c32" },
  brandIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#d9b58b", alignItems: "center", justifyContent: "center" },
  brandIconText: { color: "#17251f", fontWeight: "800", fontSize: 20 },
  brandImage: { width: 41, height: 41 },
  brandName: { color: "#fff", fontWeight: "700", fontSize: 15 },
  brandCaption: { color: "#94a198", fontSize: 8, letterSpacing: 1.5, marginTop: 4 },
  navHeading: { color: "#819087", fontSize: 9, fontWeight: "700", letterSpacing: 1.5, marginTop: 28, marginBottom: 10, marginLeft: 8 },
  navItem: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 9, paddingHorizontal: 11, marginBottom: 3 },
  navActive: { backgroundColor: "#2b4638" },
  navIndex: { color: "#829087", fontSize: 9, fontWeight: "700", width: 19 },
  navIndexActive: { color: "#dfbd97" },
  navText: { color: "#c0cbc3", fontSize: 13, fontWeight: "600" },
  navTextActive: { color: "#fff", fontWeight: "700" },
  sidebarBottom: { marginTop: "auto", gap: 12, borderTopWidth: 1, borderTopColor: "#2b3c32", paddingTop: 18 },
  userEmail: { color: "#bac5bd", fontSize: 10 },
  main: { flex: 1 },
  mainContent: { padding: 18, paddingBottom: 36, gap: 16 },
  mainContentWide: { width: "100%", maxWidth: 1440, alignSelf: "center", paddingHorizontal: 38, paddingTop: 34, gap: 20 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 6 },
  topActions: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  eyebrow: { color: "#9a774f", fontSize: 9, fontWeight: "700", letterSpacing: 1.8 },
  pageTitle: { color: "#1f2d25", fontWeight: "700", fontSize: 28, marginTop: 8, letterSpacing: -0.5 },
  pageSubtitle: { color: "#77827a", fontSize: 12, marginTop: 5 },
  quickGuide: { backgroundColor: "#eaf1eb", borderColor: "#d4e1d6", borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 18 },
  guideTitle: { color: "#193326", fontSize: 16, fontWeight: "800" },
  guideIntro: { color: "#66756b", fontSize: 11, marginTop: 4, marginBottom: 13 },
  guideGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  guideStep: { flexGrow: 1, flexBasis: 210, backgroundColor: "#fff", borderColor: "#dce5dd", borderWidth: 1, borderRadius: 11, padding: 13, gap: 7 },
  guideNumber: { color: "#9b6b35", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  guideStepTitle: { color: "#20352a", fontSize: 12, fontWeight: "700" },
  guideText: { color: "#69766e", fontSize: 10, lineHeight: 15, minHeight: 30 },
  mobileNav: { gap: 7, paddingBottom: 3 },
  mobileNavItem: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 8, backgroundColor: "#e9eeea" },
  mobileNavActive: { backgroundColor: "#315c45" },
  mobileNavText: { color: "#657168", fontSize: 10, fontWeight: "600" },
  mobileNavTextActive: { color: "#fff" },
  notice: { backgroundColor: "#edf5ed", borderWidth: 1, borderColor: "#d8e9db", borderRadius: 9, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  noticeText: { color: "#315c45", fontSize: 11, flex: 1 },
  noticeClose: { color: "#315c45", fontSize: 18, fontWeight: "600" },
  loading: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 10 },
  helper: { color: "#78847b", fontSize: 11 },
  noTenant: { gap: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: "#e4eae5", borderRadius: 9, backgroundColor: "#f8faf8", alignItems: "flex-start" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  chartGrid: { flexDirection: "column", gap: 12 },
  stackedBar: { height: 13, overflow: "hidden", borderRadius: 8, flexDirection: "row", backgroundColor: "#edf1ed", marginTop: 15 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 5 },
  legendText: { color: "#69766d", fontSize: 9 },
  barChart: { height: 148, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, paddingTop: 12 },
  barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  barValue: { color: "#738077", fontSize: 8, minHeight: 12, textAlign: "center" },
  barTrack: { width: "65%", flex: 1, justifyContent: "flex-end", overflow: "hidden", borderRadius: 6, backgroundColor: "#edf2ee" },
  barFill: { width: "100%", borderRadius: 6, backgroundColor: "#315c45" },
  barLabel: { color: "#69766d", fontSize: 9, textTransform: "capitalize" },
  statCard: { flexGrow: 1, width: "47%", minWidth: 145, backgroundColor: "#fff", borderRadius: 13, borderWidth: 1, borderColor: "#e4eae5", padding: 17 },
  statCardWide: { width: "23%", minWidth: 150 },
  statTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { color: "#6e7a72", fontSize: 10, fontWeight: "600" },
  statMarker: { color: "#b8c7bb", fontSize: 9, fontWeight: "700" },
  statValue: { color: "#254d38", fontSize: 28, fontWeight: "700", marginTop: 14 },
  statDetail: { color: "#8b958e", fontSize: 9, marginTop: 5 },
  panel: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5eae6", borderRadius: 13, padding: 16, marginBottom: 2 },
  panelHeading: { marginBottom: 9 },
  panelTitle: { color: "#25332b", fontSize: 17, fontWeight: "700" },
  panelSubtitle: { color: "#8a958d", fontSize: 11.5, marginTop: 4 },
  field: { minWidth: 180, flexGrow: 1, marginTop: 9, marginBottom: 2 },
  fieldLabel: { color: "#57645b", fontSize: 11.5, fontWeight: "600", marginBottom: 6 },
  facilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  facilityChoice: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#e0e7e1", backgroundColor: "#fbfcfb" },
  facilityChoiceActive: { borderColor: "#b8d1bd", backgroundColor: "#edf5ee" },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: "#b8c5bb", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  checkboxActive: { borderColor: "#315c45", backgroundColor: "#315c45" },
  checkboxCheck: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 13 },
  facilityText: { color: "#68756d", fontSize: 11 },
  facilityTextActive: { color: "#315c45", fontWeight: "600" },
  input: { minHeight: 42, borderWidth: 1, borderColor: "#e0e7e1", borderRadius: 7, paddingHorizontal: 11, paddingVertical: 9, color: "#243129", backgroundColor: "#fbfcfb", fontSize: 12.5, outlineStyle: "none" } as any,
  multiline: { minHeight: 68 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 3 },
  choiceRow: { gap: 7, paddingBottom: 2 },
  choice: { borderWidth: 1, borderColor: "#dfe7e0", borderRadius: 7, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#fafcfa" },
  choiceActive: { borderColor: "#315c45", backgroundColor: "#eaf3ec" },
  choiceText: { color: "#68756d", fontSize: 11, fontWeight: "600" },
  choiceTextActive: { color: "#315c45" },
  uploadBox: { minHeight: 75, marginTop: 12, padding: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#cdd8cf", borderRadius: 9, alignItems: "flex-start", gap: 9, backgroundColor: "#f9fbf9" },
  uploadPreview: { width: "100%", height: 180, borderRadius: 7 },
  photoThumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: 104, height: 76, borderRadius: 7, backgroundColor: "#e9eeea" },
  formActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 13 },
  button: { minHeight: 38, justifyContent: "center", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7, backgroundColor: "#315c45" },
  buttonText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  buttonLarge: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  buttonTextLarge: { fontSize: 14 },
  buttonSecondary: { backgroundColor: "#f4f7f4", borderWidth: 1, borderColor: "#e1e8e2" },
  buttonSecondaryText: { color: "#43564a" },
  buttonDanger: { backgroundColor: "#fff1ee", borderWidth: 1, borderColor: "#f2d7d1" },
  buttonDangerText: { color: "#a34d3f" },
  buttonDisabled: { opacity: 0.55 },
  dataRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: "#edf1ed" },
  rowMain: { flex: 1, gap: 4 },
  rowActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap", maxWidth: 400 },
  rowTitle: { color: "#2b3930", fontSize: 12.5, fontWeight: "700" },
  rowMuted: { color: "#7b877f", fontWeight: "500" },
  rowMeta: { color: "#7c8880", fontSize: 11, lineHeight: 16 },
  badge: { overflow: "hidden", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "700", textTransform: "capitalize", backgroundColor: "#edf2ee", color: "#52645a" },
  badgeGreen: { backgroundColor: "#e8f3ea", color: "#315c45" },
  badgeBlue: { backgroundColor: "#edf3f5", color: "#477480" },
  badgeGray: { backgroundColor: "#eff1ef", color: "#69756d" },
  badgeRed: { backgroundColor: "#fff0ed", color: "#a04c3f" },
  empty: { color: "#8a958d", fontSize: 11, paddingVertical: 18 },
  settingsForm: { maxWidth: 680 },
  footer: { color: "#a0a9a2", fontSize: 8, textAlign: "center", letterSpacing: 1.3, marginTop: 5 },
  simpleShell: { flex: 1, backgroundColor: "#eef2ed" },
  simpleContent: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42, gap: 16 },
  simpleTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 },
  simpleBrandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  simpleLogo: { width: 54, height: 54 },
  simpleBrand: { color: "#1d3025", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  simpleBrandCaption: { color: "#77827a", fontSize: 12, marginTop: 3, textTransform: "capitalize" },
  simpleTopActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  simpleHero: { padding: 24, borderRadius: 20, backgroundColor: "#173a29", overflow: "hidden" },
  simpleGreeting: { color: "#cfe0d2", fontSize: 16, fontWeight: "600" },
  simpleHeroTitle: { marginTop: 8, color: "#fff", fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  simpleHeroText: { marginTop: 10, color: "#c8d7cb", fontSize: 15, lineHeight: 22 },
  simpleStats: { marginTop: 20, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  simpleStat: { flexGrow: 1, flexBasis: 160, padding: 16, borderRadius: 14, backgroundColor: "#ffffff17", borderWidth: 1, borderColor: "#ffffff1f" },
  simpleStatValue: { color: "#fff", fontSize: 32, fontWeight: "800" },
  simpleStatLabel: { marginTop: 4, color: "#c3d4c7", fontSize: 13, lineHeight: 18 },
  simpleNotice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderRadius: 14, backgroundColor: "#fff8e6", borderWidth: 1, borderColor: "#f0dfb6" },
  simpleNoticeText: { flex: 1, color: "#7a5a22", fontSize: 15, lineHeight: 22 },
  simpleNoticeClose: { color: "#7a5a22", fontSize: 24, fontWeight: "700" },
  simpleSectionTitle: { marginTop: 12, color: "#1d3025", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  simpleCard: { padding: 18, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe7df", gap: 6 },
  simpleCardUrgent: { borderColor: "#ecca9f", backgroundColor: "#fffdf8" },
  simpleCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  simpleCardTitle: { flex: 1, color: "#203027", fontSize: 19, fontWeight: "800" },
  simpleBadge: { overflow: "hidden", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, color: "#8a6a32", backgroundColor: "#fbf2dd", fontSize: 12, fontWeight: "700" },
  simpleBadgeDanger: { color: "#a44433", backgroundColor: "#ffe9e4" },
  simpleBadgeInfo: { color: "#3d6c79", backgroundColor: "#e8f2f4" },
  simpleCardMeta: { color: "#66736a", fontSize: 14, lineHeight: 21 },
  simpleCardNote: { marginTop: 4, color: "#55635a", fontSize: 14, fontStyle: "italic", lineHeight: 21 },
  simpleCardAmount: { color: "#173a29", fontSize: 26, fontWeight: "800", marginTop: 2 },
  simpleActions: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 10 },
  bigButton: { flexGrow: 1, minWidth: 220, minHeight: 62, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 13, backgroundColor: "#2f6b4b" },
  bigButtonDisabled: { opacity: 0.6 },
  bigButtonText: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  bigButtonHint: { marginTop: 4, color: "#d5e6d9", fontSize: 12, textAlign: "center", lineHeight: 16 },
  bigButtonSecondary: { minHeight: 62, justifyContent: "center", paddingHorizontal: 22, borderRadius: 13, borderWidth: 1, borderColor: "#e4d4cf", backgroundColor: "#fff5f2" },
  bigButtonSecondaryText: { color: "#a34d3f", fontSize: 16, fontWeight: "800" },
  simpleEmpty: { padding: 20, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderStyle: "dashed", borderColor: "#cfdacf", gap: 5 },
  simpleEmptyTitle: { color: "#2b3b31", fontSize: 16, fontWeight: "700" },
  simpleEmptyText: { color: "#748078", fontSize: 13, lineHeight: 19 },
  simpleMenuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  simpleMenuButton: { flexGrow: 1, flexBasis: 200, minHeight: 104, padding: 16, borderRadius: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe7df", gap: 5 },
  simpleMenuIcon: { fontSize: 24 },
  simpleMenuLabel: { marginTop: 4, color: "#22342a", fontSize: 16, fontWeight: "800" },
  simpleMenuDetail: { color: "#7a867e", fontSize: 12.5, lineHeight: 18 },
  simpleMore: { color: "#7a867e", fontSize: 13, lineHeight: 19, textAlign: "center" },
  simpleFooter: { marginTop: 10, color: "#8a958d", fontSize: 12, lineHeight: 18, textAlign: "center" },
});
