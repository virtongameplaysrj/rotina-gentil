/* Rotina Gentil — motor de agendamento e cálculo das necessidades.
   Lógica pura (sem tela), para poder ser testada separadamente em tests.html. */
(function (global) {
  'use strict';

  // ---------- utilidades de tempo ----------
  function toMin(hhmm) {
    if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
    var p = hhmm.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function toHHMM(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  /** 0 = segunda ... 6 = domingo */
  function weekdayIndex(d) { return (d.getDay() + 6) % 7; }
  function weekStart(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - weekdayIndex(x));
    return x;
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function circGap(a, b) { var g = Math.abs(a - b); return Math.min(g, 7 - g); }
  function hashStr(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  var LEISURE_PRIORITY = 2.5;  // lazer fica entre "alta" e "média": é protegido, não sobra para o fim
  var MONTHLY_PRIORITY = 2.75; // tarefas do mês são as mais esquecidas: quase sempre entram na semana delas
  var KIND_ORDER = { chore: 0, exercise: 1, leisure: 2 };

  // ---------- tarefas mensais ----------
  /** Semana do mês pela quinta-feira da semana (0 = 1ª semana ... 4 = dias 29-31). */
  function monthWeekOf(ws) {
    var th = addDays(ws, 3);
    return { year: th.getFullYear(), month: th.getMonth(), idx: Math.floor((th.getDate() - 1) / 7) };
  }
  /** Em quais semanas do mês (0-3) a tarefa cai. Espalhado e sempre igual para a mesma tarefa. */
  function dueWeekIdx(perMonth, id) {
    var n = Math.max(1, Math.min(3, Math.round(perMonth || 1))), h = hashStr(id);
    if (n === 1) return [h % 4];
    if (n === 2) { var o = h % 2; return [o, o + 2]; }
    return [0, 1, 3];
  }
  function isDueWeek(t, ws) { return dueWeekIdx(t.perMonth, t.id).indexOf(monthWeekOf(ws).idx) >= 0; }
  /** Começos das semanas anteriores, no mesmo mês, em que a tarefa estava marcada (mais recente primeiro). */
  function earlierDueWeeks(t, ws) {
    var cur = monthWeekOf(ws), res = [], due = dueWeekIdx(t.perMonth, t.id);
    for (var k = 1; k <= 4; k++) {
      var w = addDays(ws, -7 * k), m = monthWeekOf(w);
      if (m.month !== cur.month || m.year !== cur.year) break;
      if (due.indexOf(m.idx) >= 0) res.push(w);
    }
    return res;
  }
  /** Média de vezes por semana (tarefas do mês contam como fração). */
  function weeklyRate(t) { return t.unit === 'month' ? (t.perMonth || 1) / 4.33 : (t.perWeek || 1); }

  /**
   * Lista de tarefas que entram numa semana específica.
   * Semanais entram sempre. Mensais entram na semana delas, ou depois, se ficaram para trás no mês.
   */
  function tasksForWeek(list, ws, completions) {
    var out = [];
    (list || []).forEach(function (t) {
      if (t.unit !== 'month') { out.push(t); return; }
      var due = isDueWeek(t, ws), overdue = false;
      if (!due) {
        var earlier = earlierDueWeeks(t, ws);
        if (earlier.length) {
          var since = earlier[0].getTime();
          var done = (completions || []).some(function (c) { return c.taskId === t.id && c.ts >= since; });
          if (!done) { due = true; overdue = true; }
        }
      }
      if (due) {
        out.push(Object.assign({}, t, { perWeek: 1, monthly: true, overdue: overdue,
          priority: Math.max(t.importance || 2, MONTHLY_PRIORITY) }));
      }
    });
    return out;
  }

  /**
   * Monta a semana.
   * cfg = { slots: {0:[{start,end}],...}, chores:[...], exercise:[...], leisure:[...], maxChoresPerDay, buffer }
   * Retorna { days: [ [item...] x7 ], unscheduled: [ {taskId, kind, name} ] }
   * Determinístico: os mesmos dados geram sempre a mesma agenda (previsibilidade).
   */
  function buildPlan(cfg) {
    var buffer = cfg.buffer == null ? 5 : cfg.buffer;
    var maxChores = cfg.maxChoresPerDay == null ? 3 : cfg.maxChoresPerDay;
    var days = [];
    for (var d = 0; d < 7; d++) {
      var raw = (cfg.slots && cfg.slots[d]) || [];
      var slots = raw.map(function (s) { return { start: toMin(s.start), end: toMin(s.end), used: 0, items: [] }; })
        .filter(function (s) { return isFinite(s.start) && isFinite(s.end) && s.end > s.start; })
        .sort(function (a, b) { return a.start - b.start; });
      days.push({ slots: slots, chores: 0, exercise: 0, load: 0 });
    }

    var tasks = [];
    function add(list, kind) {
      (list || []).forEach(function (t) {
        var prio = t.priority != null ? t.priority : kind === 'leisure' ? LEISURE_PRIORITY : (t.importance || 2);
        tasks.push({ t: t, kind: kind, prio: prio });
      });
    }
    add(cfg.chores, 'chore'); add(cfg.exercise, 'exercise'); add(cfg.leisure, 'leisure');
    tasks.sort(function (a, b) {
      return (b.prio - a.prio) || ((b.t.perWeek || 1) - (a.t.perWeek || 1)) ||
        ((b.t.duration || 0) - (a.t.duration || 0)) || String(a.t.name).localeCompare(String(b.t.name));
    });

    function fits(s, dur) { return s.used + (s.items.length ? buffer : 0) + dur <= s.end - s.start; }

    var unscheduled = [];
    tasks.forEach(function (entry) {
      var t = entry.t;
      var f = Math.max(1, Math.min(14, Math.round(t.perWeek || 1)));
      var dur = Math.max(1, Math.round(t.duration || 15));
      var ideal = 7 / f;
      var chosen = [];
      for (var k = 0; k < f; k++) {
        var best = null;
        for (var di = 0; di < 7; di++) {
          var day = days[di];
          if (entry.kind === 'chore' && day.chores >= maxChores) continue;
          var slot = null;
          for (var si = 0; si < day.slots.length; si++) { if (fits(day.slots[si], dur)) { slot = day.slots[si]; break; } }
          if (!slot) continue;
          var same = 0, spacing = 0;
          chosen.forEach(function (c) {
            if (c === di) same++;
            spacing += Math.max(0, ideal - circGap(di, c));
          });
          var score = same * 100 + spacing * 3 + day.load / 30 + (entry.kind === 'exercise' ? day.exercise * 50 : 0);
          if (!best || score < best.score - 1e-9) best = { di: di, slot: slot, score: score };
        }
        if (!best) {
          unscheduled.push({ taskId: t.id, kind: entry.kind, name: t.name });
          continue;
        }
        var dd = days[best.di];
        best.slot.used += (best.slot.items.length ? buffer : 0) + dur;
        best.slot.items.push({ t: t, kind: entry.kind, dur: dur, prio: entry.prio });
        dd.load += dur;
        if (entry.kind === 'chore') dd.chores++;
        if (entry.kind === 'exercise') dd.exercise++;
        chosen.push(best.di);
      }
    });

    // Dentro de cada horário: tarefas da casa, depois atividade física, e o lazer por último, como "recompensa".
    var out = days.map(function (day) {
      var items = [];
      day.slots.forEach(function (s, slotIdx) {
        s.items.sort(function (a, b) {
          return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (b.prio - a.prio) || String(a.t.name).localeCompare(String(b.t.name));
        });
        var cur = s.start;
        s.items.forEach(function (it) {
          items.push({ taskId: it.t.id, kind: it.kind, start: toHHMM(cur), end: toHHMM(cur + it.dur), slot: slotIdx,
            monthly: !!it.t.monthly, overdue: !!it.t.overdue });
          cur += it.dur + buffer;
        });
      });
      return items;
    });
    return { days: out, unscheduled: unscheduled };
  }

  // ---------- necessidades (barras estilo "simulador de vida") ----------
  var DAY_MS = 86400000;
  var WEEK_WINDOW = 10, MONTH_WINDOW = 35; // em quantos dias uma conclusão "esvazia" totalmente

  function taskWeight(kind, t) { return kind === 'leisure' ? 2 : (t.importance || 2); }
  function taskWindow(t) { return t.unit === 'month' ? MONTH_WINDOW : WEEK_WINDOW; }

  /**
   * Calcula o valor (0-100) de cada necessidade que tem pelo menos uma tarefa.
   * Quem segue a agenda fica, em média, entre ~50% e 100%.
   */
  function computeNeeds(input, nowMs) {
    var targets = {};
    function addTarget(kind, t) {
      if (!t.need) return;
      var perDay = t.unit === 'month' ? (t.perMonth || 1) / 30 : (t.perWeek || 1) / 7;
      targets[t.need] = (targets[t.need] || 0) + taskWeight(kind, t) * perDay * taskWindow(t) * 0.42;
    }
    (input.chores || []).forEach(function (t) { addTarget('chore', t); });
    (input.exercise || []).forEach(function (t) { addTarget('exercise', t); });
    (input.leisure || []).forEach(function (t) { addTarget('leisure', t); });

    var sums = {};
    var seedAge = (nowMs - (input.seedTs || nowMs)) / DAY_MS;
    var seedFactor = 0.8 * Math.max(0, 1 - seedAge / WEEK_WINDOW);
    Object.keys(targets).forEach(function (n) { sums[n] = targets[n] * seedFactor; });

    (input.completions || []).forEach(function (c) {
      if (!(c.need in targets)) return;
      var age = (nowMs - c.ts) / DAY_MS;
      if (age < 0) age = 0;
      sums[c.need] += (c.weight || 1) * Math.max(0, 1 - age / (c.window || WEEK_WINDOW));
    });

    var res = {};
    Object.keys(targets).forEach(function (n) {
      res[n] = targets[n] > 0 ? Math.max(0, Math.min(100, Math.round(100 * sums[n] / targets[n]))) : 100;
    });
    return res;
  }

  /** Soma de minutos disponíveis e necessários por semana — usada na análise antes de gerar a agenda. */
  function capacityReport(cfg) {
    var buffer = cfg.buffer == null ? 5 : cfg.buffer;
    var avail = 0;
    for (var d = 0; d < 7; d++) {
      ((cfg.slots && cfg.slots[d]) || []).forEach(function (s) {
        var a = toMin(s.start), b = toMin(s.end);
        if (isFinite(a) && isFinite(b) && b > a) avail += b - a;
      });
    }
    function sum(list) { var m = 0; (list || []).forEach(function (t) { m += ((t.duration || 0) + buffer) * weeklyRate(t); }); return Math.round(m); }
    var r = { available: avail, chores: sum(cfg.chores), exercise: sum(cfg.exercise), leisure: sum(cfg.leisure) };
    r.needed = r.chores + r.exercise + r.leisure;
    return r;
  }

  global.Scheduler = {
    toMin: toMin, toHHMM: toHHMM, dateKey: dateKey, parseKey: parseKey, weekdayIndex: weekdayIndex,
    weekStart: weekStart, addDays: addDays, buildPlan: buildPlan, computeNeeds: computeNeeds,
    capacityReport: capacityReport, taskWeight: taskWeight, taskWindow: taskWindow, weeklyRate: weeklyRate,
    tasksForWeek: tasksForWeek, isDueWeek: isDueWeek, monthWeekOf: monthWeekOf, dueWeekIdx: dueWeekIdx,
    LEISURE_PRIORITY: LEISURE_PRIORITY
  };
})(typeof window !== 'undefined' ? window : this);
