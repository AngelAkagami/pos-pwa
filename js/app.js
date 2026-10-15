/* =====================================================================
 * app.js — orquestación: carga, estado, eventos, realtime, guardado
 *
 * Flujo de escritura (control de concurrencia optimista):
 *   1. Se aplica el cambio en pantalla de inmediato (optimista).
 *   2. Se envía a Supabase con la `version` leída y el `updated_by`.
 *   3. El servidor solo escribe si la versión coincide (exactamente 1 fila).
 *   4. Éxito      → "Guardado", se actualiza la versión local.
 *      Conflicto  → se revierte y se recarga la versión más reciente.
 *      Error/red  → se revierte, mensaje visible y botón Reintentar.
 * ===================================================================== */

(function ($) {
  'use strict';

  var LS_AUTHOR = 'xp.author';
  var LS_EXPANDED = 'xp.expanded';

  var state = {
    board: null,
    boardId: null,
    weeks: [],
    tasks: [],
    expanded: {},
    filters: { week: 'all', member: 'all', status: 'all', q: '' },
    author: null,
    loaded: false
  };

  // estado de la barra: idle | saving | saved | offline | error
  var conn = { mode: 'idle', live: false, online: navigator.onLine, pending: 0 };
  var pendingOps = [];   // cola de escrituras cuando no hay red
  var authorWaiter = null;

  /* ================================================================ config */
  function loadConfig() {
    return new Promise(function (resolve) {
      if (window.XP_CONFIG) return resolve(window.XP_CONFIG);
      var s = document.createElement('script');
      s.src = 'js/config.js';
      s.onload = function () { resolve(window.XP_CONFIG || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  /* =============================================================== autor */
  function readStoredAuthor() {
    try {
      var v = window.localStorage.getItem(LS_AUTHOR);
      return v && window.XP_CONFIG.MEMBERS.indexOf(v) !== -1 ? v : null;
    } catch (e) { return null; }
  }

  function persistAuthor(name) {
    try { window.localStorage.setItem(LS_AUTHOR, name); } catch (e) { /* modo privado */ }
  }

  // Devuelve una promesa con el nombre elegido. Si no hay nombre, abre el
  // diálogo y espera (sin nombre no se guarda nada).
  function ensureAuthor() {
    if (state.author) return Promise.resolve(state.author);
    return new Promise(function (resolve, reject) {
      authorWaiter = { resolve: resolve, reject: reject };
      XPUI.openAuthorDialog(null, true);
    });
  }

  /* ====================================================== expanded/local */
  function readExpanded() {
    try {
      var raw = window.localStorage.getItem(LS_EXPANDED);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function persistExpanded() {
    try { window.localStorage.setItem(LS_EXPANDED, JSON.stringify(state.expanded)); } catch (e) { /* noop */ }
  }

  /* ============================================================ barra */
  function refreshConnBar(extraText) {
    if (conn.mode === 'error') return; // lo puso una escritura fallida (tiene su botón)

    if (!conn.online) {
      XPUI.setConnection('offline',
        pendingOps.length
          ? 'Sin conexión. ' + pendingOps.length + ' cambio(s) pendientes de envío.'
          : 'Sin conexión. Los cambios se enviarán al reconectar.');
      return;
    }
    if (conn.pending > 0) {
      XPUI.setConnection('saving', 'Guardando ' + conn.pending + ' cambio(s)…');
      return;
    }
    if (conn.live) {
      XPUI.setConnection(extraText ? 'saved' : 'idle',
        extraText || 'En vivo · sincronizado con el tablero');
      return;
    }
    XPUI.setConnection('idle', 'Conectando con el tablero…');
  }

  function flashSaved() {
    // El servidor confirmó la escritura: se puede afirmar "Guardado"
    // aunque el canal en vivo aún esté reconectando.
    if (!conn.online) return;
    XPUI.setConnection('saved', 'Guardado ✓');
    window.clearTimeout(flashSaved._t);
    flashSaved._t = window.setTimeout(function () { refreshConnBar(); }, 2600);
  }

  function showWriteError(message, retry) {
    conn.mode = 'error';
    XPUI.setConnection('error', message, retry ? { label: 'Reintentar', onClick: retry } : null);
  }

  function clearWriteError() {
    if (conn.mode === 'error') { conn.mode = 'idle'; refreshConnBar(); }
  }

  /* =========================================================== pantallas */
  function showBoardScreen() { XPUI.showScreen('board'); }

  /* ============================================================== carga */
  function boot() {
    conn.mode = 'idle';
    loadConfig().then(function (cfg) {
      if (!cfg) {
        XPUI.showScreen('setup');
        XPUI.setConnection('idle', 'Configuración pendiente: falta js/config.js.');
        return;
      }
      window.XP_CONFIG = cfg;

      try {
        XPService.init(cfg);
      } catch (e) {
        if (e && e.kind === 'config') {
          XPUI.showScreen('setup');
          XPUI.setConnection('idle', 'Configuración pendiente: revisa js/config.js.');
        } else {
          XPUI.showErrorScreen(e.message || String(e));
        }
        return;
      }

      XPUI.showScreen('skeleton');
      XPUI.setConnection('idle', 'Cargando tablero…');
      load();
    });
  }

  function load() {
    XPService.loadBoard()
      .then(function (data) {
        state.board = data.board;
        state.boardId = data.board.id;
        state.weeks = data.weeks;
        state.tasks = data.tasks;
        state.loaded = true;

        XPUI.renderAll(state);
        showBoardScreen();
        subscribe();
        refreshConnBar();
      })
      .catch(function (err) {
        if (err && err.kind === 'config') { XPUI.showScreen('setup'); return; }
        XPUI.showErrorScreen(err.message || String(err));
        XPUI.setConnection('error', 'No se pudo cargar el tablero.',
          { label: 'Reintentar', onClick: function () { XPUI.showScreen('skeleton'); load(); } });
      });
  }

  function subscribe() {
    XPService.subscribe(state.boardId, onRemoteChange, function (s) {
      // Si hay un error de guardado pendiente, la barra debe conservarlo
      // (con su botón Reintentar) hasta que se resuelva.
      var errorPending = conn.mode === 'error';
      if (s.state === 'live') {
        conn.live = true;
        if (!errorPending) refreshConnBar();
        flushQueue();
      } else if (s.state === 'reconnecting') {
        conn.live = false;
        if (!errorPending) XPUI.setConnection('offline', 'Reconectando con el tablero…');
      } else {
        conn.live = false;
        if (!errorPending) {
          XPUI.setConnection('offline', 'Conexión en vivo cerrada.',
            { label: 'Reconectar', onClick: function () { XPService.resubscribe(); refreshConnBar(); } });
        }
      }
    });
  }

  /* ========================================================= tiempo real */
  function onRemoteChange(evt) {
    var rec = evt.record;
    if (!rec) return;

    // Actividad archivada por otra persona: quitarla del tablero.
    if (rec.archived_at) {
      var had = state.tasks.some(function (t) { return t.id === rec.id; });
      state.tasks = state.tasks.filter(function (t) { return t.id !== rec.id; });
      if (had) {
        XPUI.renderAll(state);
        notifyRemote('archivado', rec);
      }
      return;
    }

    var idx = -1;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === rec.id) { idx = i; break; }
    }

    var isNew = idx === -1;
    if (isNew) {
      state.tasks.push(rec);
      state.tasks.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
    } else {
      // Actualiza SIEMPRE la versión local: el eco de nuestras propias
      // escrituras mantiene `version` fresco para el siguiente guardado.
      var local = state.tasks[idx];
      if (rec.version >= (local.version || 0)) {
        state.tasks[idx] = rec;
      }
    }

    var painted = isNew ? false : XPUI.updateTaskDom(rec, state);
    if (!painted || !XPUI.taskIsVisible(rec, state)) {
      XPUI.renderAll(state);
    } else {
      XPUI.updateProgressIndicators(state);
    }

    notifyRemote(isNew ? 'nuevo' : 'edicion', rec);
  }

  var lastNotified = { id: null, at: 0 };
  function notifyRemote(kind, rec) {
    if (!rec.updated_by) return;
    if (state.author && rec.updated_by === state.author) return; // eco propio
    var now = Date.now();
    if (lastNotified.id === rec.id && now - lastNotified.at < 4000) return;
    lastNotified = { id: rec.id, at: now };

    var short = String(rec.description || '').slice(0, 60);
    if (kind === 'nuevo') {
      XPUI.toast('Nueva actividad de ' + rec.updated_by + ': ' + short, 'ok');
    } else if (kind === 'archivado') {
      XPUI.toast('Actividad archivada por ' + rec.updated_by, 'warn');
    } else {
      XPUI.toast('Cambio recibido de ' + rec.updated_by + ': ' + short,
        rec.completed ? 'ok' : 'warn');
    }
  }

  /* =============================================== cola sin conexión */
  function enqueue(op) {
    pendingOps.push(op);
    refreshConnBar();
  }

  function flushQueue() {
    if (!pendingOps.length || !conn.online || !state.boardId) return;
    var queue = pendingOps.slice();
    pendingOps = [];
    conn.pending = queue.length;
    refreshConnBar();
    clearWriteError();

    XPService.refetchTasks(state.boardId)
      .then(function (fresh) {
        fresh.forEach(function (t) {
          for (var i = 0; i < state.tasks.length; i++) {
            if (state.tasks[i].id === t.id) { state.tasks[i] = t; break; }
          }
        });

        var chain = Promise.resolve();
        queue.forEach(function (op) {
          chain = chain.then(function () {
            var current = state.tasks.filter(function (t) { return t.id === op.id; })[0];
            if (!current) return;
            return XPService.updateTask(op.id, current.version, op.patch, op.actor)
              .then(function (res) {
                if (res.conflict) return;
                state.tasks[state.tasks.indexOf(current)] = res.task;
              });
          });
        });
        return chain;
      })
      .then(function () {
        conn.pending = 0;
        XPUI.renderAll(state);
        flashSaved();
        XPUI.toast('Cambios pendientes sincronizados.', 'ok');
      })
      .catch(function (err) {
        conn.pending = 0;
        showWriteError(err.message || 'No se pudieron enviar los cambios pendientes.',
          function () { flushQueue(); });
        XPUI.toast('No se enviaron los cambios pendientes: ' + (err.message || err), 'error');
      });
  }

  /* ====================================================== guardar tarea */
  // patch: campos a modificar. Se envía con la `version` leída y el actor.
  // Éxito → 1 fila; conflicto → 0 filas; error → se REVIerte el optimismo
  // y se ofrece Reintentar (que vuelve a intentar con la versión fresca).
  function persistTask(task, patch, actor) {
    clearWriteError();

    if (!conn.online) {
      enqueue({ id: task.id, patch: patch, actor: actor });
      XPUI.toast('Sin conexión: el cambio quedó pendiente de envío.', 'warn');
      return Promise.resolve({ queued: true });
    }

    conn.pending++;
    refreshConnBar();

    return XPService.updateTask(task.id, task.version, patch, actor)
      .then(function (res) {
        conn.pending--;
        if (res.conflict) {
          XPUI.toast('Otra persona modificó esta actividad antes que tú. ' +
            'Se muestra la versión más reciente; revisa y vuelve a intentar si hace falta.', 'warn');
          return reloadTasks();
        }
        var idx = state.tasks.indexOf(task);
        if (idx !== -1) state.tasks[idx] = res.task;
        var painted = XPUI.updateTaskDom(res.task, state);
        if (!painted) XPUI.renderAll(state);
        else XPUI.updateProgressIndicators(state);
        conn.mode = 'idle';
        refreshConnBar();
        flashSaved();
        return res.task;
      })
      .catch(function (err) {
        conn.pending--;
        reloadTasks(); // revierte el cambio optimista con la versión del servidor
        showWriteError('Error al guardar: ' + (err.message || err),
          function () { retryPatch(task.id, patch); });
        XPUI.toast('No se guardó el cambio. ' + (err.message || err), 'error');
        throw err;
      });
  }

  // Reintentar: recarga el estado real del servidor y vuelve a aplicar
  // el cambio con la versión vigente (sin duplicar ni pisar otros avances).
  function retryPatch(id, patch) {
    clearWriteError();
    XPService.refetchTasks(state.boardId)
      .then(function (fresh) {
        state.tasks = fresh;
        XPUI.renderAll(state);
        var task = findTask(id);
        if (!task) return null;
        return ensureAuthor().then(function (actor) { return persistTask(task, patch, actor); });
      })
      .catch(function (err) {
        showWriteError('Error al guardar: ' + (err.message || err),
          function () { retryPatch(id, patch); });
        XPUI.toast('No se guardó el cambio. ' + (err.message || err), 'error');
      });
  }

  function reloadTasks() {
    return XPService.refetchTasks(state.boardId)
      .then(function (fresh) {
        state.tasks = fresh;
        XPUI.renderAll(state);
        return fresh;
      })
      .catch(function (err) {
        XPUI.toast('No se pudo actualizar desde el servidor: ' + (err.message || err), 'error');
      });
  }

  /* ========================================================= acciones UI */
  function toggleTask(id, checked) {
    var task = findTask(id);
    if (!task) return;

    ensureAuthor().then(function (actor) {
      // Cambio optimista en pantalla (se revierte si el guardado falla).
      task.completed = checked;
      var $el = $('.task[data-id="' + id + '"]');
      $el.toggleClass('is-done', checked);
      $el.find('.task-meta .chip').first()
        .attr('class', 'chip ' + (checked ? 'chip-done' : 'chip-pending'))
        .text(checked ? 'Completada' : 'Pendiente');
      $el.find('.task-check-wrap .sr-only').text(
        (checked ? 'Desmarcar: ' : 'Marcar como completada: ') + String(task.description).slice(0, 120));
      XPUI.updateProgressIndicators(state);

      return persistTask(task, { completed: checked }, actor);
    }).catch(function (err) {
      if (err && err.message === 'cancelado') {
        $('input[data-action="toggle"][data-id="' + id + '"]').prop('checked', !checked);
        XPUI.toast('Guardado cancelado: elige un nombre para registrar cambios.', 'warn');
        return;
      }
      // persistTask ya revirtió el estado y mostró el error con Reintentar.
    });
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function weekIndexById() {
    var map = {};
    state.weeks.forEach(function (w) { map[w.id] = w.week_number; });
    return map;
  }

  function openNewTaskDialog() {
    var defaultWeek = null;
    if (state.filters.week !== 'all' && state.filters.week !== 'final') {
      var n = parseInt(state.filters.week, 10);
      state.weeks.forEach(function (w) { if (w.week_number === n) defaultWeek = w.id; });
    }
    if (!defaultWeek && state.weeks.length) defaultWeek = state.weeks[0].id;

    XPUI.fillTaskDialog({
      mode: 'new',
      task: null,
      weeks: state.weeks,
      weekIndexById: weekIndexById(),
      defaultWeekId: defaultWeek
    });
  }

  function openEditTaskDialog(id) {
    var task = findTask(id);
    if (!task) return;
    XPUI.fillTaskDialog({
      mode: 'edit',
      task: task,
      weeks: state.weeks,
      weekIndexById: weekIndexById()
    });
  }

  function saveTaskFromDialog() {
    var v = XPUI.getTaskDialogValues();
    if (!XPUI.validateTaskDialog(v)) return;

    var weekId = null;
    if (v.week !== 'final') {
      var n = parseInt(v.week, 10);
      state.weeks.forEach(function (w) { if (w.week_number === n) weekId = w.id; });
      if (!weekId) { XPUI.showTaskDialogError('La semana indicada no existe.'); return; }
    }

    var assignees = [v.assignee1];
    if (v.assignee2) assignees.push(v.assignee2);

    XPUI.setTaskDialogBusy(true);

    ensureAuthor().then(function (actor) {
      clearWriteError();
      var existing = v.id ? findTask(v.id) : null;

      var promise;
      if (existing) {
        promise = XPService.updateTask(existing.id, existing.version, {
          description: v.description,
          assignees: assignees,
          week_id: weekId,
          due_on: v.due || null
        }, actor).then(function (res) {
          if (res.conflict) {
            XPUI.closeTaskDialog();
            XPUI.toast('Otra persona modificó la actividad primero; se recargó la versión más reciente.', 'warn');
            return reloadTasks();
          }
          var idx = state.tasks.indexOf(existing);
          if (idx !== -1) state.tasks[idx] = res.task;
          XPUI.renderAll(state);
          XPUI.closeTaskDialog();
          flashSaved();
          XPUI.toast('Actividad actualizada.', 'ok');
        });
      } else {
        var position = 0;
        state.tasks.forEach(function (t) { position = Math.max(position, t.position || 0); });
        position += 10;

        promise = XPService.insertTask({
          id: XPService.generateTaskId(),
          board_id: state.boardId,
          week_id: weekId,
          description: v.description,
          assignees: assignees,
          position: position,
          completed: false,
          due_on: v.due || null
        }, actor).then(function (res) {
          // El eco por Realtime pudo llegar primero: evitar duplicados.
          if (!findTask(res.task.id)) state.tasks.push(res.task);
          state.tasks.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
          if (weekId) {
            // abrir la tarjeta donde cayó la actividad
            state.weeks.forEach(function (w) {
              if (w.id === weekId) state.expanded[w.week_number] = true;
            });
            persistExpanded();
          }
          XPUI.renderAll(state);
          XPUI.closeTaskDialog();
          flashSaved();
          XPUI.toast('Actividad agregada con ID ' + res.task.id, 'ok');
        });
      }

      return promise;
    }).catch(function (err) {
      XPUI.setTaskDialogBusy(false);
      if (err && err.message === 'cancelado') {
        XPUI.showTaskDialogError('Elige un nombre (botón "Identificado como") para poder guardar.');
        return;
      }
      XPUI.showTaskDialogError(err.message || String(err));
      XPUI.toast('No se guardó: ' + (err.message || err), 'error');
    }).then(function () {
      XPUI.setTaskDialogBusy(false);
    });
  }

  function archiveTask(id) {
    var task = findTask(id);
    if (!task) return;
    var ok = window.confirm(
      '¿Archivar esta actividad?\n\n"' + String(task.description).slice(0, 120) +
      '"\n\nSe ocultará del tablero (borrado lógico) y quedará registrada en el historial.');
    if (!ok) return;

    ensureAuthor().then(function (actor) {
      clearWriteError();
      return XPService.archiveTask(task.id, task.version, actor).then(function (res) {
        if (res.conflict) {
          XPUI.toast('La actividad cambió mientras tanto; se recargó.', 'warn');
          return reloadTasks();
        }
        state.tasks = state.tasks.filter(function (t) { return t.id !== task.id; });
        XPUI.renderAll(state);
        flashSaved();
        XPUI.toast('Actividad archivada.', 'ok');
      });
    }).catch(function (err) {
      if (err && err.message === 'cancelado') {
        XPUI.toast('Archivado cancelado: elige un nombre para registrar cambios.', 'warn');
        return;
      }
      showWriteError('Error al archivar: ' + (err.message || err), function () { archiveTask(id); });
      XPUI.toast('No se pudo archivar. ' + (err.message || err), 'error');
    });
  }

  function toggleWeek(n) {
    var isOpen = state.expanded[n] !== false;
    state.expanded[n] = !isOpen;
    persistExpanded();

    var $card = $('.week-card[data-week="' + n + '"]');
    $card.toggleClass('is-open', !isOpen);
    $card.find('.week-toggle').attr('aria-expanded', String(!isOpen));
  }

  function setAllExpanded(open) {
    state.weeks.forEach(function (w) { state.expanded[w.week_number] = open; });
    persistExpanded();
    XPUI.renderAll(state);
  }

  function applyFiltersFromControls() {
    state.filters.week = $('#filter-week').val();
    state.filters.member = $('#filter-member').val();
    state.filters.status = $('#filter-status').val();
    state.filters.q = String($('#filter-search').val() || '').trim().slice(0, 120);
    XPUI.renderAll(state);
  }

  function clearFilters() {
    $('#filter-week').val('all');
    $('#filter-member').val('all');
    $('#filter-status').val('all');
    $('#filter-search').val('');
    applyFiltersFromControls();
  }

  /* ========================================================== exportar */
  function exportMarkdown() {
    var md = XPUI.buildMarkdown(state);
    XPUI.copyText(md)
      .then(function () { XPUI.toast('Resumen Markdown copiado al portapapeles.', 'ok'); })
      .catch(function () {
        XPUI.downloadFile('tablero-xp.md', md, 'text/markdown');
        XPUI.toast('No se pudo copiar; se descargó como archivo .md', 'warn');
      });
  }

  function exportCsv() {
    XPUI.downloadFile('tablero-xp.csv', XPUI.buildCsv(state), 'text/csv');
    XPUI.toast('CSV descargado.', 'ok');
  }

  /* ============================================================== events */
  function bindEvents() {
    // Delegado: expandir/contraer, editar, archivar
    $(document).on('click', '[data-action]', function (e) {
      var $t = $(e.target).closest('[data-action]');
      if (!$t.length) return;
      var action = $t.data('action');

      if (action === 'expand') {
        var $card = $t.closest('.week-card');
        if ($card.length) { e.preventDefault(); toggleWeek(parseInt($card.data('week'), 10)); }
      } else if (action === 'edit') {
        openEditTaskDialog(String($t.data('id')));
      } else if (action === 'archive') {
        archiveTask(String($t.data('id')));
      }
    });

    // Checkbox (cambio optimista + guardado)
    $(document).on('change', 'input[data-action="toggle"]', function () {
      var $cb = $(this);
      toggleTask(String($cb.data('id')), $cb.is(':checked'));
    });

    // Filtros
    $('#filter-week, #filter-member, #filter-status').on('change', applyFiltersFromControls);
    var searchTimer = null;
    $('#filter-search').on('input', function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFiltersFromControls, 220);
    });
    $('#btn-clear-filters, #btn-clear-filters-2').on('click', clearFilters);

    // Vista
    $('#btn-expand-all').on('click', function () { setAllExpanded(true); });
    $('#btn-collapse-all').on('click', function () { setAllExpanded(false); });

    // Exportar
    $('#btn-export-md').on('click', exportMarkdown);
    $('#btn-export-csv').on('click', exportCsv);

    // Autor
    $('#btn-author').on('click', function () {
      XPUI.openAuthorDialog(state.author, false);
    });

    $('#author-form').on('submit', function (e) {
      var name = XPUI.getAuthorChoice();
      if (!name) {
        e.preventDefault();
        XPUI.toast('Elige uno de los cinco nombres.', 'warn');
        return false;
      }
      state.author = name;
      persistAuthor(name);
      XPUI.setAuthorName(name);
      XPUI.closeAuthorDialog();

      if (authorWaiter) { authorWaiter.resolve(name); authorWaiter = null; }
      return false;
    });

    $('#author-dialog-cancel').on('click', function () {
      XPUI.closeAuthorDialog();
      if (authorWaiter) { authorWaiter.reject(new Error('cancelado')); authorWaiter = null; }
    });

    // Cerrar con Esc / botón nativo de cierre sin haber elegido nombre.
    $('#author-dialog').on('close', function () {
      if (authorWaiter && !state.author) {
        authorWaiter.reject(new Error('cancelado'));
        authorWaiter = null;
      }
    });

    // Diálogo de actividad
    $('#btn-add-task').on('click', openNewTaskDialog);
    $('#task-form').on('submit', function (e) {
      e.preventDefault();
      saveTaskFromDialog();
      return false;
    });
    $('#task-dialog-cancel').on('click', function () { XPUI.closeTaskDialog(); });
    $('#task-description').on('input', function () {
      $('#task-desc-count').text(String(String($(this).val() || '').length));
    });

    // Reintentos
    $('#btn-retry-load').on('click', function () {
      XPUI.showScreen('skeleton');
      XPUI.setConnection('idle', 'Cargando tablero…');
      load();
    });

    // Red
    window.addEventListener('online', function () {
      conn.online = true;
      refreshConnBar();
      XPService.resubscribe();
      flushQueue();
    });
    window.addEventListener('offline', function () {
      conn.online = false;
      refreshConnBar();
      XPUI.toast('Sin conexión: los cambios se enviarán al reconectar.', 'warn');
    });
  }

  /* ================================================================ init */
  function init() {
    state.author = readStoredAuthor();
    state.expanded = readExpanded();
    XPUI.setAuthorName(state.author);
    bindEvents();
    boot();
  }

  // Punto de entrada para depuración y pruebas automatizadas.
  // handleRemoteEvent es exactamente la función que invoca la suscripción
  // Realtime cuando llega un cambio de otro dispositivo.
  window.XPApp = {
    state: state,
    handleRemoteEvent: onRemoteChange,
    setAllExpanded: setAllExpanded,
    applyFilters: applyFiltersFromControls,
    buildMarkdown: function () { return XPUI.buildMarkdown(state); }
  };

  $(init);
})(window.jQuery);
