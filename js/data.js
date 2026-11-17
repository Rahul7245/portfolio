/* Portfolio content. Ground truth: art-briefs/resume_content.md (+ CLAUDE.md) — do not add claims,
   metrics or links that are not listed there. */
window.PORTFOLIO = {
  email: 'maheshwarirohit14@gmail.com',
  linkedin: 'https://www.linkedin.com/in/rahul-maheshwari-14070b157',   // from the resume; '' renders "Coming soon"
  phones: [
    { label: 'UAE', display: '+971 54 520 4481', tel: '+971545204481' },
    { label: 'India', display: '+91 96020 01030', tel: '+919602001030' }
  ],
  identity: { name: 'Rahul Maheshwari', role: 'Senior Game Developer · 7+ yrs' },
  skills: {
    primary: ['C#', 'Unity3D'],
    tools: ['Jenkins', 'Git', 'DOTS', 'REST APIs', 'Android', 'Swift (iOS)', 'Shell Script', 'C', 'C++', 'Go'],
    xr: ['AR', 'VR'],
    devices: ['Oculus Go', 'HTC Vive', 'Microsoft Kinect', 'Oculus Quest 2'],
    secondary: ['Embedded Systems', 'Arduino', 'FFmpeg', 'GStreamer', 'FPGA', 'I2C']
  },
  /* Per project: company, role, dates, oneLiner (one-line description + narrator tagline), points
     ("What I did", ≤ ~8 words each), tags, links (buttons), media (videos). Scene: radius = rock
     half-width in world units, pos, swatch. narrator = costume of the Navigator bird for this planet. */
  projects: [
    {
      id: 'is-it-you',
      title: 'Is It You?',
      planet: 'Is It You?',
      company: 'Pole To Win (PTWI) India', role: 'Senior Software Engineer', dates: 'Aug 2022 – Jan 2024',
      oneLiner: 'A role-based 3D social deduction multiplayer game in a mushroom world.',
      points: ['Ported to mobile, optimised for low-end devices', 'Set up iOS & Android release pipelines', 'Worked on the Jenkins CI pipeline', 'Built sign-in, input system and rebinding'],
      tags: ['Unity', 'Multiplayer', 'Mobile Port', 'Optimisation', 'Jenkins', 'CI/CD'],
      links: [{ href: 'https://steamcommunity.com/app/1978080', label: 'Steam', icon: 'steam' }, { href: 'https://www.instagram.com/reel/CygMFCPOYVv/', label: 'Trailer' }],
      media: [{ src: 'assets/projects/is-it-you-trailer.webm', label: 'Is It You? trailer' }],
      narrator: 'assets/characters/narrator_isityou.png',
      type: 0, radius: 3.0, pos: [10.0, 8.6, 0.6],
      swatch: ['#ff8a55', '#ff6b35', '#00e5ff']
    },
    {
      id: 'all-star-cricket-2',
      title: 'All Star Cricket 2',
      planet: 'All Star Cricket 2',
      company: 'All Star Games', role: 'Unity3D Developer', dates: 'Aug 2021 – Aug 2022',
      oneLiner: 'A multiplayer cricket game for mobile phones.',
      points: ['DAU up from 16% to 35%', 'Built quests, refer-a-friend and tutorial', 'Integrated APIs, characters and animation', 'Worked closely with design and QA'],
      tags: ['Unity', 'Multiplayer', 'Mobile', 'Quests', 'Animation'],
      links: [{ href: 'https://allstargames.io', label: 'Website' }],
      media: [{ src: 'assets/projects/all-star-cricket-2-trailer.mp4', label: 'All Star Cricket 2 trailer' }],
      narrator: 'assets/characters/narrator_cricket.png',
      type: 2, radius: 3.0, pos: [-11.0, -1.6, 0.0],
      swatch: ['#8fe36a', '#3c9a3a', '#ffd700']
    },
    {
      // Not in the resume: copy kept exactly as before (ARKit POC, UI/gameplay).
      id: 'face-hero',
      title: 'Face Hero',
      planet: 'Face Hero',
      eyebrow: 'ARKit · Proof of concept',
      oneLiner: 'An ARKit proof of concept — UI and gameplay.',
      points: ['ARKit proof of concept', 'UI', 'Gameplay'],
      tags: ['ARKit', 'POC', 'UI', 'Gameplay'],
      media: [{ src: 'assets/projects/face-hero.mov', label: 'Face Hero video', note: 'QuickTime (.mov) file — if it does not play in your browser, use the download link.' }],
      narrator: 'assets/characters/narrator_facehero.png',
      type: 1, radius: 2.19, pos: [-12.4, -23.5, 0.4],
      swatch: ['#7fe6e0', '#00bcd4', '#ffffff']
    },
    {
      id: 'remote-for-unity',
      title: 'Remote for Unity',
      planet: 'Hardware Lab',
      company: 'Apra Labs', role: 'Unity3D Developer & Embedded C/C++ Engineer', dates: 'Feb 2019 – Aug 2021',
      oneLiner: 'A VR remote for Google Cardboard apps, which ship without one.',
      points: ['Led the project and set the roadmap', 'Combined hardware and software engineering', 'ESP32/Arduino remote: gyro + buttons', 'Mobile plugins for richer VR input'],
      tags: ['Unity', 'ESP32', 'Arduino', 'Embedded C/C++', 'VR'],
      media: [
        { src: 'assets/projects/remote-1.mp4', label: 'Remote for Unity video 1' },
        { src: 'assets/projects/remote-2.mp4', label: 'Remote for Unity video 2' }
      ],
      narrator: 'assets/characters/narrator_hardware.png',
      type: 3, radius: 2.19, pos: [0.6, -27.5, -0.4],
      swatch: ['#1f5a6b', '#16334a', '#69ff47']
    },
    {
      id: 'sorry-world',
      title: 'Sorry! World',
      planet: 'Sorry! World',
      company: 'Gameberry Labs', role: 'Senior Game Developer', dates: 'Feb 2025 – Jun 2025',
      oneLiner: 'The official Hasbro Sorry! board game on mobile: online multiplayer and city building.',
      points: ['Built the Addressables pipeline', 'Shipped live-ops features and updates', 'Picked up Axmol (Cocos-2D) for gameplay', 'Wrote server-side code in Go'],
      tags: ['Unity', 'Addressables', 'Live Ops', 'Axmol', 'Go'],
      links: [{ href: 'https://play.google.com/store/apps/details?id=com.gameberry.sorry.card.board.game', label: 'Google Play', icon: 'play' }, { href: 'https://apps.apple.com/us/app/sorry-world-online-board-game/id6749000283', label: 'App Store', icon: 'apple' }],
      media: [],
      gallery: [1, 2, 3, 4, 5, 6, 7].map(function (n) { return { src: 'assets/projects/sorry/sorry_' + n + '.jpg', w: 647, h: 1400, alt: 'Sorry! World store screenshot ' + n }; }),
      galleryCaption: 'Official store screenshots',
      narrator: 'assets/characters/narrator_sorry.png',
      type: 0, radius: 3.0, pos: [-9.2, 11.6, 0.2],
      swatch: ['#f3e2b3', '#e23b3b', '#f5c431']
    },
    {
      id: 'alstom-vr',
      title: 'Alstom VR',
      planet: 'Alstom VR',
      company: 'Alstom', role: 'Senior Unity Developer (Consultant) · Solo developer', dates: 'Jun 2025 – Oct 2025',
      oneLiner: 'IMAT: a VR platform for railway that trains design quality inspection on imported CAD models.',
      points: ['Architected IMAT from the ground up', 'Audio + FFmpeg video recording pipeline', 'PDF reports and text-to-speech', 'Wrote a native plugin in Rust'],
      tags: ['VR', 'Unity', 'CAD import', 'FFmpeg', 'Rust', 'Text-to-Speech'],
      media: [],
      narrator: 'assets/characters/narrator_alstom.png',
      type: 1, radius: 2.4, pos: [0.4, -14.0, -0.4],
      swatch: ['#c9d1da', '#2a4fa8', '#e5484d']
    },
    {
      id: 'fishing-game',
      title: 'FishingGame',
      planet: 'FishingGame',
      eyebrow: 'Idle-empire mobile fishing game (in development)',
      role: 'Developer · two-person team (Shivansh owns the design)',
      engine: 'Unity (URP) · mobile portrait',
      oneLiner: 'An idle-empire mobile fishing game (in development).',
      points: ['Idle-empire loop: catch, sell, hire, unlock islands', 'Data-driven progression with ScriptableObjects', 'Custom stylized water shader (URP)', 'Casting: Verlet rope and hook physics', 'Steady 60 fps on Pixel 9', 'AI multi-agent pipeline: Claude Code + Codex'],
      tags: ['Unity', 'URP', 'C#', 'Shaders', 'Mobile', 'Idle', 'AI pipeline'],
      media: [],
      gallery: [
        { src: 'assets/projects/fishing/pa-rework-01-start-zoomed.jpg', w: 720, h: 1280, alt: 'FishingGame gameplay screenshot 1' },
        { src: 'assets/projects/fishing/pa-rework-11-end.jpg', w: 720, h: 1280, alt: 'FishingGame gameplay screenshot 2' },
        { src: 'assets/projects/fishing/pa-rework-10-three-hooks-salmon.jpg', w: 720, h: 1280, alt: 'FishingGame: three hooks and a salmon catch' },
        { src: 'assets/projects/fishing/rod-shop-final.jpg', w: 720, h: 1280, alt: 'FishingGame: rod shop' },
        { src: 'assets/projects/fishing/castloop-02-drag-to-aim-over-water.jpg', w: 720, h: 1280, alt: 'FishingGame: drag to aim the cast over the water' }
      ],
      narrator: 'assets/characters/narrator_fishing.png',
      type: 0, radius: 3.0, pos: [9.4, -2.4, 0.2],
      swatch: ['#7fe6e0', '#1f9bd1', '#f5d48a']
    },
    {
      // learning project: the headline highlight is TEAL (gold is reserved for awards)
      id: 'dark-fantasy-slots',
      title: 'Dark Fantasy Slots',
      planet: 'Dark Fantasy Slots',
      eyebrow: 'Learning project · 5-reel video slot',
      engine: 'Cocos + FairyGUI',
      highlight: 'Auto RTP Calibrator',
      oneLiner: 'A 5-reel video slot: a learning project in Cocos + FairyGUI.',
      points: ['Auto RTP calibrator, tuned to a 96% target', '10M-spin simulator to verify RTP per feature', 'Auto volatility calibration, high-volatility paytable', 'Data-driven reels and paylines (JSON), seeded PRNG', 'Wild, Scatter free spins, Bonus round, MINI/MAXI/MEGA jackpots', 'QA cheats: force wild, scatter, jackpot and bonus', 'Autospin with loss limit and stop-on-feature', '16 paylines, 5×3 reels, steady 120 fps'],
      tags: ['Cocos', 'FairyGUI', 'Game Math', 'RTP', 'Simulation', 'PRNG', 'Slots'],
      media: [],
      gallery: [
        { src: 'assets/projects/slot/slot_1_reels.jpg', w: 3392, h: 1570, alt: 'Base game: 5×3 reels with jackpots', caption: 'Base game: 5×3 reels with jackpots' },
        { src: 'assets/projects/slot/slot_2_paytable.jpg', w: 3392, h: 1570, alt: 'Paytable & rules: 16 paylines', caption: 'Paytable & rules: 16 paylines' }
      ],
      narrator: 'assets/characters/narrator_slot.png',
      type: 3, radius: 2.19, pos: [12.6, -24.0, 0.2],
      swatch: ['#6a5f8a', '#2a2440', '#00e5ff']
    }
  ],
  /* The Achievements COMET: not a project, but a scene body like the planets (same sprite / bob / tilt /
     landing pad / rocket travel), anchored on the comet HEAD. Scene index = projects.length (8).
     drift = slow eased arc near the top (desktop only): ±ax world units in x, arc height ay, period s per pass. */
  station: {
    id: 'achievements', kind: 'comet',
    title: 'Achievements', planet: 'Achievements', eyebrow: 'Hall of Fame',
    radius: 1.5, pos: [0.6, 22.6, -0.6],
    drift: { ax: 4.5, ay: 0.8, period: 50 },
    narrator: 'assets/characters/narrator_achievements.png',
    swatch: ['#fff1c9', '#f2c14a', '#c9921e']
  },
  /* Achievements (gold is reserved for these). Data-driven: add entries here.
     project = project id; glyph = medal glyph ('1' or 'star'); pill = short text for the gold pill. */
  achievements: [
    { id: 'sorry-us-1', project: 'sorry-world', title: '#1 in the US at launch', pill: '#1 in the US at launch',
      glyph: '1', ribbon: ['#e23b3b', '#2f6fde'] },
    { id: 'alstom-gold', project: 'alstom-vr', title: 'Alstom Gold Award', note: 'solo project', pill: 'Alstom Gold Award',
      glyph: 'star', ribbon: ['#2a4fa8', '#e5484d'] }
  ],
  // ←/→, A/D, dropdown and plain-list order (by id). Achievements last.
  navOrder: ['sorry-world', 'is-it-you', 'all-star-cricket-2', 'fishing-game', 'alstom-vr', 'face-hero', 'remote-for-unity', 'dark-fantasy-slots', 'achievements'],
  // Dashed travel routes between bodies: [fromIndex, toIndex, bend]. The ship flies along these.
  // 0 Is It You?, 1 All Star Cricket 2, 2 Face Hero, 3 Hardware Lab (Remote for Unity), 4 Sorry! World,
  // 5 Alstom VR, 6 FishingGame, 7 Dark Fantasy Slots, 8 Achievements comet. Journey top -> bottom.
  routes: [
    [8, 4, 0.16],
    [8, 0, -0.16],
    [4, 0, 0.1],
    [4, 1, -0.14],
    [0, 6, 0.14],
    [1, 6, 0.1],
    [1, 5, -0.12],
    [6, 5, 0.12],
    [5, 2, 0.12],
    [5, 3, -0.1],
    [5, 7, -0.12],
    [2, 3, 0.12],
    [3, 7, -0.12]
  ],
  /* Planet size reference: the camera distance on desktop is fitted to THIS fixed box (the approved
     4-planet layout: Is It You?, All Star Cricket 2, Face Hero, Hardware Lab at their old positions), so
     bodies keep that on-screen size however many projects are added; the space then scrolls vertically. */
  sizeReference: [
    { id: 'is-it-you', pos: [13.4, -6.4, 0.6], radius: 3.0 },
    { id: 'all-star-cricket-2', pos: [-13.6, 5.2, 0.0], radius: 3.0 },
    { id: 'face-hero', pos: [-7.4, -8.0, 0.4], radius: 2.19 },
    { id: 'remote-for-unity', pos: [-17.0, -3.8, -0.4], radius: 2.19 }
  ]
};

/* Planet hero sprites (fixed-angle 2D, 2.5D illusion — they never rotate). Keyed by project id.
   src          final 2048px transparent PNG; if it fails to load -> placeholder image -> CSS ellipse
   body         [cx, cy, rx, ry] of the main rock (or comet head) in % of the image, measured from the PNG alpha.
                The 3D centre sits on (cx, cy); radius (data above) = rx in world units; ry/rx = aspect.
                Glow, shadow, hit area, label gap, route end dots, orbit and pad all follow this ellipse.
                Round planets: rx = ry = body width at ~60% height / 2, cy = bottom − 0.425 × body width.
                Elongated asteroids / comet head: fitted to the rock's alpha bbox / the artist's head fit.
   bbox         [l, t, r, b] whole visible (alpha > 50%) art in % — label sits under bbox bottom; cards avoid it
   padAt        optional [x%, y%] surface point for the landing pad (else: body edge along the route-facing dir)
   overlays     small animated effects positioned in % of the sprite image:
                kind 'flicker' (warm floodlight glow), 'pulse' (glow that swells; colour via `color`),
                'puff' (tiny sparkle/steam puff rising and fading); x, y, size (% of width), delay s (optional)
   medalOrbit   gold medal satellite for award planets: rx/ry in body radii, rot deg, period s
   badgeSlots   medal docking slots (Achievements), % of the image (x, y centre, size = disc diameter)
   (Re-measure body/bbox/padAt whenever a sprite is regenerated: see AGENT_NOTES_web_developer.md.) */
window.PLANET_SPRITES = {
  'all-star-cricket-2': {
    src: 'assets/planets/planet_cricket.png',
    placeholder: 'assets/meshy/cricket/cricket_front.png', placeholderOpaque: true,   // grey bg: masked to a circle
    body: [50.2, 57.8, 34.97, 34.97], bbox: [13.3, 11.7, 87.3, 87.5],
    overlays: [
      { kind: 'flicker', x: 33.9, y: 19.4, size: 13 },               // left floodlight
      { kind: 'flicker', x: 66.0, y: 18.4, size: 13, delay: -1.7 },  // right floodlight
      { kind: 'pulse', x: 27.4, y: 65.5, size: 10, color: '#00e5ff' } // cyan valve at the pipe end
    ]
  },
  'is-it-you':        { src: 'assets/planets/planet_isityou.png',  body: [51.5, 56.1, 29.94, 29.94], bbox: [19.5, 17.4, 83.6, 81.4], overlays: [] },
  // elongated asteroids: body = the rock's alpha bbox (rock centre ≈ 50% height); pad on the rock's top surface
  'face-hero':        { src: 'assets/planets/planet_facehero.png', body: [49.9, 49.9, 41.7, 26.9], bbox: [8.2, 23.0, 91.6, 76.8],
                        padAt: [78, 37.5], overlays: [] },
  'remote-for-unity': { src: 'assets/planets/planet_hardware.png', body: [49.8, 49.8, 41.8, 28.9], bbox: [8.0, 20.9, 91.6, 78.7],
                        padAt: [76, 39], overlays: [] },
  'sorry-world': { src: 'assets/planets/planet_sorry.png', body: [50.5, 58.3, 39.37, 39.37], bbox: [9.6, 8.0, 90.0, 91.8], overlays: [],
                   medalOrbit: { rx: 1.32, ry: 0.36, rot: 16, period: 16 } },
  // the train now sits ON the planet (artist sprite): headlight glow pulse at its nose + a tiny sparkle at the pantograph
  'alstom-vr':   { src: 'assets/planets/planet_alstom.png', body: [49.5, 60.6, 36.42, 36.42], bbox: [12.9, 7.8, 86.9, 91.8],
                   overlays: [
                     { kind: 'pulse', x: 26.2, y: 32.9, size: 7, color: '#fff3b0' },          // headlight
                     { kind: 'puff', x: 42.2, y: 23.6, size: 4, delay: -0.8 }                  // pantograph sparkle
                   ],
                   medalOrbit: { rx: 1.3, ry: 0.46, rot: 36, period: 18, phase: 1.2 } },
  // FishingGame: round ocean planet (lagoon top); body from the alpha (span at 60% height, cy = bottom − 0.425 × width)
  'fishing-game': { src: 'assets/planets/planet_fishing.png', body: [48.5, 63.0, 34.1, 34.1], bbox: [10.7, 8.0, 89.3, 92.0], overlays: [] },
  // Dark Fantasy Slots: elongated asteroid, body = alpha bbox (like Face Hero / Hardware), pad on the rock's right top
  'dark-fantasy-slots': { src: 'assets/planets/asteroid_slot.png', body: [50.0, 50.1, 42.0, 28.8], bbox: [8.0, 21.3, 92.0, 78.9],
                          padAt: [84, 41], overlays: [] },
  // comet: head centre/radius + slots from the 2D Artist's result (2026-11-16 20:20); tail streams to the upper-left
  'achievements': { src: 'assets/planets/comet_achievements.png', body: [68.75, 71.78, 21.48, 21.48], bbox: [6.4, 10.5, 89.8, 88.9],
                    padAt: [84, 60], overlays: [],
                    tail: { tip: [12, 16] },                                                  // particles shed along head -> tip
                    badgeSlots: [{ x: 61.82, y: 72.27, size: 11.5 }, { x: 78.47, y: 72.27, size: 11.5 }] }
};
