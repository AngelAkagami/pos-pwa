/* =====================================================================
 * scripts/generate-config.js — paso de BUILD de Netlify
 *
 * Genera js/config.js a partir de las Environment variables del sitio
 * (Netlify → Site configuration → Environment variables). Así el archivo
 * sigue fuera del repositorio (.gitignore) pero SÍ llega al publicado
 * en cada deploy conectado a GitHub.
 *
 * Variables:
 *   SUPABASE_URL        (obligatoria) Project URL  https://xxx.supabase.co
 *   SUPABASE_ANON_KEY   (obligatoria) clave anon/publishable (pública)
 *   SUPABASE_BOARD_SLUG (opcional)    default xp-tablero-9f3a7c2e
 *   SUPABASE_MEMBERS    (opcional)    "Milca,Diana,Giovanni,Christian,Angel"
 *
 * Si falta una variable obligatoria, el script FALLA a propósito:
 * Netlify no publica una versión rota y el deploy anterior sigue visible.
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var OUT = path.join(__dirname, '..', 'js', 'config.js');
var DEFAULT_SLUG = 'xp-tablero-9f3a7c2e';
var DEFAULT_MEMBERS = ['Milca', 'Diana', 'Giovanni', 'Christian', 'Angel'];

function fail(msg) {
  console.error('');
  console.error('[generate-config] ERROR: ' + msg);
  console.error('[generate-config] Configura las variables en Netlify → Site configuration → Environment variables y vuelve a desplegar.');
  console.error('[generate-config] El deploy anterior sigue visible: no se publicó nada roto.');
  console.error('');
  process.exit(1);
}

var url = String(process.env.SUPABASE_URL || '').trim();
var key = String(process.env.SUPABASE_ANON_KEY || '').trim();
var slug = String(process.env.SUPABASE_BOARD_SLUG || '').trim() || DEFAULT_SLUG;
var members = String(process.env.SUPABASE_MEMBERS || '')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);
if (members.length === 0) members = DEFAULT_MEMBERS;

var missing = [];
if (!url) missing.push('SUPABASE_URL');
if (!key) missing.push('SUPABASE_ANON_KEY');
if (missing.length) {
  fail('Faltan variables de entorno obligatorias: ' + missing.join(', ') + '.');
}
if (/TU-PROYECTO|TU_CLAVE/.test(url + key)) {
  fail('Las variables contienen los placeholders de la plantilla (TU-PROYECTO / TU_CLAVE).');
}
if (/service_role|sb_secret_/i.test(url + key)) {
  fail('Las variables contienen una clave PRIVILEGIADA (service_role / sb_secret_). El frontend solo usa la clave anon/publishable; la seguridad la dan las políticas RLS.');
}
if (!/^https:\/\//.test(url)) {
  fail('SUPABASE_URL debe ser la Project URL de Supabase (https://xxx.supabase.co).');
}

var content = [
  '/* =====================================================================',
  ' * js/config.js — GENERADO AUTOMÁTICAMENTE en el build de Netlify',
  ' * por scripts/generate-config.js. NO EDITAR ni subir al repositorio.',
  ' * Origen: Environment variables del sitio (SUPABASE_URL,',
  ' * SUPABASE_ANON_KEY, SUPABASE_BOARD_SLUG, SUPABASE_MEMBERS).',
  ' * ===================================================================== */',
  '',
  'window.XP_CONFIG = {',
  '  SUPABASE_URL: ' + JSON.stringify(url) + ',',
  '  SUPABASE_ANON_KEY: ' + JSON.stringify(key) + ',',
  '  BOARD_SLUG: ' + JSON.stringify(slug) + ',',
  '  MEMBERS: ' + JSON.stringify(members),
  '};',
  ''
].join('\n');

fs.writeFileSync(OUT, content, 'utf8');
console.log('[generate-config] js/config.js generado → ' + url + ' | slug: ' + slug + ' | members: ' + members.join(', '));
