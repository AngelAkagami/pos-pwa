# Tablero XP · Gestión de equipos e incidencias

Tablero de actividades semanales para un proyecto académico de ingeniería de
software, construido con **Extreme Programming (XP)**.

- **Frontend:** HTML5 semántico + CSS3 + JavaScript + **jQuery** (sin React/Angular/Vue).
- **Backend:** **Supabase** (PostgreSQL + Realtime) como única fuente de verdad.
- **Despliegue previsto:** Netlify (estático). **Todavía no se ha desplegado.**
- **Periodo:** 14 de octubre – 25 de noviembre de 2026 (`America/Mexico_City`).
- **Equipo:** Milca, Diana, Giovanni, Christian y Angel.

Seis tarjetas semanales (30 actividades) + 5 actividades de entrega final,
con checkboxes, responsables, progreso global y por semana, filtros, edición
en línea, exportación Markdown/CSV y **sincronización en tiempo real entre
dispositivos sin recargar**.

---

## ⚠️ Aviso de seguridad y acceso (léelo)

Este MVP usa **acceso público por enlace**:

- El acceso se limita a un tablero concreto mediante un **slug** no trivial
  (`xp-tablero-9f3a7c2e`) y políticas RLS en `supabase/schema.sql`.
- **El slug no es una protección de acceso real.** No es autenticación ni
  autorización: solo delimita a qué tablero alcanzan las políticas. Cualquier
  persona que tenga la URL pública y la clave `anon` (que, por diseño, es
  pública) **puede leer y editar** este tablero.
- **El enlace puede reenviarse.** Quien lo posea podrá editar. Esto se acepta
  explícitamente para el MVP académico; no se puede limitar el acceso a
  exactamente cinco personas sin autenticación.
- **Los nombres de autoría son autodeclarados.** `updated_by` puede
  suplantarse: la identificación es informal para el equipo, no control de
  acceso.
- Las políticas RLS **no exponen otros tablas ni permiten borrar** filas:
  no existe política `DELETE`, así que la "eliminación" es un archivado
  lógico (`archived_at`).
- **Nunca** se usa ni debe usarse la clave `service_role` de Supabase en el
  frontend. La seguridad depende de las políticas RLS, no de ocultar la clave
  `anon`.

**Mejora posterior recomendada:** Supabase Auth anónimo + una Edge Function
que valide un token de invitación compartido por el equipo, para que el
enlace deje de ser suficiente por sí solo.

---

## Estructura del proyecto

```text
xp-board/
├── index.html               # HTML semántico (tarjetas, filtros, diálogos)
├── css/
│   └── styles.css           # Responsive desde 320px, foco, contraste
├── js/
│   ├── config.example.js    # PLANTILLA → copiar a js/config.js
│   ├── app.js               # Estado, eventos, realtime, guardado
│   ├── supabase-service.js  # Única capa que habla con Supabase
│   └── ui.js                # Render con jQuery (sin innerHTML de datos)
├── data/
│   └── seed.json            # Datos exactos del tablero (fuente del seed)
├── supabase/
│   ├── schema.sql           # Tablas, constraints, triggers, RLS, realtime
│   └── seed.sql             # Seed idempotente (ON CONFLICT DO NOTHING)
├── netlify.toml             # Preparación para Netlify (sin desplegar)
├── .gitignore               # Ignora js/config.js y secretos
└── README.md
```

---

## Puesta en marcha

### 1. Crear el proyecto Supabase

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo.
2. Abre **SQL Editor** → **New query** → pega el contenido de
   **`supabase/schema.sql`** → **Run**.
3. En el mismo editor, pega y ejecuta **`supabase/seed.sql`** → **Run**.
4. Verifica (debe responder `6` semanas y `35` actividades):

   ```sql
   select (select count(*) from public.weeks)  as semanas,
          (select count(*) from public.tasks)  as actividades;
   ```

> **El seed es idempotente:** usa `ON CONFLICT DO NOTHING` con IDs
> estables. Ejecutarlo una segunda vez **no duplica** actividades ni
> restaura los avances (`completed` nunca se actualiza desde el seed).

### 2. Configurar el frontend

```powershell
copy js\config.example.js js\config.js   # Windows
# cp js/config.example.js js/config.js   # macOS / Linux
```

Edita `js/config.js` con los valores de **Supabase Dashboard → Project
Settings → API**:

| Variable            | Origen                                    |
| ------------------- | ----------------------------------------- |
| `SUPABASE_URL`      | Project URL (`https://xxx.supabase.co`)   |
| `SUPABASE_ANON_KEY` | `anon` / `public` key                     |
| `BOARD_SLUG`        | `xp-tablero-9f3a7c2e` (no cambiar sin editar RLS) |
| `MEMBERS`           | Los cinco integrantes                     |

`js/config.js` está en `.gitignore`: **no se sube al repositorio**. La clave
`anon` es pública por diseño, pero aun así no la compartas de más.

> Si cambias el slug, cambia **todas** sus apariciones en
> `supabase/schema.sql` (políticas `boards_select_target`,
> `target_board_id`) y en `js/config.js`.

### 3. Ejecutar en local

No basta con abrir `index.html` con doble clic en algunos navegadores
(restricciones de `file://`); usa un servidor estático:

```powershell
npx serve .
# o
python -m http.server 8080
```

Abre <http://localhost:8080> (o la ruta que indique la herramienta).

**Sin `js/config.js` la app muestra la pantalla de configuración** con estas
instrucciones; nunca finge que sincroniza.

### 4. Probar la sincronización con dos dispositivos

1. Abre el tablero en la **computadora** (navegador A) y en el **celular**
   (navegador B), ambos con la misma URL.
2. En A elige tu nombre cuando aparezca **Identificado como**.
3. Marca un checkbox en A → B debe verlo cambiar **sin recargar**, con el
   aviso `Cambio recibido de …`.
4. Desmarca en B → A lo ve cambiar.
5. Edita el texto o los responsables de una actividad en A → B lo ve.
6. Agrega una actividad en B → aparece en A con su ID (`T-XXXXXXXX`).
7. Recarga cualquiera de los dos: **los cambios siguen ahí** (Supabase es la
   fuente de verdad; `localStorage` solo guarda preferencias de UI).

---

## Funcionalidades

| Función | Cómo funciona |
| --- | --- |
| Progreso global | Barra superior con `N de M actividades completadas` y %; se recalcula al instante. |
| Progreso semanal | Contador `n/m` en cada tarjeta + barra y texto dentro de la tarjeta. |
| Cierre final | Sección `Entrega final — 25 de noviembre` con su propio contador y barra. |
| Checkboxes | Escritura optimista con reversión; guardan `completed`, `updated_by`, `updated_at`. |
| Edición | Diálogo con descripción, semana, 1–2 responsables y fecha opcional. |
| Alta | `Nueva actividad` → semana o entrega final; posición estable al final de la tarjeta. |
| Baja | `Archivar` con confirmación → borrado lógico (`archived_at`), nunca `DELETE`. |
| Filtros | Semana, integrante, estado y búsqueda + `Limpiar filtros`; estado vacío si no hay coincidencias. |
| Vistas | `Expandir todas` / `Contraer todas` y chevrón por tarjeta; la elección se recuerda localmente. |
| Autoría | Selector de uno de los cinco nombres, recordado en `localStorage`. No es autenticación. |
| Exportar | Copiar resumen en Markdown o descargar CSV con el estado actual. |
| Rutina XP | Sección informativa: planificación, parejas driver/navigator, CI, demo + retrospectiva. |

### Concurrencia (control optimista con `version`)

1. La tabla `tasks` tiene una columna `version` y un trigger `BEFORE UPDATE`
   que fija `updated_at = now()` y hace `version = version + 1`.
2. El cliente envía `WHERE id = … AND version = <leída>`; el servicio
   **verifica que la escritura afecte exactamente una fila** (`.select()` +
   comprobación de longitud).
3. **1 fila** → guardado correcto. **0 filas** → otra persona cambió la
   actividad primero: se muestra `Otra persona modificó esta actividad…` y
   se recarga la versión más reciente (política predecible: gana la última
   escritura válida; nunca se pisa en silencio).
4. **Error de red/permisos** → se **revierte** el cambio optimista, aparece
   `Error al guardar` con botón **Reintentar** (que vuelve a aplicar el
   cambio sobre la versión vigente). Nunca se muestra "guardado" si falló.

### Estado de la conexión

La barra bajo el encabezado muestra estados reales:
`Cargando…` · `En vivo · sincronizado` · `Guardando…` · `Guardado ✓` ·
`Sin conexión (N pendientes)` · `Error al guardar (Reintentar)`.

Si el navegador se queda sin red, los cambios se encolan y se envían
automáticamente al recuperar conexión (`online`/`offline` + reconexión del
canal Realtime).

---

## Datos iniciales

`data/seed.json` contiene el tablero acordado:

- **6 semanas** con fechas, objetivo y entregable exactos.
- **30 actividades semanales** (4 + 5 + 5 + 5 + 5 + 6) con sus parejas.
- **5 actividades de entrega final** (`F-1` … `F-5`), sin pareja asignada
  (se muestran como *Todo el equipo*).
- Todas inician en `completed: false`; los IDs son estables
  (`W1-T1` … `W6-T6`, `F-1` … `F-5`).

`supabase/seed.sql` se generó a partir de ese JSON. Si necesitas regenerarlo
tras editar el JSON, vuelve a generarlo con el mismo patrón
(`INSERT … ON CONFLICT DO NOTHING`).

---

## Despliegue en Netlify (sitio conectado a GitHub)

- **Sitio:** <https://tablero-kenal.netlify.app/> — conectado al repositorio
  de GitHub; **cada `git push` genera un deploy automático**.
- `js/config.js` **no** está en el repositorio (`.gitignore`); en cada build
  lo genera `scripts/generate-config.js` a partir de las **Environment
  variables** del sitio (Netlify → *Site configuration → Environment
  variables*):

  | Variable | Valor / origen | Obligatoria |
  | --- | --- | --- |
  | `SUPABASE_URL` | Project URL (`https://sfotsgmjxlkvotyttaoa.supabase.co`) | sí |
  | `SUPABASE_ANON_KEY` | clave `anon` / `publishable` (pública por diseño) | sí |
  | `SUPABASE_BOARD_SLUG` | default `xp-tablero-9f3a7c2e` | no |
  | `SUPABASE_MEMBERS` | `Milca,Diana,Giovanni,Christian,Angel` | no |

- `netlify.toml` define `command = "node scripts/generate-config.js"` y
  `publish = "."`, más las cabeceras de seguridad.
- **Si falta una variable obligatoria el build falla a propósito**: no se
  publica una versión rota y el deploy anterior sigue visible hasta corregir
  y reintentar (*Deploys → Retry deploy*).
- **Nunca** configures `service_role` ni `sb_secret_` en Netlify: el
  frontend solo usa la clave anon y la seguridad la dan las políticas RLS
  de `supabase/schema.sql`.
- Verificación: `https://tablero-kenal.netlify.app/js/config.js` debe
  responder **200** con `window.XP_CONFIG` (si da 404, falta el build;
  si da 404 o el build falla, revisa las variables).
- **Emergencia (deploy manual sin tocar Git):** `.\prepare-deploy.ps1` y
  arrastrar la carpeta `deploy\` a la pestaña *Deploys* del sitio existente.

---

## Criterios de aceptación y cómo verificarlos

- [ ] **Móvil:** abre la URL en un celular; una columna, controles ≥ 44px, sin scroll horizontal.
- [ ] **Dos navegadores** muestran el mismo tablero (mismos 6+1 bloques y contadores).
- [ ] **A marca → B lo ve** automáticamente (aviso `Cambio recibido de …`).
- [ ] **Recargar/reiniciar** mantiene los checkboxes (Supabase, no `localStorage`).
- [ ] **B desmarca → A lo ve** cambiar.
- [ ] **Editar texto/responsables** en A se refleja en B.
- [ ] **Agregar actividad** aparece en todos con ID estable `T-XXXXXXXX`.
- [ ] **Filtros** funcionan en móvil y escritorio sin alterar datos guardados.
- [ ] **Barras y porcentajes** se recalculan (globales, semanales y cierre).
- [ ] **6 semanas y 5 tareas finales** con las fechas indicadas (`seed.sql`).
- [ ] **Segunda ejecución del seed** no duplica ni restaura (`ON CONFLICT DO NOTHING`).
- [ ] **Error de red/permisos** muestra mensaje visible y no afirma guardado.
- [ ] **RLS:** otro tablero o datos ajenos no son accesibles (no hay políticas para ellos).
- [ ] **Sin secretos:** no hay `service_role` ni credenciales de BD en el repo.
- [ ] **README** documenta desarrollo local, Supabase, SQL, seed y Netlify.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| Pantalla "Falta la configuración de Supabase" | No existe `js/config.js` | Copia `config.example.js` y pega URL + clave anon. |
| `No existe el tablero "…"` | No corriste el seed | Ejecuta `supabase/seed.sql`. |
| `Permisos denegados (RLS)` | Schema viejo o slug distinto | Reejecuta `schema.sql` y revisa `BOARD_SLUG`. |
| No llegan cambios en vivo | Realtime deshabilitado | Ejecuta el bloque final de `schema.sql` (publicación) y recarga. |
| `Error al guardar` persistente | Red o RLS | Pulsa **Reintentar**; revisa la consola y las políticas. |
| La app no carga librerías | CDN bloqueado | Permite `cdn.jsdelivr.net` o descarga los bundles localmente. |

---

## Ideas para la siguiente iteración

1. Supabase Auth anónimo + Edge Function que valide un token de invitación.
2. Web Push nativo para avisos "cambio recibido" con la app cerrada.
3. Vista de historial (`task_events`) para auditar quién cambió qué.
4. Subtareas por actividad y arrastrar y soltar para ordenar.
