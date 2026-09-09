"""Dino Arena tuning lab: runs the JS engine in headless Chromium (Playwright).

Usage:
  python lab/lab.py                              # heatmaps (dice, budget 12, 1v1) + rankings
  python lab/lab.py --n 300                      # fights per cell
  python lab/lab.py --only dice                  # a single heatmap
  python lab/lab.py --fight trex 3 raptor 12     # one narrated fight + win rates
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LAB_HTML = ROOT / "lab" / "lab.html"

TITLES = {
    "dice": "real game: both budgets rolled on the d20",
    "budget": "fixed budget 12 each",
    "1v1": "one unit each",
}


def open_page(p):
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(LAB_HTML.as_uri())
    pg.wait_for_function("window.LAB_READY === true")
    if errors:
        raise SystemExit("JS errors while loading the engine:\n" + "\n".join(errors))
    return b, pg


def show_heatmap(hm, title):
    ids = hm["ids"]
    M = hm["matrix"]
    short = [i[:6] for i in ids]
    print(f"\n== {title} (row beats column, %) ==")
    print("        " + " ".join(f"{s:>6}" for s in short) + "   mean")
    means = []
    for i, rid in enumerate(ids):
        cells = []
        for j in range(len(ids)):
            cells.append("     -" if i == j else f"{M[i][j]['win']*100:6.0f}")
        off = [M[i][j]["win"] for j in range(len(ids)) if j != i]
        mean = sum(off) / len(off)
        means.append((rid, mean))
        print(f"{short[i]:>7} " + " ".join(cells) + f"  {mean*100:5.0f}")
    n_off = len(ids) * (len(ids) - 1)
    draws = sum(M[i][j]["draw"] for i in range(len(ids)) for j in range(len(ids)) if i != j) / n_off
    print(f"   draws: {draws*100:.1f}%")
    print("   ranking: " + " > ".join(f"{r}({m*100:.0f})" for r, m in sorted(means, key=lambda x: -x[1])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--fight", nargs=4, metavar=("SPA", "NA", "SPB", "NB"))
    ap.add_argument("--only", choices=list(TITLES))
    args = ap.parse_args()

    with sync_playwright() as p:
        b, pg = open_page(p)
        if args.fight:
            spa, na, spb, nb = args.fight
            js = f"""() => {{
              const A = {{species: SPECIES_BY_ID['{spa}'], count: {int(na)}}};
              const B = {{species: SPECIES_BY_ID['{spb}'], count: {int(nb)}}};
              const one = Engine.fight(A, B, {{seed: {args.seed}}});
              const sim = Engine.simulate(A.species, A.count, B.species, B.count, {args.n * 10}, {args.seed});
              return {{one, sim, la: Engine.label(A), lb: Engine.label(B)}};
            }}"""
            r = pg.evaluate(js)
            print(f"{r['la']} vs {r['lb']}")
            for e in r["one"]["log"]:
                side = e["side"] or "-"
                print(f"  t{e['tick']:>2} [{side}] {e['text']}")
            s = r["sim"]
            print(f"\n  over {args.n*10} fights: A {s['A']*100:.0f}%  B {s['B']*100:.0f}%  draw {s['draw']*100:.0f}%  avg ticks {s['ticks']:.1f}")
        else:
            modes = [args.only] if args.only else list(TITLES)
            for mode in modes:
                hm = pg.evaluate(f"() => Engine.heatmap({args.n}, {args.seed}, '{mode}', {{budget: 12}})")
                show_heatmap(hm, TITLES[mode])
        b.close()


if __name__ == "__main__":
    main()
