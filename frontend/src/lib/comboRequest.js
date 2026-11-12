import api from "@/lib/api";

export async function loadComboData(url, config) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.get(url, config);
    } catch (error) {
      if (attempt >= 2 || config.signal?.aborted || error.response?.status !== 503) throw error;
      const seconds = Number(error.response.headers?.["retry-after"]) || 3;
      await new Promise(resolve => window.setTimeout(resolve, Math.min(5, Math.max(1, seconds)) * 1000));
      if (config.signal?.aborted) throw error;
    }
  }
}
