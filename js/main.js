/* UI wiring: HUD, planet labels, callout, case-study modal, Achievements + Contact panels, narrators, plain list. */
(function () {
  'use strict';
  var DATA = window.PORTFOLIO, P = DATA.projects, NP = P.length;
  var ART = window.ART || { medal: function () { return ''; }, trophy: function () { return ''; } };
  // Scene bodies = the projects + the Achievements comet (index NP). Same sprite/flight system for all.
  var B = DATA.station ? P.concat([DATA.station]) : P.slice(), N = B.length;
  var STATION = DATA.station ? NP : -1;
  function idxOf(id) { for (var k = 0; k < N; k++) if (B[k].id === id) return k; return -1; }
  // navigation order (←/→, A/D, dropdown, plain list): data-driven, Achievements last
  var NAV = (DATA.navOrder || []).map(idxOf).filter(function (k) { return k >= 0; });
  B.forEach(function (b, k) { if (NAV.indexOf(k) < 0) NAV.push(k); });
  var NAV_P = NAV.filter(function (k) { return k !== STATION; });
  function navStep(i, d) {
    var pos = NAV.indexOf(i);
    if (pos < 0) return NAV[d > 0 ? 0 : NAV.length - 1];
    return NAV[(pos + d + NAV.length) % NAV.length];
  }
  // achievements resolved to scene indices
  var ACH = (DATA.achievements || []).map(function (a) {
    var o = {}; for (var k in a) o[k] = a[k];
    o.planet = idxOf(a.project); return o;
  }).filter(function (a) { return a.planet >= 0; });
  function awardsOf(i) { return ACH.filter(function (a) { return a.planet === i; }); }
  var $ = function (id) { return document.getElementById(id); };
  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var dockMQ = window.matchMedia('(max-width: 768px)');
  var reduced = reducedMQ.matches;

  var world = $('world'), stage = $('world-stage'), canvas = $('scene'), labelsEl = $('planet-labels'), callout = $('callout');
  var live = $('live'), menuBtn = $('menu-button'), menuList = $('menu-list');
  var backdrop = $('modal-backdrop'), modal = $('modal'), modalBody = $('modal-body');

  var selected = -1, scene = null, modalOpen = false, returnFocusEl = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function awardPill(i, cls) {
    return awardsOf(i).map(function (a) {
      return '<p class="award-pill ' + (cls || '') + '">' + ART.trophy() + '<span>' + esc(a.pill || a.title) + '</span></p>';
    }).join('');
  }
  // teal "Highlight" pill for a project's headline feature (gold stays reserved for awards)
  function highlightPill(p, cls) {
    if (!p || !p.highlight) return '';
    return '<p class="highlight-pill ' + (cls || '') + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/></svg>' +
      '<span class="highlight-k">Highlight</span><span>' + esc(p.highlight) + '</span></p>';
  }
  var SPR = window.PLANET_SPRITES || {}, NAVIGATOR = 'assets/characters/navigator.png';
  function eyebrowOf(p) { return p.eyebrow || [p.company, p.dates].filter(Boolean).join(' · '); }
  /* the body's own sprite as an icon: the whole visible art (bbox) fitted into the box; for the comet, its head */
  function spriteIcon(id, cls) {
    var c = SPR[id] || {}, src = c.src;
    if (!src) return '<span class="sprite-icon ' + (cls || '') + '" aria-hidden="true"></span>';
    var r = c.tail && c.body ? [c.body[0] - c.body[2], c.body[1] - c.body[3], c.body[0] + c.body[2], c.body[1] + c.body[3]] : (c.bbox || [0, 0, 100, 100]);
    var ext = Math.max(r[2] - r[0], r[3] - r[1]), S = 100 * 100 / ext * (c.tail ? 1.08 : 0.98);
    var cx = (r[0] + r[2]) / 200, cy = (r[1] + r[3]) / 200;
    return '<span class="sprite-icon ' + (cls || '') + (c.tail ? ' is-head' : '') + '" aria-hidden="true"><img alt="" draggable="false" decoding="async" src="' + esc(src) + '"' +
      ' style="width:' + S.toFixed(1) + '%;left:calc(50% - ' + (cx * S).toFixed(1) + '%);top:calc(50% - ' + (cy * S).toFixed(1) + '%)"></span>';
  }
  function swatchStyle(p) {
    return 'background: radial-gradient(circle at 32% 30%, ' + p.swatch[0] + ', ' + p.swatch[1] + ' 62%), ' + p.swatch[1] + ';' +
           '--accent:' + p.swatch[2];
  }

  /* ---------------- planet labels ---------------- */
  var labels = B.map(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'planet-label' + (i === STATION ? ' is-station' : '');
    b.id = 'planet-' + p.id;
    b.dataset.index = i;
    b.innerHTML = (i === STATION ? ART.comet('label-trophy') : '<span class="planet-dot" aria-hidden="true" style="' + swatchStyle(p) + '"></span>') +
      '<span>' + esc(p.planet) + '</span>';
    b.setAttribute('aria-label', i === STATION ? 'Fly to the Achievements comet and open Achievements' : 'Fly to ' + p.planet + (p.planet !== p.title ? ' (' + p.title + ')' : ''));
    b.addEventListener('click', function () {
      // the label hides once its body is selected, so Escape returns focus to the card's button instead
      if (i === STATION) { select(i, {}); openAchievements($('callout-open')); }
      else select(i, { focusCallout: true });
    });
    if (i === STATION) {
      var hot = function (on) { return function () { if (scene && scene.setStationHot) scene.setStationHot(on); }; };
      b.addEventListener('mouseenter', hot(true)); b.addEventListener('mouseleave', hot(false));
      b.addEventListener('focus', hot(true)); b.addEventListener('blur', hot(false));
    }
    labelsEl.appendChild(b);
    return b;
  });

  /* ---------------- project dropdown ---------------- */
  NAV.forEach(function (i) {
    var p = B[i], li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'menu-item' + (i === STATION ? ' is-achievements' : '');
    b.dataset.index = i;
    var won = awardsOf(i);
    b.innerHTML = (i === STATION ? spriteIcon(p.id, 'menu-medal')
                                 : '<span class="planet-dot" aria-hidden="true" style="' + swatchStyle(p) + '"></span>') +
      '<span class="menu-item-text"><span class="menu-item-title">' + esc(p.title) +
      (won.length ? '<span class="menu-trophy" title="' + esc(won.map(function (a) { return a.title; }).join(', ')) + '">' + ART.trophy() +
        '<span class="visually-hidden"> (award: ' + esc(won.map(function (a) { return a.title; }).join(', ')) + ')</span></span>' : '') +
      '</span><span class="menu-item-sub">' + esc(i === STATION ? 'Hall of Fame comet · awards' : eyebrowOf(p)) + '</span></span>';
    b.addEventListener('click', function () {
      closeMenu(false);
      select(i, {});
      openModal(i, menuBtn);
    });
    if (i === STATION) li.className = 'menu-sep';
    li.appendChild(b); menuList.appendChild(li);
  });
  var menuItems = Array.prototype.slice.call(menuList.querySelectorAll('.menu-item'));

  function openMenu() {
    menuList.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
    menuItems[Math.max(0, NAV.indexOf(selected))].focus();
  }
  function closeMenu(returnFocus) {
    if (menuList.hidden) return;
    menuList.hidden = true; menuBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', function () { menuList.hidden ? openMenu() : closeMenu(true); });
  menuList.addEventListener('keydown', function (e) {
    var idx = menuItems.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); menuItems[(idx + 1) % N].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); menuItems[(idx - 1 + N) % N].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); menuItems[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); menuItems[N - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') { closeMenu(false); }
  });
  document.addEventListener('pointerdown', function (e) {
    if (!menuList.hidden && !$('project-menu').contains(e.target)) closeMenu(false);
  });

  /* ---------------- plain project list ---------------- */
  var cards = $('project-cards');
  NAV_P.forEach(function (i) {
    var p = P[i], li = document.createElement('li');
    li.className = 'project-card panel';
    li.innerHTML =
      spriteIcon(p.id, 'card-planet') +
      '<div class="card-body">' +
        awardPill(i) + highlightPill(p) +
        '<p class="eyebrow">' + esc(eyebrowOf(p)) + '</p>' +
        '<h3>' + esc(p.title) + '</h3>' +
        (p.role ? '<p class="role-line">' + esc(p.role) + '</p>' : '') +
        '<p>' + esc(p.oneLiner) + '</p>' +
        '<ul class="tags" aria-label="Topics">' + p.tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="btn btn-mint card-open" data-index="' + i + '">Read case study<span class="visually-hidden">: ' + esc(p.title) + '</span>' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '</div>';
    cards.appendChild(li);
  });
  cards.addEventListener('click', function (e) {
    var b = e.target.closest('.card-open'); if (!b) return;
    openModal(+b.dataset.index, b);
  });
  // skills (resume)
  var sk = DATA.skills, skillsEl = $('skills');
  if (sk && skillsEl) {
    skillsEl.innerHTML = [['Primary', sk.primary], ['Tools & languages', sk.tools], ['XR', sk.xr], ['Devices', sk.devices], ['Also', sk.secondary]]
      .filter(function (r) { return r[1] && r[1].length; })
      .map(function (r) { return '<div class="skill-row"><dt>' + esc(r[0]) + '</dt><dd>' + r[1].map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</dd></div>'; }).join('');
  }
  // achievements in the plain list (same data as the panel)
  var achList = $('achievement-cards');
  if (achList) {
    achList.innerHTML = ACH.map(function (a) {
      return '<li class="ach-row panel"><span class="ach-row-medal" aria-hidden="true">' + ART.medal({ glyph: a.glyph, ribbon: a.ribbon }) + '</span>' +
        '<span><strong>' + esc(a.title) + '</strong> — ' + esc(P[a.planet].title) + (a.note ? ' (' + esc(a.note) + ')' : '') + '</span></li>';
    }).join('');
    if (!ACH.length) achList.parentNode.hidden = true;
  }

  /* ---------------- selection + callout ---------------- */
  function select(i, o) {
    o = o || {};
    i = ((i % N) + N) % N;
    var changed = i !== selected;
    selected = i;
    if (scene && scene.ping) scene.ping(i);
    var p = B[i], isStation = i === STATION;
    labels.forEach(function (l, j) {
      l.classList.toggle('is-selected', j === i);
      l.setAttribute('aria-current', j === i ? 'true' : 'false');
    });
    $('callout-eyebrow').textContent = (p.planet !== p.title ? p.planet + ' · ' : '') + eyebrowOf(p);
    $('callout-title').textContent = p.title;
    $('callout-award').innerHTML = awardPill(i, 'is-compact');
    $('callout-award').hidden = !awardsOf(i).length;
    $('callout-role').textContent = p.role || '';
    $('callout-role').hidden = !p.role;
    $('callout-open-text').textContent = isStation ? 'Open achievements' : 'Open case study';
    $('callout-open').setAttribute('aria-label', isStation ? 'Open achievements' : 'Open case study: ' + p.title);
    callout.classList.toggle('is-gold', isStation);
    callout.hidden = false;
    if (changed) live.textContent = 'Selected ' + p.title + '. ' + (isStation ? ACH.length + ' achievements.' : p.oneLiner);
    setNavigator(p.narrator);
    // The card for a planet only appears once the ship has landed there (scene calls onArrive).
    // Desktop tall space: the fast scroll to the body and the flight start TOGETHER; the scene judges
    // "rocket off-screen" against the view at the scroll target (off-screen -> 0.5 s fly-in from the edge).
    cancelSpaceScroll();
    var y = o.noScroll ? null : spaceScrollTarget(i), progress = null;
    if (y != null && !reduced) { progress = space.px ? Math.max(0, Math.min(1, (y - space.top) / space.px)) : 0; animateSpaceScroll(y, function () {}); }
    else if (y != null) window.scrollTo({ top: y, behavior: 'instant' });
    var flying = scene ? scene.select(i, progress != null ? { progress: progress } : null) : false;
    setCardPending(flying && !reduced);
    pendingFocus = flying && !reduced && !!o.focusCallout;
    positionOverlays();
    if (o.focusCallout && !pendingFocus) $('callout-open').focus({ preventScroll: true });
  }
  var pendingFocus = false;
  function setCardPending(on) {
    callout.classList.toggle('is-pending', on);
    // keep the hidden card out of the a11y tree / tab order while the ship is in flight
    callout.querySelector('.callout-body').setAttribute('aria-hidden', on ? 'true' : 'false');
    $('callout-open').tabIndex = on ? -1 : 0;
  }
  function onShipArrive(i) {
    if (i !== selected) return;
    calloutPlace.at = -1;
    setCardPending(false);
    if (pendingFocus) { pendingFocus = false; $('callout-open').focus({ preventScroll: true }); }
  }
  $('callout-open').addEventListener('click', function () { openModal(selected, $('callout-open')); });
  $('callout-prev').addEventListener('click', function () { select(navStep(selected, -1), {}); });
  $('callout-next').addEventListener('click', function () { select(navStep(selected, 1), {}); });

  function positionOverlays() {
    var docked = dockMQ.matches || !scene;
    callout.classList.toggle('is-docked', docked);
    if (!scene) return;
    var W = stage.clientWidth, H = stage.clientHeight;
    var hudBottom = hudBottomPx();
    var proj = [];
    for (var i = 0; i < N; i++) {
      var s = proj[i] = scene.project(i), l = labels[i];
      var off = !s.visible || s.x < -40 || s.x > W + 40 || s.y < hudBottom || s.y > H + 40;
      l.classList.toggle('is-off', off);
      l.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.bottom + labelGap()) + 'px) translate(-50%,0)';
    }
    if (selected >= 0 && !docked) {
      placeCallout(proj, W, H, hudBottom, labelBoxes(proj));
      // the selected body scrolled out of the stage: its card fades away instead of sticking to the edge
      var sp = proj[selected], bx = bodyBox(sp);
      callout.classList.toggle('is-away', bx.b < hudBottom + 20 || bx.t > H - 40);
    } else callout.classList.remove('is-away');
    if (docked) callout.style.transform = '';
    syncSpaceUi();
  }
  // HUD bottom inside the stage (cached; the HUD is fixed so it only changes on resize)
  var hudBottomCache = -1;
  function hudBottomPx() {
    if (hudBottomCache < 0) hudBottomCache = $('hud').getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
    return hudBottomCache;
  }
  /* Desktop card placement: try beside / below the selected body and keep the spot that overlaps
     the fewest sprites (any body, incl. the selected one) and labels; then clamp into the free area. */
  var calloutSize = { w: 0, h: 0, at: -1 }, labelSize = null, calloutDebug = null;
  // same gap under every body's visible art (matches the old Is It You? spacing: ~30 px at 900 px tall)
  function labelGap() { return 8 + 0.025 * stage.clientHeight; }
  function labelBoxes(proj) {
    // label pills (sizes cached; transforms don't change layout size). Selected / off-screen labels are hidden.
    if (!labelSize) labelSize = labels.map(function (l) { return { w: l.offsetWidth, h: l.offsetHeight }; });
    return labels.map(function (l, j) {
      if (j === selected || l.classList.contains('is-off')) return null;
      var s = proj[j], y = s.bottom + labelGap(), pad = 12;    // pad: labels bob ±6 px with their planet
      return { l: s.x - labelSize[j].w / 2 - pad, r: s.x + labelSize[j].w / 2 + pad, t: y - pad, b: y + labelSize[j].h + pad };
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { labelSize = null; calloutSize.at = -1; });
  function bodyBox(s) {   // visible sprite art (alpha bbox) on screen
    return s.box || { l: s.x - s.r * 1.15, r: s.x + s.r * 1.15, t: s.y - s.r * 1.5, b: s.y + s.r * 1.08 };
  }
  function overlap(a, b) { return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)); }
  /* Search a grid over the free area once per selection (and on landing / resize); the card then keeps
     that offset from its planet while it bobs. Cost = overlap with art (own ×12, others ×3) and labels (×40)
     + distance from the planet's art, so the card sits in the nearest clean gap. */
  var calloutPlace = { at: -1, dx: 0, dy: 0 };
  function placeCallout(proj, W, H, hudBottom, labBoxes) {
    if (calloutSize.at !== selected || !calloutSize.w) { calloutSize.w = callout.offsetWidth; calloutSize.h = callout.offsetHeight; calloutSize.at = selected; calloutPlace.at = -1; }
    var s = proj[selected], cw = calloutSize.w, ch = calloutSize.h, me = bodyBox(s);
    var x0 = 12, x1 = W - cw - 12, y0 = hudBottom + 8, y1 = H - ch - 56;
    if (calloutPlace.at !== selected) {
      var best = null, n = 0;
      for (var y = y0; y <= y1 + 0.5; y += Math.max(12, (y1 - y0) / 30)) {
        for (var x = x0; x <= x1 + 0.5; x += Math.max(12, (x1 - x0) / 48)) {
          var box = { l: x, r: x + cw, t: y, b: y + ch }, cost = 0;
          for (var j = 0; j < N; j++) {
            if (!proj[j].visible) continue;
            cost += overlap(box, bodyBox(proj[j])) * (j === selected ? 12 : 3);
            if (labBoxes[j]) cost += overlap(box, labBoxes[j]) * 40;
          }
          var gx = Math.max(0, me.l - box.r, box.l - me.r), gy = Math.max(0, me.t - box.b, box.t - me.b);
          cost += Math.hypot(gx, gy) * 110 + (box.r < me.l ? 400 : 0);     // near the planet; right side preferred
          n++;
          if (!best || cost < best.cost) best = { x: x, y: y, cost: cost };
        }
      }
      calloutPlace = { at: selected, dx: best.x - s.x, dy: best.y - s.y, cost: Math.round(best.cost), tried: n };
    }
    var cx = Math.max(x0, Math.min(x1, s.x + calloutPlace.dx)), cy = Math.max(y0, Math.min(y1, s.y + calloutPlace.dy));
    calloutDebug = { pick: calloutPlace, labels: labBoxes, size: [cw, ch] };
    callout.style.transform = 'translate(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px)';
  }

  /* ---------------- modal ---------------- */
  var bgRegions = [$('hud'), $('main'), document.querySelector('.footer'), document.querySelector('.skip-link')];
  function renderCase(p) {
    var h = '';
    h += '<div class="case-head">';
    h += spriteIcon(p.id, 'case-planet');
    h += '<div><p class="eyebrow">' + esc(eyebrowOf(p)) + '</p><h2 id="modal-title">' + esc(p.title) + '</h2>' +
      (p.role ? '<p class="role-line">' + esc(p.role) + '</p>' : '') +
      (p.engine ? '<p class="role-line engine-line">Engine: ' + esc(p.engine) + '</p>' : '') + '</div></div>';
    h += awardPill(P.indexOf(p), 'is-banner');
    h += highlightPill(p, 'is-banner');
    h += '<p class="case-summary">' + esc(p.oneLiner) + '</p>';
    h += '<section class="case-points"><h3>What I did</h3><ul>' +
      (p.points || []).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ul></section>';
    // Project videos: click-to-play (no autoplay/loop/mute). Poster frames come later (`poster` field).
    if ((p.media || []).length) h += '<section class="case-gallery" aria-label="Project videos">';
    (p.media || []).forEach(function (m, n) {
      h += '<figure class="media-slot" data-slot="' + esc(p.id) + '-media-' + (n + 1) + '">' +
        '<video class="case-video" controls preload="metadata" playsinline poster="' + esc(m.poster || '') + '"' +
        ' src="' + esc(m.src) + '" aria-label="' + esc(m.label) + '">' +
        'Your browser cannot play this video. <a href="' + esc(m.src) + '" download>Download ' + esc(m.label) + '</a>.' +
        '</video>' +
        '<figcaption class="media-note"' + (m.note ? '' : ' hidden') + '>' +
        '<span>' + esc(m.note || 'This video could not be played in your browser.') + '</span> ' +
        '<a href="' + esc(m.src) + '" download>Download video</a></figcaption>' +
        '</figure>';
    });
    if ((p.media || []).length) h += '</section>';
    h += renderGallery(p);      // screenshots: after the videos
    h += '<ul class="tags" aria-label="Topics">' + p.tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    h += '<div class="case-actions">' +
      (p.links || []).map(function (l) {
        return '<a class="btn btn-panel" href="' + esc(l.href) + '" target="_blank" rel="noopener noreferrer">' + (LINK_ICONS[l.icon] || '') + esc(l.label) +
          '<span class="visually-hidden"> (opens in a new tab)</span><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>';
      }).join('') +
      '<button type="button" class="btn btn-panel" data-next>Next project<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '</div>';
    return h;
  }
  /* Screenshot gallery (data-driven: project.gallery = [{src, w, h, alt, caption?}], galleryCaption).
     Portrait shots sit in phone-frame thumbs, landscape shots in wide thumbs; horizontal scroll-snap strip.
     Lazy images with width/height (no layout shift). Click -> lightbox. */
  function renderGallery(p) {
    var g = p.gallery || [];
    if (!g.length) return '';
    var h = '<section class="case-shots" aria-label="Screenshots"><h3 class="case-shots-title">Screenshots</h3><ul class="shots-strip" data-gallery="' + esc(p.id) + '">';
    g.forEach(function (im, n) {
      var land = im.w > im.h;
      h += '<li class="shot ' + (land ? 'is-landscape' : 'is-portrait') + '">' +
        '<button type="button" class="shot-thumb" data-shot="' + n + '" aria-label="Open screenshot ' + (n + 1) + ' of ' + g.length + ': ' + esc(im.alt || p.title) + '">' +
        '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" width="' + (+im.w || 9) + '" height="' + (+im.h || 16) + '" loading="lazy" decoding="async" draggable="false">' +
        '</button>' + (im.caption ? '<p class="shot-cap">' + esc(im.caption) + '</p>' : '') + '</li>';
    });
    h += '</ul>' + (p.galleryCaption ? '<p class="shots-caption">' + esc(p.galleryCaption) + '</p>' : '') + '</section>';
    return h;
  }

  /* ---------------- lightbox ---------------- */
  var lb = $('lightbox'), lbImg = $('lb-img'), lbCap = $('lb-cap'), lbCount = $('lb-count');
  var lbState = { list: null, i: 0, from: null };
  function lbOpen() { return !lb.hidden; }
  function lbShow(n) {
    var L = lbState.list; if (!L || !L.length) return;
    lbState.i = (n + L.length) % L.length;
    var im = L[lbState.i];
    lbImg.src = im.src; lbImg.alt = im.alt || '';
    lbImg.width = im.w || 0; lbImg.height = im.h || 0;
    lb.classList.toggle('is-landscape', im.w > im.h);
    lbCap.textContent = im.caption || '';
    lbCap.hidden = !im.caption;
    lbCount.textContent = (lbState.i + 1) + ' / ' + L.length;
    $('lb-prev').hidden = $('lb-next').hidden = L.length < 2;
  }
  function openLightbox(list, n, from) {
    lbState.list = list; lbState.from = from || null;
    lbShow(n);
    lb.hidden = false;
    modal.setAttribute('inert', '');
    requestAnimationFrame(function () { lb.classList.add('is-open'); });
    $('lb-close').focus({ preventScroll: true });
  }
  function closeLightbox() {
    if (!lbOpen()) return;
    lb.classList.remove('is-open'); lb.hidden = true;
    modal.removeAttribute('inert');
    var f = lbState.from; lbState.from = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true }); else modal.focus({ preventScroll: true });
  }
  $('lb-close').addEventListener('click', closeLightbox);
  $('lb-prev').addEventListener('click', function () { lbShow(lbState.i - 1); });
  $('lb-next').addEventListener('click', function () { lbShow(lbState.i + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  // swipe (touch / pen / mouse drag) on the image
  var swipe = null;
  lbImg.addEventListener('pointerdown', function (e) { swipe = { x: e.clientX, y: e.clientY }; });
  lbImg.addEventListener('pointercancel', function () { swipe = null; });
  window.addEventListener('pointerup', function (e) {
    if (!swipe || !lbOpen()) { swipe = null; return; }
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) lbShow(lbState.i + (dx < 0 ? 1 : -1));
  });
  function renderAchievements() {
    var h = '<div class="case-head ach-head">' + spriteIcon(DATA.station.id, 'case-planet ach-head-icon') +
      '<div><p class="eyebrow">Hall of Fame</p><h2 id="modal-title">Achievements</h2></div></div>';
    h += '<ul class="ach-list">';
    ACH.forEach(function (a) {
      var p = P[a.planet];
      h += '<li><button type="button" class="ach-card" data-goto="' + a.planet + '" data-achievement="' + esc(a.id) + '"' +
        ' aria-label="' + esc(a.title + ', ' + p.title + (a.note ? ' (' + a.note + ')' : '') + '. Fly to ' + p.planet) + '">' +
        '<span class="ach-medal" aria-hidden="true">' + ART.medal({ glyph: a.glyph, ribbon: a.ribbon }) + '<span class="badge-shine"></span></span>' +
        '<span class="ach-text"><span class="ach-title">' + esc(a.title) + '</span>' +
        '<span class="ach-project">' + esc(p.title) + (a.note ? ' <span class="ach-note">(' + esc(a.note) + ')</span>' : '') + '</span>' +
        '<span class="ach-go">Fly to ' + esc(p.planet) + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></span>' +
        '</button></li>';
    });
    h += '</ul>';
    return h;
  }
  function openAchievements(trigger) { openModal(STATION, trigger); }
  var modalIndex = -1;
  function openModal(i, trigger) {
    if (i < 0) return;
    var isAch = i === STATION, b = B[i];
    showPanel({ key: b.id, index: i, gold: isAch, html: isAch ? renderAchievements() : renderCase(P[i]),
                close: isAch ? 'Close achievements' : 'Close case study',
                narrator: b.narrator, bubble: isAch ? b.title : (b.oneLiner || b.title) }, trigger);
  }

  /* ---------------- Contact panel ---------------- */
  var ICO = {
    mail: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    linkedin: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/></svg>',
    phone: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>'
  };
  function copyBtn(value, what) {
    return '<button type="button" class="btn btn-panel btn-copy" data-copy="' + esc(value) + '" aria-label="Copy ' + esc(what) + '">' + ICO.copy + '<span>Copy</span></button>';
  }
  function renderContact() {
    var h = '<div class="case-head"><span class="contact-head-icon" aria-hidden="true">' + ICO.mail + '</span>' +
      '<div><p class="eyebrow">Say hello</p><h2 id="modal-title">Contact</h2></div></div><ul class="contact-list">';
    h += '<li class="contact-row" data-row="email"><span class="contact-ico" aria-hidden="true">' + ICO.mail + '</span>' +
      '<span class="contact-text"><span class="contact-label">Email</span><a class="contact-value" href="mailto:' + esc(DATA.email) + '">' + esc(DATA.email) + '</a></span>' +
      '<span class="contact-actions">' + copyBtn(DATA.email, 'email address') + '</span></li>';
    h += '<li class="contact-row" data-row="linkedin"><span class="contact-ico" aria-hidden="true">' + ICO.linkedin + '</span>' +
      '<span class="contact-text"><span class="contact-label">LinkedIn</span>' +
      (DATA.linkedin ? '<a class="contact-value" href="' + esc(DATA.linkedin) + '" target="_blank" rel="noopener noreferrer">' + esc(DATA.linkedin.replace(/^https?:\/\/(www\.)?/, '')) +
                       '<span class="visually-hidden"> (opens in a new tab)</span></a>'
                     : '<span class="contact-value is-soon">Coming soon</span>') + '</span>' +
      '<span class="contact-actions">' + (DATA.linkedin ? '<a class="btn btn-panel" href="' + esc(DATA.linkedin) + '" target="_blank" rel="noopener noreferrer" aria-label="Open LinkedIn profile (new tab)">Open</a>' : '') + '</span></li>';
    h += '<li class="contact-row" data-row="phone"><span class="contact-ico" aria-hidden="true">' + ICO.phone + '</span>' +
      '<span class="contact-text"><span class="contact-label">Phone</span>' +
      (DATA.phones || []).map(function (ph) {
        return '<span class="contact-phone"><a class="contact-value" href="tel:' + esc(ph.tel) + '">' + esc(ph.display) + '</a> <span class="contact-sub">' + esc(ph.label) + '</span>' +
          copyBtn(ph.display, ph.label + ' phone number') + '</span>';
      }).join('') + '</span></li>';
    return h + '</ul>';
  }
  /* optional brand icon in front of a case-study link label (data.js links[].icon) */
  var LINK_ICONS = {
    play: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3.5l14 8.5-14 8.5z"/></svg>',
    steam: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="15.5" cy="9" r="2.6"/><circle cx="9" cy="15.5" r="1.8"/><path d="M13.4 10.6l-3 3.3M3.6 13.6l3.8 1.4"/></svg>',
    apple: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7.6c-1.6-1-4.2-1.1-5.6.8-1.5 2-1.3 5.2.2 8 1.1 2 2.4 3.5 3.8 3.1.6-.2 1-.5 1.6-.5s1 .3 1.6.5c1.4.4 2.7-1.1 3.8-3.1-1.4-.8-2.2-2-2.2-3.5 0-1.4.7-2.6 1.9-3.3-1.5-2-3.6-2-5.1-2z"/><path d="M12 7.4c0-2 1.2-3.5 3-4"/></svg>'
  };
  function openContact(trigger) {
    closeMenu(false);
    showPanel({ key: 'contact', index: -1, gold: false, html: renderContact(), close: 'Close contact', narrator: null }, trigger);
  }
  var toastEl = $('toast'), toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1800);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; modal.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      modal.removeChild(ta); return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  $('contact-link').addEventListener('click', function () { openContact($('contact-link')); });
  $('footer-contact').addEventListener('click', function () { openContact($('footer-contact')); });

  /* ---------------- narrators: costume of the Navigator bird presenting each panel ---------------- */
  var narrEl = $('modal-narrator'), narrImg = narrEl.querySelector('img'), narrBubble = narrEl.querySelector('.narrator-bubble');
  narrImg.addEventListener('error', function () { if (narrImg.getAttribute('src') !== NAVIGATOR) narrImg.src = NAVIGATOR; });
  function showNarrator(src, text) {
    narrEl.classList.remove('is-in');
    if (!src) { narrEl.hidden = true; modal.classList.remove('has-narrator'); return; }
    narrEl.hidden = false; modal.classList.add('has-narrator');
    if (narrImg.getAttribute('src') !== src) narrImg.src = src;
    narrBubble.textContent = text || '';
    void narrEl.offsetWidth;          // restart the pop-in
    narrEl.classList.add('is-in');
  }
  // HUD Navigator: swap to the selected planet's costume (crossfade); default navigator.png
  var hudImgs = Array.prototype.slice.call(document.querySelectorAll('[data-slot="character-navigator"] .character-img'));
  var hudOn = 0, hudSrc = NAVIGATOR;
  hudImgs.forEach(function (im) {
    im.addEventListener('error', function () { if (im.getAttribute('src') !== NAVIGATOR) im.src = NAVIGATOR; });
  });
  function setNavigator(src) {
    src = src || NAVIGATOR;
    if (src === hudSrc || hudImgs.length < 2) return;
    hudSrc = src;
    var next = hudImgs[1 - hudOn], cur = hudImgs[hudOn];
    var swap = function () {
      if (hudSrc !== src) return;
      next.classList.add('is-on'); cur.classList.remove('is-on'); hudOn = 1 - hudOn;
      next.alt = cur.alt; cur.alt = '';
    };
    // swap only once the new costume is decoded, so the old one never fades out over an empty frame
    var ready = function () { (next.decode ? next.decode() : Promise.resolve()).then(swap, swap); };
    next.onload = ready;
    next.src = src;
    if (next.complete && next.naturalWidth) ready();
  }

  function showPanel(o, trigger) {
    modalIndex = o.index;
    pauseVideos();
    modal.dataset.project = o.key;
    modal.classList.toggle('is-gold', !!o.gold);
    modal.classList.toggle('is-contact', o.key === 'contact');
    $('modal-close').setAttribute('aria-label', o.close);
    modalBody.innerHTML = o.html;
    showNarrator(o.narrator, o.bubble);
    // If a file can't be decoded here (e.g. .mov outside Safari), reveal the download note.
    Array.prototype.forEach.call(modalBody.querySelectorAll('video'), function (v) {
      v.addEventListener('error', function () {
        var note = v.parentNode.querySelector('.media-note');
        if (note) { note.hidden = false; note.classList.add('is-error'); }
      });
    });
    modalBody.scrollTop = 0;
    if (!modalOpen) {
      returnFocusEl = trigger || document.activeElement;
      backdrop.hidden = false;
      bgRegions.forEach(function (el) { if (el) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } });
      document.body.classList.add('modal-open');
      // next frame so the CSS transition runs
      requestAnimationFrame(function () { backdrop.classList.add('is-open'); });
      modalOpen = true;
    }
    modalBody.scrollTop = 0;          // again once visible: a hidden scroller can keep its old offset
    modal.focus({ preventScroll: true });
  }
  function pauseVideos() {
    Array.prototype.forEach.call(modalBody.querySelectorAll('video'), function (v) { if (!v.paused) v.pause(); });
  }
  function closeModal() {
    if (!modalOpen) return;
    if (lbOpen()) { lb.classList.remove('is-open'); lb.hidden = true; modal.removeAttribute('inert'); lbState.from = null; }
    modalOpen = false;
    pauseVideos();
    narrEl.classList.remove('is-in');
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    bgRegions.forEach(function (el) { if (el) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } });
    document.body.classList.remove('modal-open');
    var target = returnFocusEl;
    if (!canFocus(target)) {
      target = $('callout-open');
      if (!canFocus(target)) {
        // card still waiting for the rocket to land: focus moves to it on arrival; until then, the Project list button
        if (!callout.hidden && callout.classList.contains('is-pending')) pendingFocus = true;
        target = menuBtn;
      }
    }
    target.focus({ preventScroll: true });
    returnFocusEl = null;
  }
  function canFocus(el) {
    return !!el && document.contains(el) && el.offsetParent !== null && getComputedStyle(el).visibility === 'visible';
  }
  $('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
  modalBody.addEventListener('click', function (e) {
    var th = e.target.closest('[data-shot]');
    if (th) {
      var strip = th.closest('[data-gallery]'), pr = strip && P.filter(function (x) { return x.id === strip.dataset.gallery; })[0];
      if (pr) openLightbox(pr.gallery, +th.dataset.shot, th);
      return;
    }
    if (e.target.closest('[data-next]')) {
      var n = NAV_P[(NAV_P.indexOf(modalIndex) + 1) % NAV_P.length];
      select(n, {});
      openModal(n);
      return;
    }
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      copyText(cp.dataset.copy).then(function (ok) { toast(ok ? 'Copied' : 'Copy failed — select the text instead'); });
      return;
    }
    var go = e.target.closest('[data-goto]');
    if (go) {   // achievement card: close the panel, fly the rocket to the planet and select it
      returnFocusEl = null;
      closeModal();
      select(+go.dataset.goto, { focusCallout: true });
    }
  });
  function focusables() {
    return Array.prototype.filter.call(
      modal.querySelectorAll('a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null; });
  }
  // Capture phase: a focused <video> swallows Escape in its native controls, so catch it first.
  window.addEventListener('keydown', function (e) {
    if (modalOpen && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (lbOpen()) closeLightbox(); else closeModal(); return; }
    if (modalOpen && lbOpen()) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); lbShow(lbState.i + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'Tab') {      // focus trap inside the lightbox
        var f = Array.prototype.filter.call(lb.querySelectorAll('button'), function (b) { return !b.hidden; });
        var k = f.indexOf(document.activeElement);
        e.preventDefault(); e.stopPropagation();
        f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (modalOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) { e.preventDefault(); return; }
        var first = f[0], lastEl = f[f.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || a === modal)) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && (a === lastEl || !modal.contains(a))) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key === 'Escape' && !menuList.hidden) { closeMenu(true); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable) || !menuList.hidden) return;
    // world keyboard controls only while the world is on screen
    var wr = world.getBoundingClientRect();
    if (wr.bottom < window.innerHeight * 0.3) return;
    var k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'd') { e.preventDefault(); select(navStep(selected, 1), {}); }
    else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); select(navStep(selected, -1), {}); }
    else if (k === 'enter' && (t === document.body || t === canvas) && selected >= 0) { e.preventDefault(); openModal(selected, $('callout-open')); }
  });

  /* ---------------- browse without playing / skip link ---------------- */
  function goToList(e) {
    e.preventDefault();
    closeMenu(false);
    var h = $('projects-title');
    $('projects').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    h.focus({ preventScroll: true });
    if (history.replaceState) history.replaceState(null, '', '#projects');
  }
  $('browse-link').addEventListener('click', goToList);
  document.querySelector('.skip-link').addEventListener('click', goToList);

  /* ---------------- parallax starfield ----------------
     Three CSS layers; each gets a tiled star texture drawn once on a 2D canvas (data URL, so it also
     works on file://). The scene shifts the layers by depth with the pointer / camera pans. */
  function buildStarfield() {
    var palette = ['255,255,255', '0,229,255', '191,166,255', '255,214,77'];
    var spec = { 'stars-far': [512, 140, 0.6, 1.1], 'stars-mid': [640, 70, 0.9, 1.7], 'stars-near': [768, 26, 1.3, 2.6] };
    return Array.prototype.map.call(document.querySelectorAll('.starfield .stars'), function (el) {
      var key = Object.keys(spec).filter(function (k) { return el.classList.contains(k); })[0], sp = spec[key];
      try {
        var c = document.createElement('canvas'); c.width = c.height = sp[0];
        var g = c.getContext('2d');
        for (var n = 0; n < sp[1]; n++) {
          var x = Math.random() * sp[0], y = Math.random() * sp[0], r = sp[2] + Math.random() * (sp[3] - sp[2]);
          var col = palette[Math.random() < 0.7 ? 0 : 1 + ((Math.random() * 3) | 0)], a = 0.45 + Math.random() * 0.55;
          var grd = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
          grd.addColorStop(0, 'rgba(' + col + ',' + a + ')'); grd.addColorStop(0.35, 'rgba(' + col + ',' + (a * 0.5) + ')'); grd.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 2.4, 0, Math.PI * 2); g.fill();
          if (key === 'stars-near' && n % 5 === 0) {   // a few cross-sparkles
            g.fillStyle = 'rgba(' + col + ',' + (a * 0.6) + ')';
            g.fillRect(x - r * 4, y - 0.5, r * 8, 1); g.fillRect(x - 0.5, y - r * 4, 1, r * 8);
          }
        }
        el.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
        el.style.backgroundSize = sp[0] + 'px ' + sp[0] + 'px';
      } catch (e) { /* no 2D canvas: plain gradient background remains */ }
      // one tile taller than the stage (above): the scene wraps the scroll parallax by the tile size
      if (sp) el.style.top = -(sp[0] + 60) + 'px';
      return { el: el, depth: +el.dataset.depth || 1, tile: sp ? sp[0] : 0 };
    });
  }

  /* ---------------- tall scrollable space (desktop) ----------------
     #world is taller than the viewport; #world-stage is sticky. The scene pans its camera with the scroll
     progress through #world (transform-only, read once per frame from window.scrollY: no layout reads).
     Mobile (≤768) keeps the zoom-into-planet mode: no extra height. */
  var space = { px: 0, top: 0, scrolled: false };
  function spaceProgress() { return space.px ? Math.max(0, Math.min(1, (window.scrollY - space.top) / space.px)) : 0; }
  function layoutSpace() {
    var info = scene && scene.scrollInfo ? scene.scrollInfo() : { px: 0 };
    space.px = dockMQ.matches ? 0 : Math.max(0, Math.round(info.px));
    world.style.height = space.px ? (stage.offsetHeight + space.px) + 'px' : '';
    space.top = world.getBoundingClientRect().top + window.scrollY;
    buildSpaceMap();
  }
  // scroll target (page y) that brings body i into the free area, or null if it is already in view
  function spaceScrollTarget(i) {
    if (!scene || !space.px || dockMQ.matches) return null;
    var wr = world.getBoundingClientRect();
    if (wr.bottom < window.innerHeight * 0.3 || wr.top > window.innerHeight * 0.7) return null;   // reading the page below: don't yank
    var s = scene.project(i), bx = bodyBox(s), H = stage.clientHeight, top = hudBottomPx() + 12, bot = H - 72;
    var t = bx.t, b = s.bottom + labelGap() + 34;
    var cur = window.scrollY;
    if (t >= top && b <= bot && wr.top <= 1 && cur <= space.top + space.px) return null;
    var want = cur + ((t + b) / 2 - (top + bot) / 2);
    want = Math.max(space.top, Math.min(space.top + space.px, want));
    return Math.abs(want - cur) < 2 ? null : Math.round(want);
  }
  var spaceAnim = 0;
  function cancelSpaceScroll() { if (spaceAnim) { cancelAnimationFrame(spaceAnim); spaceAnim = 0; } }
  function animateSpaceScroll(y, done) {
    var y0 = window.scrollY, dist = y - y0, T = Math.min(480, 380 + Math.abs(dist) * 0.1), t0 = performance.now();
    var step = function (now) {
      var k = Math.min(1, (now - t0) / T), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      window.scrollTo({ top: y0 + dist * e, behavior: 'instant' });
      if (k < 1) spaceAnim = requestAnimationFrame(step);
      else { spaceAnim = 0; done(); }
    };
    spaceAnim = requestAnimationFrame(step);
  }
  // the user takes over the scroll: stop the tween (the flight still starts)
  ['wheel', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (spaceAnim) cancelSpaceScroll();   // the flight already started with the scroll
    }, { passive: true });
  });
  // mini-map: dots by world height (top of space = top of the track), the visible window as a thumb
  var mapEl = $('space-map'), mapView = $('space-map-view'), mapDots = [], mapRange = null;
  function buildSpaceMap() {
    if (!mapEl) return;
    var ys = B.map(function (b) { return b.pos[1]; }), hi = Math.max.apply(null, ys) + 3, lo = Math.min.apply(null, ys) - 3;
    mapRange = { hi: hi, lo: lo };
    if (!mapDots.length) {
      mapDots = NAV.map(function (i) {
        var b = B[i], d = document.createElement('button');
        d.type = 'button'; d.className = 'space-map-dot' + (i === STATION ? ' is-station' : '');
        d.dataset.index = i;
        d.style.setProperty('--dot', i === STATION ? 'var(--au)' : b.swatch[1]);
        d.setAttribute('aria-label', 'Go to ' + b.title);
        d.title = b.title;
        d.addEventListener('click', function () { select(i, {}); });
        mapEl.appendChild(d);
        return d;
      });
    }
    mapDots.forEach(function (d) {
      var b = B[+d.dataset.index];
      d.style.top = (100 * (hi - b.pos[1]) / (hi - lo)).toFixed(2) + '%';
    });
    mapEl.hidden = !space.px;
    $('scroll-hint').hidden = !space.px;
  }
  var lastUi = { p: -1, sel: -2, past: null };
  function syncSpaceUi() {
    if (!space.px) return;
    var p = spaceProgress(), H = stage.clientHeight;
    if (Math.abs(p - lastUi.p) > 1e-4) {
      lastUi.p = p;
      var frac = H / (H + space.px);
      mapView.style.transform = 'translate3d(0,' + (p * (1 - frac) * 100 / frac).toFixed(2) + '%,0)';
      mapView.style.height = (frac * 100).toFixed(2) + '%';
      if (!space.scrolled && p > 0.02) { space.scrolled = true; $('scroll-hint').classList.add('is-gone'); }
    }
    if (lastUi.sel !== selected) {
      lastUi.sel = selected;
      mapDots.forEach(function (d) { var on = +d.dataset.index === selected; d.classList.toggle('is-selected', on); d.setAttribute('aria-current', on ? 'true' : 'false'); });
    }
  }

  /* ---------------- scene boot ---------------- */
  var parallax = { x: 0, y: 0 };
  var starLayers = buildStarfield();
  try {
    scene = window.createScene(canvas, B, {
      reduced: reduced,
      parallax: parallax,
      layer: $('sprite-layer'),
      sprites: window.PLANET_SPRITES || {},
      starLayers: starLayers,
      routes: DATA.routes,
      sizeRef: DATA.sizeReference,      // fixed body size: the approved 4-planet framing
      scrollProgress: spaceProgress,    // desktop: page scroll -> camera pan down the tall space
      awards: ACH,                     // gold medal satellites + constellation lines
      badges: ACH,                     // station medal slots, in order
      shipStart: 1, // ship arrives at Is It You? from All Star Cricket 2 on load, as in the concept
      hudHeight: function () { return document.getElementById('hud').getBoundingClientRect().height; },
      onPick: function (i) {
        select(i, {});
        if (i === STATION) openAchievements(null);    // tapping the station opens the panel (rocket flies there underneath)
      },
      onArrive: function (i) { onShipArrive(i); },
      onFrame: positionOverlays
    });
  } catch (err) {
    scene = null;
    document.body.classList.add('no-webgl');
    if (window.console && console.info) console.info('3D scene unavailable, using static planets:', err && err.message);
  }

  if (scene) {
    var resizeT = 0;
    var onResize = function () { cancelAnimationFrame(resizeT); resizeT = requestAnimationFrame(function () { calloutSize.at = -1; labelSize = null; hudBottomCache = -1; scene.resize(); layoutSpace(); positionOverlays(); }); };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas); else window.addEventListener('resize', onResize);
    layoutSpace();

    var visible = true;
    var syncRun = function () { scene.setRunning(visible && !document.hidden); };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; syncRun(); }, { threshold: 0 }).observe(world);
    }
    document.addEventListener('visibilitychange', syncRun);

    if (!reduced) {
      world.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = stage.getBoundingClientRect();
        parallax.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
        parallax.y = ((e.clientY - r.top) / r.height - 0.5) * -2;
      });
    }
  }
  // Give the HUD a solid bar once the world has scrolled away (it floats over the list otherwise)
  var hud = $('hud');
  var syncHud = function () { hud.classList.toggle('is-scrolled', world.getBoundingClientRect().bottom < hud.offsetHeight + 24); };
  window.addEventListener('scroll', syncHud, { passive: true });
  syncHud();

  if (dockMQ.addEventListener) dockMQ.addEventListener('change', positionOverlays);
  if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', function (e) { reduced = e.matches; });

  // Start like the approved concept: Is It You? selected, ship en route (no scroll on load: top of the space).
  select(0, { noScroll: true });

  // Read-only hook for automated browser QA (test_portfolio.py).
  window.__portfolio = {
    webgl: !!scene,
    sceneInfo: function () { return scene ? scene.info() : null; },
    selected: function () { return selected; },
    setWarp: function (on) { if (scene && scene.setWarp) scene.setWarp(on); },
    project: function (i) { return scene ? scene.project(i) : null; },
    bodies: B.map(function (b) { return b.id; }),
    navOrder: NAV.map(function (i) { return B[i].id; }),
    calloutPlacement: function () { return calloutDebug; },
    station: STATION,
    space: function () { return { px: space.px, top: space.top, progress: spaceProgress(), info: scene && scene.scrollInfo ? scene.scrollInfo() : null }; }
  };
})();
