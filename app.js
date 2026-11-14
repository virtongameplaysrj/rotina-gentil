/* Rotina Gentil — telas e interação.
   Tudo fica salvo no próprio aparelho (localStorage). Nada é enviado para a internet. */
(function () {
  'use strict';
  var Sch = window.Scheduler, C = window.CATALOG;
  var KEY = 'rotina-gentil:v1';
  var STEPS = ['welcome', 'prefs', 'slots', 'chores', 'areas', 'leisure', 'analysis'];

  // ---------------- estado ----------------
  function emptySlots() { var s = {}; for (var d = 0; d < 7; d++) s[d] = []; return s; }
  function defaults() {
    return {
      v: 1, onboarded: false, step: 0,
      prefs: { scale: 1, theme: 'light', motion: 'normal', showWholeDay: false, maxChores: 3, buffer: 5 },
      slots: emptySlots(), chores: [], areas: {}, leisure: [], completions: [], plans: {}, seedTs: null
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw), d = defaults();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      for (var p in d.prefs) if (!(p in s.prefs)) s.prefs[p] = d.prefs[p];
      return s;
    } catch (e) { return defaults(); }
  }
  var S = load();
  var storageOk = true;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  var ui = { view: 'today', edit: null, modal: null, focus: null, toast: null, weekOffset: 0, installEvt: null };

  // ---------------- utilidades ----------------
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function todayKey() { return Sch.dateKey(new Date()); }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDate(d, opts) { return capFirst(d.toLocaleDateString('pt-BR', opts || { weekday: 'long', day: 'numeric', month: 'long' })); }
  function fmtMin(m) { if (m < 60) return m + ' min'; var hh = Math.floor(m / 60), mm = m % 60; return hh + 'h' + (mm ? (mm < 10 ? '0' : '') + mm : ''); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function findTask(kind, id) {
    var list = kind === 'leisure' ? S.leisure : S.chores;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function activeNeeds() {
    var set = {};
    S.chores.forEach(function (t) { if (t.need) set[t.need] = 1; });
    S.leisure.forEach(function (t) { if (t.need) set[t.need] = 1; });
    return Object.keys(C.needs).filter(function (n) { return set[n]; });
  }
  function needsNow() {
    return Sch.computeNeeds({ chores: S.chores, leisure: S.leisure, completions: S.completions, seedTs: S.seedTs }, Date.now());
  }
  function lvl(v) { return v >= 60 ? 'good' : v >= 30 ? 'mid' : 'low'; }

  // ---------------- agenda semanal ----------------
  function planCfg() {
    return { slots: S.slots, chores: S.chores, leisure: S.leisure, maxChoresPerDay: S.prefs.maxChores, buffer: S.prefs.buffer };
  }
  function weekKeyFor(date) { return Sch.dateKey(Sch.weekStart(date)); }
  function buildWeek(wk) {
    var tpl = Sch.buildPlan(planCfg());
    var start = Sch.parseKey(wk);
    var plan = { createdAt: Date.now(), unscheduled: tpl.unscheduled, days: tpl.days.map(function (items, i) {
      var dk = Sch.dateKey(Sch.addDays(start, i));
      return items.map(function (it) {
        var done = S.completions.some(function (c) { return c.date === dk && c.taskId === it.taskId && c.kind === it.kind; });
        return { uid: uid(), taskId: it.taskId, kind: it.kind, start: it.start, end: it.end, status: done ? 'done' : 'pending' };
      });
    }) };
    S.plans[wk] = plan;
    // mantém só as últimas semanas para não ocupar espaço
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
  function regenerateFromToday() {
    var wk = weekKeyFor(new Date());
    Object.keys(S.plans).forEach(function (k) { if (k >= wk) delete S.plans[k]; });
    buildWeek(wk);
    save();
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
    S.completions.push({ taskId: t.id, kind: it.kind, need: t.need, weight: w, ts: Date.now(), date: dk, uid: it.uid });
    if (S.completions.length > 600) S.completions = S.completions.slice(-600);
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
  function stepper(action, data, value, unit, attrs) {
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
  function needsGrid(compact) {
    var vals = needsNow(), list = activeNeeds();
    if (!list.length) return '';
    return '<div class="needs">' + list.map(function (n) {
      var v = vals[n] == null ? 100 : vals[n], meta = C.needs[n];
      return '<button type="button" class="need" data-a="go" data-view="needs" aria-label="' + meta.label + ': ' + v + ' por cento">' +
        '<span class="lbl"><span>' + meta.icon + ' ' + meta.label + '</span>' + (compact ? '' : '<span>' + v + '%</span>') + '</span>' +
        '<span class="bar"><i class="lvl-' + lvl(v) + '" style="width:' + Math.max(4, v) + '%"></i></span></button>';
    }).join('') + '</div>';
  }
  function moodSummary() {
    var vals = needsNow(), list = activeNeeds();
    if (!list.length) return { avg: 100, text: '' };
    var sum = 0; list.forEach(function (n) { sum += vals[n] == null ? 100 : vals[n]; });
    var avg = Math.round(sum / list.length);
    var text = avg >= 70 ? 'Você está bem cuidado(a) esta semana.' : avg >= 40 ? 'Algumas coisas pedem atenção, sem pressa.' : 'Semana puxada. Um passo pequeno já ajuda.';
    return { avg: avg, text: text };
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
    return '<div class="stack" style="padding-top:24px">' +
      '<div class="center" style="font-size:3rem">🌱</div>' +
      '<h1 class="center">Rotina Gentil</h1>' +
      '<p class="center muted">Um app para tirar de você o peso de decidir <b>o que</b> fazer e <b>quando</b>.</p>' +
      '<div class="card soft"><h3>Como funciona</h3>' +
      '<p>1. Você diz quando tem tempo livre.</p><p>2. Você diz quais tarefas da casa precisa fazer.</p>' +
      '<p>3. Você conta o que gosta de fazer no lazer.</p><p>4. O app monta sua semana. Você só abre e vê <b>uma coisa por vez</b>.</p></div>' +
      '<p class="muted small">Leva uns 5 minutos. Você pode mudar tudo depois. Seus dados ficam só neste aparelho.</p>' +
      '</div>' + stepFooter('Vamos começar');
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
    var rep = Sch.capacityReport(planCfg());
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
    return '<div class="task-edit">' +
      '<div class="head"><input type="text" aria-label="Nome" value="' + h(t.name) + '" data-bind="taskName" ' + data + '>' +
      '<button type="button" class="icon ghost" data-a="delTask" ' + data + ' aria-label="Remover ' + h(t.name) + '">✕</button></div>' +
      '<div class="grid">' +
      '<div><div class="lab">Vezes por semana</div>' + stepper('taskNum', data + ' data-f="perWeek"', t.perWeek, '×') + '</div>' +
      '<div><div class="lab">Duração</div>' + stepper('taskNum', data + ' data-f="duration"', t.duration, 'min') + '</div>' +
      (kind === 'chore' ? '<div style="grid-column:1/-1"><div class="lab">Importância para você</div>' + seg('taskImp', data, [[1, 'Baixa'], [2, 'Média'], [3, 'Alta']], t.importance) + '</div>' : '') +
      '<div style="grid-column:1/-1"><div class="lab">Qual necessidade isso cuida?</div>' + needSelect(kind === 'chore' ? 'choreNeeds' : 'leisureNeeds', data, t.need) + '</div>' +
      '<div style="grid-column:1/-1"><div class="lab">Primeiro passo (bem pequeno)</div><input type="text" value="' + h(t.firstStep || '') + '" placeholder="Ex.: pegar a vassoura" data-bind="taskStep" ' + data + '></div>' +
      '</div></div>';
  }
  views.chores = function () {
    var names = {}; S.chores.forEach(function (t) { names[t.name] = 1; });
    return progress() + '<h1>Tarefas da casa</h1>' +
      '<p class="muted">Toque nas tarefas que você precisa fazer. Depois ajuste quantas vezes por semana, quanto tempo leva e o quanto é importante.</p>' +
      '<div class="chips">' + C.chores.map(function (c, i) {
        return '<button type="button" class="chip" data-a="toggleChore" data-i="' + i + '" aria-pressed="' + !!names[c.name] + '">' + h(c.name) + '</button>';
      }).join('') + '</div>' +
      '<h2>Suas tarefas (' + S.chores.length + ')</h2>' +
      (S.chores.length ? S.chores.map(function (t) { return taskEditor('chore', t); }).join('') : '<p class="muted">Nenhuma ainda.</p>') +
      '<button type="button" class="ghost full" data-a="addCustom" data-kind="chore">+ Criar tarefa minha</button>' +
      stepFooter('Continuar', !S.chores.length);
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
    var names = {}; S.leisure.forEach(function (t) { names[t.name] = 1; });
    var keys = Object.keys(S.areas);
    return progress() + '<h1>Atividades de lazer</h1>' +
      '<p class="muted">Escolha atividades das áreas que você marcou. Elas entram na agenda como as tarefas — assim você não precisa decidir na hora.</p>' +
      keys.map(function (k) {
        var a = C.leisureAreas[k];
        return '<h3 style="margin-top:14px">' + a.icon + ' ' + h(a.label) + '</h3><div class="chips">' + a.ideas.map(function (idea, i) {
          return '<button type="button" class="chip" data-a="toggleLeisure" data-k="' + k + '" data-i="' + i + '" aria-pressed="' + !!names[idea[0]] + '">' + h(idea[0]) + '</button>';
        }).join('') + '</div>';
      }).join('') +
      '<h2>Seu lazer (' + S.leisure.length + ')</h2>' +
      (S.leisure.length ? S.leisure.map(function (t) { return taskEditor('leisure', t); }).join('') : '<p class="muted">Nenhuma ainda.</p>') +
      '<button type="button" class="ghost full" data-a="addCustom" data-kind="leisure">+ Criar atividade minha</button>' +
      stepFooter('Ver análise', !S.leisure.length);
  };
  views.analysis = function () {
    var rep = Sch.capacityReport(planCfg());
    var tpl = Sch.buildPlan(planCfg());
    var pct = rep.available ? Math.round(100 * rep.needed / rep.available) : 0;
    var lzPct = rep.needed ? Math.round(100 * rep.leisure / rep.needed) : 0;
    var html = (ui.edit ? '' : progress()) + '<h1>Sua análise</h1>';

    html += '<div class="card"><h3>⏱️ Tempo</h3>' +
      '<div class="stat"><span>Tempo livre na semana</span><b>' + fmtMin(rep.available) + '</b></div>' +
      '<div class="stat"><span>Tarefas da casa</span><b>' + fmtMin(rep.chores) + '</b></div>' +
      '<div class="stat"><span>Lazer</span><b>' + fmtMin(rep.leisure) + '</b></div>' +
      '<div class="meter" style="margin-top:10px" aria-hidden="true"><i style="width:' + clamp(rep.available ? 100 * rep.chores / Math.max(rep.available, rep.needed) : 0, 0, 100) + '%;background:var(--accent)"></i>' +
      '<i style="width:' + clamp(rep.available ? 100 * rep.leisure / Math.max(rep.available, rep.needed) : 0, 0, 100) + '%;background:var(--leisure)"></i></div>' +
      '<div class="legend"><span style="--c:var(--accent)">Casa</span><span style="--c:var(--leisure)">Lazer</span><span style="--c:var(--surface-2)">Folga</span></div>' +
      '<p style="margin-top:10px">' + (pct > 100 ? 'Você planejou mais do que cabe (' + pct + '% do tempo livre). Tudo bem: o app coloca primeiro o que é mais importante e o lazer, e mostra o que ficou de fora.' :
        pct > 85 ? 'Sua semana ficou bem cheia (' + pct + '% do tempo livre). Se puder, deixe alguma folga.' :
        'Cabe tudo, com folga (' + pct + '% do tempo livre). Folga é ótimo: imprevistos acontecem.') + '</p></div>';

    html += '<div class="card leisure"><h3>🎈 Equilíbrio</h3><p>O lazer é <b>' + lzPct + '%</b> do que você planejou.</p>' +
      '<p class="muted">' + (lzPct < 25 ? 'É pouco lazer. Pessoas com TDAH e autismo gastam muita energia no dia a dia — recarregar é parte do cuidado. Que tal adicionar mais uma atividade?' :
        'Bom equilíbrio entre obrigação e prazer.') + '</p></div>';

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
        (fMissing.length ? 'Escolha pelo menos uma atividade para ' + fMissing.map(function (k) { return C.leisureAreas[k].label; }).join(', ') + ' (volte uma etapa) para ela entrar na agenda.' :
          'O lazer tem prioridade na agenda, então elas estão garantidas.') + '</p>';
    }
    else html += '<p>Você já cuida das áreas que mais gosta. Ótimo!</p>';
    if (noActivity.length) html += '<p class="muted">Sem atividade escolhida em: ' + noActivity.map(function (k) { return C.leisureAreas[k].label; }).join(', ') + '. Volte uma etapa se quiser adicionar.</p>';
    var missing = C.leisureNeeds.filter(function (n) { return activeNeeds().indexOf(n) < 0; });
    if (missing.length) html += '<p class="muted">Nenhuma atividade cuida de: ' + missing.map(function (n) { return C.needs[n].icon + ' ' + C.needs[n].label; }).join(', ') + '. Não é obrigatório — só um aviso.</p>';
    html += '</div>';

    if (tpl.unscheduled.length) {
      var counts = {}; tpl.unscheduled.forEach(function (u) { counts[u.name] = (counts[u.name] || 0) + 1; });
      html += '<div class="card soft"><h3>📦 Não couberam</h3><p>' + Object.keys(counts).map(function (n) { return h(n) + ' (' + counts[n] + '×)'; }).join(', ') +
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
      '<span class="grow name">' + h(t.name) + ' <span class="muted small">· ' + t.duration + ' min' + (it.status === 'done' ? ' · feito ✓' : it.status === 'skipped' ? ' · pulado' : '') + '</span></span>' +
      (showActions ? '<button type="button" class="ghost" data-a="itemMenu" data-dk="' + dk + '" data-uid="' + it.uid + '" aria-label="Opções para ' + h(t.name) + '">⋯</button>' : '') +
      '</div>';
  }
  views.today = function () {
    var now = new Date(), dk = todayKey(), di = dayInfo(dk), items = visibleItems(di.items);
    var hr = now.getHours(), greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    var mood = moodSummary();
    var html = '<p class="muted" style="margin:0">' + greet + ' 🌱</p><h1 style="font-size:1.35rem">' + fmtDate(now) + '</h1>';

    html += '<div class="card"><div class="mood" style="margin-bottom:10px"><div class="gem" style="border-color:var(--' + lvl(mood.avg) + ');background:var(--surface-2)" aria-hidden="true">' +
      (mood.avg >= 60 ? '😊' : mood.avg >= 30 ? '🙂' : '🫶') + '</div><div><b>Bem-estar: ' + mood.avg + '%</b><div class="muted small">' + mood.text + '</div></div></div>' + needsGrid(true) + '</div>';

    var pending = items.filter(function (it) { return it.status === 'pending'; });
    var next = pending[0];
    if (!items.length) {
      html += '<div class="card now center"><div style="font-size:2.4rem">☁️</div><h2>Hoje é um dia livre</h2><p class="muted">Nada planejado. Descansar também é cuidar de você.</p></div>';
    } else if (!next) {
      html += '<div class="card now center"><div style="font-size:2.4rem">🎉</div><h2>Tudo feito por hoje!</h2><p class="muted">Você cumpriu o que estava planejado. O resto do dia é seu.</p></div>';
    } else {
      var t = findTask(next.kind, next.taskId), lz = next.kind === 'leisure';
      var startMin = next.start ? Sch.toMin(next.start) : null, nowMin = hr * 60 + now.getMinutes();
      var when = !next.start ? 'Quando quiser hoje' : startMin > nowMin ? 'Começa às ' + next.start + ' · pode começar antes, se quiser' :
        Sch.toMin(next.end) < nowMin ? 'Era para as ' + next.start + ' · tudo bem fazer agora' : next.start + ' – ' + next.end;
      html += '<div class="card now ' + (lz ? 'leisure' : '') + '">' +
        '<span class="tag">' + (lz ? '🎈 Lazer — isso também é importante' : '🏠 Tarefa da casa') + '</span>' +
        '<p class="muted small" style="margin-top:8px">AGORA É A VEZ DE</p><h2>' + h(t.name) + '</h2>' +
        '<p class="muted">' + when + ' · ' + t.duration + ' min</p>' +
        (t.firstStep ? '<div class="firststep">👣 <b>Primeiro passo:</b> ' + h(t.firstStep) + '</div>' : '') +
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
        html += '<p class="muted center">Depois: ' + h(ta.name) + (after.start ? ' às ' + after.start : '') + '</p>' +
          '<div class="center"><button type="button" class="link" data-a="toggleDay">Ver o dia todo (' + items.length + ')</button></div>';
      }
    }
    return html;
  };
  views.week = function () {
    var base = Sch.addDays(Sch.weekStart(new Date()), ui.weekOffset * 7), wk = Sch.dateKey(base), plan = getWeek(wk), tk = todayKey();
    var html = '<div class="row spread"><button type="button" class="icon ghost" data-a="weekNav" data-delta="-1" aria-label="Semana anterior"' + (ui.weekOffset <= -1 ? ' disabled' : '') + '>‹</button>' +
      '<h1 class="center grow" style="font-size:1.3rem">' + (ui.weekOffset === 0 ? 'Esta semana' : ui.weekOffset > 0 ? 'Próxima semana' : 'Semana passada') +
      '<br><span class="muted small">' + fmtDate(base, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(Sch.addDays(base, 6), { day: 'numeric', month: 'short' }) + '</span></h1>' +
      '<button type="button" class="icon ghost" data-a="weekNav" data-delta="1" aria-label="Próxima semana"' + (ui.weekOffset >= 1 ? ' disabled' : '') + '>›</button></div>';
    for (var i = 0; i < 7; i++) {
      var d = Sch.addDays(base, i), dk = Sch.dateKey(d), items = visibleItems(plan.days[i]), past = dk < tk;
      html += '<div class="card"' + (past ? ' style="opacity:.7"' : '') + '><div class="daytitle"><h3>' + C.weekdays[i] + ' <span class="muted small">' + d.getDate() + '/' + (d.getMonth() + 1) + '</span></h3>' +
        (dk === tk ? '<span class="today-badge">Hoje</span>' : '') + '</div>' +
        (items.length ? items.map(function (it) { return itemLine(dk, it, true); }).join('') : '<p class="muted small">Livre ☁️</p>') + '</div>';
    }
    if (plan.unscheduled && plan.unscheduled.length) {
      var counts = {}; plan.unscheduled.forEach(function (u) { counts[u.name] = (counts[u.name] || 0) + 1; });
      html += '<div class="card soft"><h3>📦 Não couberam nesta semana</h3><p>' + Object.keys(counts).map(function (n) { return h(n) + ' (' + counts[n] + '×)'; }).join(', ') +
        '</p><p class="muted small">Não é falha sua — é falta de horário. Ajuste em Ajustes → Horários.</p></div>';
    }
    return html;
  };
  views.needs = function () {
    var vals = needsNow(), list = activeNeeds(), mood = moodSummary();
    var html = '<h1>Necessidades</h1><p class="muted">As barras enchem quando você conclui algo e esvaziam devagar com o tempo. Não é nota nem cobrança — é só um painel para você ver como está se cuidando.</p>' +
      '<div class="card"><b>Bem-estar geral: ' + mood.avg + '%</b><div class="bar" style="height:18px"><i class="lvl-' + lvl(mood.avg) + '" style="width:' + Math.max(4, mood.avg) + '%"></i></div><p class="muted small">' + mood.text + '</p></div>';
    list.forEach(function (n) {
      var v = vals[n], meta = C.needs[n];
      var tasks = S.chores.filter(function (t) { return t.need === n; }).concat(S.leisure.filter(function (t) { return t.need === n; }));
      var last = null; S.completions.forEach(function (c) { if (c.need === n && (!last || c.ts > last)) last = c.ts; });
      var ago = last ? Math.floor((Date.now() - last) / 86400000) : null;
      html += '<div class="card"><div class="row spread"><h3>' + meta.icon + ' ' + meta.label + '</h3><b>' + v + '%</b></div>' +
        '<div class="bar" style="height:18px"><i class="lvl-' + lvl(v) + '" style="width:' + Math.max(4, v) + '%"></i></div>' +
        '<p class="muted small">' + meta.hint + '</p><p class="small"><b>Enche com:</b> ' + tasks.map(function (t) { return h(t.name); }).join(', ') + '</p>' +
        '<p class="small muted">' + (ago == null ? 'Ainda não concluído pelo app.' : ago === 0 ? 'Cuidado hoje ✓' : 'Última vez: há ' + ago + ' dia' + (ago > 1 ? 's' : '') + '.') + '</p></div>';
    });
    return html;
  };
  views.settings = function () {
    var p = S.prefs;
    return '<h1>Ajustes</h1>' +
      (storageOk ? '' : '<div class="card soft"><b>Atenção:</b> este navegador não está deixando salvar. Faça um backup.</div>') +
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
      '<button type="button" class="ghost full" data-a="edit" data-step="areas">🌟 Áreas de lazer</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="leisure">🎈 Atividades de lazer</button>' +
      '<button type="button" class="ghost full" data-a="edit" data-step="analysis">🔎 Ver análise</button></div>' +
      '<div class="card stack"><h3>Backup</h3><p class="muted small">Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando.</p>' +
      '<button type="button" class="ghost full" data-a="export">⬇️ Salvar cópia (arquivo)</button>' +
      '<label class="btn ghost full" style="display:flex;align-items:center;justify-content:center;border:2px solid var(--line)">⬆️ Restaurar cópia<input type="file" accept="application/json,.json" data-bind="import" style="display:none"></label>' +
      (ui.installEvt ? '<button type="button" class="primary full" data-a="install">📲 Instalar como app</button>' : '') +
      '<button type="button" class="danger full" data-a="reset">Apagar tudo e recomeçar</button></div>' +
      '<p class="muted small center">Rotina Gentil · funciona sem internet</p>';
  };
  views.focus = function () {
    var f = ui.focus, it = f && findItem(f.dk, f.uid), t = it && findTask(it.kind, it.taskId);
    if (!t) { ui.focus = null; ui.view = 'today'; return views.today(); }
    var lz = it.kind === 'leisure';
    var total = f.total, rem = f.remaining, frac = total ? rem / total : 0, R = 96, Cc = 2 * Math.PI * R;
    return '<div class="focus">' +
      '<p class="muted">' + (lz ? '🎈 Momento de lazer' : '🏠 Você está fazendo') + '</p><h1>' + h(t.name) + '</h1>' +
      (t.firstStep ? '<div class="firststep" style="text-align:left">👣 <b>Comece só por isto:</b> ' + h(t.firstStep) + '</div>' : '') +
      '<div class="ring" aria-hidden="true"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="' + R + '" fill="none" stroke="var(--surface-2)" stroke-width="14"/>' +
      '<circle id="ringArc" cx="110" cy="110" r="' + R + '" fill="none" stroke="' + (lz ? 'var(--leisure)' : 'var(--accent)') + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + Cc.toFixed(1) + '" stroke-dashoffset="' + (Cc * (1 - frac)).toFixed(1) + '"/></svg>' +
      '<div class="t" id="timerText" role="timer">' + fmtClock(rem) + '</div></div>' +
      '<p class="muted" id="timerMsg">' + (f.ended ? (f.mini ? 'Os 2 minutos acabaram. Quer continuar ou parar? Os dois estão certos.' : 'O tempo acabou. Sem pressa — termine no seu ritmo.') :
        f.running ? (f.mini ? 'Só 2 minutos. Depois você decide.' : 'O cronômetro é só um guia.') : 'Pausado.') + '</p>' +
      '<div class="stack">' +
      (f.ended && f.mini ? '<button type="button" class="primary big" data-a="continueFull">Continuar</button><button type="button" class="ghost full" data-a="finish" data-partial="1">Parar por aqui (conta!)</button>' :
        '<button type="button" class="primary big" data-a="finish">Concluí ✓</button>') +
      '<div class="row">' + '<button type="button" class="ghost grow" data-a="timerToggle">' + (f.running ? 'Pausar' : 'Retomar') + '</button>' +
      '<button type="button" class="ghost grow" data-a="mini">Só 2 minutos</button></div>' +
      '<button type="button" class="link" data-a="exitFocus">Sair sem concluir</button></div></div>';
  };
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // ---------------- janelas (bottom sheets) ----------------
  function modalHtml() {
    var m = ui.modal; if (!m) return '';
    if (m.type === 'confirmReset') {
      return '<div class="overlay" data-a="closeModalBg"><div class="sheet" role="dialog" aria-modal="true" aria-label="Apagar tudo"><h2 style="margin-top:0">Apagar tudo?</h2>' +
        '<p>Isso apaga horários, tarefas, lazer e histórico deste aparelho. Não dá para desfazer (a não ser que você tenha um backup).</p>' +
        '<div class="stack"><button type="button" class="danger" data-a="resetYes">Sim, apagar tudo</button><button type="button" class="ghost" data-a="closeModal">Cancelar</button></div></div></div>';
    }
    var it = findItem(m.dk, m.uid), t = it && findTask(it.kind, it.taskId);
    if (!t) return '';
    var body = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + h(t.name) + '"><h2 style="margin-top:0">' + h(t.name) + '</h2>';
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
      var from = Sch.parseKey(m.dk), base = Sch.weekStart(from), tk = todayKey(), opts = '';
      for (var i = 0; i < 14; i++) {
        var d = Sch.addDays(base, i), dk = Sch.dateKey(d);
        if (dk <= tk || dk === m.dk) continue;
        var n = visibleItems(dayInfo(dk).items).length;
        opts += '<button type="button" class="ghost" data-a="moveTo" data-to="' + dk + '">' + C.weekdays[Sch.weekdayIndex(d)] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' <span class="muted small">· ' + (n ? n + ' atividade' + (n > 1 ? 's' : '') : 'livre') + '</span></button>';
        if (opts.split('data-a="moveTo"').length > 7) break;
      }
      body += '<p class="muted">Escolha o dia. Ela vai para o fim da lista daquele dia.</p><div class="stack">' + opts + '<button type="button" class="link" data-a="closeModal">Cancelar</button></div>';
    }
    return '<div class="overlay" data-a="closeModalBg">' + body + '</div></div>';
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
    var fk = focusKey(document.activeElement);
    var html;
    if (!S.onboarded) html = views[STEPS[S.step]]();
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
  function addTaskFrom(kind, src, area) {
    var t = { id: uid(), name: src.name, perWeek: src.perWeek || 1, duration: src.duration || 20, need: src.need, firstStep: src.firstStep || '' };
    if (kind === 'chore') { t.importance = src.importance || 2; S.chores.push(t); }
    else { t.area = area; S.leisure.push(t); }
  }
  var actions = {
    next: function () {
      if (STEPS[S.step] === 'analysis') {
        S.onboarded = true; S.seedTs = Date.now(); S.plans = {}; ui.view = 'today';
        buildWeek(weekKeyFor(new Date())); save();
        toast('Sua semana está pronta. Agora é só seguir uma coisa por vez. 💚');
        render(); scrollTop(); return;
      }
      setStep(S.step + 1);
    },
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
      var c = C.chores[+el.dataset.i], idx = -1;
      S.chores.forEach(function (t, i) { if (t.name === c.name) idx = i; });
      if (idx >= 0) S.chores.splice(idx, 1); else addTaskFrom('chore', c);
      save(); render();
    },
    toggleLeisure: function (el) {
      var k = el.dataset.k, idea = C.leisureAreas[k].ideas[+el.dataset.i], idx = -1;
      S.leisure.forEach(function (t, i) { if (t.name === idea[0]) idx = i; });
      if (idx >= 0) S.leisure.splice(idx, 1);
      else addTaskFrom('leisure', { name: idea[0], duration: idea[1], firstStep: idea[2], perWeek: 1, need: C.leisureAreas[k].need }, k);
      save(); render();
    },
    addCustom: function (el) {
      var kind = el.dataset.kind;
      if (kind === 'chore') addTaskFrom('chore', { name: 'Nova tarefa', need: 'ambiente', duration: 20, perWeek: 1, importance: 2 });
      else { var k = Object.keys(S.areas)[0] || 'interesse'; addTaskFrom('leisure', { name: 'Nova atividade', need: C.leisureAreas[k].need, duration: 30, perWeek: 1 }, k); }
      save(); render();
      var inputs = app.querySelectorAll('[data-bind="taskName"]'); var last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    },
    delTask: function (el) {
      var list = el.dataset.kind === 'leisure' ? S.leisure : S.chores;
      for (var i = 0; i < list.length; i++) if (list[i].id === el.dataset.id) { list.splice(i, 1); break; }
      save(); render();
    },
    taskNum: function (el) {
      var t = findTask(el.dataset.kind, el.dataset.id), d = +el.dataset.delta; if (!t) return;
      if (el.dataset.f === 'perWeek') t.perWeek = clamp(t.perWeek + d, 1, 7);
      else { var step = t.duration >= 60 ? 15 : 5; if (d < 0 && t.duration <= 60 && t.duration > 55) step = 5; t.duration = clamp(t.duration + d * step, 5, 240); }
      save(); render();
    },
    taskImp: function (el) { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.importance = +el.dataset.v; save(); render(); } },
    toggleArea: function (el) {
      var k = el.dataset.k;
      if (S.areas[k]) {
        delete S.areas[k];
        S.leisure = S.leisure.filter(function (t) { return t.area !== k || C.leisureAreas[k].ideas.every(function (i) { return i[0] !== t.name; }); });
      } else S.areas[k] = { joy: 2, now: 1 };
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
      ui.modal = null; save(); toast('Pulado. Sem culpa — semana que vem tem de novo.'); render();
    },
    unskip: function () { var it = findItem(ui.modal.dk, ui.modal.uid); if (it) it.status = 'pending'; ui.modal = null; save(); render(); },
    markDone: function () { completeItem(ui.modal.dk, ui.modal.uid, false); ui.modal = null; render(); },
    undo: function () { undoItem(ui.modal.dk, ui.modal.uid); ui.modal = null; render(); },

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

    edit: function (el) { ui.edit = el.dataset.step; render(); scrollTop(); },
    editDone: function () {
      var wasAnalysis = ui.edit === 'analysis';
      ui.edit = null;
      if (!wasAnalysis) { regenerateFromToday(); toast('Salvo. A agenda desta semana foi refeita.'); }
      render(); scrollTop();
    },
    regen: function () { regenerateFromToday(); toast('Agenda refeita.'); render(); },
    export: function () {
      try {
        var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'rotina-gentil-backup-' + todayKey() + '.json';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('Cópia salva na pasta de downloads.');
      } catch (e) { toast('Não consegui salvar a cópia neste navegador.'); }
      render();
    },
    install: function () { if (ui.installEvt) { ui.installEvt.prompt(); ui.installEvt = null; render(); } },
    reset: function () { ui.modal = { type: 'confirmReset' }; render(); },
    resetYes: function () { S = defaults(); save(); ui = { view: 'today', edit: null, modal: null, focus: null, toast: null, weekOffset: 0, installEvt: ui.installEvt }; render(); scrollTop(); }
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
    if (b === 'taskName' || b === 'taskStep') { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t[b === 'taskName' ? 'name' : 'firstStep'] = el.value; save(); } }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target, b = el.getAttribute && el.getAttribute('data-bind'); if (!b) return;
    if (b === 'slot') render(); // atualiza aviso e total de horas
    if (b === 'taskNeed') { var t = findTask(el.dataset.kind, el.dataset.id); if (t) { t.need = el.value; save(); } }
    if (b === 'import' && el.files && el.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d || typeof d !== 'object' || !Array.isArray(d.chores) || !d.slots) throw new Error('inválido');
          S = d; var def = defaults(); for (var k in def) if (!(k in S)) S[k] = def[k];
          save(); toast('Cópia restaurada.'); ui.view = 'today';
        } catch (e) { toast('Esse arquivo não parece uma cópia do Rotina Gentil.'); }
        render();
      };
      r.readAsText(el.files[0]);
    }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); } });
  // volta ao app depois de um tempo: atualiza "hoje" e as barras
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ui.view !== 'focus' && !ui.edit) render(); });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ui.installEvt = e; if (ui.view === 'settings') render(); });

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  render();
  window.__rg = { state: function () { return S; }, ui: ui, render: render };
})();
