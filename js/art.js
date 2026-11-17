/* Code-rendered vector art shared by the scene and the UI (no image files needed):
   medal badges (gold disc + ribbon + glyph), the small gold trophy icon and the gold comet icon.
   Gold is reserved for achievements. */
(function () {
  'use strict';
  var uid = 0;

  function glyphSVG(glyph) {
    if (glyph === 'star') {
      return '<path d="M32 15.5l3.9 8.1 8.9 1.2-6.5 6.2 1.6 8.8L32 35.6l-7.9 4.2 1.6-8.8-6.5-6.2 8.9-1.2z" ' +
             'fill="#fff3c4" stroke="#7a4a0c" stroke-width="2" stroke-linejoin="round"/>';
    }
    // number glyph (e.g. '1' -> "#1")
    return '<text x="32" y="35.5" text-anchor="middle" font-family="Fredoka, ui-rounded, system-ui, sans-serif" ' +
           'font-weight="700" font-size="17" fill="#7a4a0c" stroke="#fff3c4" stroke-width="0.6" paint-order="stroke">#' +
           String(glyph).replace(/[^0-9A-Za-z]/g, '') + '</text>';
  }

  /* medal({ glyph, ribbon: [c1, c2], cls, bare }) -> SVG string, viewBox 64 x 72 (disc centre 32,28 r 23).
     bare: disc only (viewBox 7.7..56.3 square) — for slots that already have a ribbon notch drawn. */
  function medal(o) {
    o = o || {};
    var id = 'md' + (++uid), rb = o.ribbon || ['#e23b3b', '#2f6fde'];
    return '<svg class="medal-svg ' + (o.cls || '') + '" viewBox="' + (o.bare ? '7.7 3.7 48.6 48.6' : '0 0 64 72') + '" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<radialGradient id="' + id + 'g" cx="38%" cy="32%" r="70%">' +
          '<stop offset="0" stop-color="#fff6d6"/><stop offset=".38" stop-color="#ffd36a"/>' +
          '<stop offset=".78" stop-color="#f2c14a"/><stop offset="1" stop-color="#c9921e"/></radialGradient>' +
      '</defs>' +
      // ribbon tails (notched ends) behind the disc
      (o.bare ? '' :
      '<path d="M22 38 L33 42 L27 70 L22.5 64.5 L16 68 Z" fill="' + rb[0] + '" stroke="#2a1606" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M42 38 L31 42 L37 70 L41.5 64.5 L48 68 Z" fill="' + rb[1] + '" stroke="#2a1606" stroke-width="2" stroke-linejoin="round"/>') +
      // disc: toon outline, rim, inner ring, highlight
      '<circle cx="32" cy="28" r="23" fill="#c9921e" stroke="#2a1606" stroke-width="2.6"/>' +
      '<circle cx="32" cy="28" r="19.5" fill="url(#' + id + 'g)"/>' +
      '<circle cx="32" cy="28" r="15.5" fill="none" stroke="#c9921e" stroke-width="1.6" stroke-dasharray="2.2 2.2"/>' +
      '<path d="M17 21a16 16 0 0 1 10-10" fill="none" stroke="#fffbe8" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>' +
      glyphSVG(o.glyph || 'star') +
      '</svg>';
  }

  /* small gold trophy icon (24 x 24) */
  function trophy(cls) {
    return '<svg class="trophy-svg ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M7 4.5H3.8v2.3c0 2.6 1.9 4.6 4.4 4.8M17 4.5h3.2v2.3c0 2.6-1.9 4.6-4.4 4.8" fill="none" stroke="#7a4a0c" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M6.6 3h10.8v4.6c0 3.4-2.4 6-5.4 6s-5.4-2.6-5.4-6z" fill="#ffd36a" stroke="#7a4a0c" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M9 5.2v2.4" stroke="#fff6d6" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M10.6 13.4h2.8l.5 3.6h-3.8z" fill="#f2c14a" stroke="#7a4a0c" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<rect x="7.2" y="17" width="9.6" height="3.8" rx="1.2" fill="#c9921e" stroke="#7a4a0c" stroke-width="1.4"/>' +
      '</svg>';
  }

  /* small gold comet icon (24 x 24): head lower-right, tail streaming to the upper-left (matches the sprite) */
  function comet(cls) {
    return '<svg class="comet-svg ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M2.5 3.5c5 1.5 9.5 4.6 12.6 8.2l-3.2 3.3C8.4 11.8 5 7.8 2.5 3.5z" fill="#ffe39a" stroke="#7a4a0c" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M4 9.5c3.6.9 6.6 2.6 8.6 4.6l-1.9 2C8.6 14.3 6.2 12 4 9.5z" fill="#f2a33a" stroke="#7a4a0c" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<circle cx="16" cy="16" r="5.6" fill="#f2c14a" stroke="#7a4a0c" stroke-width="1.5"/>' +
      '<circle cx="14.4" cy="14.3" r="1.6" fill="#fff6d6"/><path d="M8 4.5l.6 1.4 1.4.6-1.4.6L8 8.5l-.6-1.4L6 6.5l1.4-.6z" fill="#fff6d6"/>' +
      '</svg>';
  }

  window.ART = { medal: medal, trophy: trophy, comet: comet };
})();
