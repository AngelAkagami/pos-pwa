/* =====================================================================
 * ui.js — render y controles de interfaz (jQuery)
 *
 * Reglas de seguridad:
 *  - Todo texto que viene de la base de datos o del usuario se inserta
 *    con .text() / atributos nativos. NUNCA se concatena HTML con datos
 *    externos (no se usa innerHTML con contenido no confiable).
 *  - Se validan longitudes y tipos antes de pintar.
 * ===================================================================== */

window.XPUI = (function ($) {
  'use strict';

  var DEFAULT_MEMBERS = ['Milca', 'Diana', 'Giovanni', 'Christian', 'Angel'];
  var MAX_DESC = 300;
  var TZ = 'America/Mexico_City';

  function members() {
    return (window.XP_CONFIG && window.XP_CONFIG.MEMBERS) || DEFAULT_MEMBERS;
  }

  /* ------------------------------------------------------------ utilidades */
  function truncate(text, max) {
    var s = String(text == null ? '' : text).trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function parseDay(iso) {
    // 'YYYY-MM-DD' → Date a mediodía (evita corrimiento de zona horaria)
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
  }

  function fmtDay(iso, withYear) {
    var d = parseDay(iso);
    if (!d) return '';
    var opts = { day: 'numeric', month: 'short' };
    if (withYear) opts.year = 'numeric';
    return new Intl.DateTimeFormat('es-MX', opts).format(d);
  }

  function formatRange(startIso, endIso) {
    var a = parseDay(startIso), b = parseDay(endIso);
    if (!a || !b) return '';
    var sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    var month = new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(b);
    if (sameMonth) {
      return a.getDate() + ' – ' + b.getDate() + ' ' + month + ' ' + b.getFullYear();
    }
    var monthA = new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(a);
    return a.getDate() + ' ' + monthA + ' – ' + b.getDate() + ' ' + month + ' ' + b.getFullYear();
  }

  function fmtTimestamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: TZ
      }).format(d);
    } catch (e) {
      return new Intl.DateTimeFormat('es-MX', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(d);
    }
  }

  function pct(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  /* ------------------------------------------------------- pantallas base */
  function showScreen(which) {
    $('#skeleton').prop('hidden', which !== 'skeleton');
    $('#setup-screen').prop('hidden', which !== 'setup');
    $('#error-screen').prop('hidden', which !== 'error');
  }

  function showErrorScreen(message) {
    $('#error-screen-text').text(truncate(message, 300));
    showScreen('error');
  }

  /* ------------------------------------------------------ barra de estado */
  // kind: idle | saving | saved | offline | error
  function setConnection(kind, text, action) {
    var bar = $('#conn-bar').removeClass('is-idle is-saving is-saved is-offline is-error');
    bar.addClass('is-' + kind);
    $('#conn-bar-text').text(text);

    var btn = $('#conn-bar-action');
    btn.prop('hidden', !action);
    if (action) {
      btn.text(action.label).off('click.xp').on('click.xp', action.onClick);
    }
  }

  /* ------------------------------------------------------------- toasts */
  function toast(message, kind) {
    var $t = $('<div>', { class: 'toast' + (kind ? ' is-' + kind : '') , role: 'status'})
      .text(truncate(message, 240));
    $('#toasts').append($t);
    setTimeout(function () {
      $t.fadeOut(250, function () { $t.remove(); });
    }, 4600);
  }

  /* ------------------------------------------------------ autor (header) */
  function setAuthorName(name) {
    $('#author-name').text(name || 'sin elegir');
  }

  function openAuthorDialog(current, isRequired) {
    var $dlg = $('#author-dialog');
    $('#author-form input[name="author"]').prop('checked', false);
    if (current) {
      $('#author-form input[name="author"][value="' + current + '"]').prop('checked', true);
    }
    $('#author-dialog-cancel').prop('hidden', !isRequired ? false : true);
    if (typeof $dlg[0].showModal === 'function') $dlg[0].showModal();
    else $dlg.attr('open', '');
  }

  function getAuthorChoice() {
    var $checked = $('#author-form input[name="author"]:checked');
    return $checked.length ? $checked.val() : null;
  }

  function closeAuthorDialog() {
    var $dlg = $('#author-dialog');
    if (typeof $dlg[0].close === 'function') $dlg[0].close();
    else $dlg.removeAttr('open');
  }

  /* ------------------------------------------------- diálogo de actividad */
  function fillTaskDialog(opts) {
    // opts: { mode:'edit'|'new', task, weeks, defaultWeekId, weekNumbers }
    var $dlg = $('#task-dialog');
    var task = opts.task || {};

    $('#task-dialog-title').text(opts.mode === 'new' ? 'Nueva actividad' : 'Editar actividad');
    $('#task-description').val(task.description || '');
    $('#task-desc-count').text(String((task.description || '').length));
    $('#task-desc-error').prop('hidden', true);
    $('#task-assignees-error').prop('hidden', true);
    $('#task-form-error').prop('hidden', true).text('');

    var weekValue = 'final';
    if (opts.mode === 'edit') {
      weekValue = task.week_id ? String(opts.weekIndexById[task.week_id]) : 'final';
    } else if (opts.defaultWeekId) {
      weekValue = opts.defaultWeekId === 'final' ? 'final' : String(opts.weekIndexById[opts.defaultWeekId]);
    }
    $('#task-week').val(weekValue);

    var as = task.assignees || [];
    $('#task-assignee-1').val(as[0] || members()[0]);
    $('#task-assignee-2').val(as.length > 1 && as[1] !== as[0] ? as[1] : '');

    $('#task-due').val(task.due_on ? String(task.due_on).slice(0, 10) : '');
    setTaskDialogBusy(false);

    $dlg.data('task-id', task.id || null);

    if (typeof $dlg[0].showModal === 'function') $dlg[0].showModal();
    else $dlg.attr('open', '');
    setTimeout(function () { $('#task-description').trigger('focus'); }, 30);
  }

  function getTaskDialogValues() {
    return {
      id: $('#task-dialog').data('task-id') || null,
      description: truncate($('#task-description').val(), MAX_DESC),
      week: String($('#task-week').val() || 'final'),
      assignee1: String($('#task-assignee-1').val() || ''),
      assignee2: String($('#task-assignee-2').val() || ''),
      due: String($('#task-due').val() || '')
    };
  }

  function validateTaskDialog(v) {
    var ok = true;
    $('#task-desc-error').prop('hidden', true);
    $('#task-assignees-error').prop('hidden', true);

    if (!v.description || v.description.length < 3 || v.description.length > MAX_DESC) {
      $('#task-desc-error').prop('hidden', false);
      ok = false;
    }
    if (!v.assignee1 || (v.assignee2 && v.assignee1 === v.assignee2)) {
      $('#task-assignees-error').prop('hidden', false);
      ok = false;
    }
    if (v.assignee2 && members().indexOf(v.assignee2) === -1) ok = false;
    if (members().indexOf(v.assignee1) === -1) ok = false;
    return ok;
  }

  function showTaskDialogError(message) {
    $('#task-form-error').text(truncate(message, 240)).prop('hidden', false);
  }

  function setTaskDialogBusy(busy) {
    $('#task-dialog-save').prop('disabled', !!busy)
      .text(busy ? 'Guardando…' : 'Guardar');
  }

  function closeTaskDialog() {
    var $dlg = $('#task-dialog');
    if (typeof $dlg[0].close === 'function') $dlg[0].close();
    else $dlg.removeAttr('open');
  }

  /* --------------------------------------------------------- construcción */
  function assigneesText(list) {
    if (!list || !list.length) return 'Todo el equipo';
    var clean = [];
    for (var i = 0; i < list.length && i < 2; i++) {
      if (members().indexOf(list[i]) !== -1) clean.push(list[i]);
    }
    return clean.length ? clean.join(', ') : 'Todo el equipo';
  }

  function buildTaskItem(task) {
    var $li = $('<li>', { class: 'task' + (task.completed ? ' is-done' : ''), 'data-id': task.id });

    var cbId = 'chk-' + task.id;
    var $label = $('<label>', { class: 'task-check-wrap' });
    var $cb = $('<input>', {
      type: 'checkbox',
      id: cbId,
      'data-action': 'toggle',
      'data-id': task.id
    });
    if (task.completed) $cb.prop('checked', true);
    $label.append($cb);
    $label.append($('<span>', { class: 'sr-only' }).text(
      (task.completed ? 'Desmarcar: ' : 'Marcar como completada: ') + truncate(task.description, 120)
    ));

    var $body = $('<div>', { class: 'task-body' });

    var $who = $('<p>', { class: 'task-assignees' });
    if (task.assignees && task.assignees.length) {
      task.assignees.slice(0, 2).forEach(function (name, i) {
        if (i > 0) $who.append($('<span>', { class: 'sep' }).text(' · '));
        $who.append($('<strong>').text(members().indexOf(name) !== -1 ? name : truncate(name, 24)));
      });
    } else {
      $who.append($('<strong>').text('Todo el equipo'));
    }
    $body.append($who);

    $body.append($('<p>', { class: 'task-desc' }).text(truncate(task.description, MAX_DESC)));

    var $meta = $('<p>', { class: 'task-meta' });
    $meta.append(
      $('<span>', { class: 'chip ' + (task.completed ? 'chip-done' : 'chip-pending') })
        .text(task.completed ? 'Completada' : 'Pendiente')
    );
    if (task.due_on) {
      $meta.append($('<span>', { class: 'chip chip-due' }).text('Fecha: ' + fmtDay(task.due_on, false)));
    }
    var who = task.updated_by ? members().indexOf(task.updated_by) !== -1 ? task.updated_by : null : null;
    var metaText = who
      ? 'Última edición: ' + who + ' · ' + fmtTimestamp(task.updated_at)
      : (task.updated_at ? 'Actualizada ' + fmtTimestamp(task.updated_at) : 'Sin ediciones registradas');
    $meta.append($('<span>', { class: 'task-updated' }).text(metaText));
    $body.append($meta);

    var $actions = $('<div>', { class: 'task-actions' });
    $actions.append(
      $('<button>', { type: 'button', class: 'link-btn', 'data-action': 'edit', 'data-id': task.id }).text('Editar')
    );
    $actions.append(
      $('<button>', { type: 'button', class: 'link-btn is-danger', 'data-action': 'archive', 'data-id': task.id })
        .text('Archivar')
    );

    $li.append($label, $body, $actions);
    return $li;
  }

  function buildWeekCard(week, allTasks, visibleTasks, expanded) {
    var $card = $('<article>', {
      class: 'week-card' + (expanded ? ' is-open' : ''),
      'data-week': week.week_number
    });

    var bodyId = 'week-body-' + week.week_number;
    var titleId = 'week-title-' + week.week_number;

    var $head = $('<div>', { class: 'week-head', 'data-action': 'expand' });
    var $main = $('<div>', { class: 'week-head-main' });
    var $toggle = $('<button>', {
      type: 'button',
      class: 'week-toggle',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': bodyId
    }).text('Semana ' + week.week_number);
    $main.append($('<h2>', { id: titleId }).append($toggle));
    $main.append($('<span>', { class: 'week-dates' }).text(formatRange(week.starts_on, week.ends_on)));
    $main.append($('<p>', { class: 'week-goal' }).text(truncate(week.goal, 300)));

    var done = 0;
    allTasks.forEach(function (t) { if (t.completed) done++; });
    var total = allTasks.length;
    var $right = $('<span>', { class: 'week-head-right' });
    $right.append($('<span>', { class: 'week-count' + (total && done === total ? ' is-done' : '') })
      .text(done + '/' + total));
    $right.append($('<span>', { class: 'chevron', 'aria-hidden': 'true' }));

    $head.append($main, $right);
    $card.append($head);

    var $body = $('<div>', { class: 'week-body', id: bodyId, role: 'region', 'aria-labelledby': titleId });

    var $list = $('<ul>', { class: 'task-list' });
    visibleTasks.forEach(function (t) { $list.append(buildTaskItem(t)); });
    $body.append($list);

    var p = pct(done, total);
    var $prog = $('<div>', { class: 'week-progress' });
    var $bar = $('<div>', {
      class: 'progress' + (total && done === total ? ' is-complete' : ''),
      role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p
    });
    $bar.append($('<i>').css('width', p + '%'));
    $prog.append($bar);
    $prog.append($('<p>').text(done + ' de ' + total + ' actividades completadas (' + p + ' %)'));
    $body.append($prog);

    if (week.deliverable) {
      var $del = $('<div>', { class: 'deliverable' });
      $del.append($('<strong>').text('Entregable semanal: '));
      $del.append(document.createTextNode(truncate(week.deliverable, 300)));
      $body.append($del);
    }

    $card.append($body);
    return $card;
  }

  /* ---------------------------------------------------------- filtros */
  function activeFilters(f) {
    return f.week !== 'all' || f.member !== 'all' || f.status !== 'all' || !!f.q;
  }

  function taskMatches(task, f, weekNumber) {
    if (f.week !== 'all') {
      var key = weekNumber ? String(weekNumber) : 'final';
      if (f.week !== key) return false;
    }
    if (f.member !== 'all') {
      var list = task.assignees || [];
      if (list.indexOf(f.member) === -1) return false;
    }
    if (f.status === 'done' && !task.completed) return false;
    if (f.status === 'pending' && task.completed) return false;
    if (f.q) {
      var q = f.q.toLowerCase();
      var hay = (task.description + ' ' + (task.assignees || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* -------------------------------------------------------- render general */
  // state: { board, weeks, tasks, expanded, filters }
  function renderAll(state) {
    var $container = $('#weeks-container').empty();
    var filters = state.filters;
    var anyVisible = false;

    var finalTasks = state.tasks.filter(function (t) { return !t.week_id; });
    var weekTasks = state.tasks.filter(function (t) { return !!t.week_id; });

    state.weeks.forEach(function (week) {
      var all = weekTasks.filter(function (t) { return t.week_id === week.id; });
      var visible = all.filter(function (t) { return taskMatches(t, filters, week.week_number); });
      var showEmptyFilter = activeFilters(filters);

      if (showEmptyFilter && visible.length === 0) return; // oculta si no coincide
      if (all.length === 0 && showEmptyFilter) return;

      anyVisible = anyVisible || visible.length > 0 || !showEmptyFilter;
      var expanded = state.expanded[week.week_number] !== false;
      $container.append(buildWeekCard(week, all, visible, expanded));
    });

    // Entrega final
    var visibleFinal = finalTasks.filter(function (t) { return taskMatches(t, filters, null); });
    var showFinal = finalTasks.length > 0 &&
      (!activeFilters(filters) || visibleFinal.length > 0);

    $('#final-section').prop('hidden', !showFinal);
    if (showFinal) {
      var $list = $('#final-list').empty();
      visibleFinal.forEach(function (t) { $list.append(buildTaskItem(t)); });
      anyVisible = anyVisible || visibleFinal.length > 0 || !activeFilters(filters);
      updateFinalProgress(finalTasks);
    } else {
      $('#final-list').empty(); // sin contenido oculto bajo filtros
    }

    var nothing = anyVisible === false;
    $('#empty-state').prop('hidden', !nothing);
    if (nothing) {
      $('#empty-state h2').text(activeFilters(filters) ? 'Sin resultados' : 'Tablero vacío');
      $('#empty-state p').text(activeFilters(filters)
        ? 'No hay actividades que coincidan con los filtros actuales.'
        : 'Aún no hay actividades. Ejecuta supabase/seed.sql o agrega una actividad.');
    }

    updateProgressIndicators(state);
  }

  function updateProgressIndicators(state) {
    var tasks = state.tasks;
    var done = tasks.filter(function (t) { return t.completed; }).length;
    var p = pct(done, tasks.length);

    $('#global-count').text(done + ' de ' + tasks.length + ' actividades completadas');
    $('#global-pct').text(p + ' %');
    $('#global-fill').css('width', p + '%');
    $('#global-bar').attr('aria-valuenow', p)
      .attr('aria-valuetext', p + ' % de actividades completadas')
      .toggleClass('is-complete', tasks.length > 0 && done === tasks.length);

    // por semana
    state.weeks.forEach(function (week) {
      var all = tasks.filter(function (t) { return t.week_id === week.id; });
      var d = all.filter(function (t) { return t.completed; }).length;
      var wp = pct(d, all.length);
      var $card = $('.week-card[data-week="' + week.week_number + '"]');
      if (!$card.length) return;
      $card.find('.week-count')
        .text(d + '/' + all.length)
        .toggleClass('is-done', all.length > 0 && d === all.length);
      var $bar = $card.find('.week-progress .progress');
      $bar.attr('aria-valuenow', wp);
      $bar.toggleClass('is-complete', all.length > 0 && d === all.length);
      $bar.find('i').css('width', wp + '%');
      $card.find('.week-progress p').text(d + ' de ' + all.length + ' actividades completadas (' + wp + ' %)');
    });

    updateFinalProgress(tasks.filter(function (t) { return !t.week_id; }));
  }

  function updateFinalProgress(finalTasks) {
    var d = finalTasks.filter(function (t) { return t.completed; }).length;
    var p = pct(d, finalTasks.length);
    $('#final-count').text(d + '/' + finalTasks.length)
      .toggleClass('is-done', finalTasks.length > 0 && d === finalTasks.length);
    $('#final-fill').css('width', p + '%');
    $('#final-bar').attr('aria-valuenow', p);
  }

  // Actualización dirigida de UNA actividad (cambios en tiempo real).
  // Devuelve false si el nodo no está pintado (entonces conviene re-render).
  function updateTaskDom(task, state) {
    var $existing = $('.task[data-id="' + String(task.id).replace(/"/g, '') + '"]');
    if (!$existing.length) return false;

    var weekNumber = null;
    if (task.week_id) {
      state.weeks.forEach(function (w) { if (w.id === task.week_id) weekNumber = w.week_number; });
      if (weekNumber === null) return false;
      if (!taskMatches(task, state.filters, weekNumber)) return false;
    } else if (!taskMatches(task, state.filters, null)) {
      return false;
    }

    var $fresh = buildTaskItem(task);
    $existing.first().replaceWith($fresh);
    return true;
  }

  function taskIsVisible(task, state) {
    var weekNumber = null;
    if (task.week_id) {
      state.weeks.forEach(function (w) { if (w.id === task.week_id) weekNumber = w.week_number; });
      if (weekNumber === null) return false;
    }
    return taskMatches(task, state.filters, weekNumber);
  }

  /* --------------------------------------------------------- exportación */
  function buildMarkdown(state) {
    var lines = [];
    var tasks = state.tasks;
    var done = tasks.filter(function (t) { return t.completed; }).length;

    lines.push('# ' + (state.board.title || 'Tablero XP'));
    lines.push('');
    lines.push('Periodo: ' + formatRange(state.board.starts_on, state.board.ends_on) +
      ' · ' + state.board.timezone);
    lines.push('');
    lines.push('**Progreso global: ' + done + '/' + tasks.length + ' (' + pct(done, tasks.length) + ' %)**');
    lines.push('');

    state.weeks.forEach(function (week) {
      var all = tasks.filter(function (t) { return t.week_id === week.id; });
      var d = all.filter(function (t) { return t.completed; }).length;
      lines.push('## Semana ' + week.week_number + ' · ' + formatRange(week.starts_on, week.ends_on));
      lines.push('');
      lines.push('*Objetivo:* ' + week.goal);
      lines.push('');
      lines.push('Progreso: ' + d + '/' + all.length);
      lines.push('');
      all.forEach(function (t) {
        lines.push('- [' + (t.completed ? 'x' : ' ') + '] **' + assigneesText(t.assignees) +
          '** — ' + t.description +
          (t.updated_by ? ' _(última edición: ' + t.updated_by + ' · ' + fmtTimestamp(t.updated_at) + ')_' : ''));
      });
      lines.push('');
      lines.push('**Entregable:** ' + week.deliverable);
      lines.push('');
    });

    var finals = tasks.filter(function (t) { return !t.week_id; });
    if (finals.length) {
      var fd = finals.filter(function (t) { return t.completed; }).length;
      lines.push('## Entrega final — 25 de noviembre');
      lines.push('');
      lines.push('Progreso: ' + fd + '/' + finals.length);
      lines.push('');
      finals.forEach(function (t) {
        lines.push('- [' + (t.completed ? 'x' : ' ') + '] ' + t.description +
          (t.updated_by ? ' _(última edición: ' + t.updated_by + ')_' : ''));
      });
      lines.push('');
    }

    lines.push('_Generado el ' + fmtTimestamp(new Date().toISOString()) + '_');
    return lines.join('\n');
  }

  function buildCsv(state) {
    function cell(v) {
      var s = String(v == null ? '' : v);
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var rows = [];
    rows.push(['id', 'semana', 'responsables', 'descripcion', 'estado', 'fecha', 'actualizado_por', 'actualizado_at']
      .map(cell).join(','));

    state.tasks.forEach(function (t) {
      var week = null;
      state.weeks.forEach(function (w) { if (w.id === t.week_id) week = w; });
      rows.push([
        t.id,
        week ? 'Semana ' + week.week_number : 'Entrega final',
        (t.assignees || []).join(' | '),
        t.description,
        t.completed ? 'completada' : 'pendiente',
        t.due_on || '',
        t.updated_by || '',
        t.updated_at || ''
      ].map(cell).join(','));
    });
    return rows.join('\r\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var $ta = $('<textarea>').val(text).css({ position: 'fixed', top: -1000, opacity: 0 })
        .appendTo('body');
      $ta[0].select();
      try {
        var ok = document.execCommand('copy');
        $ta.remove();
        ok ? resolve() : reject(new Error('copy'));
      } catch (e) {
        $ta.remove();
        reject(e);
      }
    });
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ------------------------------------------------------------- export */
  return {
    MAX_DESC: MAX_DESC,
    showScreen: showScreen,
    showErrorScreen: showErrorScreen,
    setConnection: setConnection,
    toast: toast,
    setAuthorName: setAuthorName,
    openAuthorDialog: openAuthorDialog,
    getAuthorChoice: getAuthorChoice,
    closeAuthorDialog: closeAuthorDialog,
    fillTaskDialog: fillTaskDialog,
    getTaskDialogValues: getTaskDialogValues,
    validateTaskDialog: validateTaskDialog,
    showTaskDialogError: showTaskDialogError,
    setTaskDialogBusy: setTaskDialogBusy,
    closeTaskDialog: closeTaskDialog,
    renderAll: renderAll,
    updateProgressIndicators: updateProgressIndicators,
    updateTaskDom: updateTaskDom,
    taskIsVisible: taskIsVisible,
    activeFilters: activeFilters,
    buildMarkdown: buildMarkdown,
    buildCsv: buildCsv,
    copyText: copyText,
    downloadFile: downloadFile,
    formatRange: formatRange
  };
})(window.jQuery);
