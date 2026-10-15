/* =====================================================================
 * supabase-service.js — capa de datos (única que habla con Supabase)
 *
 * Responsabilidades:
 *  - cargar tablero / semanas / actividades
 *  - escrituras con control de concurrencia optimista (columna version)
 *    y verificación de que cada escritura afecte EXACTAMENTE 1 fila
 *  - suscripción Realtime para replicar cambios entre dispositivos
 *  - traducir errores de red / permisos a mensajes honestos
 *
 * No se usa localStorage aquí: la fuente de verdad es Supabase.
 * ===================================================================== */

window.XPService = (function ($) {
  'use strict';

  var client = null;
  var config = null;
  var channel = null;

  function ServiceError(message, kind) {
    this.name = 'ServiceError';
    this.message = message;
    // kind: 'network' | 'auth' | 'conflict' | 'notfound' | 'unknown'
    this.kind = kind || 'unknown';
  }
  ServiceError.prototype = Object.create(Error.prototype);

  /* ------------------------------------------------------------------ */
  function classify(error) {
    var msg = (error && error.message) ? error.message : String(error);
    if (/fetch|network|failed|load|timeout|ECONN|abort/i.test(msg)) return 'network';
    if (/permission|row-level security|policy|401|403|jwt/i.test(msg)) return 'auth';
    return 'unknown';
  }

  function pretty(error) {
    var kind = classify(error);
    if (kind === 'network') return 'Sin conexión con el servidor. Revisa tu red.';
    if (kind === 'auth') return 'Permisos denegados por las políticas de seguridad (RLS).';
    return String(error && error.message ? error.message : error);
  }

  /* ---------------------------------------------------------------- init */
  function init(cfg) {
    config = cfg;
    if (typeof window.supabase === 'undefined') {
      throw new ServiceError('No se cargó la librería de Supabase (¿sin internet?).', 'network');
    }
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
        /TU-PROYECTO|TU_CLAVE/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY)) {
      throw new ServiceError('Falta la configuración de Supabase (js/config.js).', 'config');
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return client;
  }

  function isConfigured() { return client !== null; }

  function boardIdOrThrow() {
    if (!config || !config.BOARD_SLUG) throw new ServiceError('Falta BOARD_SLUG en config.', 'config');
    return config.BOARD_SLUG;
  }

  /* ------------------------------------------------------------ lecturas */
  async function loadBoard() {
    boardIdOrThrow();

    var res = await client.from('boards')
      .select('id, slug, title, starts_on, ends_on, timezone')
      .eq('slug', config.BOARD_SLUG)
      .limit(1);

    if (res.error) throw new ServiceError(pretty(res.error), classify(res.error));
    if (!res.data || res.data.length !== 1) {
      throw new ServiceError(
        'No existe el tablero "' + config.BOARD_SLUG + '". ¿Se ejecutó supabase/seed.sql?', 'notfound');
    }
    var board = res.data[0];

    var resWeeks = await client.from('weeks')
      .select('id, board_id, week_number, starts_on, ends_on, goal, deliverable, position')
      .eq('board_id', board.id)
      .order('position', { ascending: true });

    if (resWeeks.error) throw new ServiceError(pretty(resWeeks.error), classify(resWeeks.error));

    var resTasks = await client.from('tasks')
      .select('id, board_id, week_id, description, assignees, position, completed, due_on, updated_at, updated_by, archived_at, version')
      .eq('board_id', board.id)
      .order('position', { ascending: true });

    if (resTasks.error) throw new ServiceError(pretty(resTasks.error), classify(resTasks.error));

    var tasks = (resTasks.data || []).filter(function (t) { return !t.archived_at; });

    return { board: board, weeks: resWeeks.data || [], tasks: tasks };
  }

  async function refetchTasks(boardId) {
    var res = await client.from('tasks')
      .select('id, board_id, week_id, description, assignees, position, completed, due_on, updated_at, updated_by, archived_at, version')
      .eq('board_id', boardId)
      .order('position', { ascending: true });
    if (res.error) throw new ServiceError(pretty(res.error), classify(res.error));
    return (res.data || []).filter(function (t) { return !t.archived_at; });
  }

  /* ----------------------------------------------------------- escrituras */
  // Devuelve { task } si la escritura afectó EXACTAMENTE 1 fila,
  // { conflict: true } si otra persona cambió la versión primero,
  // o lanza ServiceError si falló la red / los permisos.
  async function updateTask(id, expectedVersion, patch, actor) {
    if (!client) throw new ServiceError('Servicio no inicializado.', 'config');

    var payload = Object.assign({}, patch, { updated_by: actor });

    var res = await client.from('tasks')
      .update(payload)
      .eq('id', id)
      .eq('version', expectedVersion)   // control de concurrencia optimista
      .select();

    if (res.error) throw new ServiceError(pretty(res.error), classify(res.error));

    // Verificación obligatoria: exactamente una fila afectada.
    if (!res.data || res.data.length !== 1) {
      if (res.data && res.data.length > 1) {
        throw new ServiceError('Escritura ambigua: ' + res.data.length + ' filas afectadas.', 'unknown');
      }
      return { conflict: true };
    }
    return { task: res.data[0] };
  }

  async function insertTask(row, actor) {
    if (!client) throw new ServiceError('Servicio no inicializado.', 'config');

    var payload = Object.assign({}, row, { updated_by: actor });
    var res = await client.from('tasks').insert(payload).select();

    if (res.error) throw new ServiceError(pretty(res.error), classify(res.error));
    if (!res.data || res.data.length !== 1) {
      throw new ServiceError('La inserción no confirmó exactamente una fila.', 'unknown');
    }
    return { task: res.data[0] };
  }

  // Borrado lógico: nunca se emite DELETE (las políticas RLS no lo permiten).
  async function archiveTask(id, expectedVersion, actor) {
    return updateTask(id, expectedVersion, { archived_at: new Date().toISOString() }, actor);
  }

  function generateTaskId() {
    var bytes = new Uint8Array(4);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var hex = Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return 'T-' + hex.toUpperCase();
  }

  /* ------------------------------------------------------------- Realtime */
  // onChange({ type: 'insert'|'update', record })
  // statusCb({ state: 'live'|'reconnecting'|'offline'|'closed', detail })
  function subscribe(boardId, onChange, statusCb) {
    if (channel) return channel;

    function handle(type) {
      return function (payload) {
        var rec = payload && payload.new;
        if (!rec || rec.board_id !== boardId) return; // doble filtro de seguridad
        onChange({ type: type, record: rec });
      };
    }

    channel = client.channel('xp-board-' + boardId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, handle('insert'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, handle('update'))
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') statusCb({ state: 'live' });
        else if (status === 'CHANNEL_ERROR') statusCb({ state: 'reconnecting', detail: 'CHANNEL_ERROR' });
        else if (status === 'TIMED_OUT') statusCb({ state: 'reconnecting', detail: 'TIMED_OUT' });
        else if (status === 'CLOSED') statusCb({ state: 'closed', detail: 'CLOSED' });
      });

    return channel;
  }

  function resubscribe() {
    if (channel && typeof channel.subscribe === 'function') {
      channel.subscribe();
    }
  }

  function unsubscribe() {
    if (channel && client) {
      try { client.removeChannel(channel); } catch (e) { /* sin canal */ }
    }
    channel = null;
  }

  /* -------------------------------------------------------------- export */
  return {
    ServiceError: ServiceError,
    init: init,
    isConfigured: isConfigured,
    loadBoard: loadBoard,
    refetchTasks: refetchTasks,
    updateTask: updateTask,
    insertTask: insertTask,
    archiveTask: archiveTask,
    generateTaskId: generateTaskId,
    subscribe: subscribe,
    resubscribe: resubscribe,
    unsubscribe: unsubscribe
  };
})(window.jQuery);
