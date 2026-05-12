/* ============================================================
   DST SYSTEM — Vitrine JS v2.0
   Navigation flat, animations scroll, FAQ, formulaire
   ============================================================ */

(function () {
  'use strict';

  /* --- Navigation burger (mobile) --- */
  const burger  = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');

  if (burger && navLinks) {
    burger.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open');
      burger.classList.toggle('open', isOpen);
      burger.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  /* --- Fermer le menu si on clique en dehors --- */
  document.addEventListener('click', function (e) {
    if (navLinks && burger && !navLinks.contains(e.target) && !burger.contains(e.target)) {
      navLinks.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });

  /* --- Fermer le menu sur resize --- */
  window.addEventListener('resize', function () {
    if (window.innerWidth > 960 && navLinks) {
      navLinks.classList.remove('open');
      if (burger) {
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
      document.body.style.overflow = '';
    }
  });

  /* --- Active nav link --- */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href && href !== '#' && href === currentPage) {
      link.classList.add('active');
    }
  });

  /* --- Scroll fade-in animations --- */
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-up').forEach(function (el) {
    observer.observe(el);
  });

  /* --- FAQ accordion --- */
  document.querySelectorAll('.faq-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      // Fermer tous les autres
      document.querySelectorAll('.faq-item.open').forEach(function (openItem) {
        if (openItem !== item) openItem.classList.remove('open');
      });
      item.classList.toggle('open', !isOpen);
    });
  });

  /* --- Pré-sélection du formulaire via paramètres URL --- */
  const formule = document.getElementById('formule');
  if (formule) {
    const params = new URLSearchParams(window.location.search);
    const objet  = params.get('objet');
    const valid  = ['presentation', 'initier', 'evaluation', 'devis', 'indetermine',
                    'offre-base', 'offre-operationnel', 'offre-premium', 'programme-mobile', 'sur-mesure'];
    if (objet && valid.includes(objet)) {
      formule.value = objet;
    }
  }

  /* --- Smooth scroll pour ancres internes --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* --- Cookie banner --- */
  const cookieBanner = document.getElementById('cookie-banner');
  if (cookieBanner && localStorage.getItem('cookies_accepted')) {
    cookieBanner.style.display = 'none';
  }

  /* --- Theme toggle (clair / sombre) --- */
  var SUN_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var MOON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function syncThemeButtons(theme) {
    document.querySelectorAll('.nav__theme').forEach(function (btn) {
      btn.innerHTML = theme === 'light' ? MOON_SVG : SUN_SVG;
      btn.setAttribute('aria-label', theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair');
      btn.setAttribute('title', theme === 'light' ? 'Mode sombre' : 'Mode clair');
    });
  }

  function toggleTheme() {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var next = isLight ? 'dark' : 'light';
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('crbr_theme', next);
    syncThemeButtons(next);
  }

  document.querySelectorAll('.nav__theme').forEach(function (btn) {
    btn.addEventListener('click', toggleTheme);
  });

  /* Synchroniser les icônes avec le thème appliqué par le script head */
  var initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  syncThemeButtons(initialTheme);

})();
