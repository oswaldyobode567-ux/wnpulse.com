import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

// Garder false tant que /auth/register ne valide et n'enregistre pas
// whatsapp_number et whatsapp_marketing_opt_in dans la base de données.
// Passer à true seulement après installation du backend correspondant.
const WHATSAPP_REGISTRATION_ENABLED = false;

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

  // Signature existante conservée pour les autres pages du projet.
  const register = async (email, password, full_name, referral_code = null) => {
    const cleanEmail = email.trim().toLowerCase();
    const payload = { email: cleanEmail, password, full_name };
    if (referral_code) payload.referral_code = referral_code.trim();
    const { data } = await api.post("/auth/register", payload);
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
    if (number && !/^\+[1-9]\d{7,14}$/.test(number)) {
      throw new Error("Renseigne le numéro WhatsApp avec + et l’indicatif du pays.");
    }
    if (whatsapp_marketing_opt_in && !number) {
      throw new Error("Le consentement WhatsApp nécessite un numéro.");
    }
    if (!number) {
      return register(email, password, full_name, referral_code);
    }
    if (!WHATSAPP_REGISTRATION_ENABLED) {
      throw new Error("L’enregistrement WhatsApp n’est pas encore disponible. Tu peux créer ton compte en laissant ce champ vide.");
    }

    const payload = {
      email: email.trim().toLowerCase(),
      password,
      full_name: full_name.trim(),
      whatsapp_number: number,
      whatsapp_marketing_opt_in,
    };
    if (referral_code) payload.referral_code = referral_code.trim();
    const { data } = await api.post("/auth/register", payload);
    return saveSession(data);
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
    <AuthContext.Provider value={{ user, loading, login, register, registerWithWhatsapp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
