import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const registered = searchParams.get("registered") === "1";
  const nextPath = (location.state as { next?: string } | null)?.next ?? "/akun";

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") setTurnstileToken(detail);
    };
    window.addEventListener("turnstile", handler);
    if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      document.head.appendChild(s);
    }
    (window as unknown as { onTurnstileSuccess?: (token: string) => void }).onTurnstileSuccess = (token: string) => {
      window.dispatchEvent(new CustomEvent("turnstile", { detail: token }));
    };
    return () => {
      window.removeEventListener("turnstile", handler);
    };
  }, []);

  async function handleGoogleSignIn() {
    setError("");
    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Lengkapi apps/customer/.env.local terlebih dahulu.");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Silakan selesaikan verifikasi Cloudflare terlebih dahulu.");
      return;
    }
    setBusy(true);
    const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/akun";
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${safeNextPath}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Lengkapi apps/customer/.env.local terlebih dahulu.");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Silakan selesaikan verifikasi Cloudflare terlebih dahulu.");
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError("Email atau kata sandi tidak cocok. Pastikan email sudah dikonfirmasi.");
      setBusy(false);
      return;
    }
    navigate(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/akun", { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
        <h1>Masuk ke akun</h1>
        <p className="auth-copy">Lihat pengajuan dan informasi rumah petak Anda. Gunakan email yang sudah terdaftar atau lanjutkan dengan Google.</p>
        {registered ? <p className="success-message">Akun berhasil dibuat. Jika diminta, konfirmasi email sebelum masuk.</p> : null}
        {error ? <p className="error-message">{error}</p> : null}

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>

          {TURNSTILE_SITE_KEY ? (
            <div className="turnstile-wrap">
              <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-callback="onTurnstileSuccess" data-theme="light" />
            </div>
          ) : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Memproses..." : "Masuk"} <span>↗</span>
          </button>
        </form>

        <p className="auth-divider">atau</p>

        <button className="google-button" type="button" disabled={busy} onClick={() => void handleGoogleSignIn()}>
          <GoogleLogo />
          {busy ? "Menghubungkan..." : "Lanjutkan dengan Google"}
        </button>

        <p className="auth-switch">Belum punya akun? <Link to="/register">Daftar di sini</Link></p>
      </section>
    </main>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ marginRight: 10, flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
