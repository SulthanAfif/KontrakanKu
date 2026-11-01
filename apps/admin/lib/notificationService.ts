import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const tokenKey = "admin-push-token";
let soundEnabled = true;
let registration: Promise<string> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Foreground alerts are presented by the inbox listener to avoid two sounds.
    const show = AppState.currentState !== "active" || notification.request.content.data?.local === true;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show && soundEnabled, shouldSetBadge: false };
  },
});

async function channels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("booking-alerts", {
    name: "Pengajuan sewa", importance: Notifications.AndroidImportance.HIGH,
    sound: "default", vibrationPattern: [0, 200, 100, 200],
  });
  await Notifications.setNotificationChannelAsync("booking-silent", {
    name: "Pengajuan sewa tanpa bunyi", importance: Notifications.AndroidImportance.DEFAULT, sound: null,
  });
}

async function registerNotifications(userId: string, sound: boolean): Promise<string> {
  soundEnabled = sound;
  await channels();
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Izin notifikasi belum diberikan. Aktifkan melalui pengaturan perangkat.");
  if (!Device.isDevice) return "Notifikasi aktif saat aplikasi dibuka. Push memerlukan perangkat fisik.";
  if (Platform.OS === "android" && !Constants.expoConfig?.extra?.pushConfigured) {
    return "Notifikasi dan bunyi aktif saat aplikasi dibuka. Notifikasi saat aplikasi ditutup menunggu konfigurasi Firebase.";
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || !supabase) return "Notifikasi aktif saat aplikasi dibuka.";
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const previous = await AsyncStorage.getItem(tokenKey);
  if (previous && previous !== token) await supabase.from("admin_push_tokens").delete().eq("token", previous);
  // A shared device can only belong to the currently signed-in admin.
  const { error } = await supabase.from("admin_push_tokens").upsert({ token, user_id: userId, sound_enabled: sound, updated_at: new Date().toISOString() });
  if (error) throw new Error("Perangkat belum berhasil didaftarkan. Coba aktifkan notifikasi kembali.");
  await AsyncStorage.setItem(tokenKey, token);
  return "Notifikasi dan bunyi aktif, termasuk saat aplikasi ditutup.";
}

export async function enableNotifications(userId: string, sound: boolean): Promise<string> {
  if (registration) return registration;
  registration = registerNotifications(userId, sound);
  try { return await registration; }
  finally { registration = null; }
}

export async function setNotificationSound(enabled: boolean): Promise<void> {
  soundEnabled = enabled;
  const token = await AsyncStorage.getItem(tokenKey);
  if (token && supabase) {
    const { error } = await supabase.from("admin_push_tokens").update({ sound_enabled: enabled, updated_at: new Date().toISOString() }).eq("token", token);
    if (error) throw new Error("Pengaturan bunyi belum tersimpan. Coba lagi.");
  }
}

export async function presentNotification(title: string, body: string, id: number, test = false) {
  if (!test && AppState.currentState !== "active") return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await channels();
  await Notifications.scheduleNotificationAsync({
    identifier: `admin-${test ? "test" : id}`,
    content: { title, body, sound: soundEnabled ? "default" : false, data: { local: true, screen: "Booking", notificationId: id, test } },
    trigger: { channelId: soundEnabled ? "booking-alerts" : "booking-silent" },
  });
}

export function onNotificationOpen(callback: () => void) {
  const open = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (data?.screen === "Booking" && !data.test) callback();
    Notifications.clearLastNotificationResponse();
  };
  const listener = Notifications.addNotificationResponseReceivedListener(open);
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last);
  return () => listener.remove();
}

export async function restoreNotifications(userId: string, sound: boolean): Promise<string | null> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted ? enableNotifications(userId, sound) : null;
}

export async function unregisterNotifications() {
  // Finish any in-flight registration before deleting, so logout cannot leave a new token behind.
  await registration?.catch(() => {});
  const token = await AsyncStorage.getItem(tokenKey);
  if (token && supabase) {
    const { error } = await supabase.from("admin_push_tokens").delete().eq("token", token);
    if (error) throw new Error("Perangkat belum dapat dilepas dari notifikasi. Coba keluar kembali.");
  }
  await AsyncStorage.removeItem(tokenKey);
  await Notifications.dismissAllNotificationsAsync();
}
