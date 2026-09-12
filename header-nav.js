/* IXL Korea — canonical public/global navigation
   One global menu definition + shared header behavior + public navigation primitives.
   Community navigation is intentionally outside this module. */
(function () {
  'use strict';

  const PUBLIC_NAV_ITEMS = Object.freeze([
    { id: 'home', label: 'Home', i18n: 'nav.home', section: 'home' },
    {
      id: 'about',
      label: 'About',
      i18n: 'nav.about',
      section: 'company-overview',
      standaloneSection: 'about',
      children: Object.freeze([
        { id: 'company-overview', label: 'Company Overview', i18n: 'nav.companyOverview', section: 'company-overview' },
        { id: 'ixl-team', label: 'IXL Center Team', i18n: 'nav.ixlCenterTeam', section: 'ixl-team' },
        { id: 'advisory-board', label: 'Advisory Board', i18n: 'nav.advisoryBoard', section: 'advisory-board' },
        { id: 'about-partners', label: 'Partners', i18n: 'nav.partners', section: 'about-partners' },
        { id: 'our-office', label: 'Our Office', i18n: 'nav.office', section: 'our-office' }
      ])
    },
    { id: 'company-profile', label: 'Company Profile', i18n: 'nav.companyProfile', section: 'company-profile' },
    { id: 'offerings', label: 'Offerings', i18n: 'nav.offerings', section: 'offerings', standaloneSection: 'offerings-head' },
    { id: 'universities', label: 'Universities', i18n: 'nav.universities', section: 'universities' },
    { id: 'cases', label: 'Cases', i18n: 'nav.cases', section: 'cases' },
    { id: 'insights', label: 'Insights', i18n: 'nav.insights', section: 'insights' },
    { id: 'contact', label: 'Contact', i18n: 'nav.contact', section: 'contact' }
  ]);

  function normalizeContext(nav) {
    return String(nav?.dataset?.siteNavContext || 'home').trim().toLowerCase();
  }

  function sectionHref(section, context = 'home') {
    const clean = String(section || '').replace(/^#/, '');
    return context === 'home' ? `#${clean}` : `index.html#${clean}`;
  }

  function makeNavLink(item, context, className = '') {
    const link = document.createElement('a');
    const section = context === 'standalone' && item.standaloneSection
      ? item.standaloneSection
      : item.section;
    link.href = sectionHref(section, context);
    link.textContent = item.label;
    if (item.i18n) link.dataset.i18n = item.i18n;
    if (className) link.className = className;
    return link;
  }

  function renderPublicNav(root = document) {
    root.querySelectorAll('nav[data-site-nav]').forEach(nav => {
      const context = normalizeContext(nav);
      const fragment = document.createDocumentFragment();

      PUBLIC_NAV_ITEMS.forEach(item => {
        if (!item.children) {
          fragment.appendChild(makeNavLink(item, context));
          return;
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'nav-dropdown';

        const trigger = makeNavLink(item, context, 'nav-dropdown-trigger');
        dropdown.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'nav-dropdown-menu';
        item.children.forEach(child => menu.appendChild(makeNavLink(child, context)));

        dropdown.appendChild(menu);
        fragment.appendChild(dropdown);
      });

      nav.replaceChildren(fragment);
    });
  }

  function getParams(search = window.location.search) {
    return new URLSearchParams(search || '');
  }

  function buildUrl(path = 'index.html', params = null, hash = '') {
    const url = new URL(String(path || 'index.html'), window.location.href);

    if (params instanceof URLSearchParams) {
      url.search = params.toString();
    } else if (params && typeof params === 'object') {
      const next = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        next.set(key, String(value));
      });
      url.search = next.toString();
    }

    if (hash !== null && hash !== undefined) {
      const cleanHash = String(hash || '').trim().replace(/^#/, '');
      url.hash = cleanHash ? `#${cleanHash}` : '';
    }

    return url.origin === window.location.origin
      ? `${url.pathname.split('/').pop() || ''}${url.search}${url.hash}`
      : url.href;
  }

  function replaceHash(section) {
    const clean = String(section || '').trim().replace(/^#/, '');
    const hash = clean ? `#${clean}` : '';
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  function goToSection(section, options = {}) {
    const clean = String(section || '').trim().replace(/^#/, '');
    if (!clean) return false;

    const target = document.getElementById(clean);
    if (target) {
      if (options.replaceHash !== false) replaceHash(clean);
      target.scrollIntoView({
        block: options.block || 'start',
        behavior: options.behavior || 'auto'
      });
      return true;
    }

    window.location.href = sectionHref(clean, options.context || 'standalone');
    return false;
  }

  function isMobileNav() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function initHeaderBehavior(root = document) {
    const dropdown = root.querySelector('.header .nav-dropdown');
    const trigger = dropdown ? dropdown.querySelector('.nav-dropdown-trigger') : null;
    const menu = dropdown ? dropdown.querySelector('.nav-dropdown-menu') : null;

    if (!dropdown || !trigger || !menu || dropdown.dataset.navBehaviorReady === 'true') return;
    dropdown.dataset.navBehaviorReady = 'true';

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
      if (!isMobileNav()) closeAbout();
      else if (dropdown.classList.contains('mobile-about-open')) positionAbout();
    });

    window.addEventListener('scroll', function () {
      if (isMobileNav() && dropdown.classList.contains('mobile-about-open')) positionAbout();
    }, { passive: true });
  }

  function init(root = document) {
    renderPublicNav(root);
    initHeaderBehavior(root);
  }

  window.IXLPublicNavigation = Object.freeze({
    items: PUBLIC_NAV_ITEMS,
    render: renderPublicNav,
    getParams,
    buildUrl,
    replaceHash,
    goToSection,
    sectionHref,
    init
  });

  init(document);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init(document);
    }, { once: true });
  }
})();
