import axios from "axios";

// Keep existing Vercel REACT_APP_BACKEND_URL; VITE_BACKEND_URL is also supported.
const BACKEND_URL = (import.meta.env.REACT_APP_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || "https://wnpulsecom-production.up.railway.app").trim().replace(/\/+$/, "");
export const API = BACKEND_URL.endsWith("/api") ? BACKEND_URL : `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pronostix_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("pronostix_token");
      localStorage.removeItem("pronostix_user");
      if (window.location.pathname.startsWith("/app")) {
        window.location.href = "/login";
      } 
    }
    return Promise.reject(err);
  }
);

export default api;
