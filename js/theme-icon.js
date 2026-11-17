/*
 * One dark-mode icon across every tool page.
 *
 * The pages grew separately and show the toggle three different ways -- a
 * Font Awesome <i>, a lucide <i data-lucide>, a pair of inline <svg>s swapped
 * by hidden -- under four different button ids. Rewriting seventeen working
 * toggles is how the sshsecurity one got broken before, so this leaves every
 * page's own logic alone: it hides whatever icon the button already holds and
 * puts the reference one (tools/spfrecordchecker) in beside it. A page that
 * goes on setting classes or toggling hidden on its original icon does so
 * unseen and harmless.
 *
 * Everything is re-queried from the document on each paint rather than held
 * in a variable. A page is free to rebuild its own toggle -- one of them used
 * to replace it with a cloneNode(true) copy -- and a held reference would then
 * point at a node no longer in the page.
 */
(function () {
  'use strict';

  var FONT_AWESOME = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
  var SUN = 'fas fa-sun tk-theme-icon';
  var MOON = 'fas fa-moon tk-theme-icon';
  var TOGGLE = '#themeToggle, #btnThemeToggle, #themeToggleBtn, .theme-toggle-btn,' +
    ' [onclick*="toggleTheme"], [onclick*="toggleDarkMode"]';

  function ensureFontAwesome() {
    if (document.querySelector('link[href*="font-awesome"]')) return;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_AWESOME;
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    document.head.appendChild(link);
  }

  function isDark() {
    var root = document.documentElement;
    return root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';
  }

  /* Pick the control the reader actually sees. webarchive's #themeToggle is
     an sr-only checkbox inside a <label>: appending an icon to an <input>
     renders nothing, so climb to the label that wraps it. */
  function findToggle() {
    var candidates = document.querySelectorAll(TOGGLE);

    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      if (node.getBoundingClientRect().width < 20) {
        var visible = node.closest('label, button, a');
        if (visible && visible.getBoundingClientRect().width >= 20) return visible;
        continue;
      }
      return node;
    }

    return null;
  }

  function paint() {
    var toggle = findToggle();
    if (!toggle) return;

    // Geometry and colour are forced from tool-shell.css off this class, so
    // every page's button sits in the same corner at the same size.
    toggle.classList.add('tk-theme-btn');

    var icon = toggle.querySelector('.tk-theme-icon');
    if (!icon) {
      icon = document.createElement('i');
      icon.setAttribute('aria-hidden', 'true');
      toggle.appendChild(icon);
    }

    /* Hide whatever else the button holds -- every paint, not just the first.

       Several pages swap their own icon on click with
       `themeIcon.className = 'fas fa-moon ...'`. Assigning className replaces
       the whole attribute, so the class we had hidden it with disappeared and
       the page's icon came back beside ours: two suns after one click. An
       inline display survives that, because className does not touch it.

       Hidden, never removed: the page still holds references to these. */
    var kids = toggle.querySelectorAll('*');
    Array.prototype.forEach.call(kids, function (node) {
      if (node === icon) return;
      node.classList.add('tk-theme-icon-was');
      node.style.setProperty('display', 'none', 'important');
    });

    var wanted = isDark() ? SUN : MOON;
    if (icon.className !== wanted) icon.className = wanted;
  }

  function start() {
    ensureFontAwesome();
    paint();

    // Watch the result of a theme change rather than the click, so this works
    // whatever each page calls its toggle.
    new MutationObserver(paint).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // A page may rebuild its toggle on click; repaint just after one lands.
    document.addEventListener('click', function () {
      window.setTimeout(paint, 0);
      window.setTimeout(paint, 250);
    }, true);

    // And once more after late scripts have finished rearranging the page.
    window.setTimeout(paint, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
