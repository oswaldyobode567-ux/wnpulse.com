import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

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
