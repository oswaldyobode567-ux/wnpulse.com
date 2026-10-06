import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

function readCachedUser() {
  try {
    const raw = localStorage.getItem("pronostix_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser);
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

  function saveSession(data) {
    if (!data || typeof data.access_token !== "string" || !data.access_token || !data.user || typeof data.user !== "object") {
      throw new Error("La réponse du serveur ne contient pas une session valide.");
    }
    localStorage.setItem("pronostix_token", data.access_token);
    localStorage.setItem("pronostix_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  const login = async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data } = await api.post("/auth/login", { email: cleanEmail, password });
    return saveSession(data);
  };

  // Signature attendue par la nouvelle RegisterPage.jsx.
  const registerWithWhatsapp = async ({
    email,
    password,
    full_name,
    referral_code = null,
    whatsapp_number = null,
    whatsapp_marketing_opt_in = false,
  }) => {
    const number = (whatsapp_number || "").trim().replace(/[\s().-]/g, "");
    if (typeof whatsapp_marketing_opt_in !== "boolean") {
      throw new Error("Le choix de contact WhatsApp doit être vrai ou faux.");
    }
    if (!number) {
      throw new Error("Le numéro WhatsApp est obligatoire pour créer un compte.");
    }
    if (!/^\+[1-9]\d{7,14}$/.test(number)) {
      throw new Error("Renseigne le numéro WhatsApp avec + et l’indicatif du pays.");
    }
    const payload = {
      email: email.trim().toLowerCase(),
      password,
      name: full_name.trim(),
      full_name: full_name.trim(),
      whatsapp_number: number,
      whatsapp_marketing_opt_in,
    };
    if (referral_code) payload.referral_code = referral_code.trim();
    const { data } = await api.post("/auth/register", payload);
    return saveSession(data);
  };

  // Les anciens appels doivent maintenant fournir le numéro en 5e argument.
  const register = async (email, password, full_name, referral_code = null, whatsapp_number = null, whatsapp_marketing_opt_in = false) =>
    registerWithWhatsapp({ email, password, full_name, referral_code, whatsapp_number, whatsapp_marketing_opt_in });

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
    <AuthContext.Provider value={{ user, loading, login, register, registerWithWhatsapp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
