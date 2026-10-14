/** Base URL of nhis-api. Public value only; never place secrets in VITE_* variables. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
