import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase?.auth.signOut();
    navigate("/");
  }

  return (
    <header className="topbar">
      <Link className="brand brand-lockup" to="/" aria-label="KontrakanKu beranda"><img className="brand-logo" src="/logo.png" alt="" /><span className="brand-wordmark">KontrakanKu</span></Link>
      <button className={`menu-toggle${menuOpen ? " menu-open" : ""}`} type="button" aria-label={menuOpen ? "Tutup menu" : "Buka menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button>
      <nav className={menuOpen ? "nav-open" : ""}>
        <a href="/#kamar" onClick={() => setMenuOpen(false)}>Cari rumah petak</a>
        <a href="/#lokasi" onClick={() => setMenuOpen(false)}>Lokasi</a>
        <a href="/#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
        <a href="/#tentang" onClick={() => setMenuOpen(false)}>Tentang kami</a>
        {user ? <Link className="login-link" to="/akun" onClick={() => setMenuOpen(false)}>Akun saya</Link> : <Link className="login-link" to="/login" onClick={() => setMenuOpen(false)}>Masuk</Link>}
        {user ? <button className="text-button" type="button" onClick={() => { setMenuOpen(false); void signOut(); }}>Keluar</button> : null}
      </nav>
    </header>
  );
}
