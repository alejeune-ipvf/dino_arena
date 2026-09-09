"""Drive the referee app in headless Chromium and save screenshots for eyeballing.

Usage:  python lab/shots.py [output_dir]      (default: lab/shots/, git-ignored)
Also prints any JS error the page raised, so it doubles as a smoke test.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "lab" / "shots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 400, "height": 820}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console." + m.type + ": " + m.text) if m.type == "error" else None)
        pg.goto(INDEX.as_uri())

        # --- arena: one full round on a phone-sized viewport
        pg.fill("#name-a", "Alex")
        pg.fill("#name-b", "Mathis")
        pg.click("[data-action=start]")
        pg.screenshot(path=str(OUT / "01_roll.png"), full_page=True)

        pg.click('[data-roll="0"]')
        pg.wait_for_timeout(900)
        pg.click('[data-roll="1"]')
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / "02_decide.png"), full_page=True)

        pg.click('[data-decide=budget][data-idx="0"]')
        pg.wait_for_timeout(900)
        pg.click('[data-decide=keep][data-idx="1"]')
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "03_fight_ready.png"), full_page=True)

        pg.click("[data-action=fight]")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=str(OUT / "04_fight_live.png"), full_page=True)
        pg.click("[data-action=skip]")
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT / "05_result.png"), full_page=True)
        st = pg.evaluate("() => { const s = DinoArena.state(); return {phase: s.phase, score: s.score, winner: s.result.winner, how: s.result.how, a: s.armies[0].count + ' ' + s.armies[0].species.id, b: s.armies[1].count + ' ' + s.armies[1].species.id}; }")
        print("round state:", st)

        # --- lab
        pg.click("nav [data-tab=lab]")
        pg.select_option("#lab-sp-a", "trex")
        pg.fill("#lab-n-a", "1")
        pg.select_option("#lab-sp-b", "stego")
        pg.fill("#lab-n-b", "1")
        pg.click("[data-action=simulate]")
        pg.wait_for_timeout(300)
        pg.click("[data-action=watch]")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "06_lab.png"), full_page=True)

        # --- heatmap on a wider viewport
        pg.set_viewport_size({"width": 900, "height": 900})
        pg.click("[data-action=heatmap]")
        pg.wait_for_selector("table.heatmap", timeout=120000)
        pg.wait_for_timeout(200)
        pg.locator("#heatmap").screenshot(path=str(OUT / "07_heatmap.png"))

        # --- roster
        pg.click("nav [data-tab=roster]")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / "08_roster.png"), full_page=True)

        # --- arena on desktop width (two-column cards)
        pg.click("nav [data-tab=arena]")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / "09_desktop_arena.png"), full_page=True)

        b.close()

    print(f"screenshots in {OUT}")
    if errors:
        print("JS ERRORS:")
        for e in errors:
            print("  ", e)
        sys.exit(1)
    print("no JS errors")


if __name__ == "__main__":
    main()
