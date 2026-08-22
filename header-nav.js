/* IXL Korea — shared header/nav behavior
   Used by index.html and standalone content pages. */
document.addEventListener('DOMContentLoaded', function () {
  const dropdown = document.querySelector('.header .nav-dropdown');
  const trigger = dropdown ? dropdown.querySelector('.nav-dropdown-trigger') : null;
  const menu = dropdown ? dropdown.querySelector('.nav-dropdown-menu') : null;

  if (!dropdown || !trigger || !menu) return;

  function isMobileNav() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function closeAbout() {
    dropdown.classList.remove('mobile-about-open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function positionAbout() {
    const rect = trigger.getBoundingClientRect();
    const popupWidth = Math.max(menu.offsetWidth || 0, 210);
    const edge = 14;
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - popupWidth - edge));
    document.documentElement.style.setProperty('--mobile-about-left', left + 'px');
    document.documentElement.style.setProperty('--mobile-about-top', (rect.bottom + 4) + 'px');
  }

  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  trigger.addEventListener('click', function (event) {
    if (!isMobileNav()) return;
    event.preventDefault();
    event.stopPropagation();
    const opening = !dropdown.classList.contains('mobile-about-open');
    closeAbout();
    if (opening) {
      positionAbout();
      dropdown.classList.add('mobile-about-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) closeAbout();
  });

  document.addEventListener('click', function (event) {
    if (isMobileNav() && !dropdown.contains(event.target)) closeAbout();
  });

  window.addEventListener('resize', function () {
    if (!isMobileNav()) {
      closeAbout();
    } else if (dropdown.classList.contains('mobile-about-open')) {
      positionAbout();
    }
  });

  window.addEventListener('scroll', function () {
    if (isMobileNav() && dropdown.classList.contains('mobile-about-open')) positionAbout();
  }, { passive: true });
});
