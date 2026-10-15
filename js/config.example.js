/* =====================================================================
 * config.example.js — PLANTILLA
 *
 * 1. Copia este archivo como js/config.js
 *    (js/config.js está en .gitignore: NUNCA se sube al repositorio)
 * 2. Pega los valores de tu proyecto Supabase:
 *    Supabase Dashboard → Project Settings → API
 *      - Project URL  → SUPABASE_URL
 *      - anon public   → SUPABASE_ANON_KEY
 *
 * La clave "anon/public" SÍ va en el navegador: es pública por diseño.
 * La seguridad no depende de ocultarla, sino de las políticas RLS
 * (supabase/schema.sql). NUNCA pongas aquí la service_role key.
 * ===================================================================== */

window.XP_CONFIG = {
  // URL pública del proyecto Supabase (termina en .supabase.co)
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",

  // Clave pública anon / publishable
  SUPABASE_ANON_KEY: "TU_CLAVE_ANON_PUBLICA",

  // Slug del tablero. Debe coincidir con el slug protegido en las
  // políticas RLS de supabase/schema.sql ('xp-tablero-9f3a7c2e').
  BOARD_SLUG: "xp-tablero-9f3a7c2e",

  // Nombres permitidos como autoría (deben coincidir con el CHECK de la BD)
  MEMBERS: ["Milca", "Diana", "Giovanni", "Christian", "Angel"]
};
