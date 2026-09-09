# Dino Arena

Two players, two dice each, one fight. Whoever holds the hill wins the round.

Born from the eternal coffee-machine question ("T-rex vs Stegosaurus, who wins?") and its
natural conclusion: the ankylosaurus is king of the hill.

## Play

Open `index.html` in any browser (phone works, no server, no install). Pass-and-play.

Each round:

1. Both players roll a **d20** (the budget) and a **d12** (the species).
   Headcount = budget ÷ the species' bulk, rounded, minimum one. A 12 buys 3 T-rex, 12 velociraptors or 24 compys.
2. Each player may **reroll one die once** (the first to decide alternates every round).
3. **Fight.** The referee narrates it tick by tick. The winner holds the hill.

First to three hills wins the match. A ladder of hills held per player is kept in the browser.

## The roster

Hollywood edition, all-stars, twelve species. The whole game lives in `js/species.js`:
change a number, reload the page, argue.

Every species has five numbers and one signature move:

| stat | meaning |
|---|---|
| bulk | cost per head on the budget die |
| bite | damage per unit per tick, before the target's armor |
| hp | hit points per unit |
| armor | flat reduction on every incoming bite; a bite that does not exceed it does nothing |
| pack | Lanchester exponent: strength = bite × N^pack. Coordinated packs sit above 1, giants below |
| morale | fraction of the army lost before it routs; herbivores never rout |

Flyers cannot be reached by ground units (a quarter damage, leapers excepted) but can never
hold the hill: they must win before the clock runs out. A natural 20 always finds the eye and
ignores armor.

## The lab

The Lab tab settles debates: any matchup, thousands of fights, a win bar, and a "who beats
whom" heatmap with a king score per species. The same engine also runs headlessly for tuning:

```
python lab/lab.py                              # heatmaps + rankings
python lab/lab.py --fight trex 1 stego 1       # one narrated duel + win rates
python lab/shots.py                            # screenshots of the app + JS smoke test
```

Both need Python with Playwright and its Chromium (no Node required).

## Design notes

- One engine, `js/engine.js`, used by the game and the lab. Fights are pooled Lanchester
  ticks with random initiative, morale, armor thresholds and per-species signature hooks.
- The fun is the narration and the upset, not the rules depth. Rules fit in three sentences.
- Balance targets: the ankylosaurus is king (top of the ladder but beatable), the swarms scale
  with budget, every species has at least a fighting chance in the real-dice game.

## Roadmap

- Hidden tactic after both armies are known (charge / hold / ambush, simultaneous reveal).
- A shared terrain die per round.
- Faction draft: build your own d12 from a bigger bench (Therizinosaurus, Giganotosaurus, Mosasaurus, Indominus).
- Campaign mode with survivors carrying over.
- A printable one-page pocket version for phone-less play.
