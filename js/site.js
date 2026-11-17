(function () {
  'use strict';

  var THEME_STORAGE_KEY = 'theme';
  var LIST_DATE_KEY = 'achievements-updated';
  // How fast a disclosure panel slides, and the bounds that keep a short
  // list from crawling or a very long one from dragging.
  var SLIDE_PIXELS_PER_SECOND = 2500;
  var SLIDE_MIN_SECONDS = 0.7;
  var SLIDE_MAX_SECONDS = 2.0;

  /* ============================================================
     Scroll animations
     ============================================================ */
  function initScrollAnimations() {
    if (typeof AOS === 'undefined') return;

    AOS.init({
      duration: 700,
      easing: 'ease-out-quad',
      once: true,
      mirror: false
    });
  }

  /* ============================================================
     Dark mode
     Hovering the profile photo flips the theme once per pass;
     the choice is remembered in localStorage.
     ============================================================ */
  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      /* Nothing to do - the theme simply will not persist. */
    }
  }

  function initTheme() {
    /* Idempotent - the inline script at the top of <body> normally wins the race. */
    if (readStoredTheme() === 'dark') {
      document.body.classList.add('dark-mode');
    }

    var trigger = document.getElementById('dark-mode-toggle');
    if (!trigger) return;

    var armed = true;

    trigger.addEventListener('mouseenter', function () {
      if (!armed) return;
      var isDark = document.body.classList.toggle('dark-mode');
      storeTheme(isDark ? 'dark' : 'light');
      armed = false;
    });

    trigger.addEventListener('mouseleave', function () {
      armed = true;
    });
  }

  /* ============================================================
     Typed tagline
     ============================================================ */
  function initTagline() {
    var target = document.getElementById('typing-text');
    if (!target || typeof Typed === 'undefined') return;

    var phrases = [
      'pWning since 2006',
      'infosec, nature, music, trail running and bikes',
      'will hack for burger and fries'
    ];

    /* data-text feeds the CSS glitch layers, so keep it in sync. */
    new Typed(target, {
      strings: phrases,
      loop: true,
      typeSpeed: 50,
      backSpeed: 50,
      backDelay: 1000,
      smartBackspace: true,
      onStringTyped: function (position, self) {
        target.setAttribute('data-text', self.strings[position]);
      },
      onComplete: function (self) {
        target.setAttribute('data-text', self.strings[0]);
      }
    });
  }

  /* ============================================================
     Projects list (data lives in js/projects.js)
     ============================================================ */
  function initProjects() {
    var entries = window.PROJECTS;
    var mount = document.getElementById('projects-list');
    if (!entries || !mount) return;

    mount.innerHTML = entries.map(function (entry) {
      return '<p><strong>' + entry.name + '</strong></p>' +
        '<ul><li><p>' + entry.description + ' — ' +
        '<a href="' + entry.href + '" target="_blank" rel="noopener noreferrer" ' +
        'class="container cool-link">' + entry.label + '</a></p></li></ul>';
    }).join('');
  }

  /* ============================================================
     Achievements list (data lives in js/achievements.js)
     ============================================================ */
  function initAchievements() {
    var data = window.ACHIEVEMENTS;
    var head = document.getElementById('achievements-head');
    var more = document.getElementById('more');
    if (!data || !head || !more) return;

    var entries = data.entries || [];
    var cut = typeof data.VISIBLE_COUNT === 'number' ? data.VISIBLE_COUNT : entries.length;

    function markup(list) {
      return list.map(function (entry) {
        return '<strong>• ' + entry.name + '</strong> — ' + entry.detail + '<br />';
      }).join('\n');
    }

    head.innerHTML = markup(entries.slice(0, cut));
    more.innerHTML = markup(entries.slice(cut));

    var stamp = document.getElementById('achievements-updated');
    if (!stamp) return;

    var newest = data.BASELINE_DATE || '';
    entries.forEach(function (entry) {
      if (entry.added && entry.added > newest) newest = entry.added;
    });
    showDate(stamp, newest);

    // An entry added on GitHub carries no `added` date -- copying the line
    // above it does not produce one -- so the list dates itself from the
    // commit that last changed it, and that wins when it is the later of
    // the two.
    datePublishedList(data.SOURCE, function (ymd) {
      if (ymd > newest) showDate(stamp, ymd);
    });
  }

  function showDate(stamp, ymd) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!parts) return;

    var when = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
    stamp.textContent = when.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
  }

  /* Anything that goes wrong here -- offline, rate limited, a private window
     refusing storage -- leaves the date the page already rendered. */
  function datePublishedList(source, done) {
    if (!source || !source.repo || !source.path || !window.fetch) return;

    var cached = null;
    try { cached = window.sessionStorage.getItem(LIST_DATE_KEY); } catch (error) { cached = null; }
    if (cached) { done(cached); return; }

    var url = 'https://api.github.com/repos/' + source.repo +
      '/commits?per_page=1&path=' + encodeURIComponent(source.path);

    window.fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (commits) {
        if (!commits || !commits.length) return;

        var ymd = new Date(commits[0].commit.committer.date)
          .toLocaleDateString('en-CA', { timeZone: source.timeZone || 'UTC' });

        try { window.sessionStorage.setItem(LIST_DATE_KEY, ymd); } catch (error) { /* not storable */ }
        done(ymd);
      })
      .catch(function () { /* keep what is on the page */ });
  }

  /* ============================================================
     "Read More" disclosures
     ============================================================ */
  /* Slide the panel open and shut.

     max-height does the travelling, measured rather than capped: a fixed
     ceiling would animate past the content on the way open and sit still on
     the way closed, which is two different-looking motions at one duration.

     The pace is set by distance, not a fixed time -- this list is thousands
     of pixels tall, and a duration that suits a short panel runs a long one
     past in a blur. Both directions measure the same height, so they stay
     the same speed as each other.

     The settle step runs off a timer rather than transitionend: a cancelled
     transition -- a quick second click, a browser that interrupts -- never
     fires the event, and the panel would be stranded part-open.

     This one slides for everybody, prefers-reduced-motion included: the
     site owner asked for that deliberately. The background web still honours
     the setting. */
  function animatePanel(panel, expanded) {
    window.clearTimeout(panel.slideTimer);

    var travel = panel.scrollHeight;

    var seconds = Math.min(SLIDE_MAX_SECONDS,
      Math.max(SLIDE_MIN_SECONDS, travel / SLIDE_PIXELS_PER_SECOND));
    panel.style.setProperty('--disclosure-duration', seconds.toFixed(2) + 's');
    panel.offsetHeight; // Settle the new duration before the height moves,
                        // or the change can land in one recalc and not run.

    if (expanded) {
      panel.style.maxHeight = travel + 'px';
      // Let it reflow freely once open, so a resize cannot clip the list.
      panel.slideTimer = window.setTimeout(function () {
        if (panel.classList.contains('show')) panel.style.maxHeight = 'none';
      }, seconds * 1000 + 60);
      return;
    }

    // Closing needs a concrete height to travel away from; it is sitting on
    // 'none' while open.
    panel.style.maxHeight = travel + 'px';
    panel.offsetHeight;
    panel.style.maxHeight = '0px';

    panel.slideTimer = window.setTimeout(function () {
      if (!panel.classList.contains('show')) scrollClearOf(panel);
    }, seconds * 1000 + 60);
  }

  /* Giving the height back costs the page more than it has left below it, so
     the browser hauls the viewport up from wherever the reader is standing.
     Stepping up to the top of the list first leaves it where they put it. */
  function scrollClearOf(panel) {
    var room = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY <= room) return;

    var panelTop = panel.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, panelTop - 80));
  }

  function initDisclosures() {
    var triggers = document.querySelectorAll('[data-toggle-target]');

    Array.prototype.forEach.call(triggers, function (trigger) {
      var panel = document.getElementById(trigger.getAttribute('data-toggle-target'));
      if (!panel) return;

      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        var expanded = panel.classList.toggle('show');
        trigger.textContent = expanded ? 'Show Less' : 'Read More';
        trigger.setAttribute('aria-expanded', String(expanded));
        animatePanel(panel, expanded);
      });
    });
  }

  /* ============================================================
     Page load bar
     ============================================================ */
  function initLoadingBar() {
    var bar = document.getElementById('loading-bar');
    if (!bar) return;

    window.addEventListener('load', function () {
      bar.style.transition = 'opacity 0.5s ease';
      bar.style.opacity = '0';
      window.setTimeout(function () {
        bar.remove();
      }, 500);
    });
  }

  /* ============================================================
     Scroll progress bar
     ============================================================ */
  function initScrollProgress() {
    var bar = document.getElementById('scroll-progress');
    if (!bar) return;

    function update() {
      var doc = document.documentElement;
      var scrolled = doc.scrollTop || document.body.scrollTop;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      bar.style.width = (scrollable > 0 ? (scrolled / scrollable) * 100 : 0) + '%';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ============================================================
     Address hover map
     ============================================================ */
  function initAddressMap() {
    var circle = document.getElementById('map-circle');
    var address = document.getElementById('bio_left');
    if (!circle || !address) return;

    var OFFSET = 20;

    address.addEventListener('mouseenter', function () {
      circle.style.transform = 'scale(1)';
    });

    address.addEventListener('mouseleave', function () {
      circle.style.transform = 'scale(0)';
    });

    address.addEventListener('mousemove', function (event) {
      circle.style.top = (event.clientY + OFFSET) + 'px';
      circle.style.left = (event.clientX + OFFSET) + 'px';
    });
  }

  /* ============================================================
     CV hover preview
     The same trick as the address map: a panel that trails the
     cursor while the CV link is hovered, showing the first page
     of the PDF itself so it can never fall out of date.
     ============================================================ */
  function initCvPreview() {
    var panel = document.getElementById('cv-preview');
    var link = document.getElementById('cv-link');
    if (!panel || !link) return;

    var OFFSET = 20;
    var EDGE = 6;
    var loaded = false;

    /* Built on first hover rather than at page load - the CV is ~160KB
       and most visitors never hover it. */
    function ensureFrame() {
      if (loaded) return;
      loaded = true;

      var frame = document.createElement('iframe');
      /* Strip what the viewer will let us strip and fit page one to the
         width. Chrome ignores scrollbar=0, so the scrollbar is clipped in
         CSS instead - see #cv-preview iframe. */
      frame.src = link.href + '#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH';
      frame.title = 'Preview of the first page of the CV';
      frame.tabIndex = -1;
      panel.appendChild(frame);
    }

    /* The link sits near the right edge, so the panel flips to the other
       side of the cursor instead of hanging off the viewport. */
    function place(event) {
      var width = panel.offsetWidth;
      var height = panel.offsetHeight;
      var x = event.clientX + OFFSET;
      var y = event.clientY + OFFSET;

      if (x + width > window.innerWidth - EDGE) x = event.clientX - OFFSET - width;
      if (y + height > window.innerHeight - EDGE) y = event.clientY - OFFSET - height;

      panel.style.left = Math.max(EDGE, x) + 'px';
      panel.style.top = Math.max(EDGE, y) + 'px';
    }

    link.addEventListener('mouseenter', function (event) {
      ensureFrame();
      place(event);
      panel.style.transform = 'scale(1)';
    });

    link.addEventListener('mouseleave', function () {
      panel.style.transform = 'scale(0)';
    });

    link.addEventListener('mousemove', place);
  }

  /* ============================================================
     Name flicker
     ============================================================ */
  function initNameFlicker() {
    var FLICKER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    var FRAME_INTERVAL = 40;
    var FRAME_COUNT = 15;
    var letters = document.querySelectorAll('.glow-text span');

    Array.prototype.forEach.call(letters, function (letter) {
      var original = letter.textContent;
      var timer = null;

      letter.addEventListener('mouseenter', function () {
        if (timer !== null) return;

        var frame = 0;
        letter.classList.add('flicker-glow');

        timer = window.setInterval(function () {
          letter.textContent = FLICKER_CHARS.charAt(Math.floor(Math.random() * FLICKER_CHARS.length));
          frame += 1;

          if (frame >= FRAME_COUNT) {
            window.clearInterval(timer);
            timer = null;
            letter.textContent = original;
            letter.classList.remove('flicker-glow');
          }
        }, FRAME_INTERVAL);
      });
    });
  }

  /* ============================================================
     Scroll-to-top plane
     The button appears near the bottom of the page and flies off
     the top of the viewport, dragging the page back with it.
     ============================================================ */
  function initScrollToTop() {
    var button = document.getElementById('scrollToTopBtn');
    var plane = document.getElementById('airplaneIcon');
    if (!button || !plane) return;

    var REVEAL_MARGIN = 100;
    var FLIGHT_DURATION = 2500;
    var TRAIL_INTERVAL = 60;
    var TRAIL_LIFETIME = 600;
    var isFlying = false;

    window.addEventListener('scroll', function () {
      if (isFlying) return;
      var nearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - REVEAL_MARGIN;
      button.classList.toggle('show', nearBottom);
    }, { passive: true });

    function dropTrail(opacity) {
      var box = plane.getBoundingClientRect();
      var dot = document.createElement('div');

      dot.className = 'trail-dot';
      dot.style.left = (box.left + box.width / 2 - 4) + 'px';
      dot.style.top = (box.top + box.height / 2 + 25) + 'px';
      dot.style.opacity = opacity;

      document.body.appendChild(dot);
      window.setTimeout(function () {
        dot.remove();
      }, TRAIL_LIFETIME);
    }

    button.addEventListener('click', function () {
      if (isFlying) return;
      isFlying = true;

      var originalStyle = button.getAttribute('style') || '';
      var box = button.getBoundingClientRect();
      var startScroll = window.scrollY;
      var startTop = box.top;
      var startTime = performance.now();
      var lastTrailTime = 0;

      button.style.position = 'fixed';
      button.style.left = box.left + 'px';
      button.style.top = box.top + 'px';
      button.style.margin = '0';
      button.style.transition = 'none';
      button.style.pointerEvents = 'none';
      button.classList.remove('show');

      function animateFlight(time) {
        var progress = Math.min((time - startTime) / FLIGHT_DURATION, 1);
        var fade = 1 - progress * 0.8;

        button.style.top = (startTop - progress * window.innerHeight) + 'px';
        button.style.opacity = fade;
        window.scrollTo({ top: startScroll - startScroll * progress, behavior: 'instant' });

        if (progress < 1 && time - lastTrailTime >= TRAIL_INTERVAL) {
          lastTrailTime = time;
          dropTrail(fade);
        }

        if (progress < 1) {
          window.requestAnimationFrame(animateFlight);
          return;
        }

        button.setAttribute('style', originalStyle);
        button.classList.remove('show');
        button.style.pointerEvents = 'auto';
        isFlying = false;
        window.scrollTo({ top: 0 });
      }

      window.requestAnimationFrame(animateFlight);
    });
  }

  /* ============================================================
     Geometric web
     A lattice of dots drifting slowly behind the page, each one
     linked to whichever neighbours are close enough. The cursor is
     part of the web: nearby dots light up, link to the pointer and
     are shouldered aside, then spring back once it moves on.
     ============================================================ */
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
      maxDrift: 0.18,        /* px per frame at 60fps */
      minNodeRadius: 1,
      maxNodeRadius: 2.2,
      lineAlpha: 0.17,
      dotAlpha: 0.34,
      cursorRadius: 230,
      cursorPush: 1,
      springBack: 0.014,
      damping: 0.9,
      maxDisplacement: 120,
      resizeDelay: 150
    };

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
      var drift = delta;

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
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    resizeCanvas();
    populate();
    start();
  }

  initScrollAnimations();
  initTheme();
  initTagline();
  initProjects();
  initAchievements();
  initDisclosures();
  initLoadingBar();
  initScrollProgress();
  initAddressMap();
  initCvPreview();
  initNameFlicker();
  initScrollToTop();
  initGeometricWeb();
})();
