-- =====================================================================
-- seed.sql — datos iniciales IDEMPOTENTES del Tablero XP
-- Generado a partir de data/seed.json. Ejecutar DESPUÉS de schema.sql
-- desde el SQL Editor de Supabase.
--
-- * Nunca actualiza completed: usa ON CONFLICT DO NOTHING, por lo que
--   una segunda ejecución NO duplica ni restaura avances.
-- * IDs estables: semanas md5(...), actividades W1-T1..W6-T6 y F-1..F-5.
-- * Contenido: 6 semanas, 30 actividades semanales, 5 finales.
-- * Tablero: xp-tablero-9f3a7c2e
-- =====================================================================

begin;

-- 1) Tablero
insert into public.boards (slug, title, starts_on, ends_on, timezone)
values ('xp-tablero-9f3a7c2e', 'Tablero XP — Gestión de equipos e incidencias', date '2026-10-14', date '2026-11-25', 'America/Mexico_City')
on conflict (slug) do nothing;

-- Semana 1: 2026-10-14 a 2026-10-20
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-1')::uuid, b.id, 1, date '2026-10-14', date '2026-10-20', 'Bases del sistema, seguridad y autenticación', 'Autenticación funcional, permisos base y definición de alumnos.', 10
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 2: 2026-10-21 a 2026-10-27
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-2')::uuid, b.id, 2, date '2026-10-21', date '2026-10-27', 'Administración de técnicos, alumnos y equipos', 'Catálogos administrables de técnicos, equipos y alumnos.', 20
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 3: 2026-10-28 a 2026-11-03
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-3')::uuid, b.id, 3, date '2026-10-28', date '2026-11-03', 'Códigos QR y registro de uso', 'Flujo completo de escaneo, inicio y finalización de uso.', 30
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 4: 2026-11-04 a 2026-11-10
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-4')::uuid, b.id, 4, date '2026-11-04', date '2026-11-10', 'Historiales y reportes de incidencias', 'Reportes de incidencias e historiales consultables desde móvil.', 40
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 5: 2026-11-11 a 2026-11-17
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-5')::uuid, b.id, 5, date '2026-11-11', date '2026-11-17', 'Atención y resolución de incidencias', 'Flujo de incidencia desde Pendiente hasta Resuelta.', 50
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 6: 2026-11-18 a 2026-11-24
insert into public.weeks (id, board_id, week_number, starts_on, ends_on, goal, deliverable, position)
select md5('xp-week-6')::uuid, b.id, 6, date '2026-11-18', date '2026-11-24', 'Panel administrativo, notificaciones y cierre técnico', 'Panel, estadísticas, exportaciones y notificaciones integradas.', 60
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (board_id, week_number) do nothing;

-- Semana 1 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W1-T1', b.id, w.id, 'Definir roles y permisos; implementar guard de autorización y pruebas de acceso.', array['Milca', 'Giovanni'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 1
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W1-T2', b.id, w.id, 'Login web de administrador, validación de rol y manejo de errores.', array['Diana', 'Christian'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 1
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W1-T3', b.id, w.id, 'Login móvil, consumo de autenticación y almacenamiento seguro de sesión.', array['Angel', 'Milca'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 1
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W1-T4', b.id, w.id, 'Modelo de alumnos y definición del mecanismo de alta; revisar criterios pendientes.', array['Giovanni', 'Diana'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 1
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Semana 2 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W2-T1', b.id, w.id, 'Alta de técnicos, validación de correo/usuario y confirmación visual.', array['Milca', 'Christian'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 2
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W2-T2', b.id, w.id, 'Alta de equipos, validación de identificador y estado inicial Activo.', array['Diana', 'Angel'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 2
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W2-T3', b.id, w.id, 'Listado, edición y activación/desactivación de técnicos, conservando historial.', array['Giovanni', 'Christian'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 2
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W2-T4', b.id, w.id, 'Listado, filtros, edición y baja lógica/reactivación de equipos.', array['Milca', 'Diana'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 2
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W2-T5', b.id, w.id, 'Implementar el alta de alumnos acordada, baja lógica y conservación del historial.', array['Angel', 'Giovanni'], 50, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 2
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Semana 3 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W3-T1', b.id, w.id, 'Generación de identificador y QR; visualización, regeneración e invalidación del anterior.', array['Milca', 'Angel'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 3
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W3-T2', b.id, w.id, 'Escaneo móvil, permisos de cámara y validación del equipo.', array['Diana', 'Giovanni'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 3
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W3-T3', b.id, w.id, 'Confirmación y registro de uso; evitar registros activos duplicados.', array['Christian', 'Angel'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 3
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W3-T4', b.id, w.id, 'Finalizar uso, duración, liberación del equipo y resumen.', array['Milca', 'Diana'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 3
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W3-T5', b.id, w.id, 'Exportación de QR, plantilla de etiquetas y generación por lote.', array['Giovanni', 'Christian'], 50, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 3
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Semana 4 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W4-T1', b.id, w.id, 'Registro sin conexión, reintentos y pruebas de integración del uso.', array['Milca', 'Giovanni'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 4
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W4-T2', b.id, w.id, 'Historial de uso del alumno, paginación y estado vacío.', array['Diana', 'Christian'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 4
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W4-T3', b.id, w.id, 'Reporte de incidencias, validaciones, vinculación y folio.', array['Angel', 'Milca'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 4
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W4-T4', b.id, w.id, 'Adjuntar imágenes, validar formatos y configurar almacenamiento.', array['Giovanni', 'Diana'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 4
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W4-T5', b.id, w.id, 'Consulta de incidencias del alumno, detalle y actualización manual.', array['Christian', 'Angel'], 50, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 4
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Semana 5 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W5-T1', b.id, w.id, 'Login de soporte, listado de incidencias y detalle con evidencias.', array['Milca', 'Christian'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 5
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W5-T2', b.id, w.id, 'Tomar incidencias, asignación y control de concurrencia.', array['Diana', 'Angel'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 5
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W5-T3', b.id, w.id, 'Transiciones de estado, historial y permisos del técnico asignado.', array['Giovanni', 'Milca'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 5
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W5-T4', b.id, w.id, 'Resolución con solución obligatoria, fecha y visualización.', array['Christian', 'Diana'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 5
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W5-T5', b.id, w.id, 'Mis incidencias, historial del técnico y consulta rápida mediante QR.', array['Angel', 'Giovanni'], 50, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 5
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Semana 6 — actividades
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T1', b.id, w.id, 'Registros de uso administrativos, filtros, paginación y consistencia.', array['Milca', 'Diana'], 10, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T2', b.id, w.id, 'Incidencias administrativas, filtros, detalles y antigüedad.', array['Giovanni', 'Christian'], 20, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T3', b.id, w.id, 'Estadísticas, agregados y dashboard por periodo.', array['Angel', 'Milca'], 30, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T4', b.id, w.id, 'Exportación PDF/CSV con filtros y fecha de generación.', array['Diana', 'Giovanni'], 40, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T5', b.id, w.id, 'Notificaciones push para alumno y técnico; navegación y destinatarios.', array['Christian', 'Angel'], 50, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'W6-T6', b.id, w.id, 'Logout, expiración de sesión y pruebas de rutas protegidas.', array['Milca', 'Christian'], 60, false
from public.boards b
join public.weeks w on w.board_id = b.id and w.week_number = 6
where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

-- Entrega final — 25 de noviembre (week_id es NULL, sin pareja: todo el equipo)
insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'F-1', b.id, null, 'Integrar las funcionalidades web, móvil y API.', array[]::text[], 110, false
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'F-2', b.id, null, 'Ejecutar pruebas de regresión y aceptación.', array[]::text[], 120, false
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'F-3', b.id, null, 'Corregir defectos críticos detectados.', array[]::text[], 130, false
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'F-4', b.id, null, 'Validar el cumplimiento de las historias y la Definition of Done.', array[]::text[], 140, false
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

insert into public.tasks (id, board_id, week_id, description, assignees, position, completed)
select 'F-5', b.id, null, 'Realizar la demostración final y entregar la documentación técnica.', array[]::text[], 150, false
from public.boards b where b.slug = 'xp-tablero-9f3a7c2e'
on conflict (id) do nothing;

commit;

-- Verificación: deben salir 6 filas de semanas y 35 filas de actividades.
-- select (select count(*) from public.weeks) as semanas, (select count(*) from public.tasks) as actividades;
