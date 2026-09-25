export const env = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
} as const;
