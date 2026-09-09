// Dino Arena — the referee app. Pass-and-play on one phone. Requires species.js + engine.js.

(() => {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // --- persistence ------------------------------------------------------------
  const LS_KEY = 'dinoarena.v1';
  function loadStore() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveStore() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } }
  const store = loadStore();
  store.ladder = store.ladder || {};
  store.names = store.names || ['', ''];

  function ladderEntry(name) {
    return store.ladder[name] || (store.ladder[name] = { hills: 0, rounds: 0, matches: 0, wins: 0 });
  }

  // --- tabs -------------------------------------------------------------------
  $$('nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  function showTab(name) {
    $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('main > section').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
  }

  // --- dice animation ---------------------------------------------------------
  function animateDie(el, sides, finalValue, done) {
    const val = $('.val', el);
    el.classList.add('rolling');
    let i = 0;
    const iv = setInterval(() => {
      val.textContent = 1 + Math.floor(Math.random() * sides);
      if (++i >= 10) {
        clearInterval(iv);
        val.textContent = finalValue;
        el.classList.remove('rolling');
        if (done) done();
      }
    }, 60);
  }

  // =============================================================================
  // ARENA
  // =============================================================================
  let M = null;   // match state
  let logTimer = null;

  function newMatch(names, target) {
    M = {
      names, target, score: [0, 0], round: 1, firstDecider: 0,
      phase: 'roll', dice: [null, null], armies: [null, null],
      rerolled: [false, false], rerolledDie: [null, null], decided: [false, false], decider: 0, result: null,
    };
    store.names = names.slice(); saveStore();
    $('#setup').hidden = true; $('#match').hidden = false;
    $('#log').innerHTML = '';
    renderMatch();
  }

  function nextRound() {
    M.round += 1;
    M.firstDecider = 1 - M.firstDecider;
    M.phase = 'roll'; M.dice = [null, null]; M.armies = [null, null];
    M.rerolled = [false, false]; M.rerolledDie = [null, null]; M.decided = [false, false]; M.decider = M.firstDecider; M.result = null;
    $('#log').innerHTML = '';
    renderMatch();
  }

  function roll(idx) {
    if (M.phase !== 'roll' || M.dice[idx]) return;
    const dice = Engine.rollDice();
    M.dice[idx] = dice;
    renderMatch();   // draws the die boxes
    const card = $('#card-' + idx);
    const dBudget = $('.die.budget', card), dFace = $('.die.face', card);
    let pending = 2;
    const settle = () => {
      if (--pending) return;
      M.armies[idx] = Engine.armyFromDice(dice);
      if (M.dice[0] && M.dice[1] && M.armies[0] && M.armies[1]) { M.phase = 'decide'; M.decider = M.firstDecider; }
      renderMatch();
    };
    animateDie(dBudget, 20, dice.budget, settle);
    animateDie(dFace, 12, dice.face, settle);
  }

  function decide(idx, action) {
    if (M.phase !== 'decide' || M.decider !== idx || M.decided[idx]) return;
    if (action === 'keep') { finishDecision(idx); return; }
    const dice = M.dice[idx];
    const card = $('#card-' + idx);
    M.rerolled[idx] = true;
    M.rerolledDie[idx] = action;
    if (action === 'budget') {
      dice.budget = Engine.die(20, Math.random);
      animateDie($('.die.budget', card), 20, dice.budget, () => { M.armies[idx] = Engine.armyFromDice(dice); finishDecision(idx); });
    } else {
      dice.face = Engine.die(12, Math.random);
      animateDie($('.die.face', card), 12, dice.face, () => { M.armies[idx] = Engine.armyFromDice(dice); finishDecision(idx); });
    }
    $$('.actions button', card).forEach(b => { b.disabled = true; });
  }

  function finishDecision(idx) {
    M.decided[idx] = true;
    const other = 1 - idx;
    if (!M.decided[other]) M.decider = other;
    else M.phase = 'fight';
    renderMatch();
  }

  function fight() {
    if (M.phase !== 'fight') return;
    const r = Engine.fight(M.armies[0], M.armies[1]);
    M.result = r;
    M.phase = 'fighting';
    renderMatch();
    playLog(r.log, $('#log'), finishFight);
  }

  function finishFight() {
    const r = M.result;
    const [na, nb] = M.names;
    ladderEntry(na).rounds++; ladderEntry(nb).rounds++;
    if (r.winner === 'A') { M.score[0]++; ladderEntry(na).hills++; }
    if (r.winner === 'B') { M.score[1]++; ladderEntry(nb).hills++; }
    if (M.score[0] >= M.target || M.score[1] >= M.target) {
      M.phase = 'matchOver';
      const w = M.score[0] >= M.target ? 0 : 1;
      ladderEntry(na).matches++; ladderEntry(nb).matches++;
      ladderEntry(M.names[w]).wins++;
    } else {
      M.phase = 'done';
    }
    saveStore();
    renderMatch();
  }

  function playLog(entries, ol, done) {
    ol.innerHTML = '';
    let i = 0;
    const step = () => {
      if (i >= entries.length) { logTimer = null; if (done) done(); return; }
      ol.appendChild(logLine(entries[i++]));
      ol.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      logTimer = setTimeout(step, entries[i - 1].kind === 'intro' ? 700 : 900);
    };
    step();
  }
  function skipLog() {
    if (!logTimer || !M || !M.result) return;
    clearTimeout(logTimer); logTimer = null;
    const ol = $('#log');
    ol.innerHTML = '';
    M.result.log.forEach(e => ol.appendChild(logLine(e)));
    finishFight();
  }
  function logLine(e) {
    const li = document.createElement('li');
    li.className = [e.kind, e.side === 'A' ? 'a' : e.side === 'B' ? 'b' : ''].join(' ').trim();
    li.innerHTML = (e.tick > 0 ? '<span class="t">t' + e.tick + '</span>' : '') + esc(e.text);
    return li;
  }

  // --- rendering ----------------------------------------------------------------
  function renderMatch() {
    const [na, nb] = M.names;
    $('#scoreboard').innerHTML =
      '<div class="name a">' + esc(na) + '</div>' +
      '<div><div class="score">' + M.score[0] + ' – ' + M.score[1] + '</div>' +
      '<div class="meta">round ' + M.round + ' · first to ' + M.target + '</div></div>' +
      '<div class="name b">' + esc(nb) + '</div>';

    const players = $('#players');
    players.innerHTML = [0, 1].map(idx => renderCard(idx)).join('');
    $$('#players [data-roll]').forEach(b => b.addEventListener('click', () => roll(+b.dataset.roll)));
    $$('#players [data-decide]').forEach(b => b.addEventListener('click', () => decide(+b.dataset.idx, b.dataset.decide)));

    // status line
    let status = '';
    if (M.phase === 'roll') {
      const waiting = [0, 1].filter(i => !M.dice[i]).map(i => M.names[i]);
      status = waiting.length === 2 ? 'Both players roll.' : '<strong>' + esc(waiting[0]) + '</strong> rolls.';
    } else if (M.phase === 'decide') {
      status = '<strong>' + esc(M.names[M.decider]) + '</strong> decides: reroll one die, or keep.' +
        (M.decider === M.firstDecider ? ' <span class="muted">(' + esc(M.names[1 - M.decider]) + ' decides second this round.)</span>' : '');
    } else if (M.phase === 'fight') {
      status = 'Armies are set. <strong>' + esc(Engine.label(M.armies[0])) + '</strong> vs <strong>' + esc(Engine.label(M.armies[1])) + '</strong>.';
    } else if (M.phase === 'fighting') {
      status = 'Fight in progress…';
    } else if (M.phase === 'done' || M.phase === 'matchOver') {
      const r = M.result;
      status = r.winner === 'draw' ? 'Nobody holds the hill this round.' :
        '<strong>' + esc(M.names[r.winner === 'A' ? 0 : 1]) + '</strong> holds the hill.';
    }
    $('#status').innerHTML = status;

    // controls
    const fc = $('#fight-controls');
    if (M.phase === 'fight') fc.innerHTML = '<button class="primary big" data-action="fight">Fight!</button>';
    else if (M.phase === 'fighting') fc.innerHTML = '<button data-action="skip">Skip to the end</button>';
    else fc.innerHTML = '';
    $$('[data-action=fight]', fc).forEach(b => b.addEventListener('click', fight));
    $$('[data-action=skip]', fc).forEach(b => b.addEventListener('click', skipLog));

    const rc = $('#round-controls');
    if (M.phase === 'done') {
      rc.innerHTML = '<button class="primary big" data-action="next">Next round</button>';
      $('[data-action=next]', rc).addEventListener('click', nextRound);
    } else if (M.phase === 'matchOver') {
      const w = M.score[0] >= M.target ? 0 : 1;
      rc.innerHTML = '<div class="banner">👑 ' + esc(M.names[w]) + ' holds the hill! ' + M.score[0] + ' – ' + M.score[1] + '</div>' +
        '<button class="primary big" data-action="rematch">Rematch</button> <button data-action="newplayers">New players</button>';
      $('[data-action=rematch]', rc).addEventListener('click', () => newMatch(M.names.slice(), M.target));
      $('[data-action=newplayers]', rc).addEventListener('click', () => { $('#match').hidden = true; $('#setup').hidden = false; renderLadder(); });
    } else rc.innerHTML = '';
  }

  function renderCard(idx) {
    const side = idx === 0 ? 'a' : 'b';
    const dice = M.dice[idx], army = M.armies[idx];
    const active = (M.phase === 'roll' && !dice) || (M.phase === 'decide' && M.decider === idx && !M.decided[idx]);
    const sp = dice ? SPECIES[dice.face - 1] : null;
    let html = '<div id="card-' + idx + '" class="card ' + side + (active ? ' active' : '') + '">';
    html += '<div class="who">' + esc(M.names[idx]) + '<span class="tag">' + (M.rerolled[idx] ? 'rerolled ' + M.rerolledDie[idx] : (M.decided[idx] ? 'kept' : '')) + '</span></div>';
    html += '<div class="dice">' +
      '<div class="die budget' + (M.rerolledDie[idx] === 'budget' ? ' rerolled' : '') + '"><div class="lbl">d20 · budget</div><div class="val">' + (dice ? dice.budget : '–') + '</div><div class="sub">' + (army ? 'bulk ' + sp.bulk : '') + '</div></div>' +
      '<div class="die face' + (M.rerolledDie[idx] === 'species' ? ' rerolled' : '') + '"><div class="lbl">d12 · species</div><div class="val">' + (dice ? dice.face : '–') + '</div><div class="sub">' + (army ? sp.emoji + ' ' + esc(sp.name) : '') + '</div></div>' +
      '</div>';
    html += '<div class="army">' + (army
      ? '<span class="emoji">' + sp.emoji + '</span>' + esc(Engine.label(army)) + '<small>' + esc(sp.role) + ' · ' + esc(sp.signature.name) + ': ' + esc(sp.signature.text) + '</small>'
      : '<span class="muted">No army yet.</span>') + '</div>';
    html += '<div class="actions">';
    if (M.phase === 'roll' && !dice) html += '<button class="primary" data-roll="' + idx + '">Roll</button>';
    if (M.phase === 'decide' && M.decider === idx && !M.decided[idx]) {
      html += '<button data-decide="budget" data-idx="' + idx + '">Reroll budget</button>' +
        '<button data-decide="species" data-idx="' + idx + '">Reroll species</button>' +
        '<button class="primary" data-decide="keep" data-idx="' + idx + '">Keep</button>';
    }
    html += '</div></div>';
    return html;
  }

  function renderLadder() {
    const rows = Object.entries(store.ladder).sort((a, b) => b[1].hills - a[1].hills);
    const el = $('#ladder');
    if (!rows.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<table><thead><tr><th>Ladder</th><th class="num">hills</th><th class="num">rounds</th><th class="num">matches won</th></tr></thead><tbody>' +
      rows.map(([n, s]) => '<tr><td>' + esc(n) + '</td><td class="num">' + s.hills + '</td><td class="num">' + s.rounds + '</td><td class="num">' + s.wins + '/' + s.matches + '</td></tr>').join('') +
      '</tbody></table>';
  }

  // setup
  $('#name-a').value = store.names[0] || '';
  $('#name-b').value = store.names[1] || '';
  $('[data-action=start]').addEventListener('click', () => {
    const na = $('#name-a').value.trim() || 'Player 1';
    const nb = $('#name-b').value.trim() || 'Player 2';
    newMatch([na, nb], +$('#target').value);
  });
  renderLadder();

  // =============================================================================
  // LAB
  // =============================================================================
  const optionsHtml = SPECIES.map(s => '<option value="' + s.id + '">' + s.emoji + ' ' + esc(s.name) + '</option>').join('');
  $('#lab-sp-a').innerHTML = optionsHtml; $('#lab-sp-b').innerHTML = optionsHtml;
  $('#lab-sp-a').value = 'trex'; $('#lab-sp-b').value = 'stego';

  function labArmies() {
    return [
      { species: SPECIES_BY_ID[$('#lab-sp-a').value], count: Math.max(1, +$('#lab-n-a').value || 1) },
      { species: SPECIES_BY_ID[$('#lab-sp-b').value], count: Math.max(1, +$('#lab-n-b').value || 1) },
    ];
  }
  $('[data-action=simulate]').addEventListener('click', () => {
    const [A, B] = labArmies();
    const r = Engine.simulate(A.species, A.count, B.species, B.count, 3000, Math.floor(Math.random() * 1e9));
    const pct = x => Math.round(x * 100);
    $('#lab-result').innerHTML =
      '<div><strong>' + esc(Engine.label(A)) + '</strong> vs <strong>' + esc(Engine.label(B)) + '</strong> · average fight ' + r.ticks.toFixed(1) + ' ticks</div>' +
      '<div class="bar">' +
      '<div class="a" style="width:' + pct(r.A) + '%">' + pct(r.A) + '%</div>' +
      '<div class="d" style="width:' + pct(r.draw) + '%">' + (r.draw >= 0.05 ? pct(r.draw) + '%' : '') + '</div>' +
      '<div class="b" style="width:' + pct(r.B) + '%">' + pct(r.B) + '%</div></div>';
  });
  $('[data-action=watch]').addEventListener('click', () => {
    const [A, B] = labArmies();
    const r = Engine.fight(A, B);
    const ol = $('#lab-log'); ol.innerHTML = '';
    r.log.forEach(e => ol.appendChild(logLine(e)));
  });

  $('[data-action=heatmap]').addEventListener('click', () => {
    const btn = $('[data-action=heatmap]');
    btn.disabled = true; btn.textContent = 'Computing…';
    const mode = $('#hm-mode').value;
    setTimeout(() => {
      const hm = Engine.heatmap(mode === '1v1' ? 300 : 150, Math.floor(Math.random() * 1e9), mode, { budget: 12 });
      renderHeatmap(hm);
      btn.disabled = false; btn.textContent = 'Compute';
    }, 30);
  });
  function cellColor(w) {
    // red (0) → amber (0.5) → green (1)
    const h = Math.round(w * 120);
    return 'hsl(' + h + ' 70% ' + (58 - Math.abs(w - 0.5) * 16) + '%)';
  }
  function renderHeatmap(hm) {
    const ids = hm.ids;
    const sp = id => SPECIES_BY_ID[id];
    let html = '<table class="heatmap"><thead><tr><th></th>' + ids.map(id => '<th title="' + esc(sp(id).name) + '">' + sp(id).emoji + '</th>').join('') + '<th>king</th></tr></thead><tbody>';
    const rows = ids.map((id, i) => {
      const off = hm.matrix[i].filter((_, j) => j !== i).map(c => c.win);
      return { id, i, mean: off.reduce((a, b) => a + b, 0) / off.length };
    }).sort((a, b) => b.mean - a.mean);
    rows.forEach(({ id, i, mean }) => {
      html += '<tr><th class="row">' + sp(id).emoji + ' ' + esc(sp(id).name) + '</th>';
      ids.forEach((cid, j) => {
        if (i === j) { html += '<td style="background:var(--panel)"></td>'; return; }
        const c = hm.matrix[i][j];
        html += '<td style="background:' + cellColor(c.win) + '" title="' + esc(sp(id).name) + ' beats ' + esc(sp(cid).name) + ' ' + Math.round(c.win * 100) + '% (draw ' + Math.round(c.draw * 100) + '%)">' + Math.round(c.win * 100) + '</td>';
      });
      html += '<td class="king">' + Math.round(mean * 100) + '</td></tr>';
    });
    html += '</tbody></table>';
    $('#heatmap').innerHTML = html;
  }

  // =============================================================================
  // ROSTER
  // =============================================================================
  $('#roster').innerHTML = SPECIES.map(s => {
    const counts = [1, 5, 10, 15, 20].map(b => b + '→' + Engine.headcount(s, b)).join('  ');
    return '<div class="sp">' +
      '<div class="head"><span class="emoji">' + s.emoji + '</span><strong>' + esc(s.name) + '</strong><span class="face">d12 = ' + s.face + '</span></div>' +
      '<div class="role">' + esc(s.role) + '</div>' +
      '<div class="stats"><span>bulk <b>' + s.bulk + '</b></span><span>bite <b>' + s.bite + '</b></span><span>hp <b>' + s.hp + '</b></span><span>armor <b>' + s.armor + '</b></span><span>pack <b>' + s.pack + '</b></span><span>morale <b>' + (s.morale >= 1 ? 'never routs' : s.morale) + '</b></span>' + (s.flying ? '<span><b>flying</b></span>' : '') + (s.leaper ? '<span><b>leaper</b></span>' : '') + '</div>' +
      '<div class="sig"><b>' + esc(s.signature.name) + '.</b> ' + esc(s.signature.text) + '</div>' +
      '<div class="counts">budget→headcount: ' + counts + '</div>' +
      '</div>';
  }).join('');

  // expose for the headless screenshot/driver script
  window.DinoArena = { state: () => M, newMatch, roll, decide, fight, skipLog, showTab };
})();
