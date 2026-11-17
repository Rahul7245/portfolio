# Portfolio Website — Rahul Maheshwari

## Project
Gamified responsive portfolio in Star Birds art style (see reference images in uploads/).

## Visual concept (approved)
- 8 free-floating project bodies + 1 Achievements comet in deep space (no sun, no orbits) — click/tap to select, open case study
- Star Birds style: saturated flat/cel-shaded 3D, dark violet/teal space, orange/teal asteroid bodies, cyan minerals, mint machinery
- Three.js for the scene camera/flight maths + back layer (routes, exhaust); planets/rocket/pads are DOM sprites; CSS/SVG for HUD and UI chrome
- Planets: fixed-angle 2D hero sprites (2.5D illusion, never rotate) — assets/planets/planet_{cricket,isityou,facehero,hardware,sorry,alstom,fishing}.png + asteroid_slot.png + comet_achievements.png (2048px, transparent), configured in `window.PLANET_SPRITES` (js/data.js: src, `body` ellipse [cx,cy,rx,ry] %, `bbox`, optional `padAt`, % overlays) — glow, shadow, hit area, label gap, route dots and landing pad all follow the body ellipse (flat for the asteroids). DOM `<img>` layers positioned from the projected 3D planet centre and depth-sorted with the rocket (assets/ui/rocket.png, DOM sprite) so it passes behind a planet on the far half of its tilted slingshot orbit and in front on the near half; idle bob, elliptical shadow/rim glow, mouse hover tilt (no tilt on touch), CSS parallax starfield. Plain `<img>`, so it works on file:// with no embedded data URIs; navigator = assets/characters/navigator.png
- Desktop: overhead view, click to select planet, dashed travel routes between planets, spacecraft flies along routes, WASD hint
- SCROLLABLE SPACE (desktop): body sizes are FIXED by importance class — the camera distance is fitted to the approved 4-planet layout (`PORTFOLIO.sizeReference`), never shrunk to fit more projects. The space is a tall world (~2.2 viewport heights at 1440×900): `#world` is tall, `#world-stage` is sticky, the page scroll pans the camera down (transform-only, 1:1 with the scroll, star layers parallax); then the page continues (project list, footer). Journey top -> bottom: comet; Sorry! World + Is It You?; Cricket + FishingGame; Alstom; asteroid belt (Face Hero, Hardware, Slots). Selecting an off-screen body smooth-scrolls it into view first, then the rocket flies. Right-edge mini-map (dots per body, clickable, view thumb) + "Scroll to explore ↓" hint at first load
- Mobile (≤768px): no tall canvas; camera zooms into selected planet (~60% width), others pushed off-screen, ←/→ buttons, bottom sheet case study, no mandatory joystick
- Design system (body type follows project weight): big planets = Sorry! World, All Star Cricket 2, Is It You?, FishingGame; medium = Alstom VR (~0.8x); small asteroids = Face Hero, Hardware Lab, Dark Fantasy Slots (~0.6x, elongated sprites); the Achievements body is a different CLASS of object — a golden COMET (assets/planets/comet_achievements.png; head lower-right, tail to the upper-left), top-centre "north star" above the planet field. Pad / label / click area / glow anchor on the comet HEAD. Desktop: slow eased drift along a shallow arc (~50 s per pass) that holds still while hovered, selected or while the rocket flies to/orbits it; static on mobile and reduced motion. Tail shimmer (pivot at the head) + ≤40 gold CSS sparkles
- GOLD IS RESERVED FOR ACHIEVEMENTS: the comet, code-rendered medal badges (js/art.js: gold disc + ribbon + glyph), gold medal satellites orbiting award-winning planets, faint animated golden constellation lines comet head -> award planets (follow its drift; brighten on hover), gold achievement pills (SVG trophy, never emoji) in planet cards / case studies / plain list, trophy icons in the Project list, gold modal variant for the Achievements panel
- Achievements are data-driven (`PORTFOLIO.achievements` in js/data.js); comet click/tap or its card opens the Achievements panel (bottom sheet on mobile); each medal card closes it, flies the rocket to that planet and selects it; badges overlay the comet's two empty medal slots with a shine sweep
- Alstom VR: the train sits ON the planet (artist sprite); life cues = headlight glow pulse at its nose + a tiny sparkle puff (config overlays). No orbiting ring/train.
- Panels: case studies, Achievements (gold) and Contact share one modal (bottom sheet ≤768px). Each case study / Achievements panel has its Navigator-costume narrator (assets/characters/narrator_*.png, fallback navigator.png) bottom-right outside the content with a tagline bubble (= the project's oneLiner); mobile: ~120px peeking over the sheet. The HUD Navigator crossfades to the selected planet's costume. Header icons = the body's own sprite (comet head for Achievements). No "Ask me about" button.
- HUD Contact opens the Contact panel (Email + Copy toast, LinkedIn, two phones as tel: links + Copy) — never mailto directly
- Navigation order (←/→, A/D, dropdown, plain list): Sorry! World, Is It You?, All Star Cricket 2, FishingGame, Alstom VR, Face Hero, Remote for Unity, Dark Fantasy Slots, Achievements (last)
- Case-study screenshot gallery (data-driven `gallery: [{src,w,h,alt,caption?}]`, `galleryCaption`): portrait shots in phone-frame thumbs, landscape in wide thumbs, scroll-snap strip (3 visible desktop / 1.3 mobile), lazy images with width/height; lightbox (prev/next, arrow keys, swipe, Esc). Videos first, then the gallery
- A project's headline feature (`highlight`) shows as a TEAL "Highlight" pill (never gold)
- Persistent HUD: "Rahul Maheshwari / Game Developer" identity, Project list dropdown, Contact button, "Browse without playing" skip

## Portfolio content (ground truth — do not invent or add to this)
- **Source of truth: art-briefs/resume_content.md** (from Rahul's resume, Jan 2026) — company, role, dates, one-liner, 3–4 short "What I did" pointers (≤ ~8 words), tags and links per planet. Face Hero is not in the resume: keep its copy unchanged. Other resume items are NOT planets.
- Identity: Senior Game Developer · 7+ yrs. Skills (plain-list section): as listed in resume_content.md
- **Is It You?**: social deduction, mushroom world, UI/gameplay, PC→mobile port, low-end optimisation, iOS/Android release pipelines (Jenkins), sign-in, input rebinding, Facebook/Appsflyer
- **All Star Cricket 2**: quests, referrals, tutorials, physics, API/character/animation integration
- **Face Hero**: ARKit POC, UI/gameplay
- **Remote for Unity**: ESP32/Arduino gyro+buttons, mobile plugins
- **Sorry! World** (Gameberry Labs): the official Hasbro Sorry! board game on mobile — online multiplayer (2/4 players), city building. Play Store: https://play.google.com/store/apps/details?id=com.gameberry.sorry.card.board.game. ACHIEVEMENT: reached #1 in the US when it launched. role: Senior Game Developer (Feb–Jun 2025), per resume
- **FishingGame**: idle-empire mobile fishing game (in development); two-person team, Rahul = developer (Shivansh owns the design); Unity (URP), mobile portrait; idle-empire loop, ScriptableObject progression, URP water shader, Verlet rope casting, 60 fps on Pixel 9, AI multi-agent pipeline (Claude Code + Codex). Gallery assets/projects/fishing/. No video, no store link (unreleased)
- **Dark Fantasy Slots** (learning project · 5-reel video slot, Cocos + FairyGUI): highlight "Auto RTP Calibrator" (teal); RTP calibrator (96%), 10M-spin simulator, volatility calibration, JSON reels/paylines + seeded PRNG, Wild/Scatter/Bonus/jackpots, QA cheats, autospin, 16 paylines 5×3 at 120 fps. Gallery assets/projects/slot/ (landscape)
- **Sorry! World** gallery: official store screenshots assets/projects/sorry/sorry_1..7.jpg (caption "Official store screenshots"); links Google Play + App Store
- **Alstom VR** (Alstom): VR training/experience for railway. Solo developer (solely developed by Rahul). ACHIEVEMENT: won the Alstom Gold Award
- Contact: maheshwarirohit14@gmail.com · LinkedIn https://www.linkedin.com/in/rahul-maheshwari-14070b157 · phone (user-provided) +971 54 520 4481 (UAE), +91 96020 01030 (India) — `DATA.linkedin` empty => "Coming soon", never invent a URL
- No invented metrics, stats, resume links or testimonials

## Stack
- Vanilla HTML/CSS/JS + Three.js (CDN, pinned version)
- Single index.html entry point, assets/ for textures/sounds when ready
- Must work without a build step — open index.html directly in browser
- Playwright for browser QA tests (test_portfolio.py)

## Conventions
- Save screenshots to the screenshots/ dir supplied in every task prompt
- Append durable notes/decisions to AGENT_NOTES_<role>.md in this directory
- Never commit, push, or run git operations
- Never activate apps or steal window focus
- Run headless; use `unity` CLI shims are irrelevant here — no Unity commands
