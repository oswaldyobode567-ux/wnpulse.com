import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("pronostix_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pronostix_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.get("/auth/me")
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("pronostix_user", JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem("pronostix_token");
        localStorage.removeItem("pronostix_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data } = await api.post("/auth/login", { email: cleanEmail, password });
    localStorage.setItem("pronostix_token", data.access_token);
    localStorage.setItem("pronostix_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, full_name, referral_code = null) => {
    const cleanEmail = email.trim().toLowerCase();
    const payload = { email: cleanEmail, password, full_name };
    if (referral_code) payload.referral_code = referral_code.trim();
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("pronostix_token", data.access_token);
    localStorage.setItem("pronostix_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("pronostix_token");
    localStorage.removeItem("pronostix_user");
    setUser(null);
  };

  const refresh = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    localStorage.setItem("pronostix_user", JSON.stringify(data));
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
