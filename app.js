/* Rotina Gentil — telas e interação.
   Tudo fica salvo no próprio aparelho (localStorage). Nada é enviado para a internet. */
(function () {
  'use strict';
  var Sch = window.Scheduler, C = window.CATALOG;
  var KEY = 'rotina-gentil:v1';
  var STEPS = ['welcome', 'prefs', 'slots', 'chores', 'exercise', 'areas', 'leisure', 'analysis'];
  var DAY = 86400000;

  // Equilíbrio do lazer, em % do tempo planejado na semana (usado no velocímetro da análise).
  // Ajuste à vontade o que é "pouco", "equilibrado" e "muito" lazer.
  var BALANCE = {
    low: 20,   // abaixo disso: "Pouco lazer"
    high: 45,  // acima disso: "Muito lazer"
    max: 70    // fim do velocímetro
  };

  /**
   * "Modo dia difícil": decide se uma atividade de HOJE fica no dia (true) ou vai para outro dia (false).
   * O lazer é tratado à parte: o primeiro lazer do dia sempre fica, porque recarregar é essencial.
   * item: { kind: 'chore' | 'exercise', monthly: true/false, overdue: true/false }
   * task: { name, importance: 1 | 2 | 3, duration (min), unit: 'week' | 'month' }
   */
  function keepOnHardDay(item, task) {
    // TODO(human): decida o que é essencial num dia difícil.
    if (item.monthly) return true;      // tarefas do mês são as mais esquecidas
    return task.importance === 3;       // só o que você marcou como importância alta
  }

  // Começo rápido: opções prontas para montar a semana em ~2 minutos
  var QUICK_SLOTS = [
    ['Noites de seg a sex (19h–20h30)', '19:00', '20:30', [0, 1, 2, 3, 4]],
    ['Manhãs de seg a sex (7h–8h)', '07:00', '08:00', [0, 1, 2, 3, 4]],
    ['Sábado e domingo de manhã (9h–11h)', '09:00', '11:00', [5, 6]],
    ['Sábado e domingo à tarde (14h–16h)', '14:00', '16:00', [5, 6]]
  ];
  var QUICK_CHORES = [0, 1, 2, 3, 5, 6, 7, 8]; // posições em CATALOG.chores
  var QUICK_LEISURE = [['jogos', 0], ['telas', 0], ['interesse', 0], ['social', 0], ['descanso', 1], ['natureza', 0], ['criativo', 0]];
  var SHORT_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  // ---------------- estado ----------------
  function emptySlots() { var s = {}; for (var d = 0; d < 7; d++) s[d] = []; return s; }
  function defaults() {
    return {
      v: 2, onboarded: false, step: 0,
      prefs: { scale: 1, theme: 'light', motion: 'normal', showWholeDay: false, maxChores: 3, buffer: 5 },
      slots: emptySlots(), chores: [], exercise: [], areas: {}, leisure: [], completions: [], plans: {},
      seedTs: null, meta: {}, energy: []
    };
  }
  function migrate(s) {
    var d = defaults();
    for (var k in d) if (!(k in s)) s[k] = d[k];
    for (var p in d.prefs) if (!(p in s.prefs)) s.prefs[p] = d.prefs[p];
    if (s.v < 2) {
      // versão 1: "Movimento" era lazer — agora é atividade física
      delete s.areas.movimento;
      s.leisure = s.leisure.filter(function (t) {
        if (t.area !== 'movimento') return true;
        s.exercise.push({ id: t.id, name: t.name, perWeek: t.perWeek, unit: 'week', duration: t.duration, importance: 2, need: 'corpo' });
        return false;
      });
      s.plans = {};
      s.v = 2;
    }
    [s.chores, s.exercise, s.leisure].forEach(function (list) {
      list.forEach(function (t) { delete t.firstStep; if (!t.unit) t.unit = 'week'; if (!t.perWeek) t.perWeek = 1; if (!t.perMonth) t.perMonth = 1; });
    });
    s.leisure.forEach(function (t) { if (!Array.isArray(t.options)) t.options = []; });
    return s;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : defaults();
    } catch (e) { return defaults(); }
  }
  var S = load();
  var storageOk = true;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  var ui = { view: 'today', edit: null, modal: null, focus: null, toast: null, weekOffset: 0, installEvt: null, prompted: false,
    quick: { slots: {}, chores: {}, leisure: {} }, energyAsk: false, hardUndo: null };

  // ---------------- utilidades ----------------
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function todayKey() { return Sch.dateKey(new Date()); }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDate(d, opts) { return capFirst(d.toLocaleDateString('pt-BR', opts || { weekday: 'long', day: 'numeric', month: 'long' })); }
  function fmtMin(m) { m = Math.round(m); if (m < 60) return m + ' min'; var hh = Math.floor(m / 60), mm = m % 60; return hh + 'h' + (mm ? (mm < 10 ? '0' : '') + mm : ''); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function isStandalone() { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }

  function listOf(kind) { return kind === 'leisure' ? S.leisure : kind === 'exercise' ? S.exercise : S.chores; }
  function findTask(kind, id) {
    var list = listOf(kind);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function freqText(t) { return t.unit === 'month' ? t.perMonth + '×/mês' : t.perWeek + '×/semana'; }
  function itemName(it, t) { return t.name + (it.variant ? ': ' + it.variant : ''); }
  var KIND_TAG = { chore: '🏠 Tarefa da casa', exercise: '🏃 Atividade física', leisure: '🎈 Lazer — isso também é importante' };

  function allTasks() { return { chores: S.chores, exercise: S.exercise, leisure: S.leisure }; }
  function activeNeeds() {
    var set = {};
    [S.chores, S.exercise, S.leisure].forEach(function (l) { l.forEach(function (t) { if (t.need) set[t.need] = 1; }); });
    return Object.keys(C.needs).filter(function (n) { return set[n]; });
  }
  function needsNow() {
    return Sch.computeNeeds({ chores: S.chores, exercise: S.exercise, leisure: S.leisure, completions: S.completions, seedTs: S.seedTs }, Date.now());
  }
  function lvl(v) { return v >= 60 ? 'good' : v >= 30 ? 'mid' : 'low'; }

  // ---------------- agenda semanal ----------------
  function capCfg() {
    return { slots: S.slots, chores: S.chores, exercise: S.exercise, leisure: S.leisure, buffer: S.prefs.buffer };
  }
  function planCfg(ws) {
    return {
      slots: S.slots, maxChoresPerDay: S.prefs.maxChores, buffer: S.prefs.buffer,
      chores: Sch.tasksForWeek(S.chores, ws, S.completions),
      exercise: Sch.tasksForWeek(S.exercise, ws, S.completions),
      leisure: Sch.tasksForWeek(S.leisure, ws, S.completions)
    };
  }
  function weekKeyFor(date) { return Sch.dateKey(Sch.weekStart(date)); }
  /** Status que a atividade já tinha neste dia (feita ou pulada), para não perder ao refazer a agenda. */
  function priorStatus(oldDay, dk, kind, taskId) {
    if (S.completions.some(function (c) { return c.date === dk && c.taskId === taskId && c.kind === kind; })) return 'done';
    if ((oldDay || []).some(function (o) { return o.kind === kind && o.taskId === taskId && o.status === 'skipped'; })) return 'skipped';
    return 'pending';
  }
  /** opts.old + opts.keepBefore: mantém intactos os dias que já passaram. */
  function buildWeek(wk, opts) {
    var start = Sch.parseKey(wk);
    var tpl = Sch.buildPlan(planCfg(start));
    var weekSerial = Math.round(start.getTime() / (7 * DAY)), counters = {};
    var plan = { createdAt: Date.now(), unscheduled: tpl.unscheduled, days: tpl.days.map(function (items, i) {
      var dk = Sch.dateKey(Sch.addDays(start, i));
      var old = opts && opts.old ? opts.old.days[i] : null;
      if (old && i < opts.keepBefore) return old;
      return items.map(function (it) {
        var item = { uid: uid(), taskId: it.taskId, kind: it.kind, start: it.start, end: it.end, status: priorStatus(old, dk, it.kind, it.taskId),
          monthly: it.monthly, overdue: it.overdue };
        var t = findTask(it.kind, it.taskId);
        if (t && t.options && t.options.length) {
          // o app escolhe por você: vai alternando entre os itens da lista, semana após semana
          var k = counters[t.id] = (counters[t.id] || 0) + 1;
          item.variant = t.options[(weekSerial * Math.max(1, t.perWeek || 1) + k - 1) % t.options.length];
        }
        return item;
      });
    }) };
    S.plans[wk] = plan;
    var keys = Object.keys(S.plans).sort();
    while (keys.length > 10) delete S.plans[keys.shift()];
    return plan;
  }
  function getWeek(wk) { return S.plans[wk] || buildWeek(wk); }
  function dayInfo(dk) {
    var d = Sch.parseKey(dk), wk = weekKeyFor(d), plan = getWeek(wk), idx = Sch.weekdayIndex(d);
    return { plan: plan, idx: idx, items: plan.days[idx], date: d, key: dk };
  }
  function sortItems(items) {
    items.sort(function (a, b) {
      var x = a.start ? Sch.toMin(a.start) : 99999, y = b.start ? Sch.toMin(b.start) : 99999;
      return x - y;
    });
  }
  /** Refaz a semana atual a partir de hoje. Dias passados, feitos e pulados continuam como estavam. */
  function applyRegenNow() {
    var wk = weekKeyFor(new Date()), old = S.plans[wk];
    Object.keys(S.plans).forEach(function (k) { if (k > wk) delete S.plans[k]; });
    buildWeek(wk, { old: old, keepBefore: Sch.weekdayIndex(new Date()) });
    save();
  }
  /** Mantém esta semana como está; a agenda nova vale a partir da próxima segunda. */
  function applyRegenNext() {
    var wk = weekKeyFor(new Date());
    Object.keys(S.plans).forEach(function (k) { if (k > wk) delete S.plans[k]; });
    save();
  }
  /** Lista o que mudaria (de hoje até domingo) se a agenda fosse refeita agora. */
  function previewChanges() {
    var now = new Date(), start = Sch.weekStart(now), wk = Sch.dateKey(start), old = S.plans[wk], todayIdx = Sch.weekdayIndex(now);
    var tpl = Sch.buildPlan(planCfg(start));
    function mapOf(days, isNew) {
      var m = {};
      days.forEach(function (items, i) {
        if (i < todayIdx) return;
        var dk = Sch.dateKey(Sch.addDays(start, i));
        items.forEach(function (it) {
          var st = isNew ? priorStatus(old && old.days[i], dk, it.kind, it.taskId) : it.status;
          if (st !== 'pending' || !findTask(it.kind, it.taskId)) return;
          var k = it.kind + ':' + it.taskId; (m[k] = m[k] || []).push(i);
        });
      });
      return m;
    }
    var a = old ? mapOf(old.days, false) : {}, b = mapOf(tpl.days, true), keys = {}, lines = [];
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; });
    function names(arr) { return arr && arr.length ? arr.sort().map(function (i) { return SHORT_DAYS[i]; }).join(', ') : 'nenhum dia'; }
    Object.keys(keys).forEach(function (k) {
      if (names(a[k]) === names(b[k])) return;
      var i = k.indexOf(':'), t = findTask(k.slice(0, i), k.slice(i + 1));
      lines.push({ name: t ? t.name : 'Atividade removida', from: names(a[k]), to: names(b[k]) });
    });
    return lines;
  }
  function openPreviewOr(silentMsg) {
    var lines = previewChanges();
    if (!lines.length) { applyRegenNow(); toast(silentMsg); }
    else ui.modal = { type: 'preview', lines: lines };
  }

  // ---------------- modo dia difícil ----------------
  function hardDayPlan(dk) {
    var keep = [], move = [], leisureKept = false;
    visibleItems(dayInfo(dk).items).forEach(function (it) {
      if (it.status !== 'pending') return;
      var t = findTask(it.kind, it.taskId), stays;
      if (it.kind === 'leisure') { stays = !leisureKept; leisureKept = true; }
      else stays = !!keepOnHardDay(it, t);
      (stays ? keep : move).push({ it: it, t: t });
    });
    return { keep: keep, move: move };
  }
  function lightestDayAfter(dk) {
    var base = Sch.parseKey(dk), best = null;
    for (var i = 1; i <= 7; i++) {
      var k = Sch.dateKey(Sch.addDays(base, i)), n = visibleItems(dayInfo(k).items).length;
      if (!best || n < best.n) best = { k: k, n: n };
    }
    return best.k;
  }

  // ---------------- lembretes (notificações) ----------------
  var notifTimers = [];
  function notifySupported() { return 'Notification' in window; }
  function showNotif(body, tag) {
    var opts = { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: tag };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(function (r) { r.showNotification('Rotina Gentil', opts); });
      else new Notification('Rotina Gentil', opts);
    } catch (e) { }
  }
  /** Agenda avisos 10 min antes e na hora de cada atividade de hoje. */
  function scheduleNotifs() {
    notifTimers.forEach(clearTimeout); notifTimers = [];
    if (!S.onboarded || !S.prefs.notify || !notifySupported() || Notification.permission !== 'granted') return;
    var now = new Date(), nowMs = now.getTime();
    visibleItems(dayInfo(todayKey()).items).forEach(function (it) {
      if (it.status !== 'pending' || !it.start) return;
      var t = findTask(it.kind, it.taskId), m = Sch.toMin(it.start);
      var at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(m / 60), m % 60).getTime();
      [[at - 10 * 60000, 'Daqui a 10 min: '], [at, 'Agora é a vez de: ']].forEach(function (p) {
        var delay = p[0] - nowMs;
        if (delay > 0) notifTimers.push(setTimeout(function () { showNotif(p[1] + itemName(it, t), it.uid + p[1]); }, delay));
      });
    });
    var nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1).getTime();
    notifTimers.push(setTimeout(scheduleNotifs, nextDay - nowMs));
  }
  function downloadFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /** Arquivo de calendário (.ics) da semana, com alarme 10 min antes — a Agenda do celular avisa mesmo com o app fechado. */
  function icsWeek() {
    var base = Sch.weekStart(new Date()), plan = getWeek(Sch.dateKey(base)), tk = todayKey(), n = 0;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    function stamp(d, hhmm) { var m = Sch.toMin(hhmm); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(Math.floor(m / 60)) + p(m % 60) + '00'; }
    function esc(s) { return String(s).replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
    var now = new Date(), dtstamp = now.getUTCFullYear() + p(now.getUTCMonth() + 1) + p(now.getUTCDate()) + 'T' + p(now.getUTCHours()) + p(now.getUTCMinutes()) + '00Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotina Gentil//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    plan.days.forEach(function (items, i) {
      var d = Sch.addDays(base, i);
      if (Sch.dateKey(d) < tk) return;
      items.forEach(function (it) {
        var t = findTask(it.kind, it.taskId);
        if (!t || it.status !== 'pending' || !it.start || !it.end) return;
        n++;
        lines.push('BEGIN:VEVENT', 'UID:' + it.uid + '@rotina-gentil', 'DTSTAMP:' + dtstamp, 'DTSTART:' + stamp(d, it.start), 'DTEND:' + stamp(d, it.end),
          'SUMMARY:' + esc(itemName(it, t)), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(itemName(it, t)), 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n'), n: n };
  }
  function visibleItems(items) { return items.filter(function (it) { return findTask(it.kind, it.taskId); }); }

  function moveItem(fromKey, itemUid, toKey) {
    var from = dayInfo(fromKey), item = null;
    from.plan.days[from.idx] = from.items.filter(function (it) { if (it.uid === itemUid) { item = it; return false; } return true; });
    if (!item) return;
    var to = dayInfo(toKey), task = findTask(item.kind, item.taskId), dur = (task && task.duration) || 15;
    var last = null;
    to.items.forEach(function (it) { if (it.end && (!last || Sch.toMin(it.end) > Sch.toMin(last))) last = it.end; });
    var start = null;
    if (last) start = Sch.toMin(last) + S.prefs.buffer;
    else if ((S.slots[to.idx] || []).length) start = Sch.toMin(S.slots[to.idx].slice().sort(function (a, b) { return Sch.toMin(a.start) - Sch.toMin(b.start); })[0].start);
    if (start != null && isFinite(start) && start + dur < 24 * 60) { item.start = Sch.toHHMM(start); item.end = Sch.toHHMM(start + dur); }
    else { item.start = ''; item.end = ''; }
    item.status = 'pending';
    to.plan.days[to.idx].push(item);
    sortItems(to.plan.days[to.idx]);
    save();
  }
  function findItem(dk, itemUid) {
    var di = dayInfo(dk);
    for (var i = 0; i < di.items.length; i++) if (di.items[i].uid === itemUid) return di.items[i];
    return null;
  }
  function completeItem(dk, itemUid, partial) {
    var it = findItem(dk, itemUid); if (!it) return;
    var t = findTask(it.kind, it.taskId); if (!t) return;
    it.status = 'done';
    var w = Sch.taskWeight(it.kind, t) * (partial ? 0.6 : 1);
    S.completions.push({ taskId: t.id, kind: it.kind, need: t.need, weight: w, window: Sch.taskWindow(t), ts: Date.now(), date: dk, uid: it.uid });
    if (S.completions.length > 800) S.completions = S.completions.slice(-800);
    save();
    var n = C.needs[t.need];
    toast(pick(C.kindWords) + (n ? '  ' + n.icon + ' ' + n.label + ' subiu.' : ''));
  }
  function undoItem(dk, itemUid) {
    var it = findItem(dk, itemUid); if (!it) return;
    it.status = 'pending';
    S.completions = S.completions.filter(function (c) { return c.uid !== itemUid; });
    save();
  }

  // ---------------- componentes ----------------
  function stepper(action, data, value, unit) {
    return '<div class="stepper" role="group">' +
      '<button type="button" class="ghost" data-a="' + action + '" data-delta="-1" ' + data + ' aria-label="Diminuir">−</button>' +
      '<output aria-live="polite">' + h(value) + (unit ? ' ' + unit : '') + '</output>' +
      '<button type="button" class="ghost" data-a="' + action + '" data-delta="1" ' + data + ' aria-label="Aumentar">+</button></div>';
  }
  function seg(action, data, options, current) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      return '<button type="button" data-a="' + action + '" data-v="' + h(o[0]) + '" ' + data + ' aria-pressed="' + (String(o[0]) === String(current)) + '">' + h(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function needSelect(list, data, current) {
    return '<select data-bind="taskNeed" ' + data + '>' + C[list].map(function (n) {
      return '<option value="' + n + '"' + (n === current ? ' selected' : '') + '>' + C.needs[n].icon + ' ' + C.needs[n].label + '</option>';
    }).join('') + '</select>';
  }
  function areaSelect(data, current) {
    return '<select data-bind="taskArea" ' + data + '>' + Object.keys(C.leisureAreas).map(function (k) {
      var a = C.leisureAreas[k];
      return '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' + a.icon + ' ' + a.label + '</option>';
    }).join('') + '</select>';
  }

  /** Barra no estilo "simulador de vida": do meio para a direita (verde) ou para a esquerda (vermelho). */
  function simBar(v) {
    var fill, cls;
    if (v >= 50) { fill = 'left:50%;width:' + (v - 50) + '%'; cls = v >= 65 ? 'sb-green' : 'sb-lime'; }
    else { fill = 'left:' + v + '%;width:' + (50 - v) + '%'; cls = v <= 30 ? 'sb-red' : 'sb-orange'; }
    return '<span class="simbar"><i class="' + cls + '" style="' + fill + '"></i><b class="mid"></b></span>';
  }
  function moodSummary() {
    var vals = needsNow(), list = activeNeeds();
    if (!list.length) return { avg: 100, text: '' };
    var sum = 0; list.forEach(function (n) { sum += vals[n] == null ? 100 : vals[n]; });
    var avg = Math.round(sum / list.length);
    var text = avg >= 70 ? 'Você está bem cuidado(a) esta semana.' : avg >= 40 ? 'Algumas coisas pedem atenção, sem pressa.' : 'Semana puxada. Um passo pequeno já ajuda.';
    return { avg: avg, text: text };
  }
  /** Painel de necessidades: medidor de humor na lateral + barras em duas colunas. */
  function needsPanel() {
    var vals = needsNow(), list = activeNeeds(), mood = moodSummary();
    if (!list.length) return '';
    var m = mood.avg, up = m >= 50;
    var moodFill = up ? 'bottom:50%;height:' + (m - 50) + '%' : 'top:50%;height:' + (50 - m) + '%';
    return '<section class="simpanel" aria-label="Necessidades. Bem-estar ' + m + ' por cento">' +
      '<div class="sp-mood" aria-hidden="true"><span class="sp-gem">' + (m >= 60 ? '😊' : m >= 30 ? '🙂' : '🫶') + '</span>' +
      '<span class="sp-vbar"><i class="' + (up ? 'sb-green' : 'sb-red') + '" style="' + moodFill + '"></i><b class="vmid"></b></span></div>' +
      '<div class="sp-body"><div class="sp-title">Necessidades</div><div class="sp-grid">' +
      list.map(function (n) {
        var v = vals[n] == null ? 100 : vals[n], meta = C.needs[n];
        return '<button type="button" class="sp-need" data-a="go" data-view="needs" aria-label="' + meta.label + ': ' + v + ' por cento">' +
          '<span class="sp-lbl">' + meta.label + '</span>' + simBar(v) + '</button>';
      }).join('') + '</div></div></section>' +
      '<p class="muted small center" style="margin:6px 0 0">Bem-estar ' + m + '% · ' + mood.text + '</p>';
  }
  function progress() {
    var n = STEPS.length - 1, cur = S.step;
    var s = '<div class="progress" aria-label="Etapa ' + cur + ' de ' + n + '">';
    for (var i = 1; i <= n; i++) s += '<span class="' + (i <= cur ? 'on' : '') + '"></span>';
    return s + '</div>';
  }
  function stepFooter(nextLabel, nextDisabled) {
    if (ui.edit) return '<div class="bottom-actions"><button type="button" class="primary big" data-a="editDone">Salvar e voltar</button></div>';
    return '<div class="bottom-actions">' + (S.step > 0 ? '<button type="button" class="ghost" data-a="back">Voltar</button>' : '') +
      '<button type="button" class="primary" data-a="next"' + (nextDisabled ? ' disabled' : '') + '>' + (nextLabel || 'Continuar') + '</button></div>';
  }

  // ---------------- telas do cadastro ----------------
  var views = {};
  views.welcome = function () {
    var install = '';
    if (!isStandalone()) {
      install = '<div class="card install"><h3>📲 Instale o app no seu celular</h3>' +
        '<p class="muted">Assim ele abre pelo ícone, em tela cheia, e funciona sem internet. Você pode fazer o cadastro já no app instalado.</p>' +
        (ui.installEvt ? '<button type="button" class="primary big" data-a="install">Instalar o app</button>' :
          '<p class="small"><b>Como instalar:</b> no Chrome, toque nos três pontinhos <b>⋮</b> e depois em <b>“Instalar app”</b> (ou “Adicionar à tela inicial”).</p>') +
        '</div>';
    }
    return '<div class="stack" style="padding-top:16px">' +
      '<div class="center" style="font-size:3rem">🌱</div>' +
      '<h1 class="center">Rotina Gentil</h1>' +
      '<p class="center muted">Um app para tirar de você o peso de decidir <b>o que</b> fazer e <b>quando</b>.</p>' +
      install +
      '<div class="card soft"><h3>Como funciona</h3>' +
      '<p>1. Você diz quando tem tempo livre.</p><p>2. Você diz quais tarefas da casa precisa fazer (e, se quiser, atividade física).</p>' +
      '<p>3. Você conta o que gosta de fazer no lazer.</p><p>4. O app monta sua semana. Você só abre e vê <b>uma coisa por vez</b>.</p></div>' +
      '<p class="muted small">Você pode mudar tudo depois. Seus dados ficam só neste aparelho.</p>' +
      '</div><div class="stack" style="margin-top:16px">' +
      '<button type="button" class="primary big" data-a="quickStart">⚡ Começo rápido (2 min)</button>' +
      '<button type="button" class="ghost full" data-a="next">Cadastro completo (5 min)</button>' +
      (isStandalone() ? '' : '<p class="muted small center">Você pode continuar aqui no navegador ou instalar o app primeiro.</p>') + '</div>';
  };
  views.quick = function () {
    var q = ui.quick;
    function chip(action, i, label, on) { return '<button type="button" class="chip" data-a="' + action + '" data-i="' + i + '" aria-pressed="' + !!on + '">' + h(label) + '</button>'; }
    function any(o) { return Object.keys(o).some(function (k) { return o[k]; }); }
    var ok = any(q.slots) && any(q.chores);
    return '<h1>⚡ Começo rápido</h1><p class="muted">Três perguntas e sua semana fica pronta. Depois você ajusta o que quiser em Ajustes.</p>' +
      '<h3>1. Quando você costuma ter tempo livre?</h3><div class="chips">' +
      QUICK_SLOTS.map(function (s, i) { return chip('qSlot', i, s[0], q.slots[i]); }).join('') + '</div>' +
      '<h3 style="margin-top:18px">2. Quais tarefas da casa você precisa fazer?</h3><div class="chips">' +
      QUICK_CHORES.map(function (i) { return chip('qChore', i, C.chores[i][0], q.chores[i]); }).join('') + '</div>' +
      '<h3 style="margin-top:18px">3. O que você gosta de fazer no tempo livre?</h3><div class="chips">' +
      QUICK_LEISURE.map(function (l, i) { var a = C.leisureAreas[l[0]]; return chip('qLeisure', i, a.icon + ' ' + a.ideas[l[1]][0], q.leisure[i]); }).join('') + '</div>' +
      (ok ? '' : '<p class="muted small" style="margin-top:12px">Escolha pelo menos um horário e uma tarefa.</p>') +
      '<div class="bottom-actions"><button type="button" class="ghost" data-a="quickBack">Voltar</button>' +
      '<button type="button" class="primary" data-a="quickBuild"' + (ok ? '' : ' disabled') + '>Montar minha semana ✨</button></div>';
  };
  views.prefs = function () {
    var p = S.prefs;
    return progress() + '<h1>Do seu jeito</h1><p class="muted">Ajuste o visual para ficar confortável. Dá para mudar depois em Ajustes.</p>' +
      '<label class="field">Tamanho do texto</label>' + seg('pref', 'data-k="scale"', [[1, 'Normal'], [1.15, 'Grande'], [1.3, 'Enorme']], p.scale) +
      '<label class="field">Cores</label>' + seg('pref', 'data-k="theme"', [['light', 'Claro'], ['dark', 'Escuro']], p.theme) +
      '<label class="field">Animações</label>' + seg('pref', 'data-k="motion"', [['normal', 'Suaves'], ['reduce', 'Desligadas']], p.motion) +
      '<label class="field">Na tela inicial, mostrar</label>' + seg('pref', 'data-k="showWholeDay"', [['false', 'Só a próxima tarefa'], ['true', 'O dia inteiro']], String(p.showWholeDay)) +
      '<p class="muted small">Dica: “Só a próxima tarefa” ajuda a não se sentir sobrecarregado(a).</p>' +
      stepFooter();
  };
  views.slots = function () {
    var rep = Sch.capacityReport(capCfg());
    var html = progress() + '<h1>Quando você tem tempo?</h1>' +
      '<p class="muted">Marque os horários livres para cuidar da casa e de você. Não precisa ser perfeito.</p>' +
      '<div class="card soft"><b>Atalho:</b> preencha a segunda-feira e copie para outros dias.<div class="row wrap" style="margin-top:8px">' +
      '<button type="button" class="ghost" data-a="copySlots" data-to="weekdays">Copiar segunda → dias úteis</button>' +
      '<button type="button" class="ghost" data-a="copySlots" data-to="all">Copiar segunda → todos</button></div></div>';
    for (var d = 0; d < 7; d++) {
      var list = S.slots[d] || [];
      html += '<div class="card"><div class="row spread"><h3>' + C.weekdays[d] + '</h3><span class="muted small">' + (list.length ? '' : 'sem horário') + '</span></div>';
      list.forEach(function (s, i) {
        var bad = !(Sch.toMin(s.end) > Sch.toMin(s.start));
        html += '<div class="row" style="margin-top:8px"><input type="time" aria-label="Início" value="' + h(s.start) + '" data-bind="slot" data-d="' + d + '" data-i="' + i + '" data-f="start">' +
          '<span>até</span><input type="time" aria-label="Fim" value="' + h(s.end) + '" data-bind="slot" data-d="' + d + '" data-i="' + i + '" data-f="end">' +
          '<button type="button" class="icon ghost" data-a="delSlot" data-d="' + d + '" data-i="' + i + '" aria-label="Remover horário">✕</button></div>' +
          (bad ? '<p class="small" style="color:var(--low)">O fim precisa ser depois do início.</p>' : '');
      });
      html += '<div class="row wrap" style="margin-top:8px">' +
        '<button type="button" class="ghost" data-a="addSlot" data-d="' + d + '" data-s="09:00" data-e="11:00">+ Manhã</button>' +
        '<button type="button" class="ghost" data-a="addSlot" data-d="' + d + '" data-s="14:00" data-e="16:00">+ Tarde</button>' +
        '<button type="button" class="ghost" data-a="addSlot" data-d="' + d + '" data-s="19:00" data-e="20:30">+ Noite</button></div></div>';
    }
    html += '<p class="center"><b>Total livre na semana: ' + fmtMin(rep.available) + '</b></p>';
    return html + stepFooter('Continuar', rep.available === 0);
  };

  function taskEditor(kind, t) {
    var data = 'data-kind="' + kind + '" data-id="' + t.id + '"';
    var monthly = t.unit === 'month';
    var html = '<div class="task-edit ' + kind + '">' +
      '<div class="head"><input type="text" aria-label="Nome" value="' + h(t.name) + '" data-bind="taskName" ' + data + '>' +
      '<button type="button" class="icon ghost" data-a="delTask" ' + data + ' aria-label="Remover ' + h(t.name) + '">✕</button></div>' +
      '<div class="grid">' +
      '<div style="grid-column:1/-1"><div class="lab">Com que frequência?</div>' + seg('taskUnit', data, [['week', 'Por semana'], ['month', 'Por mês']], t.unit) + '</div>' +
      '<div><div class="lab">' + (monthly ? 'Vezes por mês' : 'Vezes por semana') + '</div>' +
      stepper('taskNum', data + ' data-f="' + (monthly ? 'perMonth' : 'perWeek') + '"', monthly ? t.perMonth : t.perWeek, '×') + '</div>' +
      '<div><div class="lab">Duração</div>' + stepper('taskNum', data + ' data-f="duration"', t.duration, 'min') + '</div>';
    if (monthly) html += '<p class="small muted" style="grid-column:1/-1;margin:0">📌 O app coloca na semana certa do mês e lembra de novo se ficar para trás.</p>';
    if (kind !== 'leisure') html += '<div style="grid-column:1/-1"><div class="lab">Importância para você</div>' + seg('taskImp', data, [[1, 'Baixa'], [2, 'Média'], [3, 'Alta']], t.importance) + '</div>';
    if (kind === 'chore') html += '<div style="grid-column:1/-1"><div class="lab">Qual necessidade isso cuida?</div>' + needSelect('choreNeeds', data, t.need) + '</div>';
    if (kind === 'leisure') {
      var ideaHint = '';
      var area = C.leisureAreas[t.area];
      if (area) area.ideas.forEach(function (i) { if (i[0] === t.name) ideaHint = i[2]; });
      html += '<div style="grid-column:1/-1"><div class="lab">Área</div>' + areaSelect(data, t.area) + '</div>' +
        '<div style="grid-column:1/-1"><div class="lab">Quais? O app escolhe um por vez para você <span class="muted">(opcional)</span></div>' +
        '<div class="chips" style="margin:6px 0">' + t.options.map(function (o, i) {
          return '<span class="optchip">' + h(o) + '<button type="button" data-a="delOption" ' + data + ' data-i="' + i + '" aria-label="Remover ' + h(o) + '">✕</button></span>';
        }).join('') + '</div>' +
        '<div class="row"><input type="text" placeholder="' + h(ideaHint || 'Ex.: nome do jogo, série, livro') + '" data-bind="optionInput" ' + data + '>' +
        '<button type="button" class="ghost" data-a="addOption" ' + data + '>Adicionar</button></div></div>';
    }
    return html + '</div></div>';
  }
  function suggestionChips(action, items, list, extra) {
    var names = {}; list.forEach(function (t) { names[t.name] = 1; });
    return '<div class="chips">' + items.map(function (c, i) {
      var name = c[0];
      return '<button type="button" class="chip" data-a="' + action + '" data-i="' + i + '" ' + (extra || '') + ' aria-pressed="' + !!names[name] + '">' + h(name) + '</button>';
    }).join('') + '</div>';
  }
  views.chores = function () {
    var weekly = [], monthly = [];
    C.chores.forEach(function (c, i) { (c[4] === 'month' ? monthly : weekly).push(i); });
    function chipsFor(idx) {
      var names = {}; S.chores.forEach(function (t) { names[t.name] = 1; });
      return '<div class="chips">' + idx.map(function (i) {
        return '<button type="button" class="chip" data-a="toggleChore" data-i="' + i + '" aria-pressed="' + !!names[C.chores[i][0]] + '">' + h(C.chores[i][0]) + '</button>';
      }).join('') + '</div>';
    }
    return progress() + '<h1>Tarefas da casa</h1>' +
      '<p class="muted">Toque nas tarefas que você precisa fazer. Depois ajuste a frequência, o tempo e a importância.</p>' +
      '<h3>Do dia a dia</h3>' + chipsFor(weekly) +
      '<h3 style="margin-top:14px">📌 De vez em quando (mensais)</h3><p class="muted small">Essas são as mais fáceis de esquecer. O app lembra por você.</p>' + chipsFor(monthly) +
      '<h2>Suas tarefas (' + S.chores.length + ')</h2>' +
      (S.chores.length ? S.chores.map(function (t) { return taskEditor('chore', t); }).join('') : '<p class="muted">Nenhuma ainda.</p>') +
      '<button type="button" class="ghost full" data-a="addCustom" data-kind="chore">+ Criar tarefa minha</button>' +
      stepFooter('Continuar', !S.chores.length);
  };
  views.exercise = function () {
    return progress() + '<h1>Atividade física <span class="muted" style="font-size:1rem">(opcional)</span></h1>' +
      '<p class="muted">Se quiser, escolha atividades para mexer o corpo. Elas entram na agenda junto com as tarefas. Não é obrigatório — dá para adicionar depois.</p>' +
      suggestionChips('toggleExercise', C.exercise, S.exercise) +
      '<h2>Suas atividades (' + S.exercise.length + ')</h2>' +
      (S.exercise.length ? S.exercise.map(function (t) { return taskEditor('exercise', t); }).join('') : '<p class="muted">Nenhuma — tudo bem.</p>') +
      '<button type="button" class="ghost full" data-a="addCustom" data-kind="exercise">+ Criar atividade minha</button>' +
      stepFooter(S.exercise.length ? 'Continuar' : 'Pular por agora');
  };
  views.areas = function () {
    return progress() + '<h1>O que te faz bem?</h1>' +
      '<p class="muted">Lazer não é prêmio: é necessidade. Escolha as áreas de lazer que combinam com você e responda duas perguntinhas sobre cada uma.</p>' +
      Object.keys(C.leisureAreas).map(function (k) {
        var a = C.leisureAreas[k], sel = S.areas[k];
        return '<div class="card' + (sel ? ' leisure' : '') + '">' +
          '<button type="button" class="chip" style="width:100%;text-align:left;border-radius:14px" data-a="toggleArea" data-k="' + k + '" aria-pressed="' + !!sel + '">' + a.icon + ' ' + h(a.label) + '</button>' +
          '<p class="muted small">' + h(a.desc) + '</p>' +
          (sel ? '<div class="lab small" style="margin-top:6px"><b>Quanto isso te faz bem?</b></div>' + seg('areaQ', 'data-k="' + k + '" data-f="joy"', [[1, 'Um pouco'], [2, 'Bastante'], [3, 'Muito']], sel.joy) +
            '<div class="lab small" style="margin-top:8px"><b>Com que frequência você faz hoje?</b></div>' + seg('areaQ', 'data-k="' + k + '" data-f="now"', [[0, 'Quase nunca'], [1, 'Às vezes'], [2, 'Sempre']], sel.now) : '') +
          '</div>';
      }).join('') + stepFooter('Continuar', !Object.keys(S.areas).length);
  };
  views.leisure = function () {
    var keys = Object.keys(S.areas);
    if (!keys.length) keys = Object.keys(C.leisureAreas);
    return (ui.edit ? '' : progress()) + '<h1>Atividades de lazer</h1>' +
      '<p class="muted">Escolha atividades em cada área. Em cada uma você pode listar <b>quais</b> (os jogos, séries, livros que você curte agora) — o app escolhe um por vez, para você não precisar pensar.</p>' +
      keys.map(function (k) {
        var a = C.leisureAreas[k], mine = S.leisure.filter(function (t) { return t.area === k; });
        return '<section class="card leisure"><h3>' + a.icon + ' ' + h(a.label) + '</h3>' +
          suggestionChips('toggleLeisure', a.ideas, S.leisure, 'data-k="' + k + '"') +
          mine.map(function (t) { return taskEditor('leisure', t); }).join('') +
          '<button type="button" class="ghost full" style="margin-top:8px" data-a="addCustom" data-kind="leisure" data-area="' + k + '">+ Minha atividade em ' + h(a.label) + '</button></section>';
      }).join('') +
      // atividades cuja área não está mais selecionada
      S.leisure.filter(function (t) { return keys.indexOf(t.area) < 0; }).map(function (t) { return taskEditor('leisure', t); }).join('') +
      stepFooter('Ver análise', !S.leisure.length);
  };

  /** Velocímetro (meia-lua) mostrando quanto do tempo planejado é lazer. */
  function gauge(pct) {
    var max = BALANCE.max, R = 80, cx = 100, cy = 100;
    function pt(v, r) { var a = Math.PI * (1 - clamp(v, 0, max) / max); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    function arc(a, b, color) {
      var p1 = pt(a, R), p2 = pt(b, R);
      return '<path d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '" stroke="' + color + '" stroke-width="18" fill="none"/>';
    }
    var needle = pt(pct, 64);
    return '<svg class="gauge" viewBox="0 0 200 132" role="img" aria-label="Lazer: ' + pct + '% do tempo planejado">' +
      arc(0, BALANCE.low, 'var(--low)') + arc(BALANCE.low, BALANCE.high, 'var(--good)') + arc(BALANCE.high, max, 'var(--mid)') +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + needle[0].toFixed(1) + '" y2="' + needle[1].toFixed(1) + '" stroke="var(--text)" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="var(--text)"/>' +
      '<text x="' + cx + '" y="' + (cy + 28) + '" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">' + pct + '%</text></svg>' +
      '<div class="gauge-labels"><span>Pouco lazer</span><span>Equilibrado</span><span>Muito lazer</span></div>';
  }
  views.analysis = function () {
    var rep = Sch.capacityReport(capCfg());
    var tpl = Sch.buildPlan(planCfg(Sch.weekStart(new Date())));
    var pct = rep.available ? Math.round(100 * rep.needed / rep.available) : 0;
    var lzPct = rep.needed ? Math.round(100 * rep.leisure / rep.needed) : 0;
    var html = (ui.edit ? '' : progress()) + '<h1>Sua análise</h1>';
    var scale = Math.max(rep.available, rep.needed) || 1;

    html += '<div class="card"><h3>⏱️ Tempo (média por semana)</h3>' +
      '<div class="stat"><span>Tempo livre</span><b>' + fmtMin(rep.available) + '</b></div>' +
      '<div class="stat"><span>Tarefas da casa</span><b>' + fmtMin(rep.chores) + '</b></div>' +
      (rep.exercise ? '<div class="stat"><span>Atividade física</span><b>' + fmtMin(rep.exercise) + '</b></div>' : '') +
      '<div class="stat"><span>Lazer</span><b>' + fmtMin(rep.leisure) + '</b></div>' +
      '<div class="meter" style="margin-top:10px" aria-hidden="true"><i style="width:' + (100 * rep.chores / scale) + '%;background:var(--accent)"></i>' +
      '<i style="width:' + (100 * rep.exercise / scale) + '%;background:var(--exercise)"></i>' +
      '<i style="width:' + (100 * rep.leisure / scale) + '%;background:var(--leisure)"></i></div>' +
      '<div class="legend"><span style="--c:var(--accent)">Casa</span>' + (rep.exercise ? '<span style="--c:var(--exercise)">Corpo</span>' : '') + '<span style="--c:var(--leisure)">Lazer</span><span style="--c:var(--surface-2)">Folga</span></div>' +
      '<p style="margin-top:10px">' + (pct > 100 ? 'Você planejou mais do que cabe (' + pct + '% do tempo livre). Tudo bem: o app coloca primeiro o que é mais importante e o lazer, e mostra o que ficou de fora.' :
        pct > 85 ? 'Sua semana ficou bem cheia (' + pct + '% do tempo livre). Se puder, deixe alguma folga.' :
        'Cabe tudo, com folga (' + pct + '% do tempo livre). Folga é ótimo: imprevistos acontecem.') + '</p></div>';

    var zone = lzPct < BALANCE.low ? 'low' : lzPct > BALANCE.high ? 'high' : 'ok';
    html += '<div class="card leisure center"><h3>🎈 Equilíbrio entre obrigação e lazer</h3>' + gauge(lzPct) +
      '<p style="margin-top:8px"><b>' + { low: 'Abaixo do esperado', ok: 'Equilibrado', high: 'Acima do esperado' }[zone] + '</b></p>' +
      '<p class="muted">' + { low: 'É pouco lazer. Pessoas com TDAH e autismo gastam muita energia no dia a dia — recarregar é parte do cuidado. Que tal adicionar mais uma atividade?',
        ok: 'Bom equilíbrio entre obrigação e prazer.',
        high: 'Bastante lazer! Ótimo, desde que as tarefas importantes também estejam cabendo (veja abaixo se algo ficou de fora).' }[zone] + '</p></div>';

    var forgotten = [], noActivity = [];
    Object.keys(S.areas).forEach(function (k) {
      var a = S.areas[k], has = S.leisure.some(function (t) { return t.area === k; });
      if (a.joy >= 2 && a.now === 0) forgotten.push(k);
      if (!has) noActivity.push(k);
    });
    html += '<div class="card leisure"><h3>🔎 Seu lazer</h3>';
    if (forgotten.length) {
      var fNames = forgotten.map(function (k) { return C.leisureAreas[k].icon + ' ' + C.leisureAreas[k].label; }).join(', ');
      var fMissing = forgotten.filter(function (k) { return noActivity.indexOf(k) >= 0; });
      html += '<p><b>Áreas esquecidas:</b> ' + fNames + '. Você disse que te fazem bem, mas quase não faz. ' +
        (fMissing.length ? 'Escolha pelo menos uma atividade em ' + fMissing.map(function (k) { return C.leisureAreas[k].label; }).join(', ') + ' para ela entrar na agenda.' :
          'O lazer tem prioridade na agenda, então elas estão garantidas.') + '</p>';
    } else html += '<p>Você já cuida das áreas que mais gosta. Ótimo!</p>';
    if (noActivity.length) html += '<p class="muted">Ainda sem atividade em: ' + noActivity.map(function (k) { return C.leisureAreas[k].label; }).join(', ') + '.</p>';
    var withOpts = S.leisure.filter(function (t) { return t.options.length; }).length;
    html += '<p class="muted small">' + (withOpts ? withOpts + ' atividade(s) com lista de opções: o app vai alternando entre elas.' : 'Dica: liste seus jogos e séries favoritos nas atividades e o app escolhe por você.') + '</p></div>';

    if (tpl.unscheduled.length) {
      var counts = {}; tpl.unscheduled.forEach(function (u) { counts[u.name] = (counts[u.name] || 0) + 1; });
      html += '<div class="card soft"><h3>📦 Não couberam (nesta semana)</h3><p>' + Object.keys(counts).map(function (n) { return h(n) + ' (' + counts[n] + '×)'; }).join(', ') +
        '</p><p class="muted small">Para caber, adicione horários ou diminua a frequência. Também pode aumentar o limite de tarefas por dia em Ajustes (hoje: ' + S.prefs.maxChores + ').</p></div>';
    }
    if (ui.edit) return html + '<div class="bottom-actions"><button type="button" class="primary big" data-a="editDone">Voltar</button></div>';
    return html + stepFooter('Montar minha semana ✨');
  };

  // ---------------- telas principais ----------------
  function itemLine(dk, it, showActions) {
    var t = findTask(it.kind, it.taskId);
    if (!t) return '';
    return '<div class="item ' + it.kind + ' ' + it.status + '">' +
      '<span class="time">' + (it.start || '—') + '</span><span class="dot" aria-hidden="true"></span>' +
      '<span class="grow name">' + (it.monthly ? '📌 ' : '') + h(itemName(it, t)) + ' <span class="muted small">· ' + t.duration + ' min' + (it.status === 'done' ? ' · feito ✓' : it.status === 'skipped' ? ' · pulado' : '') + '</span></span>' +
      (showActions ? '<button type="button" class="ghost" data-a="itemMenu" data-dk="' + dk + '" data-uid="' + it.uid + '" aria-label="Opções para ' + h(t.name) + '">⋯</button>' : '') +
      '</div>';
  }
  function monthlyReminder() {
    var base = Sch.weekStart(new Date()), plan = getWeek(Sch.dateKey(base)), found = [];
    plan.days.forEach(function (items, i) {
      items.forEach(function (it) {
        var t = findTask(it.kind, it.taskId);
        if (it.monthly && t && it.status === 'pending') found.push({ t: t, day: i, overdue: it.overdue });
      });
    });
    if (!found.length) return '';
    return '<div class="card monthly"><h3>📌 Tarefas do mês nesta semana</h3>' + found.map(function (f) {
      return '<p class="small">' + h(f.t.name) + ' — ' + C.weekdays[f.day].toLowerCase() + (f.overdue ? ' <span class="muted">(ficou da semana passada, sem problema)</span>' : '') + '</p>';
    }).join('') + '</div>';
  }
  function checkinCard(pendingCount) {
    var dk = todayKey();
    if (S.meta.checkin === dk) {
      if (ui.energyAsk && pendingCount > 1) {
        return '<div class="card soft"><p style="margin-top:0"><b>Energia baixa hoje.</b> Quer deixar o dia mais leve? Fica só o essencial e o resto vai para outros dias.</p>' +
          '<div class="row"><button type="button" class="primary grow" data-a="hardDay">Sim, deixar leve</button><button type="button" class="ghost grow" data-a="energyKeep">Manter o dia</button></div></div>';
      }
      return '';
    }
    return '<div class="card soft checkin"><p style="margin-top:0"><b>Como está sua energia agora?</b></p><div class="seg">' +
      [['high', '🔋', 'Boa'], ['mid', '🙂', 'Média'], ['low', '🪫', 'Baixa']].map(function (e) {
        return '<button type="button" data-a="energy" data-v="' + e[0] + '"><span class="emo" aria-hidden="true">' + e[1] + '</span>' + e[2] + '</button>';
      }).join('') + '</div><div class="center"><button type="button" class="link" data-a="energySkip">Pular</button></div></div>';
  }
  function notifyCard() {
    if (S.prefs.notify || S.meta.notifyAsked || !notifySupported() || Notification.permission === 'denied' || S.meta.checkin !== todayKey()) return '';
    return '<div class="card soft"><p style="margin-top:0">🔔 <b>Quer que o celular te avise</b> 10 minutos antes de cada atividade?</p>' +
      '<div class="row"><button type="button" class="primary grow" data-a="notifyOn">Sim, avisar</button><button type="button" class="ghost grow" data-a="notifyLater">Agora não</button></div></div>';
  }
  views.today = function () {
    var now = new Date(), dk = todayKey(), di = dayInfo(dk), items = visibleItems(di.items);
    var hr = now.getHours(), greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    var pending = items.filter(function (it) { return it.status === 'pending'; });
    var html = '<p class="muted" style="margin:0">' + greet + ' 🌱</p><h1 style="font-size:1.35rem">' + fmtDate(now) + '</h1>';
    html += checkinCard(pending.length) + notifyCard();
    html += needsPanel();

    var next = pending[0];
    if (!items.length) {
      html += '<div class="card now center"><div style="font-size:2.4rem">☁️</div><h2>Hoje é um dia livre</h2><p class="muted">Nada planejado. Descansar também é cuidar de você.</p></div>';
    } else if (!next) {
      html += '<div class="card now center"><div style="font-size:2.4rem">🎉</div><h2>Tudo feito por hoje!</h2><p class="muted">Você cumpriu o que estava planejado. O resto do dia é seu.</p></div>';
    } else {
      var t = findTask(next.kind, next.taskId);
      var startMin = next.start ? Sch.toMin(next.start) : null, nowMin = hr * 60 + now.getMinutes();
      var when = !next.start ? 'Quando quiser hoje' :
        startMin > nowMin && startMin - nowMin <= 10 ? '⏰ Começa em ' + (startMin - nowMin) + ' min (às ' + next.start + ')' :
        startMin > nowMin ? 'Começa às ' + next.start + ' · pode começar antes, se quiser' :
        Sch.toMin(next.end) < nowMin ? 'Era para as ' + next.start + ' · tudo bem fazer agora' : next.start + ' – ' + next.end;
      html += '<div class="card now ' + next.kind + '">' +
        '<span class="tag">' + (next.monthly ? '📌 Tarefa do mês' : KIND_TAG[next.kind]) + '</span>' +
        '<p class="muted small" style="margin-top:8px">AGORA É A VEZ DE</p><h2>' + h(itemName(next, t)) + '</h2>' +
        '<p class="muted">' + when + ' · ' + t.duration + ' min</p>' +
        '<button type="button" class="primary big" data-a="start" data-dk="' + dk + '" data-uid="' + next.uid + '">Começar</button>' +
        '<div class="center"><button type="button" class="link" data-a="notNow" data-dk="' + dk + '" data-uid="' + next.uid + '">Agora não consigo</button></div></div>';
    }

    if (items.length) {
      var doneN = items.filter(function (it) { return it.status === 'done'; }).length;
      if (S.prefs.showWholeDay || ui.showDay) {
        html += '<div class="card"><div class="row spread"><h3>Hoje (' + doneN + ' de ' + items.length + ')</h3>' +
          (S.prefs.showWholeDay ? '' : '<button type="button" class="link" data-a="toggleDay">Esconder</button>') + '</div>' +
          items.map(function (it) { return itemLine(dk, it, true); }).join('') + '</div>';
      } else if (pending.length > 1) {
        var after = pending[1], ta = findTask(after.kind, after.taskId);
        html += '<p class="muted center">Depois: ' + h(itemName(after, ta)) + (after.start ? ' às ' + after.start : '') + '</p>' +
          '<div class="center"><button type="button" class="link" data-a="toggleDay">Ver o dia todo (' + items.length + ')</button></div>';
      }
    }
    if (ui.hardUndo) html += '<p class="center small muted">Dia leve ativado. <button type="button" class="link" data-a="hardUndo">Desfazer</button></p>';
    else if (pending.length > 1 && S.meta.hardDay !== dk) html += '<div class="center"><button type="button" class="link" data-a="hardDay">🪫 Hoje está difícil</button></div>';
    html += monthlyReminder();
    if (S.meta.quickPending) {
      html += '<div class="card soft"><p style="margin-top:0">⚡ Você usou o começo rápido. Quando quiser, ajuste as frequências e adicione tarefas do mês, atividade física e seus jogos favoritos.</p>' +
        '<div class="row"><button type="button" class="ghost grow" data-a="go" data-view="settings">Ir para Ajustes</button><button type="button" class="link" data-a="quickDismiss">Dispensar</button></div></div>';
    }
    return html;
  };
  views.week = function () {
    var base = Sch.addDays(Sch.weekStart(new Date()), ui.weekOffset * 7), wk = Sch.dateKey(base), plan = getWeek(wk), tk = todayKey();
    var html = '<div class="row spread"><button type="button" class="icon ghost" data-a="weekNav" data-delta="-1" aria-label="Semana anterior"' + (ui.weekOffset <= -1 ? ' disabled' : '') + '>‹</button>' +
      '<h1 class="center grow" style="font-size:1.3rem">' + (ui.weekOffset === 0 ? 'Esta semana' : ui.weekOffset > 0 ? 'Próxima semana' : 'Semana passada') +
      '<br><span class="muted small">' + fmtDate(base, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(Sch.addDays(base, 6), { day: 'numeric', month: 'short' }) + '</span></h1>' +
      '<button type="button" class="icon ghost" data-a="weekNav" data-delta="1" aria-label="Próxima semana"' + (ui.weekOffset >= 1 ? ' disabled' : '') + '>›</button></div>' +
      '<div class="legend" style="justify-content:center;margin-bottom:6px"><span style="--c:var(--accent)">Casa</span><span style="--c:var(--exercise)">Corpo</span><span style="--c:var(--leisure)">Lazer</span><span style="--c:transparent">📌 do mês</span></div>';
    for (var i = 0; i < 7; i++) {
      var d = Sch.addDays(base, i), dk = Sch.dateKey(d), items = visibleItems(plan.days[i]), past = dk < tk;
      html += '<div class="card"' + (past ? ' style="opacity:.7"' : '') + '><div class="daytitle"><h3>' + C.weekdays[i] + ' <span class="muted small">' + d.getDate() + '/' + (d.getMonth() + 1) + '</span></h3>' +
        (dk === tk ? '<span class="today-badge">Hoje</span>' : '') + '</div>' +
        (items.length ? items.map(function (it) { return itemLine(dk, it, true); }).join('') : '<p class="muted small">Livre ☁️</p>') + '</div>';
    }
    if (ui.weekOffset === 0) html += '<button type="button" class="ghost full" data-a="exportIcs">📅 Colocar esta semana na agenda do celular</button>';
    if (plan.unscheduled && plan.unscheduled.length) {
      var counts = {}; plan.unscheduled.forEach(function (u) { counts[u.name] = (counts[u.name] || 0) + 1; });
      html += '<div class="card soft"><h3>📦 Não couberam nesta semana</h3><p>' + Object.keys(counts).map(function (n) { return h(n) + ' (' + counts[n] + '×)'; }).join(', ') +
        '</p><p class="muted small">Não é falha sua — é falta de horário. Ajuste em Ajustes → Horários.</p></div>';
    }
    return html;
  };
  views.needs = function () {
    var vals = needsNow(), list = activeNeeds();
    var html = '<h1>Necessidades</h1>' + needsPanel() +
      '<p class="muted">Cada barra começa no meio. <b style="color:var(--good)">Verde para a direita</b>: bem cuidado. <b style="color:var(--low)">Vermelho para a esquerda</b>: pedindo atenção. Não é nota nem cobrança.</p>';
    list.forEach(function (n) {
      var v = vals[n], meta = C.needs[n];
      var tasks = S.chores.concat(S.exercise, S.leisure).filter(function (t) { return t.need === n; });
      var last = null; S.completions.forEach(function (c) { if (c.need === n && (!last || c.ts > last)) last = c.ts; });
      var ago = last ? Math.floor((Date.now() - last) / DAY) : null;
      html += '<div class="card"><div class="row spread"><h3>' + meta.icon + ' ' + meta.label + '</h3><b>' + v + '%</b></div>' + simBar(v) +
        '<p class="muted small">' + meta.hint + '</p><p class="small"><b>Enche com:</b> ' + tasks.map(function (t) { return h(t.name) + ' (' + freqText(t) + ')'; }).join(', ') + '</p>' +
        '<p class="small muted">' + (ago == null ? 'Ainda não concluído pelo app.' : ago === 0 ? 'Cuidado hoje ✓' : 'Última vez: há ' + ago + ' dia' + (ago > 1 ? 's' : '') + '.') + '</p></div>';
    });
    if (!S.exercise.length) html += '<div class="card soft"><p>🏃 Sem atividade física cadastrada. Se quiser, <button type="button" class="link" data-a="edit" data-step="exercise">adicione aqui</button>.</p></div>';
    return html;
  };
  function notifStatusHtml() {
    if (!notifySupported()) return '<p class="small">Este navegador não permite lembretes.</p>';
    if (Notification.permission === 'denied') return '<p class="small">Os lembretes estão <b>bloqueados</b>. Para liberar: Configurações do Android → Apps → Chrome → Notificações.</p>';
    if (S.prefs.notify && Notification.permission === 'granted') return '<p class="small"><b>Ligados ✓</b></p><button type="button" class="ghost full" data-a="notifyOff">Desligar lembretes</button>';
    return '<button type="button" class="primary full" data-a="notifyOn">Ligar lembretes</button>';
  }
  views.settings = function () {
    var p = S.prefs;
    return '<h1>Ajustes</h1>' +
      (storageOk ? '' : '<div class="card soft"><b>Atenção:</b> este navegador não está deixando salvar. Faça um backup.</div>') +
      (!isStandalone() ? '<div class="card install"><h3>📲 Instalar o app</h3>' + (ui.installEvt ? '<button type="button" class="primary full" data-a="install">Instalar agora</button>' :
        '<p class="small">No Chrome: toque em <b>⋮</b> → <b>“Instalar app”</b>.</p>') + '</div>' : '') +
      '<div class="card"><h3>🔔 Lembretes</h3>' + notifStatusHtml() +
      '<p class="muted small">O app avisa 10 minutos antes e na hora de cada atividade, enquanto estiver aberto ou em segundo plano. ' +
      'Para garantir o aviso mesmo com o app fechado, coloque a semana na agenda do celular:</p>' +
      '<button type="button" class="ghost full" data-a="exportIcs">📅 Colocar esta semana na agenda do celular</button></div>' +
      '<div class="card"><h3>Visual</h3>' +
      '<label class="field">Tamanho do texto</label>' + seg('pref', 'data-k="scale"', [[1, 'Normal'], [1.15, 'Grande'], [1.3, 'Enorme']], p.scale) +
      '<label class="field">Cores</label>' + seg('pref', 'data-k="theme"', [['light', 'Claro'], ['dark', 'Escuro']], p.theme) +
      '<label class="field">Animações</label>' + seg('pref', 'data-k="motion"', [['normal', 'Suaves'], ['reduce', 'Desligadas']], p.motion) +
      '<label class="field">Tela inicial</label>' + seg('pref', 'data-k="showWholeDay"', [['false', 'Só a próxima'], ['true', 'Dia inteiro']], String(p.showWholeDay)) + '</div>' +
      '<div class="card"><h3>Agenda</h3>' +
      '<label class="field">Máximo de tarefas da casa por dia</label>' + stepper('prefNum', 'data-k="maxChores"', p.maxChores, '') +
      '<label class="field">Pausa entre atividades</label>' + stepper('prefNum', 'data-k="buffer"', p.buffer, 'min') +
      '<p class="muted small">A pausa dá tempo para trocar de uma atividade para outra (transições costumam ser difíceis).</p>' +
      '<button type="button" class="ghost full" style="margin-top:8px" data-a="regen">Refazer a agenda desta semana</button></div>' +
      '<div class="card stack"><h3>Meus dados</h3>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="slots">🕒 Horários livres</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="chores">🏠 Tarefas da casa</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="exercise">🏃 Atividade física</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="areas">🌟 Áreas de lazer</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="leisure">🎮 Meus jogos e atividades</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="analysis">🔎 Ver análise</button></div>' +
      '<div class="card stack"><h3>Backup</h3><p class="muted small">Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando.</p>' +
      '<button type="button" class="ghost full" data-a="export">⬇️ Salvar cópia (arquivo)</button>' +
      '<label class="btn ghost full" style="display:flex;align-items:center;justify-content:center;border:2px solid var(--line)">⬆️ Restaurar cópia<input type="file" accept="application/json,.json" data-bind="import" style="display:none"></label>' +
      '<button type="button" class="danger full" data-a="reset">Apagar tudo e recomeçar</button></div>' +
      '<p class="muted small center">Rotina Gentil · funciona sem internet</p>';
  };
  views.focus = function () {
    var f = ui.focus, it = f && findItem(f.dk, f.uid), t = it && findTask(it.kind, it.taskId);
    if (!t) { ui.focus = null; ui.view = 'today'; return views.today(); }
    var color = it.kind === 'leisure' ? 'var(--leisure)' : it.kind === 'exercise' ? 'var(--exercise)' : 'var(--accent)';
    var total = f.total, rem = f.remaining, frac = total ? rem / total : 0, R = 96, Cc = 2 * Math.PI * R;
    return '<div class="focus">' +
      '<p class="muted">' + { chore: '🏠 Você está fazendo', exercise: '🏃 Hora de mexer o corpo', leisure: '🎈 Momento de lazer' }[it.kind] + '</p><h1>' + h(itemName(it, t)) + '</h1>' +
      '<div class="ring" aria-hidden="true"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="' + R + '" fill="none" stroke="var(--surface-2)" stroke-width="14"/>' +
      '<circle id="ringArc" cx="110" cy="110" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + Cc.toFixed(1) + '" stroke-dashoffset="' + (Cc * (1 - frac)).toFixed(1) + '"/></svg>' +
      '<div class="t" id="timerText" role="timer">' + fmtClock(rem) + '</div></div>' +
      '<p class="muted" id="timerMsg">' + (f.ended ? (f.mini ? 'Os 2 minutos acabaram. Quer continuar ou parar? Os dois estão certos.' : 'O tempo acabou. Sem pressa — termine no seu ritmo.') :
        f.running ? (f.mini ? 'Só 2 minutos. Depois você decide.' : 'O cronômetro é só um guia.') : 'Pausado.') + '</p>' +
      '<div class="stack">' +
      (f.ended && f.mini ? '<button type="button" class="primary big" data-a="continueFull">Continuar</button><button type="button" class="ghost full" data-a="finish" data-partial="1">Parar por aqui (conta!)</button>' :
        '<button type="button" class="primary big" data-a="finish">Concluí ✓</button>') +
      '<div class="row"><button type="button" class="ghost grow" data-a="timerToggle">' + (f.running ? 'Pausar' : 'Retomar') + '</button>' +
      '<button type="button" class="ghost grow" data-a="mini">Só 2 minutos</button></div>' +
      '<button type="button" class="link" data-a="exitFocus">Sair sem concluir</button></div></div>';
  };
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // ---------------- lembretes (pop-ups) ----------------
  var LEISURE_CHECK_DAYS = 7, EXERCISE_PROMPT_DAYS = 15;
  function checkPrompts() {
    if (ui.prompted || ui.modal || !S.onboarded || ui.edit || ui.view !== 'today') return;
    var now = Date.now(), m = S.meta;
    if (!m.leisureCheck) m.leisureCheck = S.seedTs || now;
    if (!m.exercisePrompt) m.exercisePrompt = S.seedTs || now;
    if (now - m.leisureCheck >= LEISURE_CHECK_DAYS * DAY && (!m.leisureSnooze || now >= m.leisureSnooze)) ui.modal = { type: 'leisureCheck' };
    else if (!S.exercise.length && now - m.exercisePrompt >= EXERCISE_PROMPT_DAYS * DAY) ui.modal = { type: 'exerciseCheck' };
    if (ui.modal) ui.prompted = true;
  }

  // ---------------- janelas (bottom sheets) ----------------
  function sheet(label, inner) {
    return '<div class="overlay" data-a="closeModalBg"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + h(label) + '">' + inner + '</div></div>';
  }
  function modalHtml() {
    var m = ui.modal; if (!m) return '';
    if (m.type === 'confirmReset') {
      return sheet('Apagar tudo', '<h2 style="margin-top:0">Apagar tudo?</h2>' +
        '<p>Isso apaga horários, tarefas, lazer e histórico deste aparelho. Não dá para desfazer (a não ser que você tenha um backup).</p>' +
        '<div class="stack"><button type="button" class="danger" data-a="resetYes">Sim, apagar tudo</button><button type="button" class="ghost" data-a="closeModal">Cancelar</button></div>');
    }
    if (m.type === 'leisureCheck') {
      return sheet('Seus gostos mudaram?', '<div class="center" style="font-size:2.4rem">🎮</div><h2 style="margin-top:0">Você gostaria de mudar os jogos e atividades que está curtindo no momento?</h2>' +
        '<p>Não faz mal deixar de gostar de alguma coisa. Vamos ajustando sua agenda e atividades conforme seu foco no momento.</p>' +
        '<div class="stack"><button type="button" class="primary" data-a="leisureAdjust">Ajustar meus jogos e atividades</button>' +
        '<button type="button" class="ghost" data-a="leisureOk">Está tudo certo assim</button>' +
        '<button type="button" class="link" data-a="leisureSnooze">Não perguntar por 1 mês</button></div>');
    }
    if (m.type === 'exerciseCheck') {
      return sheet('Atividade física', '<div class="center" style="font-size:2.4rem">🏃</div><h2 style="margin-top:0">Que tal colocar um momento para mexer o corpo?</h2>' +
        '<p>É opcional. Uma caminhada curta ou um alongamento já contam, e o app encaixa na sua semana para você não precisar pensar nisso.</p>' +
        '<div class="stack"><button type="button" class="primary" data-a="exerciseAdd">Adicionar atividade física</button>' +
        '<button type="button" class="ghost" data-a="exerciseLater">Agora não</button></div>');
    }
    if (m.type === 'preview') {
      var shown = m.lines.slice(0, 10);
      return sheet('O que vai mudar', '<h2 style="margin-top:0">Isto vai mudar na sua semana</h2>' +
        '<p class="muted small">De hoje até domingo. O que já passou, o que você fez e o que pulou continuam iguais.</p>' +
        shown.map(function (l) {
          return '<div class="item"><span class="grow"><b>' + h(l.name) + '</b><br><span class="small muted">antes: ' + l.from + '</span><br><span class="small">agora: <b>' + l.to + '</b></span></span></div>';
        }).join('') +
        (m.lines.length > shown.length ? '<p class="small muted">…e mais ' + (m.lines.length - shown.length) + ' mudança(s).</p>' : '') +
        '<div class="stack" style="margin-top:12px"><button type="button" class="primary" data-a="applyNow">Mudar a agenda agora</button>' +
        '<button type="button" class="ghost" data-a="applyNext">Manter esta semana; mudar só a partir de segunda</button></div>');
    }
    if (m.type === 'hardDay') {
      var p = hardDayPlan(todayKey());
      function list(arr) { return arr.map(function (x) { return '<li>' + h(itemName(x.it, x.t)) + '</li>'; }).join(''); }
      return sheet('Dia difícil', '<div class="center" style="font-size:2.2rem">🪫</div><h2 style="margin-top:0">Vamos deixar hoje mais leve</h2>' +
        (p.move.length ? '<p><b>Fica hoje (o essencial):</b></p><ul>' + (list(p.keep) || '<li>Nada — hoje é para descansar.</li>') + '</ul>' +
          '<p><b>Vai para os próximos dias:</b></p><ul>' + list(p.move) + '</ul>' +
          '<p class="muted small">Elas vão para os dias mais tranquilos da semana. Dá para desfazer.</p>' +
          '<div class="stack"><button type="button" class="primary" data-a="hardDayYes">Sim, deixar leve</button><button type="button" class="ghost" data-a="closeModal">Cancelar</button></div>' :
          '<p>Hoje já tem só o essencial. Faça no seu ritmo — e se não der, tudo bem pular.</p><div class="stack"><button type="button" class="ghost" data-a="closeModal">Ok</button></div>'));
    }
    var it = findItem(m.dk, m.uid), t = it && findTask(it.kind, it.taskId);
    if (!t) return '';
    var body = '<h2 style="margin-top:0">' + h(itemName(it, t)) + '</h2>';
    if (m.type === 'notNow') {
      body += '<p class="muted">Tudo bem. Dias difíceis acontecem. O que prefere?</p><div class="stack">' +
        '<button type="button" class="ghost" data-a="later">⏳ Mais tarde hoje</button>' +
        '<button type="button" class="ghost" data-a="pickDay">📅 Passar para outro dia</button>' +
        '<button type="button" class="ghost" data-a="skip">🌿 Pular esta vez (sem problema)</button>' +
        '<button type="button" class="link" data-a="closeModal">Cancelar</button></div>';
    } else if (m.type === 'menu') {
      body += '<div class="stack">' + (it.status !== 'done' ? '<button type="button" class="primary" data-a="start" data-dk="' + m.dk + '" data-uid="' + m.uid + '">Começar agora</button>' +
        '<button type="button" class="ghost" data-a="markDone">✓ Já fiz</button>' : '<button type="button" class="ghost" data-a="undo">↩️ Desfazer “feito”</button>') +
        (it.status !== 'done' ? '<button type="button" class="ghost" data-a="pickDay">📅 Passar para outro dia</button>' : '') +
        (it.status === 'pending' ? '<button type="button" class="ghost" data-a="skip">🌿 Pular esta vez</button>' : '') +
        (it.status === 'skipped' ? '<button type="button" class="ghost" data-a="unskip">↩️ Voltar para a agenda</button>' : '') +
        '<button type="button" class="link" data-a="closeModal">Fechar</button></div>';
    } else if (m.type === 'pickDay') {
      var from = Sch.parseKey(m.dk), base = Sch.weekStart(from), tk = todayKey(), opts = '', count = 0;
      for (var i = 0; i < 14 && count < 7; i++) {
        var d = Sch.addDays(base, i), dk = Sch.dateKey(d);
        if (dk <= tk || dk === m.dk) continue;
        var n = visibleItems(dayInfo(dk).items).length;
        opts += '<button type="button" class="ghost" data-a="moveTo" data-to="' + dk + '">' + C.weekdays[Sch.weekdayIndex(d)] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' <span class="muted small">· ' + (n ? n + ' atividade' + (n > 1 ? 's' : '') : 'livre') + '</span></button>';
        count++;
      }
      body += '<p class="muted">Escolha o dia. Ela vai para o fim da lista daquele dia.</p><div class="stack">' + opts + '<button type="button" class="link" data-a="closeModal">Cancelar</button></div>';
    }
    return sheet(t.name, body);
  }

  // ---------------- renderização ----------------
  var app = document.getElementById('app');
  function applyPrefs() {
    var r = document.documentElement;
    r.style.setProperty('--scale', S.prefs.scale);
    r.setAttribute('data-theme', S.prefs.theme);
    r.setAttribute('data-motion', S.prefs.motion);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.prefs.theme === 'dark' ? '#1b1d26' : '#f4f1ea');
  }
  function focusKey(el) {
    if (!el || !el.getAttribute) return null;
    var a = el.getAttribute('data-a') || el.getAttribute('data-bind');
    return a ? a + '|' + JSON.stringify(el.dataset) : null;
  }
  function render() {
    applyPrefs();
    checkPrompts();
    var fk = focusKey(document.activeElement);
    var html;
    if (!S.onboarded) html = S.meta.quick ? views.quick() : views[STEPS[S.step]]();
    else if (ui.edit) html = views[ui.edit]();
    else if (ui.view === 'focus') html = views.focus();
    else {
      html = views[ui.view]();
      var tabs = [['today', '🌱', 'Hoje'], ['week', '📅', 'Semana'], ['needs', '📊', 'Necessidades'], ['settings', '⚙️', 'Ajustes']];
      html += '<nav class="tabs" aria-label="Navegação"><div class="inner">' + tabs.map(function (t) {
        return '<button type="button" data-a="go" data-view="' + t[0] + '"' + (ui.view === t[0] ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</button>';
      }).join('') + '</div></nav>';
    }
    html += modalHtml();
    if (ui.toast) html += '<div class="toast" role="status">' + h(ui.toast) + '</div>';
    app.innerHTML = html;
    if (fk) {
      var els = app.querySelectorAll('[data-a],[data-bind]');
      for (var i = 0; i < els.length; i++) if (focusKey(els[i]) === fk) { els[i].focus({ preventScroll: true }); break; }
    }
    scheduleNotifs();
  }
  var toastTimer = null;
  function toast(msg) {
    ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast = null; var el = app.querySelector('.toast'); if (el) el.remove(); }, 4000);
  }
  function scrollTop() { window.scrollTo(0, 0); }

  // ---------------- cronômetro ----------------
  var tick = null;
  function startFocus(dk, itemUid) {
    var it = findItem(dk, itemUid), t = it && findTask(it.kind, it.taskId); if (!t) return;
    ui.focus = { dk: dk, uid: itemUid, total: t.duration * 60, remaining: t.duration * 60, running: true, ended: false, mini: false, last: Date.now() };
    ui.view = 'focus'; ui.modal = null;
    runTick(); scrollTop();
  }
  function runTick() {
    clearInterval(tick);
    tick = setInterval(function () {
      var f = ui.focus;
      if (!f || ui.view !== 'focus') { clearInterval(tick); return; }
      var now = Date.now();
      if (f.running && !f.ended) {
        f.remaining -= (now - f.last) / 1000;
        if (f.remaining <= 0) {
          f.remaining = 0; f.ended = true; f.running = false;
          try { if (navigator.vibrate) navigator.vibrate([150, 100, 150]); } catch (e) { }
          render(); f.last = now; return;
        }
        var tt = document.getElementById('timerText'), arc = document.getElementById('ringArc');
        if (tt) tt.textContent = fmtClock(f.remaining);
        if (arc) { var Cc = 2 * Math.PI * 96; arc.setAttribute('stroke-dashoffset', (Cc * (1 - f.remaining / f.total)).toFixed(1)); }
      }
      f.last = now;
    }, 500);
  }

  // ---------------- ações ----------------
  function setStep(n) { S.step = clamp(n, 0, STEPS.length - 1); save(); render(); scrollTop(); }
  function newTask(kind, o) {
    var t = { id: uid(), name: o.name, unit: o.unit || 'week', perWeek: o.unit === 'month' ? 1 : (o.times || 1), perMonth: o.unit === 'month' ? (o.times || 1) : 1,
      duration: o.duration || 20, need: o.need };
    if (kind !== 'leisure') t.importance = o.importance || 2;
    if (kind === 'leisure') { t.area = o.area; t.options = []; }
    listOf(kind).push(t);
    return t;
  }
  function toggleByName(kind, name, create) {
    var list = listOf(kind), idx = -1;
    list.forEach(function (t, i) { if (t.name === name) idx = i; });
    if (idx >= 0) list.splice(idx, 1); else create();
    save(); render();
  }
  function addOptionFrom(el) {
    var t = findTask(el.dataset.kind, el.dataset.id); if (!t) return;
    var input = app.querySelector('input[data-bind="optionInput"][data-id="' + t.id + '"]');
    var v = input && input.value.trim();
    if (!v) { if (input) input.focus(); return; }
    if (t.options.indexOf(v) < 0) t.options.push(v);
    save(); render();
    var again = app.querySelector('input[data-bind="optionInput"][data-id="' + t.id + '"]'); if (again) again.focus();
  }
  function finishOnboarding() {
    var now = Date.now();
    S.onboarded = true; S.seedTs = now; S.plans = {}; ui.view = 'today';
    S.meta.leisureCheck = now; S.meta.exercisePrompt = now;
    buildWeek(weekKeyFor(new Date())); save();
    toast('Sua semana está pronta. Agora é só seguir uma coisa por vez. 💚');
    ui.prompted = true; render(); scrollTop();
  }
  function moodToast(v) { return { high: 'Que bom! Vamos nessa, uma coisa por vez.', mid: 'Ok. No seu ritmo.', low: 'Tudo bem. Hoje vamos com calma.' }[v]; }
  var actions = {
    next: function () {
      if (STEPS[S.step] === 'analysis') { finishOnboarding(); return; }
      setStep(S.step + 1);
    },
    quickStart: function () { S.meta.quick = true; save(); render(); scrollTop(); },
    quickBack: function () { S.meta.quick = false; save(); render(); scrollTop(); },
    qSlot: function (el) { ui.quick.slots[el.dataset.i] = !ui.quick.slots[el.dataset.i]; render(); },
    qChore: function (el) { ui.quick.chores[el.dataset.i] = !ui.quick.chores[el.dataset.i]; render(); },
    qLeisure: function (el) { ui.quick.leisure[el.dataset.i] = !ui.quick.leisure[el.dataset.i]; render(); },
    quickBuild: function () {
      var q = ui.quick;
      S.slots = emptySlots(); S.chores = []; S.leisure = []; S.exercise = []; S.areas = {};
      QUICK_SLOTS.forEach(function (s, i) { if (q.slots[i]) s[3].forEach(function (d) { S.slots[d].push({ start: s[1], end: s[2] }); }); });
      QUICK_CHORES.forEach(function (i) {
        if (!q.chores[i]) return;
        var c = C.chores[i];
        newTask('chore', { name: c[0], need: c[1], duration: c[2], times: c[3], unit: c[4], importance: c[5] });
      });
      QUICK_LEISURE.forEach(function (l, i) {
        if (!q.leisure[i]) return;
        var a = C.leisureAreas[l[0]], idea = a.ideas[l[1]];
        if (!S.areas[l[0]]) S.areas[l[0]] = { joy: 2, now: 1 };
        newTask('leisure', { name: idea[0], duration: idea[1], times: 1, need: a.need, area: l[0] });
      });
      S.meta.quick = false; S.meta.quickPending = true;
      finishOnboarding();
    },
    quickDismiss: function () { S.meta.quickPending = false; save(); render(); },

    energy: function (el) {
      var dk = todayKey(), v = el.dataset.v;
      S.meta.checkin = dk;
      S.energy = (S.energy || []).concat([{ date: dk, level: v, ts: Date.now() }]).slice(-180);
      ui.energyAsk = v === 'low' && S.meta.hardDay !== dk;
      save(); if (!ui.energyAsk) toast(moodToast(v)); render();
    },
    energySkip: function () { S.meta.checkin = todayKey(); save(); render(); },
    energyKeep: function () { ui.energyAsk = false; toast('Combinado. Vá no seu ritmo — pular também é permitido.'); render(); },
    hardDay: function () { ui.modal = { type: 'hardDay' }; render(); },
    hardDayYes: function () {
      var dk = todayKey(), p = hardDayPlan(dk), moves = [];
      p.move.forEach(function (x) { var to = lightestDayAfter(dk); moveItem(dk, x.it.uid, to); moves.push({ uid: x.it.uid, from: dk, to: to }); });
      ui.hardUndo = moves; ui.energyAsk = false; ui.modal = null; S.meta.hardDay = dk; save();
      toast(moves.length + ' atividade(s) foram para outros dias. Hoje ficou mais leve. 💚'); render(); scrollTop();
    },
    hardUndo: function () {
      (ui.hardUndo || []).forEach(function (m) { moveItem(m.to, m.uid, m.from); });
      ui.hardUndo = null; S.meta.hardDay = null; save(); toast('Desfeito. O dia voltou a ter tudo.'); render();
    },
    notifyOn: function () {
      if (!notifySupported()) return;
      S.meta.notifyAsked = true;
      Notification.requestPermission().then(function (perm) {
        S.prefs.notify = perm === 'granted'; save();
        if (perm === 'granted') { showNotif('Lembretes ligados! Vou avisar 10 min antes de cada atividade.', 'teste'); toast('Lembretes ligados. 🔔'); }
        else toast('Sem permissão para lembretes. Dá para ligar depois em Ajustes.');
        render();
      });
    },
    notifyOff: function () { S.prefs.notify = false; save(); toast('Lembretes desligados.'); render(); },
    notifyLater: function () { S.meta.notifyAsked = true; save(); toast('Tudo bem. Dá para ligar depois em Ajustes.'); render(); },
    exportIcs: function () {
      var r = icsWeek();
      if (!r.n) { toast('Não há atividades com horário para o resto desta semana.'); render(); return; }
      try { downloadFile('rotina-gentil-semana-' + todayKey() + '.ics', r.text, 'text/calendar'); toast(r.n + ' atividades no arquivo. Abra o arquivo baixado e escolha seu app de Agenda.'); }
      catch (e) { toast('Não consegui gerar o arquivo neste navegador.'); }
      render();
    },
    applyNow: function () { applyRegenNow(); ui.modal = null; toast('Pronto. A agenda foi atualizada.'); render(); },
    applyNext: function () { applyRegenNext(); ui.modal = null; toast('Combinado. Esta semana fica como está; a nova agenda começa na segunda.'); render(); },
    back: function () { setStep(S.step - 1); },
    pref: function (el) {
      var k = el.dataset.k, v = el.dataset.v;
      S.prefs[k] = k === 'scale' ? parseFloat(v) : k === 'showWholeDay' ? v === 'true' : v;
      save(); render();
    },
    prefNum: function (el) {
      var k = el.dataset.k, d = +el.dataset.delta;
      if (k === 'maxChores') S.prefs.maxChores = clamp(S.prefs.maxChores + d, 1, 8);
      if (k === 'buffer') S.prefs.buffer = clamp(S.prefs.buffer + d * 5, 0, 30);
      save(); render();
    },
    addSlot: function (el) { S.slots[el.dataset.d].push({ start: el.dataset.s, end: el.dataset.e }); save(); render(); },
    delSlot: function (el) { S.slots[el.dataset.d].splice(+el.dataset.i, 1); save(); render(); },
    copySlots: function (el) {
      var src = S.slots[0] || [];
      if (!src.length) { toast('Primeiro adicione um horário na segunda-feira.'); render(); return; }
      var last = el.dataset.to === 'all' ? 6 : 4;
      for (var d = 1; d <= last; d++) S.slots[d] = src.map(function (s) { return { start: s.start, end: s.end }; });
      save(); toast('Horários copiados.'); render();
    },
    toggleChore: function (el) {
      var c = C.chores[+el.dataset.i];
      toggleByName('chore', c[0], function () { newTask('chore', { name: c[0], need: c[1], duration: c[2], times: c[3], unit: c[4], importance: c[5] }); });
    },
    toggleExercise: function (el) {
      var c = C.exercise[+el.dataset.i];
      toggleByName('exercise', c[0], function () { newTask('exercise', { name: c[0], need: 'corpo', duration: c[1], times: c[2], unit: c[3], importance: 2 }); });
    },
    toggleLeisure: function (el) {
      var k = el.dataset.k, idea = C.leisureAreas[k].ideas[+el.dataset.i];
      toggleByName('leisure', idea[0], function () { newTask('leisure', { name: idea[0], duration: idea[1], times: 1, need: C.leisureAreas[k].need, area: k }); });
    },
    addCustom: function (el) {
      var kind = el.dataset.kind;
      if (kind === 'chore') newTask('chore', { name: 'Nova tarefa', need: 'ambiente', duration: 20, importance: 2 });
      else if (kind === 'exercise') newTask('exercise', { name: 'Nova atividade', need: 'corpo', duration: 30, importance: 2 });
      else { var k = el.dataset.area || Object.keys(S.areas)[0] || 'interesse'; newTask('leisure', { name: 'Nova atividade', need: C.leisureAreas[k].need, duration: 30, area: k }); }
      save(); render();
      var inputs = app.querySelectorAll('[data-bind="taskName"][data-kind="' + kind + '"]'); var last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    },
    delTask: function (el) {
      var list = listOf(el.dataset.kind);
      for (var i = 0; i < list.length; i++) if (list[i].id === el.dataset.id) { list.splice(i, 1); break; }
      save(); render();
    },
    taskUnit: function (el) { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.unit = el.dataset.v; save(); render(); } },
    taskNum: function (el) {
      var t = findTask(el.dataset.kind, el.dataset.id), d = +el.dataset.delta, f = el.dataset.f; if (!t) return;
      if (f === 'perWeek') t.perWeek = clamp(t.perWeek + d, 1, 7);
      else if (f === 'perMonth') t.perMonth = clamp(t.perMonth + d, 1, 3);
      else { var step = (d > 0 ? t.duration >= 60 : t.duration > 60) ? 15 : 5; t.duration = clamp(t.duration + d * step, 5, 240); }
      save(); render();
    },
    taskImp: function (el) { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.importance = +el.dataset.v; save(); render(); } },
    addOption: function (el) { addOptionFrom(el); },
    delOption: function (el) { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.options.splice(+el.dataset.i, 1); save(); render(); } },
    toggleArea: function (el) {
      var k = el.dataset.k;
      if (S.areas[k]) delete S.areas[k];
      else S.areas[k] = { joy: 2, now: 1 };
      save(); render();
    },
    areaQ: function (el) { var a = S.areas[el.dataset.k]; if (a) { a[el.dataset.f] = +el.dataset.v; save(); render(); } },

    go: function (el) { ui.view = el.dataset.view; ui.modal = null; render(); scrollTop(); },
    toggleDay: function () { ui.showDay = !ui.showDay; render(); },
    weekNav: function (el) { ui.weekOffset = clamp(ui.weekOffset + +el.dataset.delta, -1, 1); render(); },
    start: function (el) { startFocus(el.dataset.dk, el.dataset.uid); render(); },
    notNow: function (el) { ui.modal = { type: 'notNow', dk: el.dataset.dk, uid: el.dataset.uid }; render(); },
    itemMenu: function (el) { ui.modal = { type: 'menu', dk: el.dataset.dk, uid: el.dataset.uid }; render(); },
    closeModal: function () { ui.modal = null; render(); },
    closeModalBg: function (el, ev) { if (ev.target === el) { ui.modal = null; render(); } },
    later: function () {
      var m = ui.modal;
      moveItem(m.dk, m.uid, m.dk);
      ui.modal = null; toast('Combinado. Ela foi para o fim da lista de hoje.'); render();
    },
    pickDay: function () { ui.modal.type = 'pickDay'; render(); },
    moveTo: function (el) {
      var m = ui.modal; moveItem(m.dk, m.uid, el.dataset.to);
      ui.modal = null; toast('Pronto, passamos para ' + fmtDate(Sch.parseKey(el.dataset.to), { weekday: 'long' }) + '.'); render();
    },
    skip: function () {
      var it = findItem(ui.modal.dk, ui.modal.uid); if (it) it.status = 'skipped';
      ui.modal = null; save(); toast('Pulado. Sem culpa — da próxima vez tem de novo.'); render();
    },
    unskip: function () { var it = findItem(ui.modal.dk, ui.modal.uid); if (it) it.status = 'pending'; ui.modal = null; save(); render(); },
    markDone: function () { completeItem(ui.modal.dk, ui.modal.uid, false); ui.modal = null; render(); },
    undo: function () { undoItem(ui.modal.dk, ui.modal.uid); ui.modal = null; render(); },

    leisureAdjust: function () { S.meta.leisureCheck = Date.now(); save(); ui.modal = null; ui.edit = 'leisure'; render(); scrollTop(); },
    leisureOk: function () { S.meta.leisureCheck = Date.now(); save(); ui.modal = null; toast('Combinado! Pergunto de novo na semana que vem.'); render(); },
    leisureSnooze: function () { var now = Date.now(); S.meta.leisureCheck = now; S.meta.leisureSnooze = now + 30 * DAY; save(); ui.modal = null; render(); },
    exerciseAdd: function () { S.meta.exercisePrompt = Date.now(); save(); ui.modal = null; ui.edit = 'exercise'; render(); scrollTop(); },
    exerciseLater: function () { S.meta.exercisePrompt = Date.now(); save(); ui.modal = null; toast('Tudo bem. Lembro de novo daqui a 15 dias.'); render(); },

    finish: function (el) {
      var f = ui.focus; if (!f) return;
      completeItem(f.dk, f.uid, el.dataset.partial === '1');
      clearInterval(tick); ui.focus = null; ui.view = 'today'; render(); scrollTop();
    },
    timerToggle: function () { var f = ui.focus; if (!f) return; if (f.ended) { f.ended = false; f.remaining = Math.max(f.remaining, 60); f.total = Math.max(f.total, f.remaining); } f.running = !f.running; f.last = Date.now(); render(); },
    mini: function () { var f = ui.focus; if (!f) return; f.mini = true; f.total = 120; f.remaining = 120; f.running = true; f.ended = false; f.last = Date.now(); render(); },
    continueFull: function () {
      var f = ui.focus, it = findItem(f.dk, f.uid), t = it && findTask(it.kind, it.taskId);
      var rest = Math.max(60, ((t ? t.duration : 10) * 60) - 120);
      f.mini = false; f.total = rest; f.remaining = rest; f.running = true; f.ended = false; f.last = Date.now(); render();
    },
    exitFocus: function () { clearInterval(tick); ui.focus = null; ui.view = 'today'; render(); },

    edit: function (el) { ui.edit = el.dataset.step; ui.modal = null; render(); scrollTop(); },
    editDone: function () {
      var wasAnalysis = ui.edit === 'analysis';
      ui.edit = null;
      if (!wasAnalysis) openPreviewOr('Salvo. A agenda desta semana não precisou mudar.');
      render(); scrollTop();
    },
    regen: function () { openPreviewOr('A agenda já está atualizada — nada mudou.'); render(); },
    export: function () {
      try {
        downloadFile('rotina-gentil-backup-' + todayKey() + '.json', JSON.stringify(S, null, 1), 'application/json');
        toast('Cópia salva na pasta de downloads.');
      } catch (e) { toast('Não consegui salvar a cópia neste navegador.'); }
      render();
    },
    install: function () {
      if (!ui.installEvt) return;
      var evt = ui.installEvt; ui.installEvt = null;
      evt.prompt();
      if (evt.userChoice) evt.userChoice.then(function (c) { if (c && c.outcome === 'accepted') toast('Instalando… Abra pelo ícone 🌱 na tela do celular.'); render(); });
      render();
    },
    reset: function () { ui.modal = { type: 'confirmReset' }; render(); },
    resetYes: function () {
      S = defaults(); save();
      ui.view = 'today'; ui.edit = null; ui.modal = null; ui.focus = null; ui.weekOffset = 0; ui.prompted = false;
      ui.quick = { slots: {}, chores: {}, leisure: {} }; ui.energyAsk = false; ui.hardUndo = null;
      render(); scrollTop();
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]');
    if (!el || !app.contains(el) || el.disabled) return;
    var fn = actions[el.getAttribute('data-a')];
    if (fn) fn(el, ev);
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target, b = el.getAttribute && el.getAttribute('data-bind'); if (!b) return;
    if (b === 'slot') { var s = S.slots[el.dataset.d][+el.dataset.i]; if (s) { s[el.dataset.f] = el.value; save(); } }
    if (b === 'taskName') { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.name = el.value; save(); } }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target, b = el.getAttribute && el.getAttribute('data-bind'); if (!b) return;
    if (b === 'slot') render(); // atualiza aviso e total de horas
    if (b === 'taskNeed') { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.need = el.value; save(); } }
    if (b === 'taskArea') {
      var ta = findTask(el.dataset.kind, el.dataset.id);
      if (ta) { ta.area = el.value; ta.need = C.leisureAreas[el.value].need; if (!S.areas[el.value]) S.areas[el.value] = { joy: 2, now: 1 }; save(); render(); }
    }
    if (b === 'import' && el.files && el.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d || typeof d !== 'object' || !Array.isArray(d.chores) || !d.slots) throw new Error('inválido');
          S = migrate(d); save(); toast('Cópia restaurada.'); ui.view = 'today';
        } catch (e) { toast('Esse arquivo não parece uma cópia do Rotina Gentil.'); }
        render();
      };
      r.readAsText(el.files[0]);
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
    var el = ev.target;
    if (ev.key === 'Enter' && el.getAttribute && el.getAttribute('data-bind') === 'optionInput') { ev.preventDefault(); addOptionFrom(el); }
  });
  // volta ao app depois de um tempo: atualiza "hoje", as barras e os lembretes
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ui.view !== 'focus' && !ui.edit) { ui.prompted = false; render(); } });
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); ui.installEvt = e;
    if (!S.onboarded || ui.view === 'settings') render();
  });
  window.addEventListener('appinstalled', function () { ui.installEvt = null; toast('App instalado! Procure o ícone 🌱 na tela do celular.'); render(); });

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  save();
  render();
  window.__rg = { state: function () { return S; }, ui: ui, render: render };
})();
