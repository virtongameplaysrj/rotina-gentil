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

  var LEISURE_PRIORITY = 2.5; // lazer fica entre "alta" e "média": é protegido, não sobra para o fim

  /**
   * Monta a semana-modelo.
   * cfg = { slots: {0:[{start,end}],...}, chores:[...], leisure:[...], maxChoresPerDay, buffer }
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
      days.push({ slots: slots, chores: 0, load: 0 });
    }

    var tasks = [];
    (cfg.chores || []).forEach(function (t) { tasks.push({ t: t, kind: 'chore', prio: t.importance || 2 }); });
    (cfg.leisure || []).forEach(function (t) { tasks.push({ t: t, kind: 'leisure', prio: LEISURE_PRIORITY }); });
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
          var score = same * 100 + spacing * 3 + day.load / 30;
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
        chosen.push(best.di);
      }
    });

    // Dentro de cada horário: primeiro as tarefas (mais importante antes), depois o lazer como "recompensa".
    var out = days.map(function (day) {
      var items = [];
      day.slots.forEach(function (s, slotIdx) {
        s.items.sort(function (a, b) {
          var ka = a.kind === 'chore' ? 0 : 1, kb = b.kind === 'chore' ? 0 : 1;
          return (ka - kb) || (b.prio - a.prio) || String(a.t.name).localeCompare(String(b.t.name));
        });
        var cur = s.start;
        s.items.forEach(function (it) {
          items.push({ taskId: it.t.id, kind: it.kind, start: toHHMM(cur), end: toHHMM(cur + it.dur), slot: slotIdx });
          cur += it.dur + buffer;
        });
      });
      return items;
    });
    return { days: out, unscheduled: unscheduled };
  }

  // ---------- necessidades (barras estilo "simulador de vida") ----------
  var WINDOW_DAYS = 10; // cada conclusão "enche" a barra e vai esvaziando aos poucos em 10 dias
  var DAY_MS = 86400000;

  function taskWeight(kind, t) { return kind === 'leisure' ? 2 : (t.importance || 2); }

  /**
   * Calcula o valor (0-100) de cada necessidade que tem pelo menos uma tarefa.
   * Quem segue a agenda fica, em média, entre ~50% e 100%.
   */
  function computeNeeds(input, nowMs) {
    var targets = {};
    function addTarget(kind, t) {
      if (!t.need) return;
      targets[t.need] = (targets[t.need] || 0) + taskWeight(kind, t) * (t.perWeek || 1) * 0.6;
    }
    (input.chores || []).forEach(function (t) { addTarget('chore', t); });
    (input.leisure || []).forEach(function (t) { addTarget('leisure', t); });

    var sums = {};
    var seedAge = (nowMs - (input.seedTs || nowMs)) / DAY_MS;
    var seedFactor = 0.8 * Math.max(0, 1 - seedAge / WINDOW_DAYS);
    Object.keys(targets).forEach(function (n) { sums[n] = targets[n] * seedFactor; });

    (input.completions || []).forEach(function (c) {
      if (!(c.need in targets)) return;
      var age = (nowMs - c.ts) / DAY_MS;
      if (age < 0) age = 0;
      sums[c.need] += (c.weight || 1) * Math.max(0, 1 - age / WINDOW_DAYS);
    });

    var res = {};
    Object.keys(targets).forEach(function (n) {
      res[n] = targets[n] > 0 ? Math.max(0, Math.min(100, Math.round(100 * sums[n] / targets[n]))) : 100;
    });
    return res;
  }

  /** Soma de minutos disponíveis e necessários — usada na análise antes de gerar a agenda. */
  function capacityReport(cfg) {
    var buffer = cfg.buffer == null ? 5 : cfg.buffer;
    var avail = 0;
    for (var d = 0; d < 7; d++) {
      ((cfg.slots && cfg.slots[d]) || []).forEach(function (s) {
        var a = toMin(s.start), b = toMin(s.end);
        if (isFinite(a) && isFinite(b) && b > a) avail += b - a;
      });
    }
    var chores = 0, leisure = 0;
    (cfg.chores || []).forEach(function (t) { chores += ((t.duration || 0) + buffer) * (t.perWeek || 1); });
    (cfg.leisure || []).forEach(function (t) { leisure += ((t.duration || 0) + buffer) * (t.perWeek || 1); });
    return { available: avail, chores: chores, leisure: leisure, needed: chores + leisure };
  }

  global.Scheduler = {
    toMin: toMin, toHHMM: toHHMM, dateKey: dateKey, parseKey: parseKey, weekdayIndex: weekdayIndex,
    weekStart: weekStart, addDays: addDays, buildPlan: buildPlan, computeNeeds: computeNeeds,
    capacityReport: capacityReport, taskWeight: taskWeight, LEISURE_PRIORITY: LEISURE_PRIORITY
  };
})(typeof window !== 'undefined' ? window : this);
