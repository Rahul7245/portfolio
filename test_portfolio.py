#!/usr/bin/env python3
"""Headless Playwright smoke/QA tests for the portfolio (no build step, file:// URL).

Usage:
    .venv/bin/python test_portfolio.py [extra_screenshot_dir ...]

Screenshots always go to ./screenshots/ and are copied into any extra dirs given.
Exit code 0 = all checks passed.
"""
import math
import pathlib
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
URL = (ROOT / "index.html").as_uri()
SHOT_DIR = ROOT / "screenshots"
EXTRA_DIRS = [pathlib.Path(p) for p in sys.argv[1:]]
EMAIL = "maheshwarirohit14@gmail.com"
PROJECTS = [   # scene index order (data.js)
    ("is-it-you", "Is It You?"),
    ("all-star-cricket-2", "All Star Cricket 2"),
    ("face-hero", "Face Hero"),
    ("remote-for-unity", "Remote for Unity"),
    ("sorry-world", "Sorry! World"),
    ("alstom-vr", "Alstom VR"),
    ("fishing-game", "FishingGame"),
    ("dark-fantasy-slots", "Dark Fantasy Slots"),
]
STATION = 8          # Achievements comet = scene body after the projects
NBODIES = 9
NAV_ORDER = ["sorry-world", "is-it-you", "all-star-cricket-2", "fishing-game", "alstom-vr", "face-hero", "remote-for-unity",
             "dark-fantasy-slots", "achievements"]
PLAY_URL = "https://play.google.com/store/apps/details?id=com.gameberry.sorry.card.board.game"
# visible (alpha) bbox of each sprite as % of the 2048 canvas [l, t, r, b] — measured with magick (see AGENT_NOTES)
SPRITE_BBOX = {
    "is-it-you": [19.5, 17.4, 83.6, 81.4], "all-star-cricket-2": [13.3, 11.7, 87.3, 87.5],
    "face-hero": [8.2, 23.0, 91.6, 76.8], "remote-for-unity": [8.0, 20.9, 91.6, 78.7],
    "sorry-world": [9.6, 8.0, 90.0, 91.8], "alstom-vr": [12.9, 7.8, 86.9, 91.8], "achievements": [6.4, 10.5, 89.8, 88.9],
    "fishing-game": [10.7, 8.0, 89.3, 92.0], "dark-fantasy-slots": [8.0, 21.3, 92.0, 78.9],
}
VIDEOS = {
    "is-it-you": ["assets/projects/is-it-you-trailer.webm"],
    "all-star-cricket-2": ["assets/projects/all-star-cricket-2-trailer.mp4"],
    "face-hero": ["assets/projects/face-hero.mov"],
    "remote-for-unity": ["assets/projects/remote-1.mp4", "assets/projects/remote-2.mp4"],
    "sorry-world": [],
    "alstom-vr": [],
    "fishing-game": [],
    "dark-fantasy-slots": [],
}
LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def shot(page, name, full_page=False):
    SHOT_DIR.mkdir(exist_ok=True)
    path = SHOT_DIR / f"{name}.png"
    # full-page shots at CSS scale: the long mobile page at 2x DPR exceeds SwiftShader's capture limit
    page.screenshot(path=str(path), full_page=full_page, scale="css" if full_page else "device")
    for d in EXTRA_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, d / path.name)
    return path


def attach_error_capture(page):
    errors = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: (errors.append(f"pageerror: {e}"), print(f"  !! pageerror: {e}\n{getattr(e, 'stack', '')}", flush=True)))
    # Media elements cancel their own range requests (ERR_ABORTED) when paused/removed — not an error.
    page.on("requestfailed", lambda r: None if ("/assets/projects/" in r.url and "ERR_ABORTED" in (r.failure or ""))
            else errors.append(f"requestfailed: {r.url} {r.failure}"))
    return errors



SHIP_JS = """() => { const inf = window.__portfolio.sceneInfo(), s = inf.ship;
    s.rz = inf.rocket.z; s.pz = s.orbit && s.orbit.planet != null ? inf.sprites[s.orbit.planet].z : null;
    const c = document.getElementById('callout'), t = document.getElementById('callout-title');
    const cs = getComputedStyle(t), body = getComputedStyle(c.querySelector('.callout-body'));
    s.card = !c.hidden && cs.visibility === 'visible' && parseFloat(getComputedStyle(c).opacity) > 0.01 && parseFloat(body.opacity) > 0.01;
    s.cardTitle = t.textContent; s.arrows = getComputedStyle(document.getElementById('callout-next')).display !== 'none' &&
        getComputedStyle(document.getElementById('callout-next')).visibility === 'visible';
    return s; }"""


def ship_state(page):
    return page.evaluate(SHIP_JS)


def track_flight(page, label, dest, mid_shot=None, timeout_s=60, shot_when=None, orbit_shot=None, orbit_planet=None):
    """Poll the ship during a flight until it has landed AND the landing bump finished.
    Takes a screenshot mid-flight when mid_shot is given (default: on the dashed route, progress 0.25-0.85)."""
    samples, shot_taken, t_end = [], False, time.time() + timeout_s
    while time.time() < t_end:
        s = ship_state(page)
        samples.append(s)
        want = s["traveling"] and s["phaseProgress"] is not None and (
            shot_when(s) if shot_when else (s["phase"] == "travel" and 0.3 <= s["phaseProgress"] <= 0.75))
        if mid_shot and not shot_taken and want:
            shot(page, mid_shot)
            shot_taken = True
        if (orbit_shot and s["phase"] == "orbit" and 0.4 <= s["phaseProgress"] <= 0.75 and getattr(track_flight, "_orb", None) != orbit_shot
                and (orbit_planet is None or s["orbit"]["planet"] == orbit_planet)):
            shot(page, orbit_shot)
            track_flight._orb = orbit_shot
        if not s["traveling"] and not s["landing"] and s["at"] == dest:
            break
        page.wait_for_timeout(60)
    return samples, shot_taken


TWO_PI = 2 * math.pi


def _orbit_angle(sample):
    o = sample["orbit"]; c = o["center"]; n = o["normal"]; p = sample["world"]
    v = [p[i] - c[i] for i in range(3)]
    # basis in the orbit plane
    a = [1, 0, 0] if abs(n[0]) < 0.9 else [0, 1, 0]
    e1 = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]
    l = math.sqrt(sum(x * x for x in e1)); e1 = [x / l for x in e1]
    e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]
    return math.atan2(sum(v[i] * e2[i] for i in range(3)), sum(v[i] * e1[i] for i in range(3)))


def check_slingshot(label, samples):
    """Orbit -> slingshot -> travel checks for one journey (from sampled QA state)."""
    moving = [s for s in samples if s["traveling"]]
    log = next((s["log"] for s in reversed(samples) if s.get("log")), None) or []
    orbits = [e for e in log if e["kind"] == "orbit"]
    travels = [e for e in log if e["kind"] == "travel"]
    hops = len(moving[0]["nodes"]) - 1 if moving and moving[0]["nodes"] else 0
    check(f"{label}: timeline = orbit 1.2 s + travel 2.5 s per hop (+0.3 s settle)",
          len(orbits) == hops and len(travels) == hops and all(abs(e["T"] - 1.2) < 1e-6 for e in orbits) and all(abs(e["T"] - 2.5) < 1e-6 for e in travels),
          f"{[(e['kind'], e['planet'], e['T']) for e in log]} total={sum(e['T'] for e in log) + 0.3:.1f}s")
    # orbit completes before travel begins: phases strictly alternate and each travel starts after its orbit's full duration
    order_ok = [e["kind"] for e in log] == ["orbit", "travel"] * hops
    gaps = [round(log[k + 1]["startedAt"] - log[k]["startedAt"], 2) for k in range(0, len(log) - 1, 2)]
    check(f"{label}: each orbit completes (≥0.75 rev, full 1.2 s) before its travel begins",
          order_ok and all(g >= 1.19 for g in gaps) and all(e["sweep"] >= 0.75 * TWO_PI for e in orbits),
          f"orbit->travel gaps={gaps}s sweeps={[round(math.degrees(e['sweep'])) for e in orbits]}deg")
    # off-screen warp (rocket not yet in view) runs an orbit in a frame or two: judge the sampled geometry on
    # normal-speed samples only, and skip the sampled-sweep check when that first orbit was warped
    orb = [s for s in moving if s["phase"] == "orbit" and s["warp"]["k"] <= 1.001]
    warped = [s for s in moving if s["phase"] == "orbit" and (s["warp"]["k"] > 1.001 or s["warp"]["goal"])]
    cruise = [s for s in orb if s["phaseProgress"] > 0.32]
    radii = [s["orbit"]["radiusNow"] / s["orbit"]["rho"] for s in cruise]
    check(f"{label}: orbit is a circular arc (|ship - centre| = orbit radius)",
          (len(cruise) >= 2 or (warped and len(cruise) <= 1)) and all(abs(r - 1) < 0.03 for r in radii), f"r/rho={[round(r, 3) for r in radii[:8]]}")
    # angle actually swept around the planet, unwrapped from sampled world positions (first orbit)
    first_planet = orb[0]["orbit"]["planet"] if orb else None
    seq = [s for s in orb if s["orbit"]["planet"] == first_planet and s["log"] and len(s["log"]) == 1]
    swept = 0.0
    for a, b in zip(seq, seq[1:]):
        d = _orbit_angle(b) - _orbit_angle(a)
        d = (d + math.pi) % TWO_PI - math.pi
        swept += abs(d)
    first_warped = any(s["warp"]["goal"] for s in moving)      # flight started off-screen: its first orbit ran at warp
    check(f"{label}: rocket position sweeps around the planet during the orbit phase" + (" (warped off-screen: n/a)" if first_warped else ""),
          first_warped or math.degrees(swept) > 200, f"sampled sweep={math.degrees(swept):.0f}deg over {len(seq)} frames (frames miss the ends)")
    mid = [s for s in orb if 0.2 <= s["phaseProgress"] <= 0.8]
    check(f"{label}: card hidden partway through the orbit", (bool(mid) or first_warped) and not any(s["card"] for s in mid + warped), f"{len(mid)} mid-orbit samples")
    exits = {}
    for s in samples:
        e = s.get("lastExit")
        if e and s["traveling"]:
            exits[(e["planet"], e["dest"])] = e
    ok = bool(exits) and all(e["continuity"] > 0.99 and e["towardDest"] > 0.98 and 0.75 < e["speedAfter"] / e["speedBefore"] < 1.33 for e in exits.values())
    check(f"{label}: slingshot exit smooth — velocity continuous and aimed at the destination",
          ok, "; ".join(f"{k}: cont={e['continuity']:.4f} aim={e['towardDest']:.4f} v {e['speedBefore']:.1f}->{e['speedAfter']:.1f}" for k, e in exits.items()))
    trav = [s for s in moving if s["phase"] == "travel" and 0 < s["phaseProgress"] < 0.12]
    al = []
    for s in trav:
        v = s["vel"]; vl = math.sqrt(sum(x * x for x in v))
        dest = next((e["dest"] for e in exits.values()), None)
        if vl < 1e-6 or dest is None:
            continue
        al.append(vl)
    check(f"{label}: ship is moving fast right after the exit (flung out, not restarted)",
          not trav or (al and max(al) > 5), f"speeds={[round(x, 1) for x in al]}")



PIXEL_JS = """async ([b64, cx, cy, r]) => {
    // analyse a screenshot region in-page (data-URL image -> 2D canvas; no extra Python deps)
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, dpr = c.width / innerWidth;
    let n = 0, chroma = 0, lum = 0, lum2 = 0, bright = 0, gray = 0;
    const X = cx * dpr, Y = cy * dpr, R = r * dpr;
    for (let y = Math.max(0, Math.floor(Y - R)); y < Math.min(c.height, Y + R); y++)
      for (let x = Math.max(0, Math.floor(X - R)); x < Math.min(c.width, X + R); x++) {
        if ((x - X) ** 2 + (y - Y) ** 2 > R * R) continue;
        const i = (y * c.width + x) * 4, R_ = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R_, G, B), mn = Math.min(R_, G, B), L = 0.299 * R_ + 0.587 * G + 0.114 * B;
        n++; chroma += mx - mn; lum += L; lum2 += L * L; if (L > 185) bright++; if (mx - mn < 18) gray++;
      }
    const m = lum / n;
    return {n, chroma: chroma / n, lumStd: Math.sqrt(Math.max(0, lum2 / n - m * m)), bright, grayFrac: gray / n};
}"""


def region_stats(page, cx, cy, r):
    import base64
    b64 = base64.b64encode(page.screenshot()).decode()
    return page.evaluate(PIXEL_JS, [b64, cx, cy, r])


def check_new_art(page, label, mobile):
    """Generated art: fixed-angle hero sprite planets (DOM), rocket sprite, navigator."""
    info = page.evaluate("() => window.__portfolio.sceneInfo()")
    sp = info["sprites"]
    check(f"{label}: 6 planet + 1 comet hero sprites loaded from assets/planets/ (2048px PNG)",
          len(sp) == NBODIES and all(s["state"] == "sprite" for s in sp) and
          all(s["src"].startswith("assets/planets/planet_") for s in sp[:6]) and sp[STATION]["src"] == "assets/planets/comet_achievements.png" and
          page.evaluate("() => [...document.querySelectorAll('.planet-img')].every(i => i.naturalWidth === 2048)"),
          str([(s["id"], s["state"], s["src"]) for s in sp]))
    check(f"{label}: no textured Three.js planet spheres / embedded.js (sprites only)",
          info["kinds"].get("planet-sprite") == NBODIES and "textures" not in info and
          not page.evaluate("() => !!window.EMBEDDED_ASSETS || [...document.scripts].some(s => s.src.includes('embedded.js'))"),
          f"kinds={info['kinds']}")
    fx = [s["overlays"] for s in sp]
    check(f"{label}: per-planet animated overlays from config (cricket: 2 floodlights + valve; Alstom: headlight + sparkle)",
          fx == [0, 3, 0, 0, 0, 2, 0, 0, 0] and page.evaluate("""() => { const f = [...document.querySelectorAll('[data-project="all-star-cricket-2"] .fx')];
              return f.length === 3 && f.every(e => getComputedStyle(e).animationName !== 'none'); }"""), f"overlays={fx}")
    page.evaluate("() => scrollTo(0, 0)")
    stats = []
    for i in range(NBODIES):
        pr = page.evaluate("i => window.__portfolio.project(i)", i)
        on = pr["visible"] and 0 < pr["x"] < page.viewport_size["width"] and 0 < pr["y"] < page.viewport_size["height"]
        if not on:
            continue
        st = region_stats(page, pr["x"], pr["y"], pr["r"] * 0.55)
        stats.append((i, st))
    # Alstom VR is silver-grey moon rock by design (art brief): colour check skipped for it
    ok = bool(stats) and all(st["chroma"] > 45 and st["lumStd"] > 18 and st["grayFrac"] < 0.25 for i, st in stats if i != 5)
    check(f"{label}: on-screen planets show colourful sprite art (not solid/gray)", ok,
          "; ".join(f"p{i}: chroma={st['chroma']:.0f} lumStd={st['lumStd']:.0f} gray={st['grayFrac']:.2f}" for i, st in stats))
    rk = info["rocket"]
    check(f"{label}: rocket is the PNG sprite (DOM, depth-sorted with the planets)",
          rk["loaded"] and info["kinds"].get("rocket-sprite") == 1 and rk["z"] > 0, f"{rk} kinds={info['kinds']}")
    # idle bob: ±6 px over ~4.5 s (sample the sprite's screen y)
    ys = []
    for _ in range(12):
        ys.append(page.evaluate("() => window.__portfolio.sceneInfo().sprites[3].bobPx"))
        page.wait_for_timeout(200)
    check(f"{label}: idle bob within ±6 px and moving", max(abs(y) for y in ys) <= 6.01 and max(ys) - min(ys) > 0.3, f"bobPx={[round(y, 2) for y in ys]}")
    shadow = page.evaluate("() => { const e = document.querySelector('.planet-sprite .planet-shadow'); const r = e.getBoundingClientRect(); return {w: r.width, h: r.height}; }")
    check(f"{label}: soft elliptical shadow under each planet", shadow["w"] > shadow["h"] * 3 and page.evaluate("() => document.querySelectorAll('.planet-shadow').length") == NBODIES, f"{shadow}")
    # hover tilt (mouse only)
    TB = 4 if not mobile else 1     # desktop: Sorry! World (on screen at the top of the tall space)
    pr = page.evaluate("i => window.__portfolio.project(i)", TB)
    if not mobile:
        page.mouse.move(pr["x"], pr["y"]); page.mouse.move(pr["x"] + pr["r"] * 0.7, pr["y"] - pr["r"] * 0.7, steps=4)
        page.wait_for_timeout(300)
        t = page.evaluate("i => window.__portfolio.sceneInfo().sprites[i].tilt", TB)
        import re as _re
        ang = [float(a) for a in _re.findall(r"rotate[XY]\((-?[\d.]+)deg\)", t)]
        check(f"{label}: hover tilt follows the mouse (≤6°, scale 1.05)", len(ang) == 2 and all(0 < abs(a) <= 6 for a in ang) and "scale(1.05)" in t, t)
        page.mouse.move(4, pr["y"] + 300); page.wait_for_timeout(900)
        back = page.evaluate("i => getComputedStyle(document.querySelectorAll('.planet-tilt')[i]).transform", TB)
        check(f"{label}: tilt returns smoothly to rest after leaving", back in ("none", "matrix(1, 0, 0, 1, 0, 0)"), back)
    else:
        check(f"{label}: no hover tilt on touch devices", all(s["tilt"] == "" for s in page.evaluate("() => window.__portfolio.sceneInfo().sprites")))
    nav = page.evaluate("""() => { const im = document.querySelector('[data-slot="character-navigator"] .character-img.is-on'); if (!im) return null;
        const r = im.getBoundingClientRect(), cs = getComputedStyle(im);
        return {src: im.getAttribute('src'), loaded: im.complete && im.naturalWidth, h: r.height, w: r.width, left: r.left,
                bottom: innerHeight - r.bottom, anim: cs.animationName, dur: cs.animationDuration, alt: im.alt,
                glow: cs.filter, svg: !!document.querySelector('[data-slot="character-navigator"] svg')}; }""")
    want_h = 88 if mobile else 120
    sel_narr = page.evaluate("() => { const b = [...window.PORTFOLIO.projects, window.PORTFOLIO.station][window.__portfolio.selected()]; return b && b.narrator; }")
    check(f"{label}: HUD navigator bottom-left ({want_h}px tall), bobbing, glow, wearing the selected planet's narrator costume",
          nav and nav["src"] == sel_narr and nav["loaded"] == 1536 and abs(nav["h"] - want_h) < 4 and
          nav["left"] < 40 and nav["anim"] == "navigator-bob" and nav["dur"] == "2s" and "drop-shadow" in nav["glow"] and not nav["svg"] and nav["alt"],
          f"{nav}")
    st = region_stats(page, nav["left"] + nav["w"] / 2, page.viewport_size["height"] - nav["bottom"] - nav["h"] / 2, nav["h"] * 0.35)
    check(f"{label}: navigator pixels visible on screen", st["chroma"] > 40 and st["lumStd"] > 20, f"chroma={st['chroma']:.0f} lumStd={st['lumStd']:.0f}")


def check_layering(label, samples):
    """2.5D back/front split: on a planet orbit the rocket's DOM z-index drops below the planet sprite on the
    far half (ship deeper than the planet centre) and rises above it on the near half."""
    orb = [s for s in samples if s["phase"] == "orbit" and s["orbit"] and s["orbit"]["planet"] is not None and s["pz"] is not None]
    back = [s for s in orb if s["orbit"]["depthVsCenter"] > 0.2]
    front = [s for s in orb if s["orbit"]["depthVsCenter"] < -0.2]
    ok = back and front and all(s["rz"] < s["pz"] for s in back) and all(s["rz"] > s["pz"] for s in front)
    check(f"{label}: rocket renders behind the planet sprite on the far half of the orbit, in front on the near half", ok,
          f"orbit frames={len(orb)} far={len(back)} near={len(front)} far-z={[ (s['rz'], s['pz']) for s in back[:3]]} near-z={[(s['rz'], s['pz']) for s in front[:3]]}")


def check_flight(label, samples, dest, mid_shot, shot_taken, route_set=None):
    moving = [s for s in samples if s["traveling"]]
    xs = [s["screen"]["x"] for s in samples]; ys = [s["screen"]["y"] for s in samples]
    travel_px = max(xs) - min(xs) + max(ys) - min(ys)
    check(f"{label}: spacecraft animates (moves across screen over several frames)",
          len(moving) >= 4 and travel_px > 120, f"frames={len(moving)} span={travel_px:.0f}px")
    if route_set is not None and moving:
        nodes = moving[0]["nodes"]
        hops = list(zip(nodes, nodes[1:]))
        check(f"{label}: journey only hops between route-connected planets", all(tuple(sorted(h)) in route_set for h in hops), f"nodes={nodes}")
    check_slingshot(label, samples)
    check_layering(label, samples)
    shown = [s for s in samples if (s["traveling"] or s["landing"]) and s["card"]]
    check(f"{label}: callout card hidden for the whole flight + landing",
          bool(moving) and not shown, f"visible-in-flight frames={len(shown)}/{len(moving)}")
    end = samples[-1]
    check(f"{label}: ship lands ON the destination's pad and stops",
          not end["traveling"] and end["at"] == dest and end["dockDist"] < 0.05 and 0.4 < end["padDist"] < 0.7,
          f"at={end['at']} dockDist={end['dockDist']:.3f} aboveDeck={end['padDist']:.2f}")
    check(f"{label}: landing bump 1.0 -> 1.15 -> 1.0", 1.10 < end["bumpPeak"] <= 1.1501 and abs(end["scale"] - 1) < 1e-6,
          f"peak={end['bumpPeak']:.3f} now={end['scale']:.3f}")
    if mid_shot:
        check(f"{label}: mid-flight screenshot captured", shot_taken, mid_shot)

def no_h_overflow(page):
    return page.evaluate(
        "() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")


def active_id(page):
    return page.evaluate("() => document.activeElement && (document.activeElement.id || document.activeElement.className)")


def wait_selected(page, i, timeout=4000):
    page.wait_for_function("i => window.__portfolio.selected() === i", arg=i, timeout=timeout)


def planet_point(page, i):
    """Projected centre of planet i, plus whether that planet's sprite hit zone is the top element there."""
    return page.evaluate("""i => {
        const s = window.__portfolio.project(i);
        const c = document.getElementById('scene').getBoundingClientRect();
        const x = c.left + s.x, y = c.top + s.y;
        const onScreen = s.visible && x > 8 && y > 8 && x < innerWidth - 8 && y < innerHeight - 8;
        const el = onScreen ? document.elementFromPoint(x, y) : null;
        const sp = el && el.classList.contains('planet-hit') ? el.closest('.planet-sprite') : null;
        return {x, y, onScreen, hitCanvas: !!sp && +sp.dataset.index === i};
    }""", i)


def modal_state(page):
    return page.evaluate("""() => {
        const b = document.getElementById('modal-backdrop'), m = document.getElementById('modal');
        const t = document.getElementById('modal-title');
        const r = m.getBoundingClientRect();
        return {open: !b.hidden, project: m.dataset.project, title: t ? t.textContent : null,
                rect: {top: r.top, bottom: r.bottom, left: r.left, width: r.width}};
    }""")


def clip_shot(page, name, clip):
    """Screenshot of a page region (clamped to the viewport), saved like shot()."""
    SHOT_DIR.mkdir(exist_ok=True)
    vw, vh = page.viewport_size["width"], page.viewport_size["height"]
    x, y = max(0, clip["x"]), max(0, clip["y"])
    c = {"x": x, "y": y, "width": min(vw - x, clip["width"] - (x - clip["x"])), "height": min(vh - y, clip["height"] - (y - clip["y"]))}
    path = SHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path), clip=c)
    for d in EXTRA_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, d / path.name)
    return path


SPRITE_RECTS_JS = """() => [...document.querySelectorAll('.planet-sprite')].map(e => { const r = e.getBoundingClientRect();
    return {id: e.dataset.project, i: +e.dataset.index, x: r.left, y: r.top, w: r.width}; })"""


def sprite_boxes(page):
    """Visible (alpha-bbox) box of every sprite on screen, by project id."""
    out = {}
    for r in page.evaluate(SPRITE_RECTS_JS):
        b = SPRITE_BBOX[r["id"]]
        out[r["id"]] = {"l": r["x"] + r["w"] * b[0] / 100, "t": r["y"] + r["w"] * b[1] / 100,
                        "r": r["x"] + r["w"] * b[2] / 100, "b": r["y"] + r["w"] * b[3] / 100, "i": r["i"], "w": r["w"], "x0": r["x"], "y0": r["y"]}
    return out


def sprite_shapes(page):
    """Ellipses approximating each sprite's visible silhouette (inscribed in its alpha bbox)."""
    shapes = []
    for k, b in sprite_boxes(page).items():
        shapes.append((k, (b["l"] + b["r"]) / 2, (b["t"] + b["b"]) / 2, (b["r"] - b["l"]) / 2, (b["b"] - b["t"]) / 2))
    return shapes


def covered_frac(rect, shapes, only=None, skip=()):
    """Fraction of a 12x6 point grid over rect that falls inside any of the ellipses."""
    n = hit = 0
    for gx in range(12):
        for gy in range(6):
            x = rect["left"] + rect["width"] * (gx + 0.5) / 12; y = rect["top"] + rect["height"] * (gy + 0.5) / 6
            n += 1
            for k, cx, cy, rx, ry in shapes:
                if (only and not k.startswith(only)) or k in skip:
                    continue
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    hit += 1; break
    return hit / n


def check_no_overlaps(page, label):
    shapes = sprite_shapes(page)
    labs = page.evaluate("""() => [...document.querySelectorAll('.planet-label')].filter(l => getComputedStyle(l).visibility === 'visible')
        .map(l => { const r = l.getBoundingClientRect(); return {id: l.id, left: r.left, top: r.top, width: r.width, height: r.height}; })""")
    bad = [(l["id"], round(covered_frac(l, shapes), 2)) for l in labs if covered_frac(l, shapes) > 0.0]
    check(f"{label}: planet labels do not overlap any sprite", labs and not bad, f"{len(labs)} labels; overlapping={bad}")
    # labels must not overlap each other either
    ov = []
    for a in range(len(labs)):
        for b in range(a + 1, len(labs)):
            A, B = labs[a], labs[b]
            if A["left"] < B["left"] + B["width"] and B["left"] < A["left"] + A["width"] and A["top"] < B["top"] + B["height"] and B["top"] < A["top"] + A["height"]:
                ov.append((A["id"], B["id"]))
    check(f"{label}: planet labels do not overlap each other", not ov, str(ov))


def check_card_clear(page, label, i):
    """The desktop card must not cover its own planet (and should not sit on others)."""
    pid = page.evaluate("() => window.__portfolio.bodies")[i]
    shapes = sprite_shapes(page)
    rect = page.evaluate("() => { const r = document.getElementById('callout').getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height}; }")
    own = covered_frac(rect, shapes, only=pid)
    other = covered_frac(rect, shapes, skip=(pid,))
    labs = page.evaluate("""() => [...document.querySelectorAll('.planet-label')].filter(l => getComputedStyle(l).visibility === 'visible')
        .map(l => { const r = l.getBoundingClientRect(); return {id: l.id, l: r.left, r: r.right, t: r.top, b: r.bottom}; })""")
    hidden = [l["id"] for l in labs if rect["left"] < l["r"] and l["l"] < rect["left"] + rect["width"] and rect["top"] < l["b"] and l["t"] < rect["top"] + rect["height"]]
    check(f"{label}: card for {pid} does not overlap its planet sprite (others: ≤10%) or any planet label", own == 0 and other <= 0.10 and not hidden,
          f"own={own:.2f} others={other:.2f} covers labels={hidden} card={ {k: round(v) for k, v in rect.items()} }")


def zoom_state(page):
    return page.evaluate("""n => [...Array(n).keys()].map(j => { const p = window.__portfolio.project(j);
        return {fill: 2 * p.r / innerWidth, on: p.x + p.r > 0 && p.x - p.r < innerWidth && p.y + p.r > 0 && p.y - p.r < innerHeight}; })""", NBODIES)


def check_award_case(page, label, pid):
    cs = page.evaluate("""() => { const b = document.getElementById('modal-body'), pill = b.querySelector('.award-pill.is-banner');
        const sum = b.querySelector('.case-summary'), head = b.querySelector('.case-head');
        const link = b.querySelector('.case-actions a[target="_blank"]'), role = b.querySelector('.case-head .role-line');
        return {pill: pill && pill.textContent, svg: !!(pill && pill.querySelector('svg.trophy-svg')), emoji: /\\u{1F3C6}/u.test(b.textContent),
                order: !!(pill && head.nextElementSibling === pill && pill.nextElementSibling === sum),
                gold: pill ? getComputedStyle(pill).backgroundImage : '', role: role && role.textContent,
                link: link && link.getAttribute('href'), rel: link && link.rel, gallery: b.querySelectorAll('.case-gallery').length,
                summary: sum.textContent}; }""")
    want = {"sorry-world": "#1 in the US at launch", "alstom-vr": "Alstom Gold Award"}[pid]
    check(f"{label}: {pid} case study: gold achievement banner (SVG trophy, no emoji) at the top of the description",
          cs["pill"] == want and cs["svg"] and not cs["emoji"] and cs["order"] and "linear-gradient" in cs["gold"], str(cs))
    if pid == "sorry-world":
        check(f"{label}: Sorry! World: resume role 'Senior Game Developer', Google Play link, no invented media",
              cs["role"] == "Senior Game Developer" and cs["link"] == PLAY_URL and "noopener" in cs["rel"] and cs["gallery"] == 0, str(cs))
        page.wait_for_timeout(300)
        shot(page, f"{label}_09_sorry_case_study_pill")
    else:
        check(f"{label}: Alstom VR: consultant role + 'Solo developer', IMAT one-liner, no invented media",
              cs["role"] == "Senior Unity Developer (Consultant) · Solo developer" and "IMAT" in cs["summary"] and cs["gallery"] == 0, str(cs))


ACH_JS = """() => [...document.querySelectorAll('#modal .ach-card')].map(c => ({
    title: c.querySelector('.ach-title').textContent, project: c.querySelector('.ach-project').textContent,
    goto: +c.dataset.goto, medal: !!c.querySelector('.ach-medal svg.medal-svg circle'), tag: c.tagName}))"""


def check_comet_head(label, cm):
    check(f"{label}: comet click area / label / glow anchored on the HEAD (not the whole image)",
          abs(cm["hit"][0] - cm["head"]["x"]) < 3 and abs(cm["hit"][1] - cm["head"]["y"]) < 3 and cm["hit"][2] < 2.4 * cm["head"]["r"] + 4,
          f"hit={[round(v) for v in cm['hit']]} head=({cm['head']['x']:.0f},{cm['head']['y']:.0f}) r={cm['head']['r']:.0f}")


def check_achievements_panel(page, label, mobile, viewport):
    ms = modal_state(page)
    ach = page.evaluate(ACH_JS)
    gold = page.evaluate("() => document.getElementById('modal').classList.contains('is-gold') && getComputedStyle(document.getElementById('modal')).borderTopColor")
    check(f"{label}: Achievements panel opens (gold modal variant) with 2 medal cards",
          ms["open"] and ms["project"] == "achievements" and ms["title"] == "Achievements" and gold == "rgb(242, 193, 74)" and
          [(a["title"], a["project"], a["goto"]) for a in ach] == [("#1 in the US at launch", "Sorry! World", 4), ("Alstom Gold Award", "Alstom VR (solo project)", 5)] and
          all(a["medal"] and a["tag"] == "BUTTON" for a in ach), f"modal={ms['project']} gold={gold} cards={ach}")
    if mobile:
        vh = viewport["height"]
        try:
            page.wait_for_function("h => Math.abs(document.getElementById('modal').getBoundingClientRect().bottom - h) < 2", arg=vh, timeout=5000)
        except Exception:
            pass
        ms = modal_state(page)
        check(f"{label}: Achievements panel is a bottom sheet", abs(ms["rect"]["bottom"] - vh) < 2 and abs(ms["rect"]["width"] - viewport["width"]) < 2, f"rect={ms['rect']}")


def run_achievements(page, label, mobile, viewport):
    """Achievements comet, panel, medal badges/satellites, constellation; Alstom train life cues."""
    page.evaluate("() => scrollTo(0, 0)")
    page.wait_for_timeout(600)          # tall space: let the camera pan back to the top (next frames) before measuring
    info = page.evaluate("() => window.__portfolio.sceneInfo()")
    badges = page.evaluate("""() => { const sp = document.querySelector('.planet-sprite.is-station'); if (!sp) return null;
        const r = sp.getBoundingClientRect();
        return [...sp.querySelectorAll('.station-badge')].map(b => { const q = b.getBoundingClientRect();
            return {id: b.dataset.achievement, x: ((q.left + q.width / 2) - r.left) / r.width * 100, y: ((q.top + q.height / 2) - r.top) / r.width * 100,
                    svg: !!b.querySelector('svg.medal-svg'), shine: getComputedStyle(b.querySelector('.badge-shine'), '::after').animationName}; }); }""")
    slots = [(61.82, 72.27), (78.47, 72.27)]     # comet medal slots (2D Artist result)
    check(f"{label}: comet overlays the 2 code-rendered badges on the artist's medal slots, with a shine sweep",
          badges and [b["id"] for b in badges] == ["sorry-us-1", "alstom-gold"] and all(b["svg"] for b in badges) and
          all(abs(b["x"] - sx) < 1.5 and abs(b["y"] - sy) < 1.5 for b, (sx, sy) in zip(badges, slots)) and all(b["shine"] == "badge-shine" for b in badges),
          str(badges))
    orb = info["orbiters"]
    check(f"{label}: gold medal satellites orbit only the award planets; the orbiting train + rail ring are gone",
          [[o["kind"] for o in x] for x in orb] == [[], [], [], [], ["medal"], ["medal"], [], [], []] and "rail" not in info and
          page.evaluate("() => !document.querySelector('.rail-svg, .orbiter-train')"), str([[o["kind"] for o in x] for x in orb]))
    both = page.evaluate("i => [window.__portfolio.project(i), window.__portfolio.sceneInfo().constellation]", STATION)   # same frame
    hd, consts = both[0], both[1]
    import re as _re
    m0 = [_re.match(r"M(-?[\d.]+) (-?[\d.]+)", c["d"]) for c in consts]
    check(f"{label}: golden constellation lines start at the comet head and run to the 2 award planets",
          [c["planet"] for c in consts] == [4, 5] and all(m and abs(float(m.group(1)) - hd["x"]) < 3 and abs(float(m.group(2)) - hd["y"]) < 3 for m in m0)
          and not info["constLit"], f"{consts} head=({hd['x']:.1f},{hd['y']:.1f})")
    cm = page.evaluate("""() => { const sp = document.querySelector('.planet-sprite.is-comet'), img = sp.querySelector('.planet-img');
        const sparks = [...sp.querySelectorAll('.spark')];
        return {sparks: sparks.length, anim: sparks.length && getComputedStyle(sparks[0]).animationName, shimmer: getComputedStyle(img).animationName,
                origin: getComputedStyle(img).transformOrigin, head: window.__portfolio.project(+sp.dataset.index), hit: (() => { const h = sp.querySelector('.planet-hit').getBoundingClientRect(); return [h.left + h.width / 2, h.top + h.height / 2, h.width]; })()}; }""")
    check(f"{label}: comet tail life: shimmer on the sprite (pivot at the head) + ≤40 gold sparkle particles shedding",
          0 < cm["sparks"] <= 40 and cm["anim"] == "spark-shed" and cm["shimmer"] == "comet-shimmer", str(cm))
    if not mobile:
        # settle: the camera may still be panning back to the top of the tall space (SwiftShader frame rate)
        try:
            page.wait_for_function("""i => { const sp = document.querySelector('.planet-sprite.is-station'), h = sp.querySelector('.planet-hit').getBoundingClientRect(),
                p = window.__portfolio.project(i); return Math.abs(h.left + h.width / 2 - p.x) < 3 && Math.abs(h.top + h.height / 2 - p.y) < 3; }""", arg=STATION, timeout=6000)
        except Exception:
            pass
        cm["head"] = page.evaluate("i => window.__portfolio.project(i)", STATION)
        cm["hit"] = page.evaluate("() => { const h = document.querySelector('.planet-sprite.is-station .planet-hit').getBoundingClientRect(); return [h.left + h.width / 2, h.top + h.height / 2, h.width]; }")
        dbg = page.evaluate("() => ({sy: scrollY, stage: document.getElementById('world-stage').getBoundingClientRect().top, world: document.getElementById('world').offsetHeight, space: window.__portfolio.space(), anim: document.body.className})")
        if abs(cm["hit"][1] - cm["head"]["y"]) >= 3:
            print("  comet-head debug:", dbg, flush=True)
        check_comet_head(label, cm)

    al = page.evaluate("""() => [...document.querySelectorAll('.planet-sprite[data-project="alstom-vr"] .fx')].map(f => ({cls: f.className, x: f.style.left, y: f.style.top,
        anim: getComputedStyle(f).animationName}))""")
    check(f"{label}: Alstom train life cues: headlight glow pulse at the nose + sparkle puff (config overlays)",
          [a["cls"] for a in al] == ["fx fx-pulse", "fx fx-puff"] and [a["anim"] for a in al] == ["fx-pulse", "fx-puff"], str(al))

    if not mobile:
        # constellation brightens while the station is hovered
        pt = planet_point(page, STATION)
        op0 = page.evaluate("() => +getComputedStyle(document.querySelector('.const-line')).opacity")
        page.mouse.move(pt["x"], pt["y"]); page.wait_for_timeout(700)
        lit = page.evaluate("() => window.__portfolio.sceneInfo().constLit")
        op1 = page.evaluate("() => +getComputedStyle(document.querySelector('.const-line')).opacity")
        check(f"{label}: hovering the station brightens the constellation lines", lit and op1 > op0 + 0.4, f"opacity {op0:.2f} -> {op1:.2f}")
        shot(page, f"{label}_10_station_hover_constellation")
        page.mouse.move(6, 600); page.wait_for_timeout(500)

        # comet drifts slowly when idle (desktop) and holds still while hovered
        c0 = page.evaluate("() => window.__portfolio.sceneInfo().comet"); page.wait_for_timeout(1500)
        c1 = page.evaluate("() => window.__portfolio.sceneInfo().comet")
        check(f"{label}: comet drifts along its arc when idle (desktop)", not c1["hold"] and abs(c1["drift"][0] - c0["drift"][0]) > 0.005 and c1["driftT"] > c0["driftT"],
              f"{c0['drift']} -> {c1['drift']}")
        pt = planet_point(page, STATION)
        page.mouse.move(pt["x"], pt["y"]); page.wait_for_timeout(300)
        h0 = page.evaluate("() => window.__portfolio.sceneInfo().comet"); page.wait_for_timeout(1200)
        h1 = page.evaluate("() => window.__portfolio.sceneInfo().comet")
        check(f"{label}: comet holds still while hovered (stays clickable)", h1["hold"] and h1["driftT"] == h0["driftT"] and h1["drift"] == h0["drift"], f"{h0} / {h1}")
        bx = sprite_boxes(page)["achievements"]
        clip_shot(page, f"{label}_11_comet_closeup", {"x": bx["x0"] - 20, "y": bx["y0"] - 10, "width": bx["w"] + 40, "height": bx["w"] + 30})
        page.mouse.move(6, 600); page.wait_for_timeout(400)
        page.evaluate("""i => { const p = window.__portfolio.project(i), sp = window.__portfolio.space();
            scrollTo(0, Math.max(sp.top, Math.min(sp.top + sp.px, scrollY + p.y - innerHeight * 0.5))); }""", 5)   # Alstom: mid space
        page.wait_for_timeout(600)
        bx = sprite_boxes(page)["alstom-vr"]
        clip_shot(page, f"{label}_12_alstom_train_planet", {"x": bx["x0"] - 10, "y": bx["y0"] - 10, "width": bx["w"] + 20, "height": bx["w"] + 20})
        page.evaluate("() => scrollTo(0, 0)"); page.wait_for_timeout(600)
        # station label (keyboard): opens the panel; Escape returns focus to the card button (the label hides once selected)
        page.focus("#planet-achievements"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
        opened = modal_state(page)["project"] == "achievements"
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
        f0 = active_id(page)
        try:
            page.wait_for_function("() => document.activeElement && document.activeElement.id === 'callout-open'", timeout=30000)
        except Exception:
            pass
        check(f"{label}: station label opens Achievements via keyboard; Escape keeps focus visible (Project list while flying, then the card button)",
              opened and f0 in ("menu-button", "callout-open") and active_id(page) == "callout-open", f"opened={opened} focus {f0} -> {active_id(page)}")
        # Project list -> Achievements entry opens the panel
        page.click("#menu-button")
        page.locator(f'#menu-list .menu-item[data-index="{STATION}"]').click()
        page.wait_for_timeout(350)
        check(f"{label}: dropdown 'Achievements' entry opens the Achievements panel", modal_state(page)["project"] == "achievements")
        page.keyboard.press("Escape"); page.wait_for_timeout(150)

        # click the station sprite itself -> panel opens immediately (rocket flies there underneath)
        page.evaluate("() => scrollTo(0, 0)")
        pt = planet_point(page, STATION)
        check(f"{label}: station sprite is clickable (hit zone on top)", pt["onScreen"] and pt["hitCanvas"], str(pt))
        page.mouse.click(pt["x"], pt["y"]); page.wait_for_timeout(450)
        check(f"{label}: clicking the comet selects it (rocket flies there)", page.evaluate("() => window.__portfolio.selected()") == STATION)
        s0 = page.evaluate("() => window.__portfolio.sceneInfo().comet"); page.wait_for_timeout(1000)
        s1 = page.evaluate("() => window.__portfolio.sceneInfo().comet")
        check(f"{label}: comet holds still while selected / the rocket flies to it", s1["hold"] and s1["drift"] == s0["drift"], f"{s0} / {s1}")
        check_narrator(page, label, "achievements", mobile)
        check_achievements_panel(page, label, mobile, viewport)
        shot(page, f"{label}_08_achievements_panel")
        # medal card -> closes the panel, flies to the planet and selects it
        page.locator('#modal .ach-card[data-goto="5"]').click()
        page.wait_for_timeout(250)
        # Alstom is further down the tall space: the stage scrolls there first, then the rocket takes off
        page.wait_for_function("() => window.__portfolio.sceneInfo().ship.to === 5", timeout=15000)
        ms = modal_state(page)
        ship = ship_state(page)
        check(f"{label}: achievement card closes the panel, selects Alstom VR and flies the rocket there",
              not ms["open"] and page.evaluate("() => window.__portfolio.selected()") == 5 and ship["to"] == 5 and (ship["traveling"] or ship["at"] == 5),
              f"open={ms['open']} to={ship['to']} traveling={ship['traveling']}")
        track_flight(page, label, 5, timeout_s=60)
        page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=10000)
        c = page.evaluate("""() => ({title: document.getElementById('callout-title').textContent,
            pill: (document.querySelector('#callout-award .award-pill') || {}).textContent, role: document.getElementById('callout-role').textContent,
            roleShown: !document.getElementById('callout-role').hidden, focus: document.activeElement.id})""")
        check(f"{label}: Alstom VR card after landing: gold 'Alstom Gold Award' pill + 'Solo developer', focus on Open case study",
              c["title"] == "Alstom VR" and c["pill"] == "Alstom Gold Award" and "Solo developer" in c["role"] and c["roleShown"] and c["focus"] == "callout-open", str(c))
        check_card_clear(page, label, 5)
        shot(page, f"{label}_13_alstom_card_after_medal_link")
    else:
        # ←/→ order: ... Remote for Unity -> Dark Fantasy Slots -> Achievements (last) -> wraps to Sorry! World
        for _ in range(NBODIES + 1):
            if page.evaluate("() => window.__portfolio.selected()") == 7:
                break
            page.click("#callout-next")
        page.click("#callout-next")
        check(f"{label}: → after Dark Fantasy Slots goes to the Achievements comet (last in the order)",
              page.evaluate("() => window.__portfolio.selected()") == STATION and page.text_content("#callout-title") == "Achievements")
        try:
            page.wait_for_function("""i => { const p = window.__portfolio.project(i); const d = 2 * p.r / innerWidth;
                return d > 0.5 && d < 0.72 && Math.abs(p.x - innerWidth / 2) < 30; }""", arg=STATION, timeout=20000)
        except Exception:
            pass
        z = zoom_state(page)
        check(f"{label}: comet static on mobile", page.evaluate("() => window.__portfolio.sceneInfo().comet.drift").count(0) == 3 or
              all(abs(v) < 1e-3 for v in page.evaluate("() => window.__portfolio.sceneInfo().comet.drift")))
        try:
            page.wait_for_function("""i => { const sp = document.querySelector('.planet-sprite.is-comet'), h = sp.querySelector('.planet-hit').getBoundingClientRect(),
                p = window.__portfolio.project(i); return Math.abs(h.left + h.width / 2 - p.x) < 3 && Math.abs(h.top + h.height / 2 - p.y) < 3; }""", arg=STATION, timeout=8000)
        except Exception:
            pass
        check_comet_head(label, page.evaluate("""() => { const sp = document.querySelector('.planet-sprite.is-comet'), h = sp.querySelector('.planet-hit').getBoundingClientRect();
            return {head: window.__portfolio.project(+sp.dataset.index), hit: [h.left + h.width / 2, h.top + h.height / 2, h.width]}; }"""))
        check(f"{label}: zoomed into the Achievements comet head (~60% width), others off-screen",
              0.5 < z[STATION]["fill"] < 0.72 and not any(z[j]["on"] for j in range(NBODIES) if j != STATION), f"fill={z[STATION]['fill']:.2f}")
        try:
            page.wait_for_function("() => getComputedStyle(document.querySelector('#callout .callout-body')).opacity === '1'", timeout=30000)
        except Exception:
            pass
        page.wait_for_timeout(400)
        shot(page, f"{label}_08_station")
        check(f"{label}: station card offers 'Open achievements'", page.text_content("#callout-open-text") == "Open achievements")
        page.click("#callout-open"); page.wait_for_timeout(400)
        check_achievements_panel(page, label, mobile, viewport)
        check_narrator(page, label, "achievements", mobile)
        shot(page, f"{label}_09_achievements_sheet")
        page.locator('#modal .ach-card[data-goto="4"]').click(); page.wait_for_timeout(300)
        check(f"{label}: achievement card closes the sheet and selects Sorry! World",
              not modal_state(page)["open"] and page.evaluate("() => window.__portfolio.selected()") == 4)
        track_flight(page, label, 4, timeout_s=60)


ASTEROID_JS = """i => { const sp = document.querySelector(`.planet-sprite[data-index="${i}"]`), r = sp.getBoundingClientRect();
    const q = e => { const b = sp.querySelector(e).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    const lab = document.querySelectorAll('.planet-label')[i].getBoundingClientRect();
    const inf = window.__portfolio.sceneInfo(), ends = [];
    inf.routeEnds.forEach(R => { if (R.a === i) ends.push(R.pa); if (R.b === i) ends.push(R.pb); });
    return {id: sp.dataset.project, x0: r.left, y0: r.top, w: r.width, labTop: lab.top, shadow: q('.planet-shadow'), glow: q('.planet-glow'),
            hit: q('.planet-hit'), ends: ends, pad: inf.pads[i].screen, bob: inf.sprites[i].bobPx}; }"""


def asteroid_metrics(page, i):
    m = page.evaluate(ASTEROID_JS, i)
    b = SPRITE_BBOX[m["id"]]
    m["art"] = [m["x0"] + m["w"] * b[0] / 100, m["y0"] + m["w"] * b[1] / 100, m["x0"] + m["w"] * b[2] / 100, m["y0"] + m["w"] * b[3] / 100]
    a = m["art"]
    m["gaps"] = {"label": m["labTop"] - a[3], "shadow": (m["shadow"][1] + m["shadow"][3]) / 2 - a[3], "glow": m["glow"][3] - a[3]}
    m["glowAspect"] = (m["glow"][2] - m["glow"][0]) / max(1, m["glow"][3] - m["glow"][1])
    return m


def check_asteroids(label, M, page, mobile=False):
    """QA FAIL fix: label / shadow / glow / hit area / route dots / pad fit the elongated asteroid sprites."""
    ref = M[0]
    tbl = {M[i]["id"]: {k: round(v) for k, v in M[i]["gaps"].items()} for i in M}
    for i in (2, 3):
        m, a = M[i], M[i]["art"]
        name = m["id"]
        check(f"{label}: {name}: label sits the same gap under the rock as on Is It You? (±6 px)",
              abs(m["gaps"]["label"] - ref["gaps"]["label"]) <= 6, f"gaps below the rock bottom (px): {tbl}")
        check(f"{label}: {name}: shadow + glow hug the rock (no lower than on Is It You?), glow is a wide flat ellipse",
              -0.2 * (a[3] - a[1]) <= m["gaps"]["shadow"] <= ref["gaps"]["shadow"] + 4 and m["gaps"]["glow"] <= ref["gaps"]["glow"] + 4 and
              m["glowAspect"] >= 1.35 and abs(ref["glowAspect"] - 1) < 0.05, f"{tbl} glow w/h {name}={m['glowAspect']:.2f} iiy={ref['glowAspect']:.2f}")
        h = m["hit"]
        check(f"{label}: {name}: click area covers the full rock width with no empty band below it",
              h[0] <= a[0] + 2 and h[2] >= a[2] - 2 and h[3] <= a[3] + 6, f"hit={[round(x) for x in h]} art={[round(x) for x in a]}")
        if not mobile:
            # route lines don't bob; the sprite does (±6 px, + = up): compare against the un-bobbed rock
            cx, cy, rx, ry = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2 + m["bob"], (a[2] - a[0]) / 2, (a[3] - a[1]) / 2
            d = [math.hypot((e["x"] - cx) / rx, (e["y"] - cy) / ry) for e in m["ends"]]
            check(f"{label}: {name}: route end dots sit on the rock's edge (ellipse distance 0.8–1.4)",
                  d and all(0.8 <= x <= 1.4 for x in d), f"dist={[round(x, 2) for x in d]}")
        if name == "remote-for-unity":
            want = (m["x0"] + m["w"] * 0.76, m["y0"] + m["w"] * 0.39)
            dist = math.hypot(m["pad"]["x"] - want[0], m["pad"]["y"] - want[1])
            check(f"{label}: Hardware Lab landing pad sits on the rock's top surface (measured point)", dist <= 12,
                  f"pad={m['pad']} surface point=({want[0]:.0f},{want[1]:.0f}) off={dist:.1f}px")


def check_case_content(page, label, pid):
    c = page.evaluate("""pid => { const b = document.getElementById('modal-body'), d = window.PORTFOLIO.projects.find(p => p.id === pid);
        const icon = b.querySelector('.case-head .sprite-icon img');
        return {eyebrow: b.querySelector('.case-head .eyebrow').textContent, role: (b.querySelector('.case-head .role-line') || {}).textContent || null,
                points: [...b.querySelectorAll('.case-points li')].map(l => l.textContent), links: [...b.querySelectorAll('.case-actions a')].map(a => [a.textContent.replace(' (opens in a new tab)', ''), a.getAttribute('href')]),
                icon: icon && icon.getAttribute('src'), iconLoaded: icon && icon.complete && icon.naturalWidth, sprite: window.PLANET_SPRITES[pid].src,
                ask: /Ask me/.test(b.textContent) || !!b.querySelector('.case-actions .btn-mint'), data: d}; }""", pid)
    d = c["data"]
    ok_head = (c["eyebrow"] == d.get("eyebrow")) if not d.get("company") else (d["company"] in c["eyebrow"] and d["dates"] in c["eyebrow"] and c["role"] == d["role"])
    check(f"{label}: {pid}: header shows company · dates + role (resume), and the planet's own sprite as the icon",
          ok_head and c["icon"] == c["sprite"] and c["iconLoaded"], f"eyebrow={c['eyebrow']!r} role={c['role']!r} icon={c['icon']}")
    check(f"{label}: {pid}: 3–4 short 'What I did' pointers (≤ 8 words each; up to 8 pointers for the user-supplied FishingGame / Slots lists), links as buttons, no 'Ask me about' button",
          3 <= len(c["points"]) <= (8 if d.get("gallery") and not d.get("company") else 4) and c["points"] == d["points"] and all(len(x.split()) <= 8 for x in c["points"]) and
          [l[1] for l in c["links"]] == [l["href"] for l in d.get("links", [])] and not c["ask"], f"points={c['points']} links={c['links']}")


NARR_JS = """() => { const n = document.getElementById('modal-narrator'), img = n.querySelector('img'), bub = n.querySelector('.narrator-bubble');
    const m = document.getElementById('modal').getBoundingClientRect(), r = img.getBoundingClientRect(), br = bub.getBoundingClientRect();
    const bird = {l: r.left + r.width * .17, r: r.left + r.width * .90, t: r.top + r.height * .15, b: r.top + r.height * .94};
    const hits = [];
    document.querySelectorAll('#modal-body p, #modal-body h2, #modal-body h3, #modal-body li, #modal-body video, #modal-body a, #modal-body button, #modal-close')
      .forEach(e => { let q = e.getBoundingClientRect(); if (!q.width) return;
        const st = e.closest('.shots-strip');      // gallery strip scrolls horizontally: only its visible part counts
        if (st) { const s = st.getBoundingClientRect(); q = {left: Math.max(q.left, s.left), right: Math.min(q.right, s.right), top: q.top, bottom: q.bottom};
                  if (q.right <= q.left) return; }
        const sc = document.getElementById('modal-body').getBoundingClientRect();
        if (e.id !== 'modal-close' && (q.bottom <= sc.top || q.top >= sc.bottom)) return;     // scrolled out of view (clipped)
        [['bird', bird], ['bubble', {l: br.left, r: br.right, t: br.top, b: br.bottom}]].forEach(([k, a]) => {
          if (a.l < q.right && q.left < a.r && a.t < q.bottom && q.top < a.b) hits.push(k + ':' + (e.id || e.className || e.tagName) + ':' + e.textContent.slice(0, 24)); }); });
    return {hidden: n.hidden, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth, bubble: bub.textContent, birdH: bird.b - bird.t,
            imgPE: getComputedStyle(img).pointerEvents, wrapPE: getComputedStyle(n).pointerEvents, bubPE: getComputedStyle(bub).pointerEvents,
            anim: getComputedStyle(n).animationName, idle: getComputedStyle(img).animationName, hits: hits,
            modal: [m.left, m.top, m.right, m.bottom], bird: [bird.l, bird.t, bird.r, bird.b]}; }"""


def check_narrator(page, label, pid, mobile, reduced=False):
    page.wait_for_timeout(900)
    n = page.evaluate(NARR_JS)
    exp = page.evaluate("""pid => { const b = [...window.PORTFOLIO.projects, window.PORTFOLIO.station].find(x => x.id === pid);
        return {src: b.narrator, text: b.kind === 'comet' ? b.title : (b.oneLiner || b.title)}; }""", pid)
    m, b = n["modal"], n["bird"]
    if mobile:
        place = abs((b[3] - b[1]) / 0.79 - 120) < 6 and b[1] < m[1] < b[3] + 30
    else:
        place = 185 <= n["birdH"] <= 245 and b[0] < m[2] < b[2] and b[3] > m[3] - 160
    check(f"{label}: {pid} panel narrator: its costume, bottom-right {'peeking over the sheet' if mobile else '(~200-240 px)'}, tagline bubble, pops in + bobs",
          not n["hidden"] and n["src"] == exp["src"] and n["loaded"] == 1536 and n["bubble"] == exp["text"] and place and
          (reduced or (n["anim"] == "narr-pop" and n["idle"] == "narr-bob")), f"{ {k: n[k] for k in ('src', 'bubble', 'birdH', 'anim', 'idle')} } bird={[round(x) for x in b]} modal={[round(x) for x in m]}")
    check(f"{label}: {pid} narrator never covers text, tags, video, buttons or the close button; only its bubble takes pointer events",
          not n["hits"] and n["imgPE"] == "none" and n["wrapPE"] == "none" and n["bubPE"] == "auto", f"hits={n['hits'][:4]}")


def check_contact(page, label, mobile, viewport):
    page.evaluate("() => scrollTo(0, 0)")
    page.click("#contact-link"); page.wait_for_timeout(500)
    c = page.evaluate("""() => { const b = document.getElementById('modal-body');
        return {key: document.getElementById('modal').dataset.project, title: (document.getElementById('modal-title') || {}).textContent,
                rows: [...b.querySelectorAll('.contact-row')].map(r => ({row: r.dataset.row, icon: !!r.querySelector('.contact-ico svg'), label: r.querySelector('.contact-label').textContent,
                  hrefs: [...r.querySelectorAll('a.contact-value')].map(a => a.getAttribute('href')), copies: r.querySelectorAll('[data-copy]').length,
                  aria: [...r.querySelectorAll('button')].every(x => x.getAttribute('aria-label')) })),
                narrator: document.getElementById('modal-narrator').hidden}; }""")
    want = [("email", ["mailto:" + EMAIL], 1), ("linkedin", ["https://www.linkedin.com/in/rahul-maheshwari-14070b157"], 0), ("phone", ["tel:+971545204481", "tel:+919602001030"], 2)]
    check(f"{label}: Contact opens a panel (not mailto) with Email / LinkedIn / Phone rows: icon, label, linked value, actions",
          c["key"] == "contact" and c["title"] == "Contact" and [(r["row"], r["hrefs"], r["copies"]) for r in c["rows"]] == want and
          all(r["icon"] and r["aria"] for r in c["rows"]), str(c["rows"]))
    page.locator('.contact-row[data-row="email"] [data-copy]').click(); page.wait_for_timeout(350)
    t = page.evaluate("() => { const t = document.getElementById('toast'); return {text: t.textContent, on: t.classList.contains('is-on'), op: +getComputedStyle(t).opacity}; }")
    check(f"{label}: Copy shows a 'Copied' toast", t["text"] == "Copied" and t["on"], str(t))
    shot(page, f"{label}_14_contact_panel")
    inside = True
    for _ in range(9):
        page.keyboard.press("Tab")
        inside = inside and page.evaluate("() => document.getElementById('modal').contains(document.activeElement)")
    check(f"{label}: Contact panel traps focus", inside)
    if mobile:
        vh = viewport["height"]
        try:
            page.wait_for_function("h => Math.abs(document.getElementById('modal').getBoundingClientRect().bottom - h) < 2", arg=vh, timeout=5000)
        except Exception:
            pass
        ms = modal_state(page)
        check(f"{label}: Contact panel is a bottom sheet", abs(ms["rect"]["bottom"] - vh) < 2 and abs(ms["rect"]["width"] - viewport["width"]) < 2, f"{ms['rect']}")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check(f"{label}: Escape closes Contact; focus returns to the Contact button", not modal_state(page)["open"] and active_id(page) == "contact-link", active_id(page))


def run_asteroids_landed(browser):
    """Screenshots + checks with the rocket landed on both asteroids (desktop)."""
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = attach_error_capture(page)
    page.goto(URL, wait_until="load")
    page.wait_for_function("() => window.__portfolio", timeout=10000)
    page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return !s.traveling && !s.landing && s.at === 0; }", timeout=30000)
    for i, pid, name in ((2, "face-hero", "15_facehero_landed"), (3, "remote-for-unity", "16_hardware_landed")):
        page.evaluate(f"() => document.getElementById('planet-{pid}').click()")
        track_flight(page, "landed", i, timeout_s=60)
        page.mouse.move(4, 880); page.wait_for_timeout(700)
        st = ship_state(page)
        bx = sprite_boxes(page)[pid]
        clip_shot(page, f"desktop_1440_{name}", {"x": bx["x0"] - 30, "y": bx["y0"] - 30, "width": bx["w"] + 60, "height": bx["w"] + 50})
        r = page.evaluate("() => window.__portfolio.sceneInfo().rocket")
        a = asteroid_metrics(page, i)["art"]
        check(f"landed: rocket parked on {pid}'s pad, on the rock (not floating in empty space)",
              st["at"] == i and st["dockDist"] < 0.05 and a[0] < r["screen"]["x"] < a[2] and a[1] - 40 < r["screen"]["y"] < (a[1] + a[3]) / 2,
              f"rocket={r['screen']} art={[round(x) for x in a]}")
    check("landed: no console errors", not errors, "; ".join(errors[:4]))
    ctx.close()


def check_space(page, label):
    """Desktop tall space: sticky stage, camera pans with the scroll, fixed body sizes, mini-map, hint."""
    sp = page.evaluate("() => window.__portfolio.space()")
    H = page.evaluate("() => innerHeight")
    total = page.evaluate("() => document.getElementById('world').offsetHeight")
    check(f"{label}: space is a tall scroll (~2-2.6 viewport heights) on desktop", sp["px"] > 0 and 1.9 <= total / H <= 2.7,
          f"px={sp['px']} world={total} H={H}")
    check(f"{label}: body sizes fixed by the 4-planet reference (camera distance = reference fit)",
          abs(sp["info"]["dist"] - sp["info"]["refDist"]) < 1e-6, str(sp["info"]))
    check(f"{label}: 'scroll to explore' hint + mini-map with one dot per body",
          page.is_visible("#scroll-hint") and page.is_visible("#space-map") and page.locator(".space-map-dot").count() == NBODIES)
    hud_bottom = page.evaluate("() => document.getElementById('hud').getBoundingClientRect().bottom")
    seen, sizes, stuck = set(), {}, True
    r0 = page.evaluate("i => window.__portfolio.project(i).r", 1)
    for k in range(6):
        page.evaluate("t => scrollTo(0, t)", round(sp["top"] + sp["px"] * k / 5))
        page.wait_for_timeout(450)
        st = page.evaluate("() => document.getElementById('world-stage').getBoundingClientRect().top")
        stuck = stuck and abs(st) < 1.5
        for i in range(NBODIES):
            pr = page.evaluate("i => window.__portfolio.project(i)", i)
            if hud_bottom < pr["y"] < H - 40:
                seen.add(i); sizes.setdefault(i, []).append(pr["r"])
    check(f"{label}: stage stays pinned (sticky) for the whole space scroll", stuck)
    check(f"{label}: scrolling the space brings every body into view below the HUD", len(seen) == NBODIES, str(sorted(seen)))
    var = max((max(v) / min(v) for v in sizes.values() if len(v) > 1), default=1)
    check(f"{label}: bodies keep (nearly) the same size while the space scrolls", var < 1.15, f"max ratio {var:.3f}")
    check(f"{label}: scroll hint goes once the user scrolls", page.evaluate("() => document.getElementById('scroll-hint').classList.contains('is-gone')"))
    page.evaluate("t => scrollTo(0, t)", round(sp["top"] + sp["px"] + 400)); page.wait_for_timeout(400)
    shot(page, f"{label}_15_space_into_page")
    below = page.evaluate("() => document.getElementById('world-stage').getBoundingClientRect().bottom")
    check(f"{label}: past the bottom of space the page continues (stage scrolls away)", below < H - 300, f"stage bottom={below}")
    page.evaluate("() => scrollTo(0, 0)"); page.wait_for_timeout(500)
    # selecting an off-screen body scrolls the stage to it first, then the rocket flies
    slots = PROJECTS.index(("dark-fantasy-slots", "Dark Fantasy Slots"))
    page.evaluate("i => document.querySelector('.space-map-dot[data-index=\"' + i + '\"]').click()", slots)
    page.wait_for_function("t => scrollY > t", arg=sp["top"] + sp["px"] * 0.6, timeout=15000)
    page.wait_for_timeout(1200)
    pr = page.evaluate("i => window.__portfolio.project(i)", slots)
    check(f"{label}: mini-map dot scrolls the off-screen body into view and the rocket flies there",
          hud_bottom < pr["y"] < H and page.evaluate("() => window.__portfolio.selected()") == slots, str(pr))
    shot(page, f"{label}_16_space_bottom_slots")
    page.wait_for_function("i => { const s = window.__portfolio.sceneInfo().ship; return s.at === i && !s.traveling && !s.landing; }", arg=slots, timeout=90000)
    page.evaluate("() => scrollTo(0, 0)"); page.wait_for_timeout(300)
    page.evaluate("() => { document.activeElement.blur(); }")
    # back to Is It You? (top) so the rest of the run starts from the approved overview
    page.evaluate("() => document.querySelector('.space-map-dot[data-index=\"0\"]').click()")
    page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return window.__portfolio.selected() === 0 && s.at === 0 && !s.traveling && !s.landing; }", timeout=90000)
    page.evaluate("() => scrollTo(0, 0)"); page.wait_for_timeout(600)


def check_gallery(page, label, mobile):
    """Screenshot gallery + lightbox (Sorry! World: 7 portrait store shots; Slots: 2 landscape)."""
    page.evaluate("() => { const b = document.querySelector('.card-open[data-index=\"4\"]'); b.scrollIntoView(); b.click(); }")
    page.wait_for_selector(".modal-backdrop.is-open"); page.wait_for_timeout(400)
    g = page.evaluate("""() => { const imgs = [...document.querySelectorAll('#modal-body .shots-strip img')];
        const strip = document.querySelector('#modal-body .shots-strip'), sr = strip.getBoundingClientRect(), it = strip.querySelector('.shot').getBoundingClientRect();
        const acts = [...document.querySelectorAll('#modal-body .case-actions a')].map(a => a.textContent.trim().replace(/ \(opens.*$/, ''));
        return { n: imgs.length, lazy: imgs.every(i => i.loading === 'lazy' && i.decoding === 'async' && i.getAttribute('width') && i.getAttribute('height')),
                 portrait: document.querySelectorAll('#modal-body .shot.is-portrait').length, perView: sr.width / it.width,
                 cap: (document.querySelector('#modal-body .shots-caption') || {}).textContent, snap: getComputedStyle(strip).scrollSnapType,
                 acts: acts }; }""")
    want = 1.3 if mobile else 3
    check(f"{label}: Sorry! gallery = 7 lazy phone-frame thumbs, scroll-snap, ~{want} visible, caption",
          g["n"] == 7 and g["lazy"] and g["portrait"] == 7 and abs(g["perView"] - want) < 0.25 and "x" in g["snap"] and g["cap"] == "Official store screenshots", str(g))
    check(f"{label}: Sorry! links: Google Play then App Store", g["acts"][:2] == ["Google Play", "App Store"], str(g["acts"]))
    page.locator('#modal-body .shot-thumb[data-shot="0"]').click()
    page.wait_for_timeout(400)
    c1 = page.text_content("#lb-count")
    if mobile:
        box = page.locator("#lb-img").bounding_box()
        y = box["y"] + box["height"] / 2
        page.evaluate("""y => { const im = document.getElementById('lb-img'), o = {bubbles: true, pointerId: 1, pointerType: 'touch', clientY: y};
            im.dispatchEvent(new PointerEvent('pointerdown', {...o, clientX: 300})); window.dispatchEvent(new PointerEvent('pointerup', {...o, clientX: 120})); }""", y)
    else:
        page.keyboard.press("ArrowRight")
    page.wait_for_timeout(300)
    c2 = page.text_content("#lb-count")
    page.keyboard.press("ArrowLeft"); page.wait_for_timeout(200)
    c3 = page.text_content("#lb-count")
    shot(page, f"{label}_17_lightbox")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    st = page.evaluate("() => ({ lb: document.getElementById('lightbox').hidden, modal: !document.getElementById('modal-backdrop').hidden, f: document.activeElement.dataset.shot })")
    check(f"{label}: lightbox opens, {'swipe' if mobile else 'arrow keys'} pages, Esc closes it only (focus back on the thumb)",
          c1 == "1 / 7" and c2 == "2 / 7" and c3 == "1 / 7" and st["lb"] and st["modal"] and st["f"] == "0", f"{c1} {c2} {c3} {st}")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    # Slots: landscape thumbs (no phone frame), teal highlight pill (not gold)
    page.evaluate("() => { const b = document.querySelector('.card-open[data-index=\"7\"]'); b.scrollIntoView(); b.click(); }")
    page.wait_for_selector(".modal-backdrop.is-open"); page.wait_for_timeout(400)
    sl = page.evaluate("""() => ({ land: document.querySelectorAll('#modal-body .shot.is-landscape').length, caps: [...document.querySelectorAll('#modal-body .shot-cap')].map(c => c.textContent),
        hl: (document.querySelector('#modal-body .highlight-pill') || {}).textContent || '', gold: !!document.querySelector('#modal-body .award-pill'),
        eng: (document.querySelector('#modal-body .engine-line') || {}).textContent, narr: document.querySelector('#modal-narrator img').getAttribute('src') })""")
    check(f"{label}: Slots case: 2 landscape shots with captions, teal 'Highlight: Auto RTP Calibrator' (no gold pill), engine line, croupier narrator",
          sl["land"] == 2 and sl["caps"] == ["Base game: 5×3 reels with jackpots", "Paytable & rules: 16 paylines"] and "Auto RTP Calibrator" in sl["hl"] and
          not sl["gold"] and sl["eng"] == "Engine: Cocos + FairyGUI" and sl["narr"].endswith("narrator_slot.png"), str(sl))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.evaluate("() => { const b = document.querySelector('.card-open[data-index=\"6\"]'); b.scrollIntoView(); b.click(); }")
    page.wait_for_selector(".modal-backdrop.is-open"); page.wait_for_timeout(400)
    fg = page.evaluate("""() => ({ n: document.querySelectorAll('#modal-body .shot.is-portrait').length, links: document.querySelectorAll('#modal-body .case-actions a').length,
        vids: document.querySelectorAll('#modal-body video').length, pts: [...document.querySelectorAll('#modal-body .case-points li')].map(l => l.textContent),
        narr: document.querySelector('#modal-narrator img').getAttribute('src') })""")
    check(f"{label}: FishingGame case: 5 portrait shots, no video / store link, short pointers (≤8 words), fisherman narrator",
          fg["n"] == 5 and fg["links"] == 0 and fg["vids"] == 0 and all(len(p.split()) <= 8 for p in fg["pts"]) and fg["narr"].endswith("narrator_fishing.png"), str(fg))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)


def run_viewport(browser, label, viewport, mobile):
    ctx = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile,
                              device_scale_factor=2 if mobile else 1)
    page = ctx.new_page()
    errors = attach_error_capture(page)
    page.goto(URL, wait_until="load")
    page.wait_for_function("() => window.__portfolio", timeout=10000)
    page.wait_for_timeout(2500)  # fonts + first frames + ship travel

    webgl = page.evaluate("() => window.__portfolio.webgl")
    check(f"{label}: WebGL scene initialised", webgl)
    o = no_h_overflow(page)
    check(f"{label}: no horizontal overflow (initial)", o["sw"] <= o["cw"], f"scrollWidth={o['sw']} clientWidth={o['cw']}")
    shot(page, f"{label}_01_world")

    # HUD + email links
    check(f"{label}: HUD Contact is a button that does not open mailto",
          page.evaluate("() => { const b = document.getElementById('contact-link'); return b.tagName === 'BUTTON' && !b.hasAttribute('href'); }"))
    check(f"{label}: HUD identity reads 'Senior Game Developer · 7+ yrs'", page.text_content(".hud-role") == "Senior Game Developer · 7+ yrs")
    check(f"{label}: footer Contact is a button (no mailto in footer)",
          page.evaluate("() => { const b = document.getElementById('footer-contact'); return !!b && b.tagName === 'BUTTON' && !document.querySelector('.footer a[href^=\\'mailto:\\']'); }"))
    check(f"{label}: HUD identity visible",
          page.is_visible("text=Rahul Maheshwari") and page.is_visible("text=Game Developer"))
    check(f"{label}: Browse without playing visible", page.is_visible("#browse-link"))

    # ---- scene composition (approved concept): no sun, no orbits, dashed routes ----
    info = page.evaluate("() => window.__portfolio.sceneInfo()")
    kinds = info["kinds"]
    check(f"{label}: no sun / no orbit rings in scene",
          not any(k in kinds for k in ("star", "sun", "orbit")), f"kinds={kinds}")
    check(f"{label}: 8 planets + station + dashed travel routes", kinds.get("planet") == NBODIES and kinds.get("route", 0) >= 8,
          f"planets={kinds.get('planet')} routes={info['routes']}")
    bg0 = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim()")
    cyan = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim()")
    check(f"{label}: Star Birds palette tokens", bg0 == "#0d0221" and cyan == "#00e5ff", f"bg0={bg0} cyan={cyan}")


    # ship arrives at Is It You? along the Cricket -> Is It You? route on load
    page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return !s.traveling && s.at === 0; }", timeout=30000)
    check(f"{label}: ship parked at Is It You? after load", True)
    page.wait_for_function("() => !window.__portfolio.sceneInfo().ship.landing", timeout=10000)
    info = page.evaluate("() => window.__portfolio.sceneInfo()")
    pads = info["pads"]
    check(f"{label}: landing pad on all 9 bodies (attached to each sprite)",
          info["kinds"].get("landing-pad") == NBODIES and len(pads) == NBODIES and all(p["parent"] for p in pads), f"kinds={info['kinds']}")
    check(f"{label}: every body reachable over the dashed routes (incl. the station)",
          len({n for r in info["routes"] for n in r}) == NBODIES and any(STATION in r for r in info["routes"]), str(info["routes"]))
    check_new_art(page, label, mobile)
    shot(page, f"{label}_07_new_art")
    check(f"{label}: pads face the viewer (front hemisphere)", all(p["facing"] > 0.2 for p in pads), str([round(p["facing"], 2) for p in pads]))
    g = [p["glow"] for p in pads]
    check(f"{label}: selected planet's pad glows brighter than the others", g[0] > max(g[1:]) + 0.05, str([round(x, 2) for x in g]))

    if not mobile:
        pts = [planet_point(page, i) for i in range(NBODIES)]
        hud_bottom = page.evaluate("() => document.getElementById('hud').getBoundingClientRect().bottom")
        check_space(page, label)
        pts = [planet_point(page, i) for i in range(NBODIES)]
        W, H = 1440, 900
        st = pts[STATION]
        check(f"{label}: Achievements comet head is the top 'north star' (drifting near the centre), above every planet",
              abs(st["x"] - W / 2) < W * 0.18 and all(st["y"] < p["y"] - 80 for k, p in enumerate(pts) if k != STATION),
              str([(round(p['x']), round(p['y'])) for p in pts]))
        boxes = sprite_boxes(page)
        vis_w = {k: b["r"] - b["l"] for k, b in boxes.items()}
        big = [vis_w[k] for k in ("sorry-world", "all-star-cricket-2", "is-it-you", "fishing-game")]
        rel = lambda k: vis_w[k] / (sum(big) / len(big))
        head = 2 * page.evaluate("i => window.__portfolio.project(i).r", STATION) / (sum(big) / len(big))
        # (tall space: bodies are measured at different screen heights -> ±8% perspective, hence the looser bounds)
        check(f"{label}: size hierarchy (Sorry/Cricket/IIY/FishingGame big, Alstom ~0.8x, comet head ~0.5x, asteroids small)",
              max(big) / min(big) < 1.2 and 0.64 < rel("alstom-vr") < 0.9 and 0.35 < head < 0.65 and
              all(rel(k) < 0.82 for k in ("face-hero", "remote-for-unity", "dark-fantasy-slots")),
              f"visible widths={ {k: round(v) for k, v in vis_w.items()} } rel alstom={rel('alstom-vr'):.2f} comet head={head:.2f} "
              f"fh={rel('face-hero'):.2f} hw={rel('remote-for-unity'):.2f}")
        check_no_overlaps(page, label)
        check_asteroids(label, {i: asteroid_metrics(page, i) for i in (0, 2, 3)}, page)
        # the Is It You? card (selected on load) must not cover its planet (old bug)
        page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=10000)
        check_card_clear(page, label, 0)
        # ship flies along the dashed route: IIY -> Sorry! World is a direct route
        page.evaluate("() => scrollTo(0, 0)")
        route_set = {tuple(sorted(r)) for r in info["routes"]}
        start = page.evaluate("() => window.__portfolio.sceneInfo().ship")
        page.evaluate("() => document.getElementById('planet-sorry-world').click()")
        ship = page.evaluate("() => window.__portfolio.sceneInfo().ship")
        check(f"{label}: ship starts flying Is It You? -> Sorry! World (no teleport)",
              ship["traveling"] and ship["nodes"] == [0, 4] and
              abs(ship["screen"]["x"] - start["screen"]["x"]) + abs(ship["screen"]["y"] - start["screen"]["y"]) < 40,
              f"nodes={ship['nodes']}")
        card0 = ship_state(page)
        check(f"{label}: previous card hidden immediately on click", not card0["card"], f"card={card0['card']}")
        # (no mid-orbit screenshot here: the capture stalls sampling of the very orbit whose sweep is measured; 01e covers it)
        samples, took = track_flight(page, label, 4, mid_shot=f"{label}_01b_mid_flight_no_card")
        lr = page.evaluate("() => window.__portfolio.sceneInfo().rocket")
        check(f"{label}: landed rocket uses the cropped sprite (no drawn flame on the pad)", lr["cropped"], f"{lr}")
        check_flight(f"{label} IIY->Sorry! World", samples, 4, f"{label}_01b_mid_flight_no_card", took, route_set)
        page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=5000)
        after = ship_state(page)
        check(f"{label}: card for Sorry! World visible after landing", after["card"] and after["cardTitle"] == "Sorry! World",
              f"card={after['card']} title={after['cardTitle']}")
        pill = page.evaluate("""() => { const a = document.getElementById('callout-award'), p = a.querySelector('.award-pill');
            return {shown: !a.hidden && !!p && p.getBoundingClientRect().height > 10, text: p && p.textContent, svg: !!(p && p.querySelector('svg.trophy-svg')),
                    first: a === document.querySelector('#callout .callout-body').firstElementChild,
                    role: !document.getElementById('callout-role').hidden}; }""")
        check(f"{label}: Sorry! World card shows the gold '#1 in the US at launch' pill (SVG trophy) at the top, plus the resume role",
              pill["shown"] and pill["text"] == "#1 in the US at launch" and pill["svg"] and pill["first"] and pill["role"], str(pill))
        check_card_clear(page, label, 4)
        shot(page, f"{label}_01c_landed_card_visible")
        a = ship_state(page)["world"]
        page.wait_for_timeout(500)
        b = ship_state(page)
        check(f"{label}: ship stays docked at Sorry! World until next selection",
              not b["traveling"] and b["at"] == 4 and sum(abs(x - y) for x, y in zip(a, b["world"])) < 0.6, f"{a} -> {b['world']}")
        # multi-hop: Sorry! World -> Hardware Lab has no direct route, so it hops via the nearest connected planet
        # Hardware Lab is far down the tall space: selecting it scrolls the stage there first, then the rocket flies
        page.evaluate("() => document.getElementById('planet-remote-for-unity').click()")
        page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return s.traveling && s.to === 3; }", timeout=30000)
        ship = ship_state(page)
        hops = list(zip(ship["nodes"], ship["nodes"][1:]))
        check(f"{label}: multi-hop trip Sorry! World -> ... -> Hardware Lab over route-connected planets",
              ship["nodes"][0] == 4 and ship["nodes"][-1] == 3 and len(ship["nodes"]) >= 3 and all(tuple(sorted(h)) in route_set for h in hops), f"nodes={ship['nodes']}")
        samples, took = track_flight(page, label, 3, mid_shot=f"{label}_01d_ship_multihop", orbit_shot=f"{label}_01e_via_orbit", orbit_planet=ship["nodes"][1])
        check_flight(f"{label} Sorry! World->Hardware Lab", samples, 3, None, took, route_set)
        # interrupt mid-ORBIT: Hardware Lab -> Is It You?, switch to Alstom VR (same general direction) while still circling Hardware Lab
        page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=5000)
        page.evaluate("() => window.__portfolio.setWarp(false)")   # this checks the interrupt maths at normal speed (warp has its own test)
        page.evaluate("() => document.getElementById('planet-is-it-you').click()")
        page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return s.phase === 'orbit' && s.phaseProgress > 0.4; }", timeout=30000)
        before = ship_state(page)
        # dispatch directly: Playwright's actionability wait on the bobbing label can outlast the 1.2 s orbit (SwiftShader ~5 fps)
        page.evaluate("() => document.getElementById('planet-alstom-vr').click()")
        page.evaluate("() => window.__portfolio.setWarp(true)")
        rr = ship_state(page)
        jump = abs(rr["screen"]["x"] - before["screen"]["x"]) + abs(rr["screen"]["y"] - before["screen"]["y"])
        rq = rr["lastReroute"]
        check(f"{label}: click mid-orbit keeps circling the same planet, re-aimed at the new target (no jump)",
              rr["phase"] == "orbit" and rr["orbit"]["planet"] == 3 and rr["to"] == 5 and rr["flightId"] != before["flightId"] and
              rq and rq["gap"] < 0.01 and rq["turn"] > 0.9 and 0.6 < rq["speedAfter"] / max(rq["speedBefore"], 1e-6) < 1.6,
              f"planet={rr['orbit'] and rr['orbit']['planet']} to={rr['to']} gap={rq and rq['gap']:.4f} heading-dot={rq and rq['turn']:.3f} "
              f"v {rq and rq['speedBefore']:.1f}->{rq and rq['speedAfter']:.1f} (screen poll delta {jump:.0f}px incl. normal motion)")
        # interrupt mid-AIR: switch to All Star Cricket 2 while travelling
        # mid-leg of a travel phase (Hardware -> IIY is multi-hop now: later in the leg the ship enters a via-orbit)
        page.wait_for_function("() => { const s = window.__portfolio.sceneInfo().ship; return s.phase === 'travel' && s.phaseProgress > 0.3 && s.phaseProgress < 0.6; }", timeout=30000)
        fl = page.evaluate("() => { const x = window.__portfolio.sceneInfo(); return {s: x.ship, r: x.rocket}; }")
        st = region_stats(page, fl["s"]["screen"]["x"], fl["s"]["screen"]["y"], 26)
        check(f"{label}: rocket sprite visible in flight (bright sprite pixels at the ship), full image with flame",
              st["bright"] >= 25 and not fl["r"]["cropped"], f"bright px={st['bright']} chroma={st['chroma']:.0f} cropped={fl['r']['cropped']}")
        shot(page, f"{label}_07b_rocket_sprite_flight")
        before = ship_state(page)
        page.evaluate("() => document.getElementById('planet-all-star-cricket-2').click()")   # instant (see mid-orbit note)
        rr = ship_state(page)
        jump = abs(rr["screen"]["x"] - before["screen"]["x"]) + abs(rr["screen"]["y"] - before["screen"]["y"])
        rq = rr["lastReroute"]
        check(f"{label}: click mid-flight cancels and starts a mini orbit from where the ship is (no jump)",
              rr["phase"] == "orbit" and rr["orbit"]["planet"] is None and rr["to"] == 1 and rr["flightId"] != before["flightId"] and
              rq and rq["gap"] < 0.01 and rq["turn"] > 0.95 and jump < 60,
              f"phase={rr['phase']} orbitPlanet={rr['orbit'] and rr['orbit']['planet']} kind={rq and rq.get('kind')} flight {before['flightId']}->{rr['flightId']} "
              f"to={rr['to']} gap={rq and rq['gap']:.4f} heading-dot={rq and rq['turn']:.3f} v {rq and rq['speedBefore']:.1f}->{rq and rq['speedAfter']:.1f} jump={jump:.0f}px")
        samples, took = track_flight(page, label, 1, mid_shot=None)
        moving = [x for x in samples if x["traveling"] or x["landing"]]
        end = samples[-1]
        ex = end["lastExit"]
        check(f"{label}: after the mini orbit the slingshot exit is smooth",
              ex and ex["continuity"] > 0.99 and ex["towardDest"] > 0.98, f"{ex}")
        check(f"{label}: rerouted ship lands on All Star Cricket 2's pad, card hidden until then",
              end["at"] == 1 and end["dockDist"] < 0.05 and not any(x["card"] for x in moving), f"at={end['at']} frames={len(moving)}")
        page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=5000)
        check(f"{label}: card shows All Star Cricket 2 after reroute landing", ship_state(page)["cardTitle"] == "All Star Cricket 2")

    if mobile:
        # same flight on mobile: zoomed in, the ship leaves the old planet and lands on the visible one
        page.evaluate("() => scrollTo(0, 0)")
        info = page.evaluate("() => window.__portfolio.sceneInfo()")
        route_set = {tuple(sorted(r)) for r in info["routes"]}
        page.click("#callout-prev")   # Is It You? -> Sorry! World (previous in nav order; direct route)
        samples, took = track_flight(page, label, 4, mid_shot=f"{label}_01b_mid_flight_no_card",
                                     shot_when=lambda s: s["phase"] == "travel" and 0.45 <= s["phaseProgress"] <= 0.97 and 20 < s["screen"]["x"] < 370 and 330 < s["screen"]["y"] < 1300)
        check_flight(f"{label} IIY->Sorry! World", samples, 4, f"{label}_01b_mid_flight_no_card", took, route_set)
        inflight = [x for x in samples if x["traveling"]]
        check(f"{label}: ←/→ arrows stay usable during flight (only the card body hides)",
              bool(inflight) and all(x["arrows"] for x in inflight), f"{len(inflight)} frames")
        vw, vh = 390, 844
        off = [s for s in samples if s["traveling"] and not (0 <= s["screen"]["x"] <= vw and 0 <= s["screen"]["y"] <= vh)]
        on_after = [s for s in samples if s["traveling"] and s["phase"] == "travel" and 0 <= s["screen"]["x"] <= vw and 0 <= s["screen"]["y"] <= vh and s["phaseProgress"] > 0.5]
        end = samples[-1]["screen"]
        check(f"{label}: ship comes in from off-screen and lands on the visible planet",
              bool(off) and bool(on_after) and 0 <= end["x"] <= vw and 0 <= end["y"] <= vh,
              f"offscreen_frames={len(off)} end=({end['x']:.0f},{end['y']:.0f})")
        page.wait_for_function("() => getComputedStyle(document.querySelector('#callout .callout-body')).opacity === '1'", timeout=5000)
        after = ship_state(page)
        check(f"{label}: card for Sorry! World visible after landing", after["card"] and after["cardTitle"] == "Sorry! World")
        shot(page, f"{label}_01c_landed_card_visible")

    # ---- planet interactions -> case study ----
    ast_mobile = {}
    for i, (pid, title) in enumerate(PROJECTS):
        method = None
        # The callout tracks a floating planet; Playwright click retries may force-scroll. Reset.
        # Desktop tall space: scroll so the body sits mid-stage first (like a user scrolling to it).
        if mobile:
            page.evaluate("() => scrollTo(0, 0)")
        else:
            page.evaluate("""i => { const p = window.__portfolio.project(i), sp = window.__portfolio.space();
                scrollTo(0, Math.max(sp.top, Math.min(sp.top + sp.px, scrollY + p.y - innerHeight * 0.55))); }""", i)
            page.wait_for_timeout(500)
        pt = planet_point(page, i)
        if pt["onScreen"] and pt["hitCanvas"]:
            if mobile:
                page.touchscreen.tap(pt["x"], pt["y"])
            else:
                page.mouse.click(pt["x"], pt["y"])
            method = "tap planet" if mobile else "click planet"
            try:
                wait_selected(page, i)
            except Exception:
                method += " (missed)"
        if page.evaluate("() => window.__portfolio.selected()") != i:
            # planet off-screen (mobile camera follows the selected planet) -> use callout arrows
            for _ in range(NBODIES + 1):
                if page.evaluate("() => window.__portfolio.selected()") == i:
                    break
                page.click("#callout-next")
            method = (method + " -> " if method else "") + "callout next arrow"
        sel = page.evaluate("() => window.__portfolio.selected()")
        callout_title = page.text_content("#callout-title")
        check(f"{label}: select planet {title}", sel == i and callout_title == title,
              f"method={method}; callout='{callout_title}'")
        if mobile:
            # camera zooms into the selected planet (~60% of viewport width); others pushed off-screen
            try:
                page.wait_for_function("""i => { const p = window.__portfolio.project(i); const d = 2 * p.r / innerWidth;
                    return d > 0.5 && d < 0.72 && Math.abs(p.x - innerWidth / 2) < 30; }""", arg=i, timeout=20000)
            except Exception:
                pass
            z = zoom_state(page)
            others_off = all(not z[j]["on"] for j in range(NBODIES) if j != i)
            check(f"{label}: zoomed into {title} (~60% width), other planets off-screen",
                  0.5 < z[i]["fill"] < 0.72 and others_off,
                  f"fill={z[i]['fill']:.2f} others_on={[j for j in range(NBODIES) if j != i and z[j]['on']]}")
        elif page.evaluate("() => window.__portfolio.selected()") == i:
            page.wait_for_function("() => getComputedStyle(document.getElementById('callout')).opacity === '1'", timeout=30000)
            check_card_clear(page, label, i)
        page.wait_for_timeout(600)
        if mobile and i in (0, 2, 3):
            ast_mobile[i] = asteroid_metrics(page, i)
        shot(page, f"{label}_02_selected_{pid}")

        page.click("#callout-open")
        page.wait_for_timeout(350)
        ms = modal_state(page)
        if pid in ("sorry-world", "alstom-vr"):
            check_award_case(page, label, pid)
        check_case_content(page, label, pid)
        check_narrator(page, label, pid, mobile)
        check(f"{label}: '{title}' opens correct case study",
              ms["open"] and ms["project"] == pid and ms["title"] == title, f"modal={ms['project']}/{ms['title']}")
        vids = page.evaluate("""() => [...document.querySelectorAll('#modal video')].map(v => { const r = v.getBoundingClientRect();
            const mb = document.getElementById('modal-body').getBoundingClientRect();
            return {src: v.getAttribute('src'), controls: v.controls, autoplay: v.autoplay, loop: v.loop, muted: v.muted,
                    poster: v.getAttribute('poster'), ratio: r.width / r.height, w: r.width, mw: mb.width, top: r.top}; })""")
        want = VIDEOS[pid]
        check(f"{label}: '{title}' case study has <video> elements with correct src",
              [v["src"] for v in vids] == want, f"{[v['src'] for v in vids]}")
        check(f"{label}: '{title}' videos: controls, no autoplay/loop/mute, empty poster, 16:9, fit modal",
              all(v["controls"] and not v["autoplay"] and not v["loop"] and not v["muted"] and v["poster"] == "" and
                  abs(v["ratio"] - 16 / 9) < 0.03 and v["w"] <= v["mw"] + 1 for v in vids),
              str([(round(v["ratio"], 3), round(v["w"]), round(v["mw"])) for v in vids]))
        check(f"{label}: '{title}' no grey placeholder boxes left", page.locator("#modal .media-box").count() == 0)
        if len(vids) == 2:
            check(f"{label}: '{title}' two videos stacked vertically", vids[1]["top"] > vids[0]["top"] + 50, f"{vids[0]['top']:.0f} -> {vids[1]['top']:.0f}")
        meta = page.evaluate("""() => Promise.all([...document.querySelectorAll('#modal video')].map(v => new Promise(res => {
            if (v.readyState >= 1) return res({src: v.getAttribute('src'), ok: true, w: v.videoWidth});
            const t = setTimeout(() => res({src: v.getAttribute('src'), ok: false, err: v.error && v.error.code}), 8000);
            v.addEventListener('loadedmetadata', () => { clearTimeout(t); res({src: v.getAttribute('src'), ok: true, w: v.videoWidth}); }, {once: true});
            v.addEventListener('error', () => { clearTimeout(t); res({src: v.getAttribute('src'), ok: false, err: v.error && v.error.code}); }, {once: true});
        })))""")
        check(f"{label}: '{title}' video metadata loads in Chromium", all(m["ok"] for m in meta), str(meta))
        if i == 3 or pid == "face-hero":
            page.evaluate("() => document.querySelector('#modal video').scrollIntoView({block: 'center'})")
            page.wait_for_timeout(300)
            shot(page, f"{label}_03b_case_study_video_{pid}")
        if i == 0:
            shot(page, f"{label}_03_case_study_{pid}")
            # focus trap
            inside = True
            for _ in range(12):
                page.keyboard.press("Tab")
                inside = inside and page.evaluate(
                    "() => document.getElementById('modal').contains(document.activeElement)")
            for _ in range(4):
                page.keyboard.press("Shift+Tab")
                inside = inside and page.evaluate(
                    "() => document.getElementById('modal').contains(document.activeElement)")
            check(f"{label}: focus trapped in modal", inside)
            # Escape must also work while the <video> element has focus. (Once Tab moves focus *inside*
            # Chromium's native video controls, key events never reach page script — browser limitation.)
            page.focus("#modal video")
            o = no_h_overflow(page)
            check(f"{label}: no horizontal overflow (modal open)", o["sw"] <= o["cw"], f"{o}")
            if mobile:
                vh = viewport["height"]
                try:  # let the slide-up transition finish (SwiftShader frames are slow)
                    page.wait_for_function("h => Math.abs(document.getElementById('modal').getBoundingClientRect().bottom - h) < 2", arg=vh, timeout=5000)
                except Exception:
                    pass
                ms = modal_state(page)
                check(f"{label}: case study is a bottom sheet",
                      abs(ms["rect"]["bottom"] - vh) < 2 and abs(ms["rect"]["width"] - viewport["width"]) < 2,
                      f"rect={ms['rect']}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        ms = modal_state(page)
        aid = active_id(page)
        check(f"{label}: Escape closes '{title}', focus returns to trigger",
              not ms["open"] and aid == "callout-open", f"open={ms['open']} focus={aid}")

    if mobile and len(ast_mobile) == 3:
        check_asteroids(label, ast_mobile, page, mobile=True)
    # ---- Contact panel ----
    check_contact(page, label, mobile, viewport)

    # ---- project list dropdown -> direct access ----
    page.click("#menu-button")
    menu = page.evaluate("""() => [...document.querySelectorAll('#menu-list .menu-item')].map(b => ({
        title: b.querySelector('.menu-item-title').childNodes[0].textContent, trophy: !!b.querySelector('.menu-trophy svg.trophy-svg'),
        ach: b.classList.contains('is-achievements')}))""")
    check(f"{label}: Project list dropdown opens with 8 projects + Achievements",
          page.is_visible("#menu-list") and len(menu) == 9 and [m["title"] for m in menu] ==
          ["Sorry! World", "Is It You?", "All Star Cricket 2", "FishingGame", "Alstom VR", "Face Hero", "Remote for Unity", "Dark Fantasy Slots", "Achievements"] and menu[-1]["ach"], str(menu))
    check(f"{label}: gold trophy icon only next to the award-winning projects in the dropdown",
          [m["title"] for m in menu if m["trophy"]] == ["Sorry! World", "Alstom VR"], str([m["title"] for m in menu if m["trophy"]]))
    shot(page, f"{label}_04_project_list")
    page.locator('#menu-list .menu-item[data-index="2"]').click()
    page.wait_for_timeout(300)
    ms = modal_state(page)
    check(f"{label}: dropdown item opens Face Hero", ms["open"] and ms["project"] == "face-hero", ms["project"])
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    check(f"{label}: focus returns to Project list button", active_id(page) == "menu-button", active_id(page))

    # ---- keyboard cycling (desktop) ----
    if not mobile:
        page.evaluate("() => { document.activeElement.blur(); scrollTo(0, 0); }")
        bodies = page.evaluate("() => window.__portfolio.bodies")
        before = page.evaluate("() => window.__portfolio.selected()")
        page.keyboard.press("d")
        after_d = page.evaluate("() => window.__portfolio.selected()")
        page.keyboard.press("ArrowLeft")
        after_left = page.evaluate("() => window.__portfolio.selected()")
        pos = NAV_ORDER.index(bodies[before])
        check(f"{label}: D / ArrowLeft step through the bodies in nav order",
              bodies[after_d] == NAV_ORDER[(pos + 1) % NBODIES] and after_left == before,
              f"{before}->{after_d}->{after_left}")
        seen = []
        for _ in range(NBODIES):
            page.keyboard.press("ArrowRight")
            seen.append(bodies[page.evaluate("() => window.__portfolio.selected()")])
        check(f"{label}: →/D visits all 8 planets and the Achievements station (station last), then wraps",
              sorted(seen) == sorted(NAV_ORDER) and seen[-1] == bodies[before] and
              seen.index("achievements") == (NAV_ORDER.index("achievements") - pos - 1) % NBODIES, str(seen))
        # planet label button is keyboard-operable
        page.focus("#planet-all-star-cricket-2") if page.is_visible("#planet-all-star-cricket-2") else None
        if page.is_visible("#planet-all-star-cricket-2"):
            page.keyboard.press("Enter")
            # focus moves to "Open case study" once the ship has landed and the card is shown
            try:
                page.wait_for_function("() => document.activeElement && document.activeElement.id === 'callout-open'", timeout=30000)
            except Exception:
                pass
            check(f"{label}: planet label button selects via keyboard",
                  page.evaluate("() => window.__portfolio.selected()") == 1 and active_id(page) == "callout-open",
                  f"focus={active_id(page)}")

    run_achievements(page, label, mobile, viewport)

    # ---- browse without playing -> plain list ----
    page.click("#browse-link")
    page.wait_for_timeout(900)
    in_view = page.evaluate("() => { const r = document.getElementById('projects-title').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }")
    check(f"{label}: Browse without playing scrolls to project list", in_view and active_id(page) == "projects-title",
          f"focus={active_id(page)}")
    check(f"{label}: plain list has 8 projects (nav order) + achievements",
          page.locator("#project-cards > li").count() == 8 and page.locator("#achievement-cards > li").count() == 2 and
          page.evaluate("() => [...document.querySelectorAll('#project-cards h3')].map(h => h.textContent)") ==
          ["Sorry! World", "Is It You?", "All Star Cricket 2", "FishingGame", "Alstom VR", "Face Hero", "Remote for Unity", "Dark Fantasy Slots"])
    shot(page, f"{label}_05_project_list_section")
    btn = page.locator('.card-open[data-index="3"]')
    btn.click()
    page.wait_for_timeout(300)
    ms = modal_state(page)
    check(f"{label}: list card opens Remote for Unity", ms["open"] and ms["project"] == "remote-for-unity", ms["project"])
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    check(f"{label}: focus returns to list card button",
          page.evaluate("() => document.activeElement === document.querySelector('.card-open[data-index=\"3\"]')"))
    check_gallery(page, label, mobile)
    o = no_h_overflow(page)
    check(f"{label}: no horizontal overflow (scrolled)", o["sw"] <= o["cw"], f"{o}")
    shot(page, f"{label}_06_full_page", full_page=True)

    check(f"{label}: no console errors / failed requests", not errors, "; ".join(errors[:5]))
    ctx.close()


def run_reduced_motion(browser):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    errors = attach_error_capture(page)
    page.route("**/narrator_facehero.png", lambda r: r.fulfill(status=404, body=""))   # simulate a missing narrator file
    page.goto(URL, wait_until="load")
    page.wait_for_function("() => window.__portfolio", timeout=10000)
    page.wait_for_timeout(1200)
    p1 = page.evaluate("() => window.__portfolio.project(1)")
    page.wait_for_timeout(1200)
    p2 = page.evaluate("() => window.__portfolio.project(1)")
    moved = abs(p1["x"] - p2["x"]) + abs(p1["y"] - p2["y"])
    check("reduced-motion: planets static", moved < 0.5, f"moved={moved:.2f}px")
    streak = page.evaluate("() => getComputedStyle(document.querySelector('.streak')).display")
    check("reduced-motion: CSS animations off", streak == "none", streak)
    bob = page.evaluate("() => getComputedStyle(document.querySelector('.character-img')).animationName")
    check("reduced-motion: navigator bob animation disabled", bob == "none", bob)
    t1 = page.evaluate("() => window.__portfolio.sceneInfo().orbiters[5].map(o => [o.angle, o.side, o.transform])")
    page.wait_for_timeout(900)
    t2 = page.evaluate("() => window.__portfolio.sceneInfo().orbiters[5].map(o => [o.angle, o.side, o.transform])")
    check("reduced-motion: Alstom medal satellite static, on the near half", t1 == t2 and all(o[1] == "front" for o in t2), f"{t1} / {t2}")
    cm = page.evaluate("() => window.__portfolio.sceneInfo().comet")
    sp = page.evaluate("() => getComputedStyle(document.querySelector('.comet-sparks')).display")
    check("reduced-motion: comet static (no drift), no sparkles", all(abs(v) < 1e-6 for v in cm["drift"]) and cm["driftT"] == 0 and sp == "none", f"{cm} sparks={sp}")
    page.keyboard.press("d")
    ship = page.evaluate("() => window.__portfolio.sceneInfo().ship")
    rm = ship_state(page)
    check("reduced-motion: card shown instantly, no landing bump",
          rm["card"] and rm["cardTitle"] == "All Star Cricket 2" and not rm["landing"] and rm["scale"] == 1, f"card={rm['card']} scale={rm['scale']}")
    check("reduced-motion: ship teleports to the new planet (no flight)",
          not ship["traveling"] and ship["at"] == 1 and ship["dockDist"] < 0.05, f"{ship['at']} traveling={ship['traveling']}")
    page.click("#callout-open")
    ms = modal_state(page)
    check("reduced-motion: case study still opens", ms["open"] and ms["project"] == "all-star-cricket-2", ms["project"])
    check_narrator(page, "reduced-motion", "all-star-cricket-2", False, reduced=True)
    nv = page.evaluate("() => getComputedStyle(document.getElementById('modal-narrator')).animationName")
    check("reduced-motion: narrator static (no pop-in / bob)", nv == "none", nv)
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    # missing narrator file -> navigator.png (modal + HUD)
    page.evaluate("() => document.querySelector('#menu-list .menu-item[data-index=\"2\"]').click()"); page.wait_for_timeout(500)
    fb = page.evaluate("() => [document.querySelector('#modal-narrator img').getAttribute('src'), document.querySelector('.character-img.is-on').getAttribute('src')]")
    check("narrator fallback: missing narrator_facehero.png -> navigator.png (panel + HUD)", fb == ["assets/characters/navigator.png"] * 2, str(fb))
    shot(page, "reduced_motion_desktop")
    errors = [e for e in errors if "status of 404" not in e]     # the deliberately missing narrator file above
    check("reduced-motion: no console errors", not errors, "; ".join(errors[:5]))
    ctx.close()


def run_no_webgl_fallback(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.route("**/three.min.js", lambda r: r.abort())
    page.goto(URL, wait_until="load")
    page.wait_for_function("() => window.__portfolio", timeout=10000)
    check("fallback (Three.js blocked): static planets shown",
          page.evaluate("() => document.body.classList.contains('no-webgl')") and page.is_visible("#planet-face-hero"))
    page.tap("#planet-face-hero")
    page.click("#callout-open")
    ms = modal_state(page)
    check("fallback: planet button opens case study", ms["open"] and ms["project"] == "face-hero", ms["project"])
    shot(page, "fallback_no_webgl_mobile")
    check("fallback: no uncaught JS errors", not page_errors, "; ".join(page_errors[:3]))
    ctx.close()


WARP_JS = "() => { const s = window.__portfolio.sceneInfo().ship; return {w: s.warp, busy: s.traveling || s.landing, at: s.at}; }"


def run_offscreen_warp(browser):
    """Off-screen warp: rocket out of view at the click -> fast until it enters the view (<= 0.6 s), eased back to
    normal speed; on-screen click -> no warp; immediate ping (glow + pad) on the target. Desktop tall space + mobile."""
    for label, vp, mobile in (("warp_desktop", {"width": 1440, "height": 900}, False), ("warp_mobile", {"width": 390, "height": 844}, True)):
        ctx = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(URL, wait_until="load")
        page.wait_for_function("() => window.__portfolio && window.__portfolio.sceneInfo()", timeout=10000)

        def go(i):
            page.evaluate("i => document.querySelectorAll('.planet-label')[i].click()", i)

        def land(i):
            page.wait_for_function("i => { const s = window.__portfolio.sceneInfo().ship; return !s.traveling && !s.landing && s.at === i; }", arg=i, timeout=60000)
        # park the rocket at the comet (top of the space), then pick Hardware Lab (bottom): rocket leaves the view
        go(STATION); land(STATION)
        if not mobile:
            sp = page.evaluate("window.__portfolio.space()")
            page.evaluate("y => window.scrollTo(0, y)", sp["top"] + sp["px"]); page.wait_for_timeout(500)
        go(3)
        ping = page.evaluate("() => { const e = document.querySelector('.planet-sprite[data-index=\"3\"]'); return e.classList.contains('is-ping') && getComputedStyle(e.querySelector('.pad-tip')).opacity === '1'; }")
        check(f"{label}: click gives immediate feedback on the target (glow ping + pad lit)", ping)
        ks, t0 = [], time.time()
        while time.time() - t0 < 60:
            st = page.evaluate(WARP_JS); ks.append(st["w"]["k"])
            if not st["busy"] and st["at"] == 3: break
            page.wait_for_timeout(16)
        w = page.evaluate(WARP_JS)["w"]
        last = w["last"] or {}
        check(f"{label}: rocket off-screen at the click warps in (<= 0.6 s off-screen, 4-40x), then normal speed",
              last.get("offscreen") is not None and last["offscreen"] <= 0.6 and 4 <= last.get("factor", 0) <= 40 and ks[-1] == 1, f"{last} k_end={ks[-1]}")
        check(f"{label}: warp journey lands on the target", page.evaluate(WARP_JS)["at"] == 3)
        # on-screen click: neighbour Dark Fantasy Slots, rocket visible -> no warp at all
        page.wait_for_timeout(400)
        on = page.evaluate(WARP_JS)["w"]["onScreen"]
        go(7)
        page.wait_for_timeout(50)
        w2 = page.evaluate(WARP_JS)["w"]
        if on and not mobile:   # mobile: the view jumps to the new planet, so "on-screen" is judged in that new framing
            check(f"{label}: rocket on-screen at the click -> no warp", w2["seen"] is True and w2["goal"] is None and w2["k"] == 1, str(w2))
        land(7)
        check(f"{label}: no JS errors", not errs, "; ".join(errs[:3]))
        ctx.close()


def main():
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        run_viewport(browser, "desktop_1440", {"width": 1440, "height": 900}, mobile=False)
        run_viewport(browser, "mobile_390", {"width": 390, "height": 844}, mobile=True)
        run_reduced_motion(browser)
        run_asteroids_landed(browser)
        run_no_webgl_fallback(browser)
        run_offscreen_warp(browser)
        browser.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed in {time.time() - t0:.1f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
