-- =====================================================================
-- Tablero XP — Gestión de equipos e incidencias
-- schema.sql — esquema reproducible para Supabase (PostgreSQL)
--
-- IMPORTANTE (seguridad):
-- * Este MVP usa ACCESO PÚBLICO POR ENLACE. Las políticas RLS de abajo
--   permiten a cualquier rol anónimo (cualquier visitante que tenga la
--   clave pública anon y el slug del tablero) LEER y EDITAR el tablero
--   "xp-tablero-9f3a7c2e". El slug NO es autenticación ni autorización:
--   solo delimita a qué tablero alcanzan las políticas.
-- * El enlace puede reenviarse; quien lo tenga podrá editar. Esto es una
--   limitación aceptada y documentada del MVP académico.
-- * La seguridad real (limitar a cinco personas) requiere Supabase Auth
--   + una Edge Function que valide un token de invitación. Ver README.
-- * NUNCA uses la clave service_role en el frontend.
-- * Si cambias el slug, cambia TODAS las apariciones de
--   'xp-tablero-9f3a7c2e' aquí y en js/config.js.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  starts_on   date not null,
  ends_on     date not null,
  timezone    text not null default 'America/Mexico_City',
  created_at  timestamptz not null default now()
);

comment on table public.boards is
  'Tablero del proyecto. Solo existe uno por MVP; RLS limita el acceso a su slug.';

-- ---------------------------------------------------------------------
-- weeks
-- ---------------------------------------------------------------------
create table if not exists public.weeks (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards (id) on delete cascade,
  week_number  integer not null check (week_number between 1 and 52),
  starts_on    date not null,
  ends_on      date not null,
  goal         text not null check (char_length(goal) between 1 and 300),
  deliverable  text not null check (char_length(deliverable) between 1 and 300),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint weeks_board_week_unique unique (board_id, week_number),
  constraint weeks_dates_check check (ends_on >= starts_on)
);

create index if not exists weeks_board_id_idx on public.weeks (board_id, position);

-- ---------------------------------------------------------------------
-- tasks  (IDs estables: W1-T1 .. W6-T6, F-1 .. F-5, nuevas T-<hex>)
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id          text primary key check (char_length(id) between 1 and 64),
  board_id    uuid not null references public.boards (id) on delete cascade,
  week_id     uuid references public.weeks (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 300),
  assignees   text[] not null default '{}',
  position    integer not null default 0,
  completed   boolean not null default false,
  due_on      date,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  archived_at timestamptz,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),

  -- Solo los cinco integrantes del tablero pueden registrarse como autor.
  constraint tasks_updated_by_check check (
    updated_by is null
    or updated_by in ('Milca', 'Diana', 'Giovanni', 'Christian', 'Angel')
  ),

  -- De 1 a 2 responsables, siempre dentro del equipo, sin repetir.
  -- Excepción: la Entrega final (week_id IS NULL) puede quedar sin pareja
  -- asignada y se muestra como "Todo el equipo".
  constraint tasks_assignees_check check (
    (cardinality(assignees) = 0 and week_id is null)
    or (
      cardinality(assignees) between 1 and 2
      and assignees <@ array['Milca', 'Diana', 'Giovanni', 'Christian', 'Angel']
      and (cardinality(assignees) = 1 or assignees[1] <> assignees[2])
    )
  ),

  constraint tasks_version_check check (version >= 1)
);

create index if not exists tasks_board_id_idx on public.tasks (board_id, position);
create index if not exists tasks_week_id_idx  on public.tasks (week_id, position);
create index if not exists tasks_updated_idx  on public.tasks (updated_at);

-- week_id es NULL únicamente para la Entrega final (F-1 .. F-5 y las
-- agregadas en esa sección). El tablero las distingue por week_id.
create or replace function public.tasks_week_or_final_check() returns trigger
language plpgsql as $$
begin
  if new.week_id is null then
    -- permitido: entrega final
    return new;
  end if;
  -- comprobar que la semana pertenece al mismo tablero
  if not exists (
    select 1 from public.weeks w
    where w.id = new.week_id and w.board_id = new.board_id
  ) then
    raise exception 'week_id % no pertenece al tablero %', new.week_id, new.board_id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_week_or_final_check on public.tasks;
create trigger tasks_week_or_final_check
  before insert or update on public.tasks
  for each row execute function public.tasks_week_or_final_check();

-- ---------------------------------------------------------------------
-- task_events (auditoría; el cliente NUNCA inserta aquí directamente)
-- ---------------------------------------------------------------------
create table if not exists public.task_events (
  id             uuid primary key default gen_random_uuid(),
  task_id        text references public.tasks (id) on delete cascade,
  action         text not null,
  previous_value jsonb,
  new_value      jsonb,
  actor_name     text,
  created_at     timestamptz not null default now()
);

create index if not exists task_events_task_idx on public.task_events (task_id, created_at);

-- ---------------------------------------------------------------------
-- Control de concurrencia optimista:
--   * updated_at y version los administra SIEMPRE el servidor.
--   * El cliente escribe con WHERE id = ... AND version = <leída>.
--     Si otra persona ya incrementó la versión, la actualización afecta
--     0 filas => el cliente detecta el conflicto.
--   * Cada escritura debe afectar exactamente 1 fila (el cliente lo
--     verifica con .select() y comprobando longitud del resultado).
-- ---------------------------------------------------------------------
-- BEFORE: normalizar campos de la tarea antes de almacenarla.
-- No insertar eventos aquí: la tarea todavía no existe para la FK.
create or replace function public.tasks_touch() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before insert or update on public.tasks
  for each row execute function public.tasks_touch();

-- AFTER: registrar auditoría cuando ya existe la fila padre.
create or replace function public.tasks_audit() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, action, new_value, actor_name)
    values (new.id, 'insert', to_jsonb(new), new.updated_by);
  else
    insert into public.task_events (task_id, action, previous_value, new_value, actor_name)
    values (new.id, 'update', to_jsonb(old), to_jsonb(new), new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists tasks_audit on public.tasks;
create trigger tasks_audit
  after insert or update on public.tasks
  for each row execute function public.tasks_audit();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.boards      enable row level security;
alter table public.weeks       enable row level security;
alter table public.tasks       enable row level security;
alter table public.task_events enable row level security;

-- Tablero previsto para este MVP.
-- (Si cambias el slug, cámbialo en TODAS las políticas de abajo.)
create or replace function public.target_board_id() returns uuid
language sql
stable
as $$
  select id from public.boards where slug = 'xp-tablero-9f3a7c2e' limit 1;
$$;

create or replace function public.is_target_board(board uuid) returns boolean
language sql
stable
as $$
  select board = public.target_board_id();
$$;

-- boards: solo lectura del tablero previsto. Sin escritura anónima.
drop policy if exists boards_select_target on public.boards;
create policy boards_select_target on public.boards
  for select to anon, authenticated
  using (slug = 'xp-tablero-9f3a7c2e');

-- weeks: solo lectura. La app no crea ni modifica semanas.
drop policy if exists weeks_select_target on public.weeks;
create policy weeks_select_target on public.weeks
  for select to anon, authenticated
  using (public.is_target_board(board_id));

-- tasks: lectura, inserción y actualización SOLO del tablero previsto.
-- No se crea política DELETE: no se puede borrar físicamente nada desde
-- el cliente; la "eliminación" es el archivado lógico (archived_at).
drop policy if exists tasks_select_target on public.tasks;
create policy tasks_select_target on public.tasks
  for select to anon, authenticated
  using (public.is_target_board(board_id));

drop policy if exists tasks_insert_target on public.tasks;
create policy tasks_insert_target on public.tasks
  for insert to anon, authenticated
  with check (public.is_target_board(board_id));

drop policy if exists tasks_update_target on public.tasks;
create policy tasks_update_target on public.tasks
  for update to anon, authenticated
  using (public.is_target_board(board_id))
  with check (public.is_target_board(board_id));

-- task_events: solo lectura del historial del tablero previsto.
-- La escritura ocurre dentro del trigger SECURITY DEFINER (dueño de la
-- tabla, que queda fuera de las políticas por ser el propietario).
drop policy if exists task_events_select_target on public.task_events;
create policy task_events_select_target on public.task_events
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_events.task_id
        and public.is_target_board(t.board_id)
    )
  );

-- ---------------------------------------------------------------------
-- Realtime: que los cambios de tasks/weeks se publiquen.
-- (Bloque idempotente: repetirlo no falla.)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.weeks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
