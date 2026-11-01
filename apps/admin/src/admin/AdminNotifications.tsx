import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { enableNotifications, onNotificationOpen, presentNotification, restoreNotifications, setNotificationSound } from "../../lib/notificationService";

type Notice = { id: number; title: string; body: string; read_at: string | null; created_at: string };

export function AdminNotifications({ onOpenBookings, onNewBooking }: { onOpenBookings: () => void; onNewBooking: () => void }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const enabledRef = useRef(false);
  const lastId = useRef<number | null>(null);
  const reloadRef = useRef<() => void>(() => {});
  const onOpenRef = useRef(onOpenBookings);
  const onNewRef = useRef(onNewBooking);
  onOpenRef.current = onOpenBookings;
  onNewRef.current = onNewBooking;

  useEffect(() => onNotificationOpen(() => { onOpenRef.current(); reloadRef.current(); }), []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let stopped = false;
    let loading = false;
    let reloadQueued = false;
    let dispose = () => {};

    async function start() {
      const { data: { user } } = await client!.auth.getUser();
      if (!user || stopped) return;
      setUserId(user.id);
      const storedSound = await AsyncStorage.getItem(`admin-notification-sound:${user.id}`);
      if (stopped) return;
      const soundValue = storedSound !== "off";
      setSound(soundValue);
      // Native permissions remain OS-controlled; web audio must be unlocked by a click.
      await setNotificationSound(soundValue).catch(() => {});
      // Restore Android permissions without asking again; browser audio needs a gesture.
      void restoreNotifications(user.id, soundValue).then((message) => {
        if (!stopped && message) { enabledRef.current = true; setEnabled(true); setStatus(message); }
      }).catch(() => { if (!stopped) setStatus("Tekan Aktifkan notifikasi untuk mendaftarkan ulang perangkat."); });

      async function load() {
        if (stopped) return;
        if (loading) { reloadQueued = true; return; }
        loading = true;
        try {
          const [list, count] = await Promise.all([
            client!.from("admin_notifications").select("id,title,body,read_at,created_at").eq("user_id", user!.id).order("id", { ascending: false }).limit(20),
            client!.from("admin_notifications").select("id", { head: true, count: "exact" }).eq("user_id", user!.id).is("read_at", null),
          ]);
          if (stopped) return;
          if (list.error || count.error) { setError("Notifikasi belum dapat dimuat. Tekan Coba lagi."); return; }
          setError("");
          const loaded = (list.data ?? []) as Notice[];
          setItems(loaded);
          setUnread(count.count ?? 0);
          const newestId = loaded[0]?.id ?? 0;
          const fresh = lastId.current === null ? [] : loaded.filter((item) => item.id > lastId.current! && !item.read_at);
          lastId.current = Math.max(lastId.current ?? 0, newestId);
          if (fresh.length) {
            onNewRef.current();
            if (enabledRef.current) {
              const newest = fresh[0];
              await presentNotification(newest.title, fresh.length > 1 ? `${fresh.length} pengajuan sewa baru menunggu ditinjau.` : newest.body, newest.id);
            }
          }
        } catch {
          if (!stopped) setError("Notifikasi belum dapat dimuat. Tekan Coba lagi.");
        } finally {
          loading = false;
          if (reloadQueued && !stopped) { reloadQueued = false; void load(); }
        }
      }
      reloadRef.current = () => { void load(); };
      const channel = client!.channel(`admin-inbox:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications", filter: `user_id=eq.${user.id}` }, () => void load())
        .subscribe((state) => { if (state === "SUBSCRIBED") void load(); });
      const timer = setInterval(() => void load(), 30_000);
      const stateListener = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
      dispose = () => { clearInterval(timer); stateListener.remove(); void client!.removeChannel(channel); };
      if (stopped) { dispose(); return; }
      void load();
    }
    void start().catch(() => { if (!stopped) setError("Notifikasi belum dapat dimuat. Tekan Coba lagi."); });
    return () => { stopped = true; dispose(); reloadRef.current = () => {}; };
  }, []);

  async function enable() {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const message = await enableNotifications(userId, sound);
      enabledRef.current = true;
      setEnabled(true);
      setStatus(message);
      await presentNotification("Notifikasi admin aktif", "Bunyi ini akan terdengar saat ada pengajuan sewa baru.", 0, true);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Notifikasi belum dapat diaktifkan. Coba lagi."); }
    finally { setBusy(false); }
  }

  async function toggleSound() {
    if (busy) return;
    setBusy(true);
    try {
      await setNotificationSound(!sound);
      await AsyncStorage.setItem(`admin-notification-sound:${userId}`, sound ? "off" : "on");
      setSound(!sound);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Pengaturan bunyi belum tersimpan."); }
    finally { setBusy(false); }
  }

  const open = useCallback(async (item?: Notice) => {
    const client = supabase;
    if (!client || !userId) return;
    const query = client.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    const { error: updateError } = await (item ? query.eq("id", item.id) : query);
    if (updateError) { setStatus("Notifikasi belum dapat ditandai dibaca. Coba lagi."); return; }
    reloadRef.current();
    if (item) { setExpanded(false); onOpenRef.current(); }
  }, [userId]);

  return <View style={styles.panel}>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={styles.button} onPress={() => setExpanded(!expanded)}>
        <Text style={styles.buttonText}>Notifikasi{unread ? ` (${unread} belum dibaca)` : ""}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !userId} style={styles.button} onPress={() => void enable()}>
        <Text style={styles.buttonText}>{busy ? "Memproses..." : enabled ? "Uji notifikasi" : "Aktifkan notifikasi & bunyi"}</Text>
      </TouchableOpacity>
      {enabled ? <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: sound }} disabled={busy} style={styles.button} onPress={() => void toggleSound()}><Text style={styles.buttonText}>Bunyi: {sound ? "aktif" : "mati"}</Text></TouchableOpacity> : null}
    </View>
    {status ? <Text style={styles.caption} accessibilityLiveRegion="polite">{status}</Text> : null}
    {error ? <TouchableOpacity accessibilityRole="button" onPress={() => reloadRef.current()}><Text style={styles.error}>{error}</Text></TouchableOpacity> : null}
    {expanded ? <ScrollView style={styles.inbox} contentContainerStyle={styles.list}>
      {unread ? <TouchableOpacity accessibilityRole="button" onPress={() => void open()}><Text style={styles.buttonText}>Tandai semua dibaca</Text></TouchableOpacity> : null}
      {!items.length ? <Text style={styles.caption}>Belum ada notifikasi.</Text> : items.map((item) => <TouchableOpacity accessibilityRole="button" key={item.id} style={[styles.item, !item.read_at && styles.unread]} onPress={() => void open(item)}>
        <Text style={styles.title}>{item.title}{!item.read_at ? " · Baru" : ""}</Text><Text style={styles.caption}>{item.body}</Text>
        <Text style={styles.caption}>{new Date(item.created_at).toLocaleString("id-ID")}</Text>
      </TouchableOpacity>)}
    </ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#fff", borderColor: "#dce5dd", borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 42, justifyContent: "center", borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: "#edf4ee" },
  buttonText: { color: "#315c45", fontSize: 13, fontWeight: "700" },
  caption: { color: "#657168", fontSize: 12, lineHeight: 19 },
  error: { color: "#a04630", fontSize: 12, lineHeight: 19 },
  list: { gap: 9 },
  inbox: { maxHeight: 260 },
  item: { padding: 12, gap: 5, borderRadius: 9, borderWidth: 1, borderColor: "#e4eae5" },
  unread: { backgroundColor: "#f0f7f1", borderColor: "#bed4c2" },
  title: { color: "#20352a", fontSize: 14, fontWeight: "700" },
});
