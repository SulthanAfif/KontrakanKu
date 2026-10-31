import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SiteHeader } from "@/components/SiteHeader";
import { AccountPage } from "@/pages/AccountPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { RoomDetailPage } from "@/pages/RoomDetailPage";

function NotFoundPage() {
  return <main className="account-content"><h1>Halaman tidak ditemukan</h1><p className="auth-copy">Halaman yang Anda cari tidak tersedia.</p></main>;
}

function SiteLayout() {
  return <><SiteHeader /><Routes><Route path="/" element={<HomePage />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/kamar/:id" element={<RoomDetailPage />} /><Route element={<ProtectedRoute />}><Route path="/akun" element={<AccountPage />} /></Route><Route path="*" element={<NotFoundPage />} /></Routes></>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><SiteLayout /></AuthProvider></BrowserRouter>;
}
