import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Alert, Image, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import { AdminWorkspace } from "./admin/AdminWorkspace";

WebBrowser.maybeCompleteAuthSession();

type Access = "loading" | "signedOut" | "forbidden" | "allowed";

export default function App() {
  const [access, setAccess] = useState<Access>("loading");
  const [message, setMessage] = useState("Memeriksa akses admin...");
  const [userEmail, setUserEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkAccess() {
    if (!supabase) {
      setMessage("Lengkapi konfigurasi Supabase di apps/admin/.env.local terlebih dahulu.");
      setAccess("signedOut");
      return;
    }
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      setUserEmail("");
      setMessage(error ? "Sesi tidak dapat diperiksa. Silakan masuk kembali." : "Masuk sebagai admin untuk melihat data pengelolaan.");
      setAccess("signedOut");
      return;
    }
    setUserEmail(user.email ?? "");
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError || !profile || !["admin", "pemilik"].includes(profile.role)) {
      setMessage(profileError ? `Gagal memeriksa role: ${profileError.message}` : "Akun ini belum memiliki akses admin. Ubah role profil menjadi admin atau pemilik di Supabase.");
      setAccess("forbidden");
      return;
    }
    setMessage("");
    setAccess("allowed");
  }

  useEffect(() => { void checkAccess(); }, []);

  async function signIn() {
    if (!supabase) return setMessage("Supabase belum dikonfigurasi.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      Alert.alert("Tidak dapat masuk", error.message);
      return;
    }
    await checkAccess();
    setBusy(false);
  }

  async function signInWithGoogle() {
    if (!supabase) return setMessage("Supabase belum dikonfigurasi.");
    const redirectTo = Platform.OS === "web" ? window.location.origin : Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: Platform.OS !== "web" } });
    if (error || !data.url) {
      Alert.alert("Tidak dapat masuk dengan Google", error?.message ?? "URL autentikasi tidak tersedia.");
      return;
    }
    if (Platform.OS === "web") {
      window.location.assign(data.url);
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;
    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    if (!code) return Alert.alert("Login Google gagal", "Supabase tidak mengembalikan kode autentikasi.");
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return Alert.alert("Login Google gagal", exchangeError.message);
    await checkAccess();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setAccess("signedOut");
    setMessage("Anda sudah keluar.");
  }

  if (access === "allowed") return <SafeAreaView style={styles.app}><AdminWorkspace onSignOut={() => void signOut()} userEmail={userEmail} /></SafeAreaView>;

  return <SafeAreaView style={styles.loginPage}><View style={styles.loginCard}>
    <View style={styles.loginBrand}><View style={styles.logo}><Image source={require("../assets/logo.png")} style={styles.logoImage} resizeMode="contain" /></View><Text style={styles.loginWordmark}>KontrakanKu</Text></View>
    <Text style={styles.kicker}>KONTRAKANKU · ADMIN</Text>
    <Text style={styles.title}>{access === "loading" ? "Memeriksa akses" : access === "forbidden" ? "Akses belum tersedia" : "Masuk ke panel admin"}</Text>
    <Text style={styles.description}>{access === "loading" ? "Memuat akun dan hak akses Anda." : message}</Text>
    {access === "loading" ? <ActivityIndicator color="#315c45" style={styles.spinner} /> : null}
    {access === "forbidden" ? <TouchableOpacity style={[styles.submit, styles.secondary]} onPress={() => void signOut()}><Text style={[styles.submitText, styles.secondaryText]}>Keluar dan ganti akun</Text></TouchableOpacity> : null}
    {access === "signedOut" ? <>
      <TouchableOpacity style={styles.google} onPress={() => void signInWithGoogle()}><Text style={styles.googleText}>Lanjutkan dengan Google</Text></TouchableOpacity>
      <Text style={styles.divider}>atau masuk dengan email</Text>
      <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Kata sandi" secureTextEntry value={password} onChangeText={setPassword} />
      <TouchableOpacity style={styles.submit} disabled={busy} onPress={() => void signIn()}><Text style={styles.submitText}>{busy ? "Memeriksa..." : "Masuk"}</Text></TouchableOpacity>
    </> : null}
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#f5f7f5" },
  loginPage: { flex: 1, backgroundColor: "#f3f6f4", alignItems: "center", justifyContent: "center", padding: 24 },
  loginCard: { width: "100%", maxWidth: 500, padding: 32, borderRadius: 20, borderWidth: 1, borderColor: "#e4eae5", backgroundColor: "#fff", shadowColor: "#1f3b2b", shadowOpacity: 0.08, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  loginBrand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  logo: { width: 58, height: 58, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImage: { width: 62, height: 62 },
  loginWordmark: { color: "#1f2d25", fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  kicker: { color: "#9a774f", fontSize: 11, fontWeight: "700", letterSpacing: 1.8 },
  title: { color: "#1f2d25", fontSize: 30, fontWeight: "800", marginTop: 10, letterSpacing: -0.5 },
  description: { color: "#6d7a71", fontSize: 14.5, lineHeight: 22, marginTop: 10, marginBottom: 14 },
  spinner: { marginTop: 16 },
  google: { borderWidth: 1, borderColor: "#dbe4dc", borderRadius: 11, alignItems: "center", justifyContent: "center", minHeight: 52, padding: 14, marginTop: 12, backgroundColor: "#fbfdfb" },
  googleText: { color: "#29382f", fontSize: 15, fontWeight: "700" },
  divider: { textAlign: "center", color: "#8a958d", fontSize: 12, marginVertical: 15 },
  input: { minHeight: 52, borderWidth: 1, borderColor: "#dbe4dc", borderRadius: 10, paddingHorizontal: 14, marginTop: 11, fontSize: 16, color: "#203027", backgroundColor: "#fbfcfb" },
  submit: { backgroundColor: "#2f6b4b", borderRadius: 11, alignItems: "center", justifyContent: "center", minHeight: 54, padding: 15, marginTop: 16 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondary: { backgroundColor: "#f4f7f4", borderWidth: 1, borderColor: "#e0e7e1" },
  secondaryText: { color: "#315c45" },
});
