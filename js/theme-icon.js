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
 * in a variable: proofreader replaces its toggle with a cloneNode(true) copy,
 * and a held reference would point at a node no longer in the page.
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

  function paint() {
    var toggle = document.querySelector(TOGGLE);
    if (!toggle) return;

    var icon = toggle.querySelector('.tk-theme-icon');
    if (!icon) {
      // Hide, never remove: the page may still hold a reference to these.
      var existing = toggle.querySelectorAll('i, svg');
      Array.prototype.forEach.call(existing, function (node) {
        node.classList.add('tk-theme-icon-was');
      });

      icon = document.createElement('i');
      icon.setAttribute('aria-hidden', 'true');
      toggle.appendChild(icon);
    }

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
