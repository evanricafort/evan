/*
 * One dark-mode icon across every tool page.
 *
 * The pages grew separately and their toggles show the icon three different
 * ways -- a Font Awesome <i>, a lucide <i data-lucide>, a pair of inline
 * <svg>s swapped by hidden. Rewriting each toggle would mean touching working
 * code on seventeen pages, so this leaves every page's own logic alone: it
 * hides whatever icon is already in the button and puts the reference one
 * (tools/spfrecordchecker) in beside it. A page that keeps setting classes or
 * toggling hidden on its original icon goes on doing so, unseen and harmless.
 */
(function () {
  'use strict';

  var FONT_AWESOME = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
  var SUN = 'fas fa-sun tk-theme-icon';
  var MOON = 'fas fa-moon tk-theme-icon';

  function findToggle() {
    return document.querySelector(
      '#themeToggle, #btnThemeToggle, #themeToggleBtn, .theme-toggle-btn,' +
      ' [onclick*="toggleTheme"], [onclick*="toggleDarkMode"]'
    );
  }

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

  function start() {
    var toggle = findToggle();
    if (!toggle || toggle.querySelector('.tk-theme-icon')) return;

    ensureFontAwesome();

    // Hide, never remove: the page may still be holding a reference to these.
    var existing = toggle.querySelectorAll('i, svg');
    Array.prototype.forEach.call(existing, function (node) {
      node.classList.add('tk-theme-icon-was');
    });

    var icon = document.createElement('i');
    icon.className = isDark() ? SUN : MOON;
    icon.setAttribute('aria-hidden', 'true');
    toggle.appendChild(icon);

    function sync() {
      icon.className = isDark() ? SUN : MOON;
    }

    // The page swaps the theme however it likes; watch the result rather than
    // the click, so this works whatever the toggle is called.
    new MutationObserver(sync).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
