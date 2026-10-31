import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="account-content"><p className="auth-copy">Memeriksa sesi Anda...</p></main>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ next: location.pathname }} />;
  }

  return <Outlet />;
}
