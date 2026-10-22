/**
 * Base URL of nhis-api. Public value only; never place secrets in VITE_* variables.
 * `import.meta.env?.` keeps the module loadable under Node (unit tests), where Vite does not provide `env`.
 */
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
