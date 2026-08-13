/* ======================================================================
   Geometric web background — shared by the tool pages
   Lifted from js/site.js so the tools and the homepage draw the same
   background from one source. Self-contained: it creates its own canvas
   if the page has none, reads --geo-line / --geo-accent from the page,
   and re-reads them when the theme class on <html> changes.
   ====================================================================== */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* The tool pages have no <canvas> in their markup, so add one rather
     than requiring ten separate markup edits. */
  function ensureCanvas() {
    var existing = document.getElementById('bg-canvas');
    if (existing) return existing;
    var el = document.createElement('canvas');
    el.id = 'bg-canvas';
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }
  function initGeometricWeb() {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var TAU = Math.PI * 2;

    var SETTINGS = {
      areaPerNode: 15000,    /* one node per N square CSS pixels */
      minNodes: 26,
      maxNodes: 88,
      linkDistance: 165,     /* neighbours closer than this are linked */
      maxDrift: 0.13,        /* px per frame at 60fps */
      minNodeRadius: 1,
      maxNodeRadius: 2.2,
      lineAlpha: 0.17,
      dotAlpha: 0.34,
      cursorRadius: 230,
      cursorPush: 1,
      springBack: 0.014,
      damping: 0.9,
      maxDisplacement: 120,
      calmDrift: 0.35,       /* drift multiplier under "reduce motion" */
      resizeDelay: 150
    };

    /* "Reduce motion" calms the web - slower drift - but it keeps
       moving and keeps answering the cursor, because a frozen
       background reads as broken rather than considerate. */
    var calm = reducedMotion.matches;

    var nodes = [];
    var pointer = { x: -9999, y: -9999, influence: 0, target: 0 };
    var palette = readPalette();
    var viewport = { width: 0, height: 0 };
    var frameId = null;
    var lastFrameTime = 0;
    var resizeTimer = null;

    function random(min, max) {
      return min + Math.random() * (max - min);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function readPalette() {
      var styles = window.getComputedStyle(document.body);
      var line = styles.getPropertyValue('--geo-line').trim() || '0, 0, 0';
      var accent = styles.getPropertyValue('--geo-accent').trim() || line;
      return { line: line, accent: accent };
    }

    function rgba(rgb, alpha) {
      return 'rgba(' + rgb + ', ' + alpha.toFixed(4) + ')';
    }

    function createNode() {
      var x = random(0, viewport.width);
      var y = random(0, viewport.height);

      return {
        x: x,
        y: y,
        renderX: x,     /* drift position plus the cursor offset */
        renderY: y,
        radius: random(SETTINGS.minNodeRadius, SETTINGS.maxNodeRadius),
        driftX: random(-SETTINGS.maxDrift, SETTINGS.maxDrift),
        driftY: random(-SETTINGS.maxDrift, SETTINGS.maxDrift),
        offsetX: 0,
        offsetY: 0,
        pushX: 0,
        pushY: 0,
        nearness: 0     /* 0..1 proximity to the cursor */
      };
    }

    function populate() {
      var count = clamp(
        Math.round((viewport.width * viewport.height) / SETTINGS.areaPerNode),
        SETTINGS.minNodes,
        SETTINGS.maxNodes
      );

      nodes.length = 0;
      for (var i = 0; i < count; i += 1) {
        nodes.push(createNode());
      }
    }

    function resizeCanvas() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2);

      viewport.width = window.innerWidth;
      viewport.height = window.innerHeight;
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function step(delta) {
      var decay = Math.pow(SETTINGS.damping, delta);
      var drift = delta * (calm ? SETTINGS.calmDrift : 1);

      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];

        node.x += node.driftX * drift;
        node.y += node.driftY * drift;

        /* Bounce at the edges - wrapping would snap links across the page. */
        if (node.x < 0) { node.x = 0; node.driftX = -node.driftX; }
        else if (node.x > viewport.width) { node.x = viewport.width; node.driftX = -node.driftX; }
        if (node.y < 0) { node.y = 0; node.driftY = -node.driftY; }
        else if (node.y > viewport.height) { node.y = viewport.height; node.driftY = -node.driftY; }

        var dx = node.renderX - pointer.x;
        var dy = node.renderY - pointer.y;
        var distance = Math.sqrt(dx * dx + dy * dy) || 1;
        var falloff = Math.max(0, 1 - distance / SETTINGS.cursorRadius);

        node.nearness = falloff * pointer.influence;

        if (node.nearness > 0.01) {
          var force = falloff * falloff * SETTINGS.cursorPush * pointer.influence;
          node.pushX += (dx / distance) * force * delta;
          node.pushY += (dy / distance) * force * delta;
        }

        /* Damped spring pulls each node back onto its drifting path. */
        node.pushX = (node.pushX - node.offsetX * SETTINGS.springBack * delta) * decay;
        node.pushY = (node.pushY - node.offsetY * SETTINGS.springBack * delta) * decay;
        node.offsetX = clamp(node.offsetX + node.pushX * delta, -SETTINGS.maxDisplacement, SETTINGS.maxDisplacement);
        node.offsetY = clamp(node.offsetY + node.pushY * delta, -SETTINGS.maxDisplacement, SETTINGS.maxDisplacement);

        node.renderX = node.x + node.offsetX;
        node.renderY = node.y + node.offsetY;
      }
    }

    function draw() {
      var count = nodes.length;
      var reach = SETTINGS.linkDistance;
      var reachSq = reach * reach;
      var i, j, node;

      ctx.clearRect(0, 0, viewport.width, viewport.height);

      /* Links first, so the dots sit on top of them. */
      for (i = 0; i < count; i += 1) {
        var a = nodes[i];

        for (j = i + 1; j < count; j += 1) {
          var b = nodes[j];
          var dx = a.renderX - b.renderX;
          var dy = a.renderY - b.renderY;
          var squared = dx * dx + dy * dy;
          if (squared >= reachSq) continue;

          var strength = 1 - Math.sqrt(squared) / reach;
          var nearness = a.nearness > b.nearness ? a.nearness : b.nearness;

          ctx.strokeStyle = rgba(
            nearness > 0.05 ? palette.accent : palette.line,
            strength * (SETTINGS.lineAlpha + nearness * 0.5)
          );
          ctx.lineWidth = 1 + nearness * 0.6;
          ctx.beginPath();
          ctx.moveTo(a.renderX, a.renderY);
          ctx.lineTo(b.renderX, b.renderY);
          ctx.stroke();
        }
      }

      /* The cursor's own links into the web. */
      if (pointer.influence > 0.01) {
        ctx.lineWidth = 1;

        for (i = 0; i < count; i += 1) {
          node = nodes[i];
          if (node.nearness <= 0.02) continue;

          ctx.strokeStyle = rgba(palette.accent, node.nearness * 0.55);
          ctx.beginPath();
          ctx.moveTo(node.renderX, node.renderY);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }

      /* Dots. */
      for (i = 0; i < count; i += 1) {
        node = nodes[i];

        ctx.fillStyle = rgba(
          node.nearness > 0.05 ? palette.accent : palette.line,
          SETTINGS.dotAlpha + node.nearness * 0.6
        );
        ctx.beginPath();
        ctx.arc(node.renderX, node.renderY, node.radius + node.nearness * 1.8, 0, TAU);
        ctx.fill();
      }
    }

    function render(time) {
      var delta = lastFrameTime ? Math.min((time - lastFrameTime) / 16.6667, 3) : 1;
      lastFrameTime = time;

      pointer.influence += (pointer.target - pointer.influence) * Math.min(0.08 * delta, 1);
      step(delta);
      draw();

      frameId = window.requestAnimationFrame(render);
    }

    function start() {
      if (frameId !== null) return;
      lastFrameTime = 0;
      frameId = window.requestAnimationFrame(render);
    }

    function stop() {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }

    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resizeCanvas();
        for (var i = 0; i < nodes.length; i += 1) {
          var node = nodes[i];
          node.x = clamp(node.x, 0, viewport.width);
          node.y = clamp(node.y, 0, viewport.height);
          node.renderX = node.x + node.offsetX;
          node.renderY = node.y + node.offsetY;
        }
      }, SETTINGS.resizeDelay);
    }

    function applyMotionPreference() {
      calm = reducedMotion.matches;
      start();
    }

    function releasePointer() {
      pointer.target = 0;
    }

    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.target = 1;
    }, { passive: true });

    /* pointerleave does not bubble, so it is bound to <html> rather than window. */
    document.documentElement.addEventListener('pointerleave', releasePointer);
    window.addEventListener('blur', releasePointer);
    window.addEventListener('resize', handleResize);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    /* Pick up the theme's palette when dark mode is toggled. */
    new MutationObserver(function () {
      palette = readPalette();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', applyMotionPreference);
    }

    resizeCanvas();
    populate();
    applyMotionPreference();
  }
  function start() {
    ensureCanvas();
    initGeometricWeb();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();