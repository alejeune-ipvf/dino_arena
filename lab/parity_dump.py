"""Dump a parity fixture from the JS engine: seeds + armies -> outcome + narration.

The Apollo port (utils/dino_arena/engine.py in staff_production_app) replays this file in
a unit test, so the two engines can never drift apart silently. Regenerate whenever
species.js or engine.js change, then copy the output over Apollo's
tests/fixtures/dino_arena_parity.json.

Usage:  python lab/parity_dump.py [output.json] [--cases 300]
"""
import argparse
import json
import random
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LAB_HTML = ROOT / "lab" / "lab.html"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default=str(ROOT / "lab" / "parity.json"))
    ap.add_argument("--cases", type=int, default=300)
    args = ap.parse_args()

    picker = random.Random(20260911)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(LAB_HTML.as_uri())
        pg.wait_for_function("window.LAB_READY === true")
        species = pg.evaluate("() => SPECIES")
        ids = [s["id"] for s in species]
        cases = []
        for i in range(args.cases):
            seed = picker.randrange(1, 2**31)
            a, b_ = picker.choice(ids), picker.choice(ids)
            na, nb = picker.randint(1, 20), picker.randint(1, 20)
            if i % 7 == 0:          # a slice of pure duels, the marquee matchups
                na = nb = 1
            r = pg.evaluate(
                "([a, na, b, nb, seed]) => Engine.fight({species: SPECIES_BY_ID[a], count: na},"
                " {species: SPECIES_BY_ID[b], count: nb}, {seed})",
                [a, na, b_, nb, seed])
            cases.append({
                "seed": seed, "a": a, "na": na, "b": b_, "nb": nb,
                "winner": r["winner"], "how": r["how"], "ticks": r["ticks"],
                "A": r["A"], "B": r["B"],
                "log": [[e["tick"], e["side"], e["kind"], e["text"]] for e in r["log"]],
            })
        b.close()

    out = Path(args.out)
    out.write_text(json.dumps({"generated_from": "alejeune-ipvf/dino_arena js/engine.js",
                               "species": species, "cases": cases}, indent=1, ensure_ascii=False),
                   encoding="utf-8")
    print(f"{len(cases)} cases -> {out}")


if __name__ == "__main__":
    main()
