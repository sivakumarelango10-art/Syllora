/**
 * ============================================================================
 * SYLLORA PUBLIC RUNTIME CONFIGURATION
 * ============================================================================
 * Safe public client configuration.
 * Contains ONLY public parameters intended for the browser runtime.
 * NEVER place database connection strings or secret service keys here.
 */

window.__SYLLORA_CONFIG__ = window.__SYLLORA_CONFIG__ || {
  PUBLIC_API_BASE_URL: "http://127.0.0.1:8000",
  PUBLIC_SUPABASE_URL: "https://lgiarosqejiaejizrxdu.supabase.co",
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_AasSK22U-NcZhWk4e-7VAA_FFAUyQIU",
  SUPABASE_STORAGE_BUCKET: "syllora-study-pdfs",
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024
};
