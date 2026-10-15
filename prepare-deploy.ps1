<#
  prepare-deploy.ps1 — Empaqueta la carpeta publicable "deploy/" para Netlify.

  Uso:   .\prepare-deploy.ps1

  ¿Por qué existe?  js/config.js está en .gitignore a propósito (nunca se
  sube al repositorio), por eso Netlify lo devolvía con 404 y la app caía
  en la pantalla "Falta la configuración de Supabase". Este script arma una
  carpeta de salida estática con SOLO los archivos que el navegador carga,
  incluyendo js/config.js, validando antes de publicar que no haya
  placeholders ni claves privilegiadas.

  Rutas de publicación (elegir una):
    A) Sitio manual (Netlify Drop):  arrastrar la carpeta deploy\ al sitio
       existente en https://app.netlify.com
    B) Sitio conectado a Git:        npx netlify-cli login
                                     npx netlify-cli link
                                     npx netlify-cli deploy --dir deploy --prod
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out  = Join-Path $root 'deploy'

# --- 1) Requisitos: config.js real, sin placeholders ni material privilegiado
$cfgPath = Join-Path $root 'js\config.js'
if (-not (Test-Path $cfgPath)) {
  throw "No existe js\config.js. Copia js\config.example.js a js\config.js y pega la Project URL y la clave anon/public de Supabase."
}
$cfg = Get-Content $cfgPath -Raw
foreach ($name in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BOARD_SLUG')) {
  if ($cfg -notmatch [regex]::Escape($name)) { throw "js\config.js no define $name." }
}
if ($cfg -match 'TU-PROYECTO|TU_CLAVE') {
  throw 'js\config.js todavia tiene placeholders de la plantilla (TU-PROYECTO / TU_CLAVE). Pega los valores reales antes de publicar.'
}
if ($cfg -match 'service_role|sb_secret_') {
  throw 'js\config.js contiene una clave PRIVILEGIADA (service_role / sb_secret_). Nunca se publica en el frontend; usa solo la anon/public.'
}

# --- 2) Carpeta de salida limpia (siempre desde cero: evita deploy\deploy)
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

# --- 3) Copiar SOLO lo que el navegador carga en runtime
Copy-Item (Join-Path $root 'index.html')   $out
Copy-Item (Join-Path $root 'netlify.toml') $out
New-Item -ItemType Directory -Path (Join-Path $out 'css') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $out 'js')  | Out-Null
Copy-Item (Join-Path $root 'css\styles.css') (Join-Path $out 'css')
foreach ($f in @('app.js', 'ui.js', 'supabase-service.js', 'config.js')) {
  Copy-Item (Join-Path $root "js\$f") (Join-Path $out 'js')
}
# NO se copian: supabase\ (SQL), data\ (seed.json no se usa en runtime),
# README.md, package.json, .git, node_modules, js\config.example.js.

# --- 4) Verificacion obligatoria de la salida
$required = @(
  'index.html', 'netlify.toml', 'css\styles.css',
  'js\app.js', 'js\ui.js', 'js\supabase-service.js', 'js\config.js'
)
foreach ($f in $required) {
  if (-not (Test-Path (Join-Path $out $f))) { throw "Falta $f dentro de deploy\" }
}

# --- 5) Barrido de secretos privilegiados en TODO el paquete
$hits = Get-ChildItem $out -Recurse -File |
        Select-String -Pattern 'service_role|sb_secret_[a-zA-Z0-9]|postgres(ql)?://[^"\s]+:[^"\s]+@'
if ($hits) {
  throw ("Secreto privilegiado detectado en: " + (($hits | ForEach-Object { $_.Path }) -join ', '))
}

# --- 6) Resumen
$files = Get-ChildItem $out -Recurse -File
$kb    = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1KB), 1)
Write-Host ''
Write-Host ("deploy\ listo: " + $files.Count + " archivos, " + $kb + " KB") -ForegroundColor Green
$files | ForEach-Object { Write-Host ('  ' + $_.FullName.Substring($out.Length + 1)) }
Write-Host ''
Write-Host 'Siguiente paso (elegir UNA ruta):' -ForegroundColor Cyan
Write-Host '  A) Sitio manual (Drop)   -> arrastra la carpeta deploy\ al sitio existente en app.netlify.com'
Write-Host '  B) Sitio conectado a Git -> npx netlify-cli login; npx netlify-cli link; npx netlify-cli deploy --dir deploy --prod'
