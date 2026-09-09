// Dino Arena — fight engine. Pure logic, no DOM. Works in the browser and inside
// the headless-Chromium lab (lab/lab.py). Requires species.js to be loaded first.

const Engine = (() => {
  const MAX_TICKS = 12;
  const D20_MEAN = 10.5;

  // --- RNG -------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) { return seed == null ? Math.random : mulberry32(seed); }
  function die(n, rng) { return 1 + Math.floor(rng() * n); }
  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  // --- Armies ----------------------------------------------------------------
  function headcount(species, budget) {
    return Math.max(1, Math.round(budget / species.bulk));
  }
  function makeArmy(species, budget) {
    return { species, budget, count: headcount(species, budget) };
  }
  function rollDice(rng) {
    rng = rng || Math.random;
    return { budget: die(20, rng), face: die(12, rng) };
  }
  function armyFromDice(dice) {
    const sp = SPECIES[dice.face - 1];
    return { ...makeArmy(sp, dice.budget), dice };
  }
  function label(army) {
    const s = army.species;
    return `${army.count} ${army.count === 1 ? s.name : s.plural}`;
  }

  // --- Fight -----------------------------------------------------------------
  function makeSide(key, army) {
    const s = army.species;
    return {
      key, sp: s, n0: army.count, n: army.count,
      hp: s.hp, pool: army.count * s.hp,
      bite: s.bite, armor: s.armor, pack: s.pack, morale: s.morale,
      flying: !!s.flying, leaper: !!s.leaper,
      biteMult: 1, dazed: false, routed: false, losses: 0,
      armorNoted: false,
    };
  }

  // Templates: {A} attacker, {B} defender, {B1} one defender, {k} kills.
  // {many|one} picks the plural or singular form from ctx.many (the attacker's headcount).
  const LINES = {
    kill: [
      'The {A} {tear|tears} into the {B}: {k} down.',
      'The {A} {strike|strikes}. {k} {B} fall.',
      'The {B} lose {k} to the {A}.',
      '{k} {B} go down under the {A}.',
    ],
    kill1: [
      'The {A} {bring|brings} down {an} {B1}.',
      '{An} {B1} falls to the {A}.',
      'The {A} {single|singles} out {an} {B1}. It does not get up.',
    ],
    armor: [
      'The {A} {bite|bites} the {B} and {find|finds} only armor.',
      'Teeth on plate: the {A} {do|does} nothing to the {B}.',
    ],
    rout: [
      'The {A} {have|has} had enough. {They|It} {break|breaks} and {flee|flees}.',
      'Too many lost: the {A} {scatter|scatters}.',
    ],
    end: {
      mutual: 'Both armies are spent. Nobody holds the hill.',
      clockDraw: 'The sun sets on a standoff. Nobody holds the hill.',
      clockHill: 'The {L} can circle all day, but only feet hold ground. The {W} {hold|holds} the hill.',
      clockAttrition: 'The sun sets. The {W} still {stand|stands} in better shape ({wn}/{wn0} vs {ln}/{ln0}). {They|It} {hold|holds} the hill.',
      routed: 'The {L} are gone. The {W} {hold|holds} the hill with {wn} of {wn0} standing.',
      lastFalls: 'The last {L1} falls. The {W} {hold|holds} the hill with {wn} of {wn0} standing.',
      oneFalls: 'The {L1} falls. The {W} {hold|holds} the hill with {wn} of {wn0} standing.',
    },
  };

  function fmt(tpl, ctx) {
    return tpl
      .replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, many, one) => (ctx.many ? many : one))
      .replace(/\{(\w+)\}/g, (_, k) => (ctx[k] !== undefined ? ctx[k] : '{' + k + '}'));
  }
  const nameOf = (S) => (S.n0 > 1 ? S.sp.plural : S.sp.name);

  function fight(armyA, armyB, opts) {
    opts = opts || {};
    const rng = opts.rng || makeRng(opts.seed);
    const keepLog = opts.log !== false;
    const A = makeSide('A', armyA);
    const B = makeSide('B', armyB);
    const log = [];
    let quietFrom = null;   // first tick of the current run of ticks where nothing fell
    const flushQuiet = (upTo) => {
      if (quietFrom === null || upTo < quietFrom) return;
      const text = upTo > quietFrom
        ? 'Ticks ' + quietFrom + ' to ' + upTo + ': blood on both sides, nothing falls.'
        : 'Tick ' + quietFrom + ': scratches, nothing falls.';
      log.push({ tick: quietFrom, side: null, kind: 'quiet', text });
      quietFrom = null;
    };
    const say = (tick, side, kind, text) => {
      if (!keepLog) return;
      flushQuiet(tick - 1);
      log.push({ tick, side, kind, text });
    };

    if (keepLog) {
      log.push({ tick: 0, side: 'A', kind: 'intro', text: fmt(A.sp.intro, { n: A.n0, plural: nameOf(A), many: A.n0 > 1 }) });
      log.push({ tick: 0, side: 'B', kind: 'intro', text: fmt(B.sp.intro, { n: B.n0, plural: nameOf(B), many: B.n0 > 1 }) });
    }

    // One side's attack against the other. Returns a pending effect that apply() resolves.
    function attack(X, Y, tick) {
      if (X.n <= 0 || X.routed) return null;
      const roll = die(20, rng);
      let mult = roll / D20_MEAN;
      const notes = [];

      if (X.dazed) { mult *= 0.5; X.dazed = false; notes.push('dazed'); }

      let ignoreArmor = false;
      if (X.sp.id === 'trex' && roll >= 17) { ignoreArmor = true; mult *= 2; notes.push('crushing'); }
      if (X.sp.id === 'raptor' && roll >= 18) { ignoreArmor = true; notes.push('clever'); }
      if (roll === 20 && !ignoreArmor) { ignoreArmor = true; notes.push('eye'); }

      const effBite = X.bite * X.biteMult - (ignoreArmor ? 0 : Y.armor);
      if (effBite <= 0) {
        return { X, Y, dmg: 0, roll, notes, effects: {}, armored: true };
      }

      if (Y.flying && !X.flying && !X.leaper) { mult *= 0.25; notes.push('swat'); }

      if (X.sp.id === 'stego' && Y.sp.bulk >= 3) mult *= 2.0;
      if (X.sp.id === 'trike' && tick === 1) mult *= 1.8;
      if (X.sp.id === 'brachio' && Y.sp.bulk <= 1) mult *= 2;
      if (X.sp.id === 'spino' && Y.sp.id === 'trex') mult *= 1.5;
      if (X.sp.id === 'carno' && tick === 1) mult *= 1.5;

      let dmg = effBite * Math.pow(X.n, X.pack) * mult;

      if (X.sp.id === 'ankylo' && roll >= 14 && Y.sp.bulk >= 3) {
        dmg += 0.25 * Y.hp * X.n; notes.push('club');
      }

      const effects = {};
      if (X.sp.id === 'pachy' && roll >= 15) effects.daze = true;
      if (X.sp.id === 'dilo' && tick === 1) effects.venom = true;

      return { X, Y, dmg, roll, notes, effects, armored: false };
    }

    function apply(p, tick) {
      if (!p) return;
      const X = p.X, Y = p.Y;
      const nameA = nameOf(X), nameB = nameOf(Y), nameB1 = Y.sp.name, many = X.n0 > 1;
      if (p.armored) {
        if (!X.armorNoted) { say(tick, X.key, 'armor', fmt(pick(LINES.armor, rng), { A: nameA, B: nameB, many })); X.armorNoted = true; }
        return;
      }
      const before = Y.n;
      Y.pool -= p.dmg;
      Y.n = Math.max(0, Math.ceil(Y.pool / Y.hp - 1e-9));
      const kills = before - Y.n;
      Y.losses += kills;

      if (keepLog) {
        const an = /^[aeiou]/i.test(nameB1) ? 'an' : 'a';
        const ctx = { A: nameA, B: nameB, B1: nameB1, k: kills, many, an, An: an === 'an' ? 'An' : 'A' };
        const tags = [];
        if (p.notes.includes('crushing')) tags.push('Crushing bite!');
        if (p.notes.includes('clever')) tags.push('Clever girl: they found the gap.');
        if (p.notes.includes('eye')) tags.push('Natural 20: straight in the eye.');
        if (p.notes.includes('club')) tags.push('The club shatters legs.');
        if (p.notes.includes('dazed')) tags.push('(still dazed)');
        if (p.effects.daze) tags.push('Headbutt! The enemy reels.');
        if (p.effects.venom) tags.push('Venom in their eyes: bites weaken.');
        if (X.sp.id === 'trike' && tick === 1 && kills > 0) tags.push('The charge lands.');
        if (X.sp.id === 'carno' && tick === 1) tags.push('Ambush!');
        if (X.sp.id === 'stego' && Y.sp.bulk >= 3 && kills > 0) tags.push('Thagomizer.');
        if (kills > 0 || tags.length) {
          let text;
          if (kills === 0) text = 'The ' + nameA + (many ? ' press' : ' presses') + ' the ' + nameB + '.';
          else if (kills === 1) text = fmt(pick(LINES.kill1, rng), ctx);
          else text = fmt(pick(LINES.kill, rng), ctx);
          say(tick, X.key, kills > 0 ? 'kill' : 'hit', tags.length ? text + ' ' + tags.join(' ') : text);
        }
      }
      if (p.effects.daze) Y.dazed = true;
      if (p.effects.venom) Y.biteMult *= 0.7;
    }

    function moraleCheck(X, tick) {
      if (X.routed || X.n <= 0 || X.morale >= 1) return;
      if (X.losses / X.n0 >= X.morale) {
        X.routed = true;
        say(tick, X.key, 'rout', fmt(pick(LINES.rout, rng), { A: nameOf(X), many: X.n0 > 1 }));
      }
    }
    const out = (X) => X.n <= 0 || X.routed;

    let tick = 0;
    let result = null;
    for (tick = 1; tick <= MAX_TICKS; tick++) {
      const logLenBefore = log.length;
      // Initiative is random each tick (a carnotaurus always strikes first on tick 1).
      // Strikes resolve one after the other: a side that just fell or routed does not strike back.
      const ambushA = A.sp.id === 'carno' && B.sp.id !== 'carno' && tick === 1;
      const ambushB = B.sp.id === 'carno' && A.sp.id !== 'carno' && tick === 1;
      const aFirst = ambushA ? true : ambushB ? false : rng() < 0.5;
      const X = aFirst ? A : B, Y = aFirst ? B : A;
      apply(attack(X, Y, tick), tick);
      moraleCheck(Y, tick);
      if (!out(Y)) apply(attack(Y, X, tick), tick);
      moraleCheck(X, tick);
      if (keepLog && log.length === logLenBefore && quietFrom === null) quietFrom = tick;
      if (out(A) && out(B)) { result = 'draw'; break; }
      if (out(A)) { result = 'B'; break; }
      if (out(B)) { result = 'A'; break; }
    }

    let how;
    if (result) {
      how = result === 'draw' ? 'mutual' : 'field';
    } else {
      // The clock. Flyers never hold the hill.
      tick = MAX_TICKS;
      if (A.flying && !B.flying) { result = 'B'; how = 'clock-hill'; }
      else if (B.flying && !A.flying) { result = 'A'; how = 'clock-hill'; }
      else {
        const fa = A.n / A.n0, fb = B.n / B.n0;
        if (Math.abs(fa - fb) < 1e-9) { result = 'draw'; how = 'clock-draw'; }
        else { result = fa > fb ? 'A' : 'B'; how = 'clock-attrition'; }
      }
    }

    if (keepLog) {
      const W = result === 'A' ? A : result === 'B' ? B : null;
      const L = result === 'A' ? B : result === 'B' ? A : null;
      let key;
      if (how === 'mutual') key = 'mutual';
      else if (how === 'clock-draw') key = 'clockDraw';
      else if (how === 'clock-hill') key = 'clockHill';
      else if (how === 'clock-attrition') key = 'clockAttrition';
      else if (L.routed) key = 'routed';
      else key = L.n0 > 1 ? 'lastFalls' : 'oneFalls';
      const ctx = W ? { W: nameOf(W), L: nameOf(L), L1: L.sp.name, wn: W.n, wn0: W.n0, ln: L.n, ln0: L.n0, many: W.n0 > 1 } : {};
      flushQuiet(tick);
      log.push({ tick, side: result === 'draw' ? null : result, kind: 'end', text: fmt(LINES.end[key], ctx) });
    }

    return {
      winner: result, how, ticks: tick, log,
      A: { n: A.n, n0: A.n0, routed: A.routed },
      B: { n: B.n, n0: B.n0, routed: B.routed },
    };
  }

  // --- Lab -------------------------------------------------------------------
  function simulate(spA, countA, spB, countB, n, seed) {
    const rng = makeRng(seed == null ? 1 : seed);
    const armyA = { species: spA, count: countA }, armyB = { species: spB, count: countB };
    const tally = { A: 0, B: 0, draw: 0, ticks: 0 };
    for (let i = 0; i < n; i++) {
      const r = fight(armyA, armyB, { rng, log: false });
      tally[r.winner]++; tally.ticks += r.ticks;
    }
    return { A: tally.A / n, B: tally.B / n, draw: tally.draw / n, ticks: tally.ticks / n };
  }

  // Win rate of row species vs column species. mode:
  //   'dice'   both budgets rolled on the d20 independently (the real game)
  //   'budget' both sides get the fixed budget opts.budget
  //   '1v1'    one unit each
  function heatmap(n, seed, mode, opts) {
    mode = mode || 'dice'; opts = opts || {};
    const rng = makeRng(seed == null ? 1 : seed);
    const S = SPECIES.length;
    const M = [];
    for (let i = 0; i < S; i++) {
      const row = [];
      for (let j = 0; j < S; j++) {
        let w = 0, d = 0;
        for (let k = 0; k < n; k++) {
          let ca, cb;
          if (mode === '1v1') { ca = 1; cb = 1; }
          else if (mode === 'budget') { ca = headcount(SPECIES[i], opts.budget || 12); cb = headcount(SPECIES[j], opts.budget || 12); }
          else { ca = headcount(SPECIES[i], die(20, rng)); cb = headcount(SPECIES[j], die(20, rng)); }
          const r = fight({ species: SPECIES[i], count: ca }, { species: SPECIES[j], count: cb }, { rng, log: false });
          if (r.winner === 'A') w++; else if (r.winner === 'draw') d++;
        }
        row.push({ win: w / n, draw: d / n });
      }
      M.push(row);
    }
    return { ids: SPECIES.map(s => s.id), matrix: M };
  }

  return { MAX_TICKS, makeRng, die, headcount, makeArmy, rollDice, armyFromDice, label, fight, simulate, heatmap };
})();

if (typeof module !== 'undefined') module.exports = Engine;
