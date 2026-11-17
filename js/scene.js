/* Three.js r128 world + DOM hero-sprite planets. Exposes window.createScene().

   Planets are fixed-angle 2D hero sprites (assets/planets/*.png, 2048px, transparent): a 2.5D
   illusion, they never rotate. Three.js still owns the camera, the projection and all 3D flight
   maths, but only RENDERS the back layer (dashed routes, route dots, exhaust puffs, reticle).
   Planet sprites, their landing pads and the rocket are DOM elements in opts.layer, positioned every
   frame from projected 3D positions and z-sorted by camera depth (painter's order). Slingshot orbits
   are tilted away from camera-facing, so the rocket's far half of an orbit has greater depth than
   the planet centre -> it is drawn BEHIND that planet's sprite; on the near half it is in FRONT. */
(function () {
  'use strict';

  var ROCKET_SIZE = 1.35;        // world units (rocket image edge), × ship scale
  var SHIP_SCALE = 1.25;
  var FLAME_CUT = 0.2;           // bottom fraction of rocket.png holding the drawn flame (cropped when landed)
  var ORBIT_TILT = 62 * Math.PI / 180;   // orbit plane tilted away from camera-facing: far half passes behind the planet
  var BOB_PX = 6, BOB_PERIOD = 4.5;      // idle bob: ±6 px screen, 4.5 s sine (ease in/out)
  var TILT_MAX = 6, HOVER_SCALE = 1.05;  // mouse-follow hover tilt (deg) + scale
  var PAD_VIEW = 2.5;            // pad SVG edge = PAD_VIEW × pad radius

  function makeShip() {
    // invisible 3D carrier of position/heading; drawn as the DOM rocket sprite
    var ship = new THREE.Group();
    ship.scale.setScalar(SHIP_SCALE);
    return ship;
  }

  function mulberry(a) {   // tiny seeded RNG (stable sparkle layout between loads)
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function padSVG(id) {
    // origin = centre of the pad's top surface; "up" (away from the planet) = -y
    return '<svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">' +
      '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="#00e5ff" stop-opacity=".9"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse class="pad-glow" cx="0" cy="-2" rx="50" ry="17" fill="url(#' + id + ')"/>' +
      '<path d="M-11 7 L-14 24 L14 24 L11 7Z" fill="#2f8a74" stroke="#0b2b3a" stroke-width="1.5"/>' +
      '<rect x="-46" y="-34" width="4.5" height="40" rx="2" fill="#5fc9a8" stroke="#0b2b3a" stroke-width="1.2"/>' +
      '<rect x="41.5" y="-34" width="4.5" height="40" rx="2" fill="#5fc9a8" stroke="#0b2b3a" stroke-width="1.2"/>' +
      '<circle class="pad-tip" cx="-43.7" cy="-37" r="5"/><circle class="pad-tip" cx="43.7" cy="-37" r="5"/>' +
      '<ellipse cx="0" cy="6" rx="40" ry="10" fill="#2f8a74" stroke="#0b2b3a" stroke-width="1.5"/>' +
      '<rect x="-40" y="0" width="80" height="6" fill="#2f8a74"/>' +
      '<ellipse cx="0" cy="0" rx="40" ry="10" fill="#bff5dc" stroke="#0b2b3a" stroke-width="1.5"/>' +
      '<ellipse class="pad-ring" cx="0" cy="0" rx="28" ry="6.5" fill="none" stroke="#00e5ff" stroke-width="2.6"/>' +
      '</svg>';
  }

  /* ======================================================================= */
  /* Free-floating planets connected by dashed travel routes. No sun, no orbits. */
  window.createScene = function (canvas, projects, opts) {
    if (!window.THREE) throw new Error('THREE not loaded');
    if (!opts.layer) throw new Error('sprite layer missing');
    var reduced = !!opts.reduced;
    var routesDef = opts.routes || [];
    var layer = opts.layer, spriteCfg = opts.sprites || {};
    var tiltMQ = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(14, 1, 0.1, 1200);
    var camDir = new THREE.Vector3(0, 0.55, 1).normalize();   // static 3/4 overhead view
    var screenUpW = new THREE.Vector3(0, 1, 0).addScaledVector(camDir, -camDir.y).normalize();   // world dir of screen-up
    var camTarget = new THREE.Vector3(), camTargetGoal = new THREE.Vector3();
    var camDist = 40, camDistGoal = 40;

    var time = 0;
    var selected = -1, hovered = -1;
    var cRect = null;   // canvas client rect, refreshed on resize/scroll (pointer maths without per-move layout)
    function canvasRect() { return cRect || (cRect = canvas.getBoundingClientRect()); }
    window.addEventListener('scroll', function () { cRect = null; }, { passive: true });

    /* ---------- planets: invisible 3D anchors + DOM hero sprites ---------- */
    function buildSprite(pl, i) {
      var cfg = pl.cfg, p = pl.proj;
      var el = document.createElement('div');
      // the Achievements body (comet) keeps .is-station for its gold styling
      el.className = 'planet-sprite is-loading' + (p.kind === 'station' || p.kind === 'comet' ? ' is-station' : '') + (p.kind === 'comet' ? ' is-comet' : '');
      el.dataset.index = i; el.dataset.project = p.id;
      el.setAttribute('aria-hidden', 'true');           // the accessible controls are the planet labels
      el.style.setProperty('--ax', (pl.ax * 100) + '%');
      el.style.setProperty('--ay', (pl.ay * 100) + '%');
      el.style.setProperty('--body', (100 / pl.size) + '%');                 // body ellipse width (% of sprite width)
      el.style.setProperty('--bodyh', (100 * pl.aspect / pl.size) + '%');    // body ellipse height (same basis)
      el.style.setProperty('--hitk', pl.aspect < 0.9 ? 1.04 : 1.12);          // flat rocks: hit = the rock, no empty band
      el.style.setProperty('--c0', p.swatch[0]); el.style.setProperty('--c1', p.swatch[1]); el.style.setProperty('--c2', p.swatch[2]);
      var fx = (cfg.overlays || []).map(function (o) {
        return '<span class="fx fx-' + o.kind + '" style="left:' + o.x + '%;top:' + o.y + '%;width:' + o.size + '%;' +
          (o.delay != null ? 'animation-delay:' + o.delay + 's;' : '') + (o.color ? '--fx:' + o.color + ';' : '') + '"></span>';
      }).join('');
      // station medal docking slots: code-rendered badges + shine sweep (one per achievement)
      var badges = (cfg.badgeSlots || []).slice(0, (opts.badges || []).length).map(function (b, n) {
        var a = opts.badges[n];
        return '<span class="station-badge" data-achievement="' + a.id + '" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.size + '%">' +
          (window.ART ? window.ART.medal({ glyph: a.glyph, ribbon: a.ribbon, bare: true }) : '') +
          '<span class="badge-shine" style="animation-delay:' + (n * 1.3) + 's"></span></span>';
      }).join('');
      // comet tail: a few gold sparkles shed along the tail (CSS-animated spans, ≤ 40; hidden under reduced motion)
      if (cfg.tail) {
        var hx = pl.ax * 100, hy = pl.ay * 100, tx = cfg.tail.tip[0], ty = cfg.tail.tip[1];
        var ux = tx - hx, uy = ty - hy, ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        var rnd = mulberry(7), sparks = '';
        for (var n = 0; n < (cfg.tail.particles || 26); n++) {
          var f = 0.25 + 0.7 * rnd(), side = (rnd() - 0.5) * 16;
          var x = hx + ux * ul * f - uy * side, y = hy + uy * ul * f + ux * side;
          sparks += '<span class="spark" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%;' +
            '--dx:' + (ux * (4 + 8 * rnd()) - uy * (rnd() - 0.5) * 6).toFixed(1) + 'cqw;--dy:' + (uy * (4 + 8 * rnd()) + ux * (rnd() - 0.5) * 6).toFixed(1) + 'cqw;' +
            'width:' + (0.8 + 1.4 * rnd()).toFixed(2) + '%;animation-duration:' + (2.2 + 1.8 * rnd()).toFixed(2) + 's;animation-delay:' + (-4 * rnd()).toFixed(2) + 's"></span>';
        }
        fx += '<span class="comet-sparks">' + sparks + '</span>';
      }
      // back/front orbit layers: painted before / after the sprite (same z slot as the planet)
      el.innerHTML =
        '<div class="planet-shadow"></div>' +
        '<div class="orbit-layer orbit-back"></div>' +
        '<div class="planet-tilt">' +
          '<div class="planet-glow"></div>' +
          '<div class="planet-placeholder"></div>' +
          '<img class="planet-img" alt="" draggable="false" decoding="async">' +
          '<div class="planet-fx">' + fx + '</div>' +
          (badges ? '<div class="planet-badges">' + badges + '</div>' : '') +
        '</div>' +
        '<div class="orbit-layer orbit-front"></div>' +
        '<div class="planet-pad" data-kind="landing-pad">' + padSVG('padg' + i) + '</div>' +
        '<div class="planet-hit"></div>';
      layer.appendChild(el);
      pl.el = el; pl.tilt = el.querySelector('.planet-tilt'); pl.shadow = el.querySelector('.planet-shadow');
      pl.padEl = el.querySelector('.planet-pad'); pl.hitEl = el.querySelector('.planet-hit');
      pl.backEl = el.querySelector('.orbit-back'); pl.frontEl = el.querySelector('.orbit-front');
      pl.tiltEls = [pl.backEl, pl.tilt, pl.frontEl];     // hover tilt moves the orbit layers with the body
      buildOrbiters(pl, i);

      // sprite source: final hero sprite -> placeholder image -> CSS placeholder circle
      var img = el.querySelector('.planet-img'), srcs = [cfg.src, cfg.placeholder].filter(Boolean);
      pl.spriteState = 'loading'; pl.spriteSrc = null;
      (function tryNext(k) {
        if (k >= srcs.length) {
          pl.spriteState = 'placeholder-circle'; img.removeAttribute('src');
          el.classList.remove('is-loading'); el.classList.add('is-circle'); return;
        }
        img.onload = function () {
          pl.spriteState = k === 0 ? 'sprite' : 'placeholder-image'; pl.spriteSrc = srcs[k];
          el.classList.remove('is-loading');
          el.classList.toggle('is-sprite', k === 0);
          el.classList.toggle('is-opaque-placeholder', k > 0 && !!cfg.placeholderOpaque);
        };
        img.onerror = function () { tryNext(k + 1); };
        img.src = srcs[k];
      })(0);

      // tap / click selects; mouse hover tilts toward the pointer (never on touch)
      var hit = pl.hitEl, down = null;
      hit.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !e.isPrimary) return;          // no right-click / secondary-touch picks
        down = { x: e.clientX, y: e.clientY };
        if (hit.setPointerCapture) try { hit.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      hit.addEventListener('pointercancel', function () { down = null; });
      hit.addEventListener('lostpointercapture', function () { setTimeout(function () { down = null; }, 0); });
      hit.addEventListener('pointerup', function (e) {
        if (!down) return;
        var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        down = null;
        if (moved <= 12 && opts.onPick) opts.onPick(i);
      });
      hit.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        hovered = i;
        if (reduced || !tiltMQ.matches) return;
        // from cached frame values (no layout read): hit circle = body centre, radius 0.56 × body width
        var cr = canvasRect(), rad = Math.max(1, pl.sr * 1.12);
        var nx = Math.max(-1, Math.min(1, (e.clientX - cr.left - pl.sx) / rad));
        var ny = Math.max(-1, Math.min(1, (e.clientY - cr.top - pl.sy) / rad));
        pl.tiltNow = { x: nx, y: ny };
        var tf = 'rotateX(' + (-ny * TILT_MAX).toFixed(2) + 'deg) rotateY(' + (nx * TILT_MAX).toFixed(2) + 'deg) scale(' + HOVER_SCALE + ')';
        pl.tiltEls.forEach(function (t) { t.classList.add('is-tilting'); t.style.transform = tf; });
      });
      hit.addEventListener('pointerleave', function () {
        if (hovered === i) hovered = -1;
        pl.tiltNow = null;
        pl.tiltEls.forEach(function (t) { t.classList.remove('is-tilting'); t.style.transform = ''; });   // CSS transition eases back to rest
      });
    }

    /* ---------- orbiters: gold medal satellites of award planets ----------
       Each runs on a tilted ellipse in the sprite's % space (centre = body centre). On the far (upper)
       half it lives in .orbit-back (painted before the sprite: hidden behind the body), on the near half
       in .orbit-front. Far half: slightly smaller + dimmer. Reduced motion: static on the near half. */
    function buildOrbiters(pl, i) {
      pl.orbiters = [];
      var cfg = pl.cfg, bodyR = 50 / pl.size;   // body half-width, % of the sprite
      function add(o) {
        var el = document.createElement('div');
        el.className = 'orbiter orbiter-' + o.kind;
        el.style.width = (o.width * 2 * bodyR).toFixed(2) + '%';
        el.innerHTML = o.html;
        o.el = el; o.side = 'front'; pl.frontEl.appendChild(el);
        o.cx = pl.ax * 100; o.cy = pl.ay * 100; o.rx *= bodyR; o.ry *= bodyR; o.rotR = (o.rot || 0) * Math.PI / 180;
        pl.orbiters.push(o);
        return o;
      }
      var award = (opts.awards || []).filter(function (a) { return a.planet === i; })[0];
      if (award) {
        var mo = cfg.medalOrbit || {};
        add({ kind: 'medal', rx: mo.rx || 1.3, ry: mo.ry || 0.36, rot: mo.rot || 16, period: mo.period || 16,
              phase: Math.PI / 2 + (mo.phase != null ? mo.phase : 0.9), width: 0.2, rotate: false,
              html: window.ART ? window.ART.medal({ glyph: award.glyph, ribbon: award.ribbon }) : '' });
      }
    }
    function updateOrbiters(pl) {
      for (var n = 0; n < pl.orbiters.length; n++) {
        var o = pl.orbiters[n];
        var t = o.phase - time * TWO_PI / o.period;              // decreasing angle: near half travels right
        var c = Math.cos(t), sn = Math.sin(t), cr = Math.cos(o.rotR), sr = Math.sin(o.rotR);
        var lx = o.rx * c, ly = o.ry * sn;
        var x = o.cx + lx * cr - ly * sr, y = o.cy + lx * sr + ly * cr;
        var near = (sn + 1) / 2, side = sn >= 0 ? 'front' : 'back';
        if (side !== o.side) { (side === 'front' ? pl.frontEl : pl.backEl).appendChild(o.el); o.side = side; }
        var sc = 0.84 + 0.16 * near, tf = 'translate(' + (x * pl.w / 100).toFixed(1) + 'px,' + (y * pl.w / 100).toFixed(1) + 'px) translate(-50%,-50%)';
        if (o.rotate) {
          // velocity (dt < 0) in the rotated frame; foreshorten the length like a projected circle
          var vx0 = o.rx * sn, vy0 = -o.ry * c, vx = vx0 * cr - vy0 * sr, vy = vx0 * sr + vy0 * cr;
          var fs = Math.max(0.34, Math.hypot(vx, vy) / o.rx);
          tf += vx >= 0 ? ' rotate(' + Math.atan2(vy, vx).toFixed(3) + 'rad) scale(' + (sc * fs).toFixed(3) + ',' + sc.toFixed(3) + ')'
                        : ' rotate(' + Math.atan2(-vy, -vx).toFixed(3) + 'rad) scale(' + (-sc * fs).toFixed(3) + ',' + sc.toFixed(3) + ')';
        } else tf += ' scale(' + sc.toFixed(3) + ')';
        o.el.style.transform = tf;
        o.el.style.filter = 'brightness(' + (0.7 + 0.3 * near).toFixed(2) + ')';
        o.t = t; o.x = x; o.y = y;
      }
    }

    var planets = projects.map(function (proj, i) {
      var root = new THREE.Group();
      root.userData.kind = 'planet'; scene.add(root);
      var base = new THREE.Vector3().fromArray(proj.pos);
      root.position.copy(base);
      var cfg = spriteCfg[proj.id] || {}, body = cfg.body;
      // body ellipse [cx, cy, rx, ry] (% of the image) -> anchor, size (sprite width ÷ 2R), aspect (ry/rx)
      var anchor = body ? [body[0], body[1]] : (cfg.anchor || [50, 55]);
      var pl = { proj: proj, root: root, base: base, sel: 0, hover: 0, scale: 1, cfg: cfg,
                 size: body ? 50 / body[2] : (cfg.size || 1.35), aspect: body ? body[3] / body[2] : 1,
                 ax: anchor[0] / 100, ay: anchor[1] / 100,
                 drift: proj.drift || null, driftT: 0, driftOff: new THREE.Vector3(), driftHold: false,
                 ppu: 0, bobPx: 0, w: 0, z: 0, left: 0, top: 0, tiltNow: null,
                 off: new THREE.Vector3(), offGoal: new THREE.Vector3(), disp: base.clone() };
      buildSprite(pl, i);
      return pl;
    });

    /* gold constellation lines: Achievements station -> each award-winning planet (SVG under all sprites) */
    var stationIdx = -1; planets.forEach(function (pl, i) { if (pl.proj.kind === 'station' || pl.proj.kind === 'comet') stationIdx = i; });
    var stationHot = false;
    var SVGNS = 'http://www.w3.org/2000/svg';
    var constEl = document.createElementNS(SVGNS, 'svg');
    constEl.setAttribute('class', 'constellation'); constEl.setAttribute('aria-hidden', 'true');
    layer.insertBefore(constEl, layer.firstChild);
    var constLines = stationIdx < 0 ? [] : (opts.awards || []).map(function (a) {
      var g = document.createElementNS(SVGNS, 'g'), path = document.createElementNS(SVGNS, 'path'), glow = document.createElementNS(SVGNS, 'path');
      glow.setAttribute('class', 'const-glow'); path.setAttribute('class', 'const-line');
      g.appendChild(glow); g.appendChild(path);
      var stars = [0.3, 0.55, 0.78].map(function (f, k) {
        var c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('class', 'const-star'); c.setAttribute('r', k === 1 ? 2.6 : 1.9);
        c.style.animationDelay = (k * 0.7) + 's'; g.appendChild(c); return { el: c, f: f };
      });
      constEl.appendChild(g);
      return { planet: a.planet, path: path, glow: glow, stars: stars, d: '' };
    });
    function updateConstellation() {
      if (!constLines.length) return;
      if (constEl.__w !== W || constEl.__h !== H) { constEl.__w = W; constEl.__h = H; constEl.setAttribute('width', W); constEl.setAttribute('height', H); }
      var S = planets[stationIdx];
      constEl.classList.toggle('is-lit', stationHot || hovered === stationIdx);
      constLines.forEach(function (L) {
        var P = planets[L.planet], dx = P.sx - S.sx, dy = P.sy - S.sy, len = Math.hypot(dx, dy) || 1;
        var mx = (S.sx + P.sx) / 2 - dy / len * len * 0.08, my = (S.sy + P.sy) / 2 + dx / len * len * 0.08;
        var d = 'M' + S.sx.toFixed(1) + ' ' + S.sy.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + P.sx.toFixed(1) + ' ' + P.sy.toFixed(1);
        if (d !== L.d) { L.d = d; L.path.setAttribute('d', d); L.glow.setAttribute('d', d); }
        L.stars.forEach(function (st) {
          var f = st.f, u = 1 - f;
          st.el.setAttribute('cx', (u * u * S.sx + 2 * u * f * mx + f * f * P.sx).toFixed(1));
          st.el.setAttribute('cy', (u * u * S.sy + 2 * u * f * my + f * f * P.sy).toFixed(1));
        });
      });
    }

    /* dashed travel routes (gently curved quadratic beziers between planets) */
    var adj = planets.map(function () { return []; });
    var ROUTE_SEGS = 80;
    var routes = routesDef.map(function (r, k) {
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(ROUTE_SEGS + 1).fill(0).map(function () { return new THREE.Vector3(); })),
        new THREE.LineDashedMaterial({ color: 0xc9b8ff, dashSize: 0.42, gapSize: 0.34, transparent: true, opacity: 0.8 }));
      line.userData.kind = 'route'; line.frustumCulled = false; scene.add(line);
      var dots = [0, 1].map(function () {
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        dot.userData.kind = 'route-dot'; scene.add(dot); return dot;
      });
      adj[r[0]].push({ to: r[1], route: k }); adj[r[1]].push({ to: r[0], route: k });
      return { a: r[0], b: r[1], bend: r[2] || 0.18, ctrl: new THREE.Vector3(), s0: new THREE.Vector3(), e0: new THREE.Vector3(), line: line, dots: dots };
    });
    var rv1 = new THREE.Vector3(), rv2 = new THREE.Vector3(), rv3 = new THREE.Vector3();
    function edgeDist(pl, dir) {
      // distance from the centre to the body ellipse (semi-axes R, R·aspect in screen x / y) along dir
      var R = pl.proj.radius, dx = dir.x, dy = dir.y, l = Math.hypot(dx, dy);
      if (l < 1e-6 || pl.aspect >= 0.999) return R;
      dx /= l; dy /= l;
      return R / Math.sqrt(dx * dx + (dy / pl.aspect) * (dy / pl.aspect));
    }
    function layoutRoute(R) {
      // gently curved quadratic bezier between the planets' current (displayed) positions
      var A = planets[R.a], B = planets[R.b];
      var dir = rv1.subVectors(B.disp, A.disp), len = dir.length(); dir.normalize();
      var perp = rv2.set(-dir.y, dir.x, 0).normalize();
      R.ctrl.addVectors(A.disp, B.disp).multiplyScalar(0.5).addScaledVector(perp, len * R.bend);
      rv3.subVectors(R.ctrl, A.disp).normalize();
      var s0 = A.disp.clone().addScaledVector(rv3, edgeDist(A, rv3) * 1.12);
      rv3.subVectors(R.ctrl, B.disp).normalize();
      var e0 = B.disp.clone().addScaledVector(rv3, edgeDist(B, rv3) * 1.12);
      var pts = new THREE.QuadraticBezierCurve3(s0, R.ctrl, e0).getPoints(ROUTE_SEGS), pos = R.line.geometry.attributes.position;
      for (var i = 0; i <= ROUTE_SEGS; i++) pos.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      pos.needsUpdate = true;
      R.line.computeLineDistances();
      R.dots[0].position.copy(s0); R.dots[1].position.copy(e0);
      R.s0.copy(s0); R.e0.copy(e0);
    }
    routes.forEach(layoutRoute);
    var pushV = new THREE.Vector3();
    function updatePushGoals() {
      // mobile zoom: non-selected planets slide away from the selected one, off-screen
      planets.forEach(function (pl, i) {
        if (zoomMode && selected >= 0 && i !== selected && !travel) {   // mobile flight: real layout (route visible)
          pushV.subVectors(pl.base, planets[selected].base); pushV.z = 0;
          if (pushV.lengthSq() < 1e-4) pushV.set(1, 0, 0);
          pl.offGoal.copy(pushV.normalize().multiplyScalar(18));
        } else pl.offGoal.set(0, 0, 0);
      });
    }

    function findPath(from, to) {
      // Shortest route chain by distance (Dijkstra over the dashed-route graph), so a
      // pair with no direct route hops through the nearest connected planet.
      if (from === to) return [from];
      if (directJump) return [from, to];   // a jump that scrolls the page: straight to the target, no hops
      var n = planets.length, dist = [], prev = [], done = [];
      for (var i = 0; i < n; i++) { dist[i] = Infinity; prev[i] = -1; done[i] = false; }
      dist[from] = 0;
      for (;;) {
        var u = -1;
        for (i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || u === to) break;
        done[u] = true;
        adj[u].forEach(function (e) {
          var d = dist[u] + planets[u].base.distanceTo(planets[e.to].base);
          if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = u; }
        });
      }
      if (dist[to] === Infinity) return null;        // disconnected: caller flies a free arc
      var path = [to]; while (path[0] !== from) path.unshift(prev[path[0]]);
      return path;
    }

    /* ship (3D carrier) + DOM rocket sprite + reticle + exhaust puffs */
    var ship = makeShip(); scene.add(ship);
    var rocketEl = document.createElement('div');
    rocketEl.className = 'rocket-sprite'; rocketEl.setAttribute('aria-hidden', 'true');
    rocketEl.innerHTML = '<i class="rocket-warp"></i><img src="assets/ui/rocket.png" alt="" draggable="false" decoding="async">';
    layer.appendChild(rocketEl);
    var rocketWarp = rocketEl.firstChild, rocketImg = rocketEl.lastChild, rocketLoaded = false;
    function onRocket() { rocketLoaded = true; rocketEl.classList.add('is-ready'); }
    if (rocketImg.complete && rocketImg.naturalWidth) onRocket(); else rocketImg.addEventListener('load', onRocket);
    var rocketState = { z: 0, size: 0, docked: true, behind: -1 };
    var spriteDir = new THREE.Vector3(), spriteA = new THREE.Vector3(), spriteB = new THREE.Vector3(), spriteAngle = 0;
    function updateRocketAngle() {
      // rotate in screen space so the nose (image +Y) points along the ship's 3D heading
      spriteDir.set(0, 0, 1).applyQuaternion(ship.quaternion);
      spriteA.copy(ship.position).project(camera);
      spriteB.copy(ship.position).addScaledVector(spriteDir, 0.6).project(camera);
      var dx = (spriteB.x - spriteA.x) * W, dy = (spriteB.y - spriteA.y) * H;
      if (dx * dx + dy * dy > 4) spriteAngle = Math.atan2(dy, dx) - Math.PI / 2;
    }
    var reticle = new THREE.Group(), reticleRing = (function () {
      var pts = new THREE.EllipseCurve(0, 0, 1.0, 1.0, 0, Math.PI * 2, false, 0).getPoints(48).map(function (v) { return new THREE.Vector3(v.x, v.y, 0); });
      var l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x00e5ff, dashSize: 0.32, gapSize: 0.18, transparent: true, opacity: 0.9 }));
      l.computeLineDistances(); return l;
    })();
    reticle.add(reticleRing); scene.add(reticle);
    var puffs = [], puffGeo = new THREE.IcosahedronGeometry(0.14, 0), puffIdx = 0;
    for (var pi = 0; pi < 40; pi++) {
      var pm = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: pi % 3 ? 0x2f7bff : 0x00e5ff, transparent: true, opacity: 0 }));
      pm.userData.life = 0; scene.add(pm); puffs.push(pm);
    }
    /* ---------- landing pads ----------
       One pad per planet (DOM SVG inside the planet sprite, so it shares the planet's z-order and
       sits in front of the sprite). 3D placement as before: direction dockDir = up + left/right toward
       the planet's routes + slightly toward the viewer, on the body ellipse (or at cfg.padAt). The SVG is
       rotated to dockDir's screen direction and sized from the pad radius (max(0.18R, 0.42)). */
    planets.forEach(function (pl, i) {
      var R = pl.proj.radius, amp = 0.16;
      var side = 0;
      adj[i].forEach(function (e) { side += rv1.subVectors(routes[e.route].ctrl, pl.base).normalize().x; });
      pl.dockDir = new THREE.Vector3(side < 0 ? -0.55 : 0.55, 0.8, 0.12).normalize();
      var padR = Math.max(0.18 * R, 0.42), padH = 0.06 * R;
      if (pl.cfg.padAt) {
        // measured surface point (image %) -> world offset in the sprite plane (+ a little toward the viewer)
        var spriteW = 2 * R * pl.size, pa = pl.cfg.padAt;
        var off = new THREE.Vector3(1, 0, 0).multiplyScalar((pa[0] - pl.ax * 100) / 100 * spriteW)
          .addScaledVector(screenUpW, -(pa[1] - pl.ay * 100) / 100 * spriteW).addScaledVector(camDir, 0.12 * R);
        pl.dockDir = off.clone().normalize().multiplyScalar(0.45).add(new THREE.Vector3(0, 0.9, 0.12)).normalize();
        pl.padOff = off.addScaledVector(pl.dockDir, padH);       // pad top = surface + pad height
      } else {
        pl.padOff = pl.dockDir.clone().multiplyScalar(edgeDist(pl, pl.dockDir) * (1 + amp * 0.5) + 0.06 + padH);
      }
      pl.pad = { padR: padR, screen: { x: 0, y: 0 }, angle: 0 };
    });
    var SHIP_CLEAR = 0.52;   // ship centre above the pad top (fins rest on the platform)
    function padPoint(i, out) {        // centre of the pad's top surface (world)
      var pl = planets[i];
      return (out || new THREE.Vector3()).copy(pl.root.position).addScaledVector(pl.padOff, pl.scale);
    }
    function dockPoint(i, out) {       // landed: sitting ON the pad
      return padPoint(i, out).addScaledVector(planets[i].dockDir, SHIP_CLEAR);
    }
    function hoverPoint(i, out) {      // just above the pad: vertical take-off / final descent
      return padPoint(i, out).addScaledVector(planets[i].dockDir, SHIP_CLEAR + 1.1);
    }
    var shipAt = opts.shipStart != null ? opts.shipStart : 0, travel = null, landing = null;
    var MOBILE_FLIGHT_SPEED = 1.5;   // mobile zoom: whole flight (orbit + hop) ≈ 2.5 s
    var ORBIT_SECONDS = 1.2, HOP_SECONDS = 2.5, BUMP_SECONDS = 0.3, RAMP = 0.3, LAND_SPEED = 0.6;
    /* Off-screen select: the off-screen part of the journey is skipped. The rocket is moved just outside the
       viewport edge facing its old position and flies straight in to an entry point near the target in
       FLYIN_SECONDS (ease-out, speed streak); then the normal final approach + landing at normal speed. */
    var FLYIN_SECONDS = 0.5, FLYIN_EASE = 0.7;      // ease f(x) = x + k x (1 - x): exits at (1 - k) x mean speed
    var directJump = false, lastFlyIn = null, pinged = -1, pingAt = 0, warpOn = true;
    var flightId = 0, bumpPeak = 1, arrivals = 0, lastExit = null, lastReroute = null;
    var shipVel = new THREE.Vector3(), lastShipPos = new THREE.Vector3();
    dockPoint(shipAt, ship.position); lastShipPos.copy(ship.position);

    /* =====================================================================
       Journey = sequence of phases, each built when it starts from the ship's REAL position and
       velocity (so interrupts and moving planets never cause a jump):
         orbit  (1.2 s) — circle the planet (radius = surface + pad + 0.25R) in a plane that contains
                          the direction to the next destination and is tilted ORBIT_TILT away from
                          camera-facing (screen-up half recedes): far half behind the sprite, near half in
                          front. One full revolution plus the turn to the slingshot exit angle
                          θx = ∓acos(ρ/L), where the tangent line passes through the next planet.
         travel (2.5 s) — cubic leaving the exit point along the orbit tangent. Via hops end tangent to
                          the next planet's orbit; the final hop swings over the target and descends
                          onto its pad. Speed profile matches orbit speed at both ends (fling -> glide).
       then a 0.3 s landing settle, then opts.onArrive (the card appears). */
    var TWO_PI = Math.PI * 2, lv1 = new THREE.Vector3(), lv2 = new THREE.Vector3(), lv3 = new THREE.Vector3(), lv4 = new THREE.Vector3();
    function wrap2pi(a) { a %= TWO_PI; return a < 0 ? a + TWO_PI : a; }
    function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
    function centerOf(i) { return function (o) { return o.copy(planets[i].root.position); }; }
    function orbitRadius(i) {
      var pl = planets[i], R = pl.proj.radius, amp = 0.16;
      return (R * (1 + amp * 0.5) + 0.06 * R + 0.25 * R) * pl.scale;   // surface + pad height + 0.25R
    }
    function frameToward(center, dest, normalHint) {
      // e1 points at the destination. Without a hint the plane is tilted: e2 = screen-perpendicular
      // to e1 (pointing screen-up) rotated ORBIT_TILT away from the camera, so the upper half of the
      // orbit ellipse lies behind the planet centre (depth) and the lower half in front of it.
      var e1 = dest.clone().sub(center), L = e1.length(); e1.divideScalar(L || 1);
      var n, e2;
      if (normalHint) {
        n = normalHint.clone().addScaledVector(e1, -normalHint.dot(e1));
        if (n.lengthSq() < 1e-6) n.set(0, 0, 1).addScaledVector(e1, -e1.z);
        n.normalize();
        e2 = new THREE.Vector3().crossVectors(n, e1);
      } else {
        var n0 = camDir.clone().addScaledVector(e1, -camDir.dot(e1));
        if (n0.lengthSq() < 1e-6) n0.set(0, 0, 1).addScaledVector(e1, -e1.z);
        n0.normalize();
        var s = new THREE.Vector3().crossVectors(n0, e1).normalize();
        if (s.dot(screenUpW) < 0) s.negate();
        e2 = s.multiplyScalar(Math.cos(ORBIT_TILT)).addScaledVector(n0, -Math.sin(ORBIT_TILT)).normalize();
        n = new THREE.Vector3().crossVectors(e1, e2).normalize();      // so that n × e1 = e2
      }
      return { e1: e1, e2: e2, n: n, L: L };
    }
    function angleIn(F, v) { return Math.atan2(v.dot(F.e2), v.dot(F.e1)); }
    function exitAngle(F, rho, dir) { var k = Math.acos(Math.min(0.97, rho / Math.max(F.L, 1e-3))); return dir > 0 ? -k : k; }
    function sweepTo(th0, thX, dir) { return dir > 0 ? wrap2pi(thX - th0) : wrap2pi(th0 - thX); }
    function tangentAt(F, th, dir, out) { return out.copy(F.e1).multiplyScalar(-Math.sin(th) * dir).addScaledVector(F.e2, Math.cos(th) * dir); }

    /* angle progress: starts at slope a (relative to cruise), linear ramp to cruise by x = RAMP */
    function rampK(a) { return 1 / (1 - RAMP * (1 - a) / 2); }
    function rampG(x, a) {
      var k = rampK(a);
      return x < RAMP ? k * (a * x + (1 - a) * x * x / (2 * RAMP)) : k * ((1 + a) * RAMP / 2 + x - RAMP);
    }
    function orbitPos(o, th, out) {
      var r = o.rho(), c = o.center(lv4);
      return out.copy(c).addScaledVector(o.F.e1, r * Math.cos(th)).addScaledVector(o.F.e2, r * Math.sin(th));
    }
    function orbitTheta(o, x) { return o.theta0 + o.dir * o.sweep * rampG(x, o.a); }
    function orbitAt(o, x, out) {
      orbitPos(o, orbitTheta(o, x), out);
      if (x < RAMP) out.addScaledVector(o.offset, 1 - smooth01(x / RAMP));   // blend in from pad / previous path
      return out;
    }
    function makeOrbit(o) {
      // o: planet (index|null), center(fn), rho(fn), F, dir, theta0, sweep, T, sIn, start, rest, final
      o.kind = 'orbit'; o.t = 0;
      var q = o.sIn * o.T / Math.max(1e-3, o.rho() * o.sweep);
      o.a = Math.max(0, Math.min(3, q * (1 - RAMP / 2) / Math.max(0.2, 1 - q * RAMP / 2)));
      o.offset = o.start.clone().sub(orbitPos(o, o.theta0, new THREE.Vector3()));
      o.cruise = o.rho() * o.sweep * rampK(o.a) / o.T;
      return o;
    }
    var MIN_REV = 0.75 * TWO_PI;
    function bestDir(F, rho, thetaFor) {
      // "orbit once": of both turning directions and 0/1 extra laps, take the sweep that ends on
      // the slingshot exit angle and is closest to one revolution (never less than 0.75 rev)
      var best = null;
      [1, -1].forEach(function (dir) {
        var th0 = thetaFor(dir), d = sweepTo(th0, exitAngle(F, rho, dir), dir);
        [d, d + TWO_PI].forEach(function (sw) {
          if (sw < MIN_REV) return;
          if (!best || Math.abs(sw - TWO_PI) < Math.abs(best.sweep - TWO_PI)) best = { dir: dir, theta0: th0, sweep: sw };
        });
      });
      return best;
    }

    /* legs used inside a travel phase */
    function legPoint(L, s, out) {
      var a = L.from(lv1), b = L.to(lv2);
      if (L.kind === 'line') return out.copy(a).lerp(b, s);
      if (L.kind === 'cubic') {
        L.t1(lv4); lv4.multiplyScalar(-L.k1).add(b);          // P2 first: t1() may use lv3 as scratch
        lv3.copy(a).addScaledVector(L.t0, L.k0);              // P1
        var k = 1 - s;
        return out.set(0, 0, 0).addScaledVector(a, k * k * k).addScaledVector(lv3, 3 * k * k * s).addScaledVector(lv4, 3 * k * s * s).addScaledVector(b, s * s * s);
      }
      // around: interpolate direction + distance from the planet centre, bulging outward
      var c = planets[L.planet].root.position;
      a.sub(c); b.sub(c);
      var ra = a.length(), rb = b.length();
      a.divideScalar(ra || 1); b.divideScalar(rb || 1);
      var bump = Math.sin(Math.PI * s);
      lv3.copy(a).multiplyScalar(1 - s).addScaledVector(b, s).add(lv4.set(0, 0, 0.35 * bump));
      if (lv3.lengthSq() < 1e-6) lv3.set(0, 0, 1);
      lv3.normalize().multiplyScalar((ra + (rb - ra) * s) * (1 + 0.12 * bump));
      return out.copy(c).add(lv3);
    }
    function legLength(L) {
      var len = 0, p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
      legPoint(L, 0, p0);
      for (var i = 1; i <= 24; i++) { legPoint(L, i / 24, p1); len += p1.distanceTo(p0); p0.copy(p1); }
      return Math.max(len, 1e-3);
    }
    function travelPoint(T, u, out) {
      var d = Math.max(0, Math.min(1, u)) * T.total;
      for (var i = 0; i < T.legs.length; i++) {
        var L = T.legs[i];
        if (d <= L.len || i === T.legs.length - 1) { T.cur = L; return legPoint(L, Math.min(1, d / L.len), out); }
        d -= L.len;
      }
      return out;
    }
    function makeTravel(o) {
      // o: legs, T, v0, v1, to(node), final, via (orbit spec to start on arrival, or null)
      o.kind = 'travel'; o.t = 0;
      var L = 0; o.legs.forEach(function (lg) { lg.len = legLength(lg); L += lg.len; });
      o.total = L;
      var T = o.T, v0 = o.v0, v1 = o.v1, a = Math.max(2.5, (v0 + v1) / (0.8 * L)), E = 0, c = 0;
      for (var it = 0; it < 16; it++) {
        E = (1 - Math.exp(-a * T)) / a; c = (L - (v0 + v1) * E) / (T - 2 * E);
        if (c >= 0.15 * L / T) break;
        a *= 1.4;
      }
      o.prof = { a: a, c: c };
      return o;
    }
    function travelDist(o, t) {   // distance flown after t s: fast out of the orbit, glide, speed up into the next
      if (o.flyin) { var x = Math.max(0, Math.min(1, t / o.T)); return o.total * (x + FLYIN_EASE * x * (1 - x)); }
      var a = o.prof.a, c = o.prof.c, T = o.T;
      return (o.v0 - c) * (1 - Math.exp(-a * t)) / a + (o.v1 - c) * (Math.exp(-a * (T - t)) - Math.exp(-a * T)) / a + c * t;
    }
    function travelAt(o, t, out) { return travelPoint(o, travelDist(o, Math.max(0, Math.min(o.T, t))) / o.total, out); }

    /* ---- phase builders ---- */
    function departOrbit(from, path, final, sIn) {
      // orbit planet `from`, then head for path[0] (or land back on `from` if path is empty)
      var c = planets[from].root.position.clone(), rho = function () { return orbitRadius(from); };
      var o = { planet: from, center: centerOf(from), rho: rho, T: ORBIT_SECONDS, sIn: sIn || 0, start: ship.position.clone(), rest: path, final: final };
      var dest = path.length ? planets[path[0]].root.position : hoverPoint(from);
      o.F = frameToward(c, dest);
      var th = angleIn(o.F, ship.position.clone().sub(c));
      var b = bestDir(o.F, rho(), function () { return th; });
      o.dir = b.dir; o.theta0 = th; o.sweep = b.sweep;
      return makeOrbit(o);
    }
    function exitState(o) {   // position + unit velocity at the end of an orbit
      var p = orbitAt(o, 1, new THREE.Vector3()), q = orbitAt(o, 1 - 1e-3, new THREE.Vector3());
      return { p: p, v: p.clone().sub(q).normalize(), speed: p.distanceTo(q) / (1e-3 * o.T) };
    }
    function travelFrom(p0, t0, s0, path, final) {
      // fly from p0 (moving along t0 at s0) to path[0]; orbit there if it is a via-planet, else land
      var to = path[0], legs = [], via = null, v1;
      if (to !== final) {
        var cB = planets[to].root.position.clone(), next = planets[path[1]].root.position, rhoB = function () { return orbitRadius(to); };
        var F = frameToward(cB, next), u = cB.clone().sub(p0).normalize(), ux = u.dot(F.e1), uy = u.dot(F.e2);
        var b = bestDir(F, rhoB(), function (dir) { return dir > 0 ? Math.atan2(-ux, uy) : Math.atan2(ux, -uy); });
        via = { planet: to, center: centerOf(to), rho: rhoB, F: F, dir: b.dir, theta0: b.theta0, sweep: b.sweep, T: ORBIT_SECONDS, rest: path.slice(1), final: final };
        var tEnd = tangentAt(F, b.theta0, b.dir, new THREE.Vector3());
        var entry = function (o) { return orbitPos(via, via.theta0, o); };
        var k = 0.35 * p0.distanceTo(entry(new THREE.Vector3()));
        legs.push({ kind: 'cubic', from: function (o) { return o.copy(p0); }, to: entry, t0: t0.clone(), k0: k, k1: k, t1: function (o) { return o.copy(tEnd); } });
        v1 = rhoB() * b.sweep / ORBIT_SECONDS;
      } else {
        // final hop: arrive at the near side of the target, swing over to above the pad, descend onto it
        var dirE = p0.clone().sub(planets[to].root.position).normalize(), rhoT = function () { return orbitRadius(to); };
        var E = function (o) { return o.copy(planets[to].root.position).addScaledVector(dirE, rhoT()); };
        var tE = function (o) {
          hoverPoint(to, o).sub(E(lv3)); o.addScaledVector(dirE, -o.dot(dirE));
          return o.lengthSq() > 1e-4 ? o.normalize() : o.copy(dirE).negate();
        };
        var kk = 0.35 * p0.distanceTo(E(new THREE.Vector3()));
        legs.push({ kind: 'cubic', from: function (o) { return o.copy(p0); }, to: E, t0: t0.clone(), k0: kk, k1: kk, t1: tE });
        legs.push({ kind: 'around', planet: to, from: E, to: function (o) { return hoverPoint(to, o); } });
        legs.push({ kind: 'line', upright: to, from: function (o) { return hoverPoint(to, o); }, to: function (o) { return dockPoint(to, o); } });
        v1 = LAND_SPEED;
      }
      return makeTravel({ legs: legs, T: HOP_SECONDS, v0: s0, v1: v1, to: to, final: final, via: via, rest: path });
    }
    function startPhase(ph, carry) {
      // carry = time already spent in this phase (frame overshoot of the previous one): log the true start
      travel.phase = ph; ph.t = carry || 0;
      travel.log.push({ kind: ph.kind, planet: ph.kind === 'orbit' ? ph.planet : ph.to, T: ph.T, sweep: ph.sweep || null, startedAt: travel.clock - (carry || 0) });
      return ph;
    }
    function afterOrbit(o, carry) {
      var ex = exitState(o), path = o.rest.length ? o.rest : [o.planet];
      var tr = travelFrom(ex.p, ex.v, ex.speed, path, o.final);
      startPhase(tr, carry);
      // slingshot continuity: velocity just before vs just after the exit
      var a0 = travelAt(tr, 0, new THREE.Vector3()), a1 = travelAt(tr, 0.004, new THREE.Vector3());
      var vAfter = a1.sub(a0), sAfter = vAfter.length() / 0.004; vAfter.normalize();
      var toDest = planets[path[0]].root.position.clone().sub(ex.p).normalize();
      lastExit = { planet: o.planet, dest: path[0], continuity: ex.v.dot(vAfter), towardDest: ex.v.dot(toDest),
                   speedBefore: ex.speed, speedAfter: sAfter, turned: o.sweep };
    }
    function afterTravel(tr, carry) {
      if (tr.flyin) { startPhase(travelFrom(tr.endP.clone(), tr.endDir, tr.endSpeed, [tr.to], tr.to), carry); return; }
      if (tr.via) {
        var v = tr.via; v.sIn = shipVel.length(); v.start = ship.position.clone();
        startPhase(makeOrbit(v), carry);
      } else {
        shipAt = tr.to; landing = { t: 0, id: travel.id, at: shipAt }; travel = null; bumpPeak = 1;
        updatePushGoals();
      }
    }

    function nearestEntry(p, final) {   // network node that makes (here -> node -> ... -> final) shortest
      if (directJump) return [final];
      var best = null;
      planets.forEach(function (pl, n) {
        var nodes = findPath(n, final); if (!nodes) return;
        var cost = p.distanceTo(pl.root.position) + pathLength(nodes);
        if (!best || cost < best.cost) best = { n: n, nodes: nodes, cost: cost };
      });
      return best ? best.nodes : [final];
    }
    function pathLength(nodes) {
      var d = 0; for (var j = 0; j + 1 < nodes.length; j++) d += planets[nodes[j]].base.distanceTo(planets[nodes[j + 1]].base);
      return d;
    }
    function miniOrbit(final) {
      // interrupted in mid-air: loop once (tangent to the current velocity) and fling toward the new target
      var p = ship.position.clone(), s = Math.max(2, shipVel.length());
      var w = shipVel.lengthSq() > 1e-6 ? shipVel.clone().normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
      var path = nearestEntry(p, final), D = planets[path[0]].root.position.clone();
      var nrm = new THREE.Vector3().crossVectors(w, D.clone().sub(p));
      if (nrm.lengthSq() < 1e-6) nrm.copy(camDir).addScaledVector(w, -camDir.dot(w));
      nrm.normalize();
      var side = new THREE.Vector3().crossVectors(nrm, w), rho = 1.5, center, F, th0, sw;
      for (var it = 0; it < 3; it++) {
        center = p.clone().addScaledVector(side, rho);
        F = frameToward(center, D, nrm); th0 = angleIn(F, p.clone().sub(center));
        sw = TWO_PI + sweepTo(th0, exitAngle(F, rho, 1), 1);
        rho = Math.max(0.8, Math.min(3.5, s * ORBIT_SECONDS / sw));
      }
      center = p.clone().addScaledVector(side, rho);
      F = frameToward(center, D, nrm); th0 = angleIn(F, p.clone().sub(center));
      sw = TWO_PI + sweepTo(th0, exitAngle(F, rho, 1), 1);
      var cFix = center.clone(), rFix = rho;
      return makeOrbit({ planet: null, center: function (o) { return o.copy(cFix); }, rho: function () { return rFix; }, F: F, dir: 1,
                         theta0: th0, sweep: sw, T: ORBIT_SECONDS, sIn: s, start: p, rest: path, final: final });
    }
    function retargetOrbit(o, final) {
      // interrupted mid-orbit around a planet: keep circling it, re-aim the exit at the new target
      var P = o.planet, c = planets[P].root.position.clone(), path = (findPath(P, final) || [P, final]).slice(1);
      var dest = path.length ? planets[path[0]].root.position : hoverPoint(P);
      var F = frameToward(c, dest), dir = F.n.dot(o.F.n) >= 0 ? o.dir : -o.dir, rho = orbitRadius(P);
      var th0 = angleIn(F, ship.position.clone().sub(c));
      var thX = path.length ? exitAngle(F, rho, dir) : 0;          // landing back here: exit right under the pad
      var sw = sweepTo(th0, thX, dir), s = Math.max(1, shipVel.length());
      var T = Math.max(0.25, Math.min(ORBIT_SECONDS, sw * rho / s));
      return makeOrbit({ planet: P, center: centerOf(P), rho: function () { return orbitRadius(P); }, F: F, dir: dir, theta0: th0,
                         sweep: Math.max(sw, 1e-3), T: T, sIn: s, start: ship.position.clone(), rest: path, final: final });
    }

    /* Returns true when a journey starts (the UI then waits for onArrive before showing the card). */
    function selectPlanet(i, so) {
      if (i === selected) return !!travel || !!landing;
      var progress = so && so.progress != null ? so.progress : null;   // desktop: page scroll the view is heading to
      directJump = progress != null || zoomMode;   // page-scroll jump / mobile: straight to the target, no hops at other planets
      selected = i;
      updatePushGoals();
      if (zoomMode) frameGoal(false);      // mobile: the view is about to move to the new planet - judge against that
      if (reduced) {
        var wasOff = !rocketOnScreen(progress);
        shipAt = i; travel = null; landing = null; dockPoint(i, ship.position);
        if (wasOff) { rocketEl.classList.remove('is-fadein'); void rocketEl.offsetWidth; rocketEl.classList.add('is-fadein'); }
        return false;
      }
      landing = null; ship.scale.setScalar(1.25);
      var ph = travel && travel.phase, origin = travel ? travel.nodes[0] : shipAt;
      var vBefore = shipVel.clone(), wasMoving = !!ph;
      if (!travel && shipAt === i) return false;
      var nodes = travel ? null : (findPath(shipAt, i) || [shipAt, i]);
      travel = { id: ++flightId, to: i, nodes: nodes, log: travel ? travel.log : [], clock: travel ? travel.clock : 0, rerouted: !!travel };
      updatePushGoals();                     // mobile: un-push the planets for the flight
      if (warpOn && !zoomMode && !rocketOnScreen(progress)) { flyIn(i, progress); return true; }   // off-screen: skip to the edge
      if (!ph) startPhase(departOrbit(shipAt, nodes.slice(1), i, 0));                  // docked: orbit, then go
      else if (ph.kind === 'orbit' && ph.planet != null) {
        var r = retargetOrbit(ph, i); travel.nodes = [ph.planet].concat(r.rest); startPhase(r);   // keep circling, re-aim
      } else {
        var m = miniOrbit(i); travel.nodes = [origin].concat(m.rest); startPhase(m);              // mid-air: mini orbit
      }
      if (wasMoving) {   // QA: how cleanly the interrupt continued (position gap, heading/speed change)
        var np = travel.phase, p0 = orbitAt(np, 0, new THREE.Vector3()), p1 = orbitAt(np, 0.004, new THREE.Vector3());
        var vNew = p1.sub(p0).divideScalar(0.004 * np.T);
        lastReroute = { gap: p0.distanceTo(ship.position), turn: vBefore.lengthSq() > 1e-6 && vNew.lengthSq() > 1e-6 ? vBefore.clone().normalize().dot(vNew.clone().normalize()) : 1,
                        speedBefore: vBefore.length(), speedAfter: vNew.length(), kind: np.planet == null ? 'mini-orbit' : 'retarget-orbit' };
      }
      return true;
    }
    function flyIn(i, progress) {
      // place the rocket just outside the view edge on the line target -> old position, fly straight in to E
      var cam = viewCam(progress), rc = viewRect(progress), P = planets[i].root.position;
      var d = ship.position.clone().sub(P); d.addScaledVector(camDir, -d.dot(camDir));
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
      d.normalize();
      var m = Math.max(24, (rocketState.size || 40) * 0.7), q = new THREE.Vector3();
      var inside = function (s, pad) {
        q.copy(P).addScaledVector(d, s).project(cam);
        var x = (q.x * 0.5 + 0.5) * W, y = (-q.y * 0.5 + 0.5) * H;
        return q.z < 1 && x >= rc.x0 + pad && x <= rc.x1 - pad && y >= rc.y0 + pad && y <= rc.y1 - pad;
      };
      var edge = function (pad) {     // distance along d where the point leaves the rect (shrunk by pad)
        if (!inside(0, pad)) return 0;
        var lo = 0, hi = 1;
        while (inside(hi, pad) && hi < 1e4) { lo = hi; hi *= 2; }
        for (var k = 0; k < 24; k++) { var mid = (lo + hi) / 2; if (inside(mid, pad)) lo = mid; else hi = mid; }
        return hi;
      };
      var R = orbitRadius(i), sIn = edge(m), sOut = Math.max(edge(-m), sIn + R);
      var sE = Math.max(R * 1.3, Math.min(R * 2.6, sIn * 0.8));
      var S = P.clone().addScaledVector(d, sOut), E = P.clone().addScaledVector(d, sE);
      ship.position.copy(S); lastShipPos.copy(S); shipVel.set(0, 0, 0);
      var ph = makeTravel({ legs: [{ kind: 'line', from: function (o) { return o.copy(S); }, to: function (o) { return o.copy(E); } }],
                            T: FLYIN_SECONDS, v0: 0, v1: 0, to: i, final: i, via: null, rest: [i] });
      ph.flyin = true; ph.endP = E; ph.endDir = E.clone().sub(S).normalize(); ph.endSpeed = (1 - FLYIN_EASE) * ph.total / FLYIN_SECONDS;
      travel.nodes = [i]; startPhase(ph);
      lastFlyIn = { flightId: travel.id, to: i, dist: ph.total, startedAt: performance.now() };
    }
    var goalCam = null, gsv = new THREE.Vector3(); var frameStartPos = new THREE.Vector3();
    var WARP_SUBSTEP = 0.03;   // max sim s per flight sub-step (long frames are split)
    function stepFlight(h) {
      // advance the journey clock by h (sim) seconds, placing the ship; phase changes as in normal flight.
      // Long steps (warp) are split so shipVel stays the true tangent velocity (it seeds orbits / reroutes).
      if (h > WARP_SUBSTEP * 1.0001) {
        var n = Math.ceil(h / WARP_SUBSTEP);                 // even split: no tiny last step (noisy velocity)
        for (var q = 0; q < n && travel; q++) stepFlight(h / n);
        return;
      }
      if (!travel) return;
      lastShipPos.copy(ship.position);
      var ph = travel.phase;
      ph.t += h; travel.clock += h;      // clock = flight (sim) time: the phase log keeps its 1.2 s / 2.5 s spacing under warp
      if (ph.t >= ph.T) {
        var carry = ph.t - ph.T;
        if (ph.kind === 'orbit') { orbitAt(ph, 1, ship.position); afterOrbit(ph, carry); }
        else { travelAt(ph, ph.T, ship.position); afterTravel(ph, carry); }
      }
      if (travel) {
        var cp = travel.phase;
        if (cp.kind === 'orbit') orbitAt(cp, Math.min(1, cp.t / cp.T), ship.position); else travelAt(cp, cp.t, ship.position);
        if (h > 0) shipVel.subVectors(ship.position, lastShipPos).divideScalar(h);
      }
    }
    var gLook = new THREE.Vector3();
    function viewCam(progress) {
      // the camera the view settles on: mobile = framing of the selected planet; desktop = pan at the
      // page scroll `progress` (0..1, the scroll-to-target in flight) or the current scroll
      if (!goalCam) goalCam = camera.clone();
      goalCam.aspect = camera.aspect; goalCam.updateProjectionMatrix();
      gLook.copy(camTargetGoal);
      if (!zoomMode) {
        var sp = progress != null ? progress : (opts.scrollProgress ? opts.scrollProgress() || 0 : 0);
        gLook.y -= Math.max(0, Math.min(1, sp)) * (scrollTop - scrollBot);
      }
      goalCam.position.copy(camDir).multiplyScalar(camDistGoal).add(gLook); goalCam.lookAt(gLook); goalCam.updateMatrixWorld();
      return goalCam;
    }
    function viewRect(progress) {
      // visible part of the stage in canvas px (the canvas can extend past the window while the page scrolls);
      // with a scroll-to-target pending the sticky stage ends up pinned at the top
      var r = canvas.getBoundingClientRect(), vh = window.innerHeight || H, vw = window.innerWidth || W;
      var top = progress != null ? 0 : r.top;
      return { x0: Math.max(0, -r.left), x1: Math.min(W, vw - r.left), y0: Math.max(0, -top), y1: Math.min(H, vh - top) };
    }
    function rocketOnScreen(progress) {
      gsv.copy(ship.position).project(viewCam(progress));
      if (gsv.z > 1) return false;
      var x = (gsv.x * 0.5 + 0.5) * W, y = (-gsv.y * 0.5 + 0.5) * H, rc = viewRect(progress);
      var m = Math.max(4, (rocketState.size || 0) * 0.25);
      return x >= rc.x0 - m && x <= rc.x1 + m && y >= rc.y0 - m && y <= rc.y1 + m;
    }
    /* sizing / camera framing */
    var W = 1, H = 1, zoomMode = false, hudPx = 0;
    var vA = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
    /* Desktop framing. Body sizes are FIXED: the camera distance is fitted to the approved 4-planet reference
       box (opts.sizeRef), never to the whole (growing) layout. The space is taller than the viewport, so the
       camera pans down world-y with the page scroll (opts.scrollProgress 0..1): scrollTop -> scrollBot. */
    function itemOf(pl) {
      return { p: pl.base, R: pl.proj.radius, size: pl.size, ax: pl.ax, ay: pl.ay, bb: pl.cfg.bbox || [10, 10, 90, 90], drift: pl.drift };
    }
    var refItems = (opts.sizeRef || []).map(function (r) {
      var cfg = spriteCfg[r.id] || {}, body = cfg.body || [50, 55, 37, 37];
      return { p: new THREE.Vector3().fromArray(r.pos), R: r.radius, size: 50 / body[2], ax: body[0] / 100, ay: body[1] / 100, bb: cfg.bbox || [10, 10, 90, 90], drift: null };
    });
    function boxAt(d, target, items, box) {
      camera.position.copy(camDir).multiplyScalar(d).add(target); camera.lookAt(target); camera.updateMatrixWorld();
      camRight.setFromMatrixColumn(camera.matrixWorld, 0); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      var mnx = 9, mxx = -9, mny = 9, mxy = -9;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], p = it.p, sw = 2 * it.R * it.size, bb = it.bb;
        // visible art box around the centre (anchor), plus room for the label pill under the art
        var ext = [(bb[0] / 100 - it.ax) * sw, (bb[2] / 100 - it.ax) * sw, -((bb[3] / 100 - it.ay) * sw + 3.0), (it.ay - bb[1] / 100) * sw];
        var dxs = it.drift ? [-it.drift.ax, it.drift.ax] : [0];      // the comet's whole drift range must fit
        for (var q = 0; q < dxs.length; q++) {
          for (var k = 0; k < 4; k++) {
            vA.copy(p).addScaledVector(camRight, dxs[q]).addScaledVector(k < 2 ? camRight : camUp, ext[k]).project(camera);
            mnx = Math.min(mnx, vA.x); mxx = Math.max(mxx, vA.x); mny = Math.min(mny, vA.y); mxy = Math.max(mxy, vA.y);
          }
        }
      }
      box.mnx = mnx; box.mxx = mxx; box.mny = mny; box.mxy = mxy;
      return box;
    }
    function limits() { return { top: 1 - 2 * (hudPx + 8) / H, bot: -1 + 2 * 64 / H }; }   // bottom: keyboard hint bar
    function fitDist(items, c, xOnly) {     // smallest distance where items fit (x only, or the whole free area), re-centred
      var box = {}, L = limits(), hi = 40;
      for (var pass = 0; pass < 3; pass++) {
        var lo = 8; hi = 200;
        for (var it = 0; it < 24; it++) {
          var mid = (lo + hi) / 2; boxAt(mid, c, items, box);
          var ok = box.mnx >= -0.95 && box.mxx <= 0.95 && (xOnly || (box.mny >= L.bot && box.mxy <= L.top));
          if (ok) hi = mid; else lo = mid;
        }
        boxAt(hi, c, items, box);
        var tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        var dx = (box.mnx + box.mxx) / 2, dy = xOnly ? 0 : (box.mny + box.mxy) / 2 - (L.top + L.bot) / 2;
        c.addScaledVector(camRight, dx * hi * tanV * camera.aspect).addScaledVector(camUp, dy * hi * tanV);
      }
      return hi;
    }
    var camLook = new THREE.Vector3(), deskTarget = new THREE.Vector3(), deskDist = 40, refDist = 40, scrollTop = 0, scrollBot = 0, scrollPx = 0, scrollPan = 0;
    function fitDesktop() {
      var items = planets.map(itemOf), c = new THREE.Vector3(), box = {}, L = limits();
      planets.forEach(function (p) { c.add(p.base); }); c.multiplyScalar(1 / planets.length);
      // 1) reference size: the old 4-planet layout fitted into this viewport
      refDist = refItems.length ? fitDist(refItems, c.clone(), false) : fitDist(items, c.clone(), false);
      // 2) never larger than that; only farther if the layout is too wide for this viewport
      var cx = c.clone(), wDist = fitDist(items, cx, true);
      deskDist = Math.max(refDist, wDist);
      c.x = cx.x; c.z = cx.z;
      // 3) vertical extent: target y where the content top touches the HUD / the content bottom the hint bar
      function solve(edge, lim) {
        var y = c.y;
        for (var k = 0; k < 6; k++) {
          var t0 = new THREE.Vector3(c.x, y, c.z), t1 = new THREE.Vector3(c.x, y + 1, c.z);
          var a = boxAt(deskDist, t0, items, box)[edge], b = boxAt(deskDist, t1, items, box)[edge];
          var slope = b - a; if (Math.abs(slope) < 1e-6) break;
          y += (lim - a) / slope;
        }
        return y;
      }
      var yT = solve('mxy', L.top), yB = solve('mny', L.bot);
      if (yT <= yB) { yT = yB = (yT + yB) / 2; }
      scrollTop = yT; scrollBot = yB;
      // pixels per world unit of camera pan at the screen centre -> scroll length in px (content moves 1:1 with the page)
      var tc = new THREE.Vector3(c.x, yT, c.z);
      boxAt(deskDist, tc, [], box);                     // camera at the target; a 1-unit pan = content moving by -1
      var ppuY = Math.abs(vA.copy(tc).project(camera).y - vA.copy(tc).add(new THREE.Vector3(0, -1, 0)).project(camera).y) * H / 2;
      scrollPx = (yT - yB) * ppuY;
      deskTarget.set(c.x, yT, c.z);
    }
    function resize() {
      var rect = canvas.getBoundingClientRect(); cRect = null;
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      zoomMode = W <= 768;
      updatePushGoals();
      hudPx = opts.hudHeight ? opts.hudHeight() : 100;
      fitDesktop();
      frameGoal(true);
    }
    function frameGoal(snap) {
      var tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      if (zoomMode && selected >= 0) {
        // mobile: selected planet body diameter ≈ 60% of viewport width
        var pl = planets[selected], r = pl.proj.radius * 1.08;
        camDistGoal = (r / 0.6) / (tanV * camera.aspect);
        camTargetGoal.copy(pl.base);
        // nudge so the sprite (towers reach above the body) sits in the free area between HUD and docked callout
        camTargetGoal.y += (hudPx - 150) / H * camDistGoal * tanV + pl.proj.radius * 0.18;
        if (travel && !reduced) { camTargetGoal.copy(ship.position); camTargetGoal.y += (hudPx - 60) / H * camDistGoal * tanV; }   // in flight: follow the rocket
      } else {
        camDistGoal = deskDist; camTargetGoal.copy(deskTarget);
      }
      // page scroll pans the desktop camera straight down the tall space (applied unsmoothed: 1:1 with the scroll)
      var sp = !zoomMode && opts.scrollProgress ? Math.max(0, Math.min(1, opts.scrollProgress() || 0)) : 0;
      scrollPan = -sp * (scrollTop - scrollBot);
      if (snap) { camDist = camDistGoal; camTarget.copy(camTargetGoal); }
    }

    /* ---------- DOM layer: planet sprites, pads, rocket, starfield parallax ---------- */
    var camFwd = new THREE.Vector3(), sA = { x: 0, y: 0 }, sB = { x: 0, y: 0 }, sv = new THREE.Vector3(), dv = new THREE.Vector3();
    function toScreen(v, out) {
      sv.copy(v).project(camera);
      out.x = (sv.x * 0.5 + 0.5) * W; out.y = (-sv.y * 0.5 + 0.5) * H; out.z = sv.z;
      return out;
    }
    function depthOf(v) { return dv.subVectors(v, camera.position).dot(camFwd); }
    function projectPlanet(i, out) {
      var pl = planets[i];
      toScreen(pl.root.position, out);
      sv.copy(pl.root.position).addScaledVector(camUp, pl.proj.radius * pl.scale).project(camera);
      out.r = Math.abs((-sv.y * 0.5 + 0.5) * H - out.y);
      return out;
    }
    var starPar = { x: 0, y: 0 };
    function updateDom(dt) {
      camera.getWorldDirection(camFwd);
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      // painter's order by camera depth: farthest planet gets the lowest z-index
      var order = planets.map(function (pl, i) { return { i: i, d: depthOf(pl.root.position) }; })
        .sort(function (a, b) { return b.d - a.d; });
      order.forEach(function (o, k) { planets[o.i].z = 10 + 10 * k; planets[o.i].depth = o.d; });
      var s = {};
      planets.forEach(function (pl, i) {
        projectPlanet(i, s);
        pl.ppu = s.r / (pl.proj.radius * pl.scale);
        pl.sx = s.x; pl.sy = s.y; pl.sr = s.r; pl.visible = s.z < 1;
        var el = pl.el, w = 2 * s.r * pl.size;
        if (Math.abs(w - pl.w) > 0.5) {
          // size via width/height (not a transform scale) so the 2048px source is resampled crisply
          pl.w = w; el.style.width = el.style.height = w.toFixed(1) + 'px';
          el.style.perspective = Math.round(Math.max(600, w * 3)) + 'px';
        }
        pl.left = s.x - pl.ax * pl.w; pl.top = s.y - pl.ay * pl.w;
        el.style.transform = 'translate3d(' + pl.left.toFixed(1) + 'px,' + pl.top.toFixed(1) + 'px,0)';
        el.style.zIndex = pl.z;
        el.classList.toggle('is-selected', i === selected);
        el.classList.toggle('is-hovered', i === hovered);
        // shadow stays put while the planet bobs: shrinks/fades as the planet rises
        var b = pl.bobPx / BOB_PX;
        pl.shadow.style.transform = 'translate(-50%,-50%) translateY(' + pl.bobPx.toFixed(1) + 'px) scale(' + (1 - 0.07 * b).toFixed(3) + ')';
        pl.shadow.style.opacity = (0.85 - 0.15 * b).toFixed(2);
        // landing pad
        padPoint(i, vA); toScreen(vA, sA); vA.add(pl.dockDir); toScreen(vA, sB);
        var ang = Math.atan2(sB.x - sA.x, -(sB.y - sA.y));
        var ps = PAD_VIEW * pl.pad.padR * pl.scale * pl.ppu;
        pl.pad.screen.x = sA.x; pl.pad.screen.y = sA.y; pl.pad.angle = ang; pl.pad.size = ps;
        if (Math.abs(ps - (pl.pad.wSet || 0)) > 0.5) { pl.pad.wSet = ps; pl.padEl.style.width = pl.padEl.style.height = ps.toFixed(1) + 'px'; }
        pl.padEl.style.transform = 'translate(' + (sA.x - pl.left - ps / 2).toFixed(1) + 'px,' + (sA.y - pl.top - ps / 2).toFixed(1) + 'px) rotate(' + ang.toFixed(3) + 'rad)';
        if (pl.orbiters.length) updateOrbiters(pl);
      });
      updateConstellation();
      // rocket: slots in after every planet that is farther from the camera than the ship
      toScreen(ship.position, sA);
      vA.copy(ship.position).add(camUp); toScreen(vA, sB);
      var ppuS = Math.hypot(sB.x - sA.x, sB.y - sA.y), size = ROCKET_SIZE * ship.scale.x * ppuS;
      var dS = depthOf(ship.position), k = 0;
      planets.forEach(function (pl) { if (pl.depth > dS) k++; });
      var docked = !travel;
      rocketState.z = 10 * k + 5; rocketState.size = size; rocketState.docked = docked; rocketState.depth = dS;
      rocketState.behind = -1;
      planets.forEach(function (pl, i) {   // QA: the planet whose sprite currently covers the rocket
        if (pl.z > rocketState.z && Math.hypot(sA.x - pl.sx, sA.y - pl.sy) < pl.sr * 0.9) rocketState.behind = i;
      });
      rocketState.x = sA.x; rocketState.y = sA.y;
      updateRocketAngle();
      rocketEl.style.zIndex = rocketState.z;
      rocketEl.style.width = rocketEl.style.height = size.toFixed(1) + 'px';
      rocketEl.style.transform = 'translate3d(' + (sA.x - size / 2).toFixed(1) + 'px,' + (sA.y - size / 2).toFixed(1) + 'px,0) rotate(' + (-spriteAngle).toFixed(3) + 'rad)';
      rocketEl.classList.toggle('is-docked', docked);
      var fph = travel && travel.phase, wo = reduced || !fph || !fph.flyin ? 0 : Math.round(20 * (1 - Math.pow(Math.min(1, fph.t / fph.T), 3))) / 20;
      if (wo !== rocketState.warpO) { rocketState.warpO = wo; rocketWarp.style.opacity = wo.toFixed(2); }
      var pingOn = pinged >= 0 && (performance.now() - pingAt < 900 || selected !== pinged);
      planets.forEach(function (pl, i) { pl.el.classList.toggle('is-ping', pingOn && i === pinged); });
      // parallax starfield: layers shift with the pointer (desktop) and with camera pans (mobile zoom)
      if (opts.starLayers && opts.starLayers.length) {
        var kp = reduced ? 1 : 1 - Math.exp(-dt * 4);
        var px = opts.parallax && !zoomMode && !reduced ? opts.parallax.x : 0, py = opts.parallax && !zoomMode && !reduced ? opts.parallax.y : 0;
        starPar.x += (px - starPar.x) * kp; starPar.y += (py - starPar.y) * kp;
        var cx = (camTarget.x - deskTarget.x), cy = (camTarget.y - deskTarget.y);
        opts.starLayers.forEach(function (L) {
          var tx = -(starPar.x * 14 + cx * 4) * L.depth, ty = (starPar.y * 10 + cy * 4) * L.depth;
          if (L.tile) {   // scroll parallax: far layers drift slower than the planets; wrapped by the tile (layers are one tile taller)
            var sy = -scrollPan * (scrollPx / Math.max(1e-6, scrollTop - scrollBot)) * 0.45 * L.depth;
            ty = ((ty - sy) % L.tile + L.tile) % L.tile;
          }
          L.el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0)';
        });
      }
    }

    /* loop */
    var routesDirty = false;
    var running = true, last = performance.now(), raf = 0, tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), look = new THREE.Vector3(), dummy = new THREE.Object3D();
    /* Comet drift: slow eased ping-pong along a shallow arc near the top (desktop only). Holds still while
       hovered (sprite or label), selected, or while the rocket is flying to / orbiting / landing on it. */
    function updateDrift(pl, i, dt) {
      var ph = travel && travel.phase;
      pl.driftHold = hovered === i || (i === stationIdx && stationHot) || selected === i ||
        (travel && (travel.to === i || (ph && ph.kind === 'orbit' && ph.planet === i))) || (landing && landing.at === i);
      var D = pl.drift, ox = 0, oy = 0;
      if (!reduced && !zoomMode) {
        if (!pl.driftHold) pl.driftT += dt;
        var p = (pl.driftT / D.period + 0.25) % 2, u = p < 1 ? p : 2 - p;      // starts at the centre of the arc
        u = u * u * (3 - 2 * u);                                                // eased at both ends
        var sx = 2 * u - 1;
        ox = D.ax * sx; oy = D.ay * (1 - sx * sx) - D.ay;                      // highest mid-pass
      }
      var k = reduced ? 1 : 1 - Math.exp(-dt * 2);
      var nx = zoomMode || reduced ? pl.driftOff.x + (0 - pl.driftOff.x) * k : ox, ny = zoomMode || reduced ? pl.driftOff.y + (0 - pl.driftOff.y) * k : oy;
      if (Math.abs(nx - pl.driftOff.x) + Math.abs(ny - pl.driftOff.y) > 1e-5) { pl.driftOff.set(nx, ny, 0); pl.disp.addVectors(pl.base, pl.off).add(pl.driftOff); routesDirty = true; }
    }

    function spawnPuff(at) {
      var p = puffs[puffIdx++ % puffs.length];
      p.position.copy(at).add(tmp2.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2));
      p.userData.life = 1; p.scale.setScalar(1 + Math.random() * 0.7); p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    }

    function tick(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      if (!reduced) time += dt;
      var motion = reduced ? 0 : 1;

      planets.forEach(function (pl, i) {
        if (pl.off.distanceToSquared(pl.offGoal) > 1e-6) {
          pl.off.lerp(pl.offGoal, reduced ? 1 : 1 - Math.exp(-dt * 3));
          pl.disp.addVectors(pl.base, pl.off).add(pl.driftOff); routesDirty = true;
        }
        if (pl.drift) updateDrift(pl, i, dt);
        // idle bob: ±BOB_PX screen pixels (converted with last frame's px-per-unit), sine = ease in/out
        pl.bobPx = BOB_PX * Math.sin(time * TWO_PI / BOB_PERIOD + i * 1.7) * motion;
        pl.root.position.copy(pl.disp);                 // disp = base + mobile push offset + comet drift
        if (pl.ppu > 0) pl.root.position.addScaledVector(screenUpW, pl.bobPx / pl.ppu);
        var sGoal = i === selected ? 1 : 0, hGoal = i === hovered ? 1 : 0, k = reduced ? 1 : Math.min(1, dt * 8);
        pl.sel += (sGoal - pl.sel) * k; pl.hover += (hGoal - pl.hover) * k;
        pl.scale = 1 + 0.08 * pl.sel; pl.root.scale.setScalar(pl.scale);
      });
      if (routesDirty) { routes.forEach(layoutRoute); routesDirty = false; }
      routes.forEach(function (r) {
        var on = selected >= 0 && (r.a === selected || r.b === selected);
        r.line.material.color.setHex(on ? 0x00e5ff : 0xc9b8ff);
      });

      // ship: step the current journey phase; then the landing settle; then report onArrive
      var bank = 0, bankAxis = null, upright = null;
      var simDt = zoomMode && travel ? dt * MOBILE_FLIGHT_SPEED : dt;
      frameStartPos.copy(ship.position);
      var flew = !!travel;
      if (travel) stepFlight(simDt);
      if (simDt <= 0) simDt = dt;
      if (travel) {
        var cp = travel.phase, x = Math.min(1, cp.t / cp.T);
        if (cp.kind === 'orbit') {
          orbitAt(cp, x, ship.position);
          orbitAt(cp, Math.min(1, x + 0.004), look); orbitAt(cp, Math.max(0, x - 0.004), tmp2);
          look.sub(tmp2);
          // bank into the curve as the orbit is entered: roll the ship's top toward the centre
          bank = 0.6 * smooth01(x / RAMP); bankAxis = cp.center(tmp).sub(ship.position).normalize();
          dummy.up.copy(cp.F.n).multiplyScalar(-Math.cos(bank)).addScaledVector(bankAxis, Math.sin(bank)).normalize();
        } else {
          travelAt(cp, cp.t, ship.position);
          travelAt(cp, Math.min(cp.T, cp.t + 0.01), look); travelAt(cp, Math.max(0, cp.t - 0.01), tmp2);
          look.sub(tmp2);
          upright = cp.cur && cp.cur.upright;
          dummy.up.copy(camDir).negate();
        }
        if (upright != null) { dummy.position.copy(ship.position); dummy.lookAt(look.copy(ship.position).add(planets[upright].dockDir)); }
        else if (look.lengthSq() > 1e-10) { dummy.position.copy(ship.position); dummy.lookAt(look.add(ship.position)); }
        if (cp.kind === 'travel' || x > RAMP * 0.5) spawnPuff(ship.localToWorld(tmp2.set(0, 0, -0.6)));
      }
      if (!travel) {
        dockPoint(shipAt, ship.position);
        dummy.up.copy(camDir).negate();
        dummy.position.copy(ship.position); dummy.lookAt(look.copy(ship.position).add(planets[shipAt].dockDir));
      }
      if (dt > 0 && !(flew && travel)) shipVel.subVectors(ship.position, frameStartPos).divideScalar(simDt);   // in flight: stepFlight set it
      lastShipPos.copy(ship.position);
      var bumpS = 1;
      if (landing) {
        landing.t += dt;
        var lk = Math.min(1, landing.t / BUMP_SECONDS);
        bumpS = 1 + 0.15 * Math.sin(Math.PI * lk);        // 1.0 -> 1.15 -> 1.0 over 0.3 s
        bumpPeak = Math.max(bumpPeak, bumpS);
        if (lk >= 1) { var arrivedAt = landing.at; landing = null; bumpS = 1; arrivals++; if (opts.onArrive) opts.onArrive(arrivedAt); }
      }
      ship.scale.setScalar(SHIP_SCALE * bumpS);
      ship.quaternion.slerp(dummy.quaternion, reduced ? 1 : 1 - Math.exp(-dt * 14));
      reticle.position.copy(ship.position); reticle.quaternion.copy(camera.quaternion);
      reticleRing.rotation.z += dt * 0.8 * motion;
      reticle.visible = !!travel || selected < 0;
      puffs.forEach(function (p) {
        if (p.userData.life <= 0) { p.material.opacity = 0; return; }
        p.userData.life -= dt * 1.3;
        p.material.opacity = Math.max(0, p.userData.life) * 0.9;
        p.scale.multiplyScalar(1 - dt * 0.8);
      });

      // camera
      frameGoal(false);
      var kc = reduced ? 1 : 1 - Math.exp(-dt * (zoomMode && travel ? 5 : 3.5));   // mobile flight: follow with a slight lag
      camTarget.lerp(camTargetGoal, kc);
      camDist += (camDistGoal - camDist) * kc;
      camLook.copy(camTarget); camLook.y += scrollPan;
      camera.position.copy(camDir).multiplyScalar(camDist).add(camLook);
      if (!zoomMode && !reduced && opts.parallax) { camera.position.x += opts.parallax.x * 0.8; camera.position.y += opts.parallax.y * 0.5; }
      camera.lookAt(camLook);
      camera.updateMatrixWorld();

      updateDom(dt);
      renderer.render(scene, camera);
      if (opts.onFrame) opts.onFrame();
      raf = requestAnimationFrame(tick);
    }

    resize();
    frameGoal(true);
    camLook.copy(camTarget); camLook.y += scrollPan;
    camera.position.copy(camDir).multiplyScalar(camDist).add(camLook); camera.lookAt(camLook); camera.updateMatrixWorld();
    updateDom(0);
    raf = requestAnimationFrame(tick);

    return {
      resize: resize,
      select: function (i, o) { return selectPlanet(i, o); },
      setWarp: function (on) { warpOn = !!on; },   // QA hook
      // immediate click feedback (before any scroll / flight): target glow pulse + pad lit
      ping: function (i) {
        pinged = i; pingAt = performance.now();
        planets.forEach(function (pl, j) { pl.el.classList.toggle('is-ping', j === i); });   // this frame, not the next
      },
      isFlying: function () { return !!travel || !!landing; },
      setRunning: function (on) {
        if (on === running) return;
        running = on;
        if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      },
      isZoomMode: function () { return zoomMode; },
      // desktop scroll length of the tall space (px); 0 in mobile zoom mode or when everything fits
      scrollInfo: function () { return { px: zoomMode ? 0 : scrollPx, top: scrollTop, bot: scrollBot, pan: scrollPan, refDist: refDist, dist: deskDist }; },
      setStationHot: function (on) { stationHot = !!on; },
      /* screen-space info for DOM overlays (CSS px relative to canvas); r = body radius */
      project: function (i) {
        var pl = planets[i];
        // box = visible art on screen (alpha bbox from config); bottom = art bottom (labels sit a fixed gap below)
        var bb = pl.cfg.bbox || [10, 10, 90, 90], w = pl.w;
        var box = { l: pl.left + w * bb[0] / 100, t: pl.top + w * bb[1] / 100, r: pl.left + w * bb[2] / 100, b: pl.top + w * bb[3] / 100 };
        return { x: pl.sx, y: pl.sy, r: pl.sr, rh: pl.sr * pl.aspect, visible: pl.visible, bottom: box.b, box: box };
      },
      /* read-only introspection for QA */
      info: function () {
        var kinds = {};
        scene.traverse(function (o) { var k = o.userData.kind; if (k) kinds[k] = (kinds[k] || 0) + 1; });
        kinds['planet-sprite'] = layer.querySelectorAll('.planet-sprite').length;
        kinds['landing-pad'] = layer.querySelectorAll('.planet-sprite > .planet-pad').length;
        kinds['rocket-sprite'] = layer.querySelectorAll('.rocket-sprite').length;
        return {
          kinds: kinds, routes: routes.map(function (r) { return [r.a, r.b]; }),
          ship: (function () {
            var sp = ship.position.clone().project(camera), dp = dockPoint(shipAt);
            var ph = travel && travel.phase, orb = null;
            if (ph && ph.kind === 'orbit') {
              var oc = ph.center(new THREE.Vector3()), xx = Math.min(1, ph.t / ph.T);
              orb = { planet: ph.planet, center: oc.toArray(), normal: ph.F.n.toArray(), rho: ph.rho(), dir: ph.dir, sweep: ph.sweep,
                      turned: ph.sweep * rampG(xx, ph.a), radiusNow: ship.position.distanceTo(oc),
                      depthVsCenter: depthOf(ship.position) - depthOf(oc) };
            }
            return { at: shipAt, traveling: !!travel, landing: !!landing, to: travel ? travel.to : shipAt, flightId: travel ? travel.id : flightId,
                     phase: ph ? ph.kind : (landing ? 'settle' : 'docked'), phaseProgress: ph ? Math.min(1, ph.t / ph.T) : null,
                     phaseT: ph ? ph.T : null, phaseTo: ph ? (ph.kind === 'orbit' ? (ph.rest[0] != null ? ph.rest[0] : ph.planet) : ph.to) : null,
                     orbit: orb, log: travel ? travel.log.slice() : null, clock: travel ? travel.clock : null, lastExit: lastExit, lastReroute: lastReroute,
                     flyIn: { active: !!(travel && travel.phase && travel.phase.flyin), last: lastFlyIn, onScreen: rocketOnScreen() },
                     vel: shipVel.toArray(), scale: ship.scale.x / SHIP_SCALE, bumpPeak: bumpPeak, arrivals: arrivals,
                     padDist: ship.position.distanceTo(padPoint(shipAt)),
                     nodes: travel ? travel.nodes.slice() : null,
                     legs: ph && ph.legs ? ph.legs.map(function (L) { return L.kind + ':' + L.len.toFixed(2); }) : null,
                     world: ship.position.toArray(), dockDist: ship.position.distanceTo(dp),
                     routeDist: routes.reduce(function (m, R) {
                       var a = R.line.geometry.attributes.position;
                       for (var q = 0; q < a.count; q++) m = Math.min(m, tmp.fromBufferAttribute(a, q).distanceTo(ship.position));
                       return m;
                     }, Infinity),
                     planetDist: ship.position.distanceTo(planets[shipAt].root.position) / (planets[shipAt].proj.radius * planets[shipAt].scale),
                     screen: { x: (sp.x * 0.5 + 0.5) * W, y: (-sp.y * 0.5 + 0.5) * H } };
          })(),
          pads: planets.map(function (pl, i) {
            var toCam = new THREE.Vector3(); camera.getWorldDirection(toCam).negate();
            var glowEl = pl.padEl.querySelector('.pad-glow');
            return { planet: i, facing: pl.dockDir.dot(toCam), parent: pl.padEl.parentNode === pl.el,
                     glow: +getComputedStyle(glowEl).opacity, size: pl.pad.size, angleDeg: pl.pad.angle * 180 / Math.PI,
                     screen: { x: pl.pad.screen.x, y: pl.pad.screen.y } };
          }),
          sprites: planets.map(function (pl) {
            return { id: pl.proj.id, state: pl.spriteState, src: pl.spriteSrc, z: pl.z, width: pl.w, left: pl.left, top: pl.top,
                     bobPx: pl.bobPx, overlays: pl.el.querySelectorAll('.fx').length, tilt: pl.tilt.style.transform || '' };
          }),
          rocket: { loaded: rocketLoaded, z: rocketState.z, behind: rocketState.behind, size: rocketState.size,
                    cropped: rocketState.docked, rotationDeg: spriteAngle * 180 / Math.PI,
                    screen: { x: rocketState.x, y: rocketState.y } },
          orbiters: planets.map(function (pl) {
            return pl.orbiters.map(function (o) {
              return { kind: o.kind, side: o.side, inBack: o.el.parentNode === pl.backEl, angle: o.t, x: o.x, y: o.y, state: o.state || null,
                       transform: o.el.style.transform };
            });
          }),
          comet: stationIdx < 0 ? null : (function (pl) {
            return { drift: pl.driftOff.toArray(), driftT: pl.driftT, hold: pl.driftHold, sparks: pl.el.querySelectorAll('.spark').length,
                     kind: pl.proj.kind, src: pl.spriteSrc };
          })(planets[stationIdx]),
          constellation: constLines.map(function (L) { return { planet: L.planet, d: L.d }; }),
          routeEnds: routes.map(function (R) {   // screen px of each route's white end dots: [a-end, b-end]
            var a = toScreen(R.s0, {}), b = toScreen(R.e0, {});
            return { a: R.a, b: R.b, pa: { x: a.x, y: a.y }, pb: { x: b.x, y: b.y } };
          }),
          constLit: constEl.classList.contains('is-lit'),
          station: stationIdx,
          camDist: camDist, zoomMode: zoomMode
        };
      }
    };
  };
})();
