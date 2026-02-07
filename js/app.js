/* ============================================================
   DST-SYSTEM — Application principale
   Routeur SPA, navigation, gestion du header et des alertes
   ============================================================ */

const App = (() => {
  'use strict';

  /* --- État interne --- */
  let currentView = 'dashboard';
  let alertsPanelOpen = false;

  /* --- Routes disponibles --- */
  const routes = {
    dashboard:  { label: 'Dashboard dirigeant', icon: '◉', view: () => Views.Dashboard },
    clients:    { label: 'Clients',              icon: '⊡', view: () => Views.Clients },
    offers:     { label: 'Offres / Abonnements', icon: '⊞', view: () => Views.Offers },
    sessions:   { label: 'Sessions',             icon: '▶', view: () => Views.Sessions },
    operators:  { label: 'Opérateurs',           icon: '⊕', view: () => Views.Operators },
    modules:    { label: 'Modules',              icon: '⬡', view: () => Views.Modules },
    locations:  { label: 'Lieux',                icon: '⊿', view: () => Views.Locations },
    settings:   { label: 'Paramètres',           icon: '⚙', view: () => Views.Settings }
  };

  /* --- Initialisation --- */
  function init() {
    renderSidebar();
    renderHeader();

    // Écouter le hash pour navigation
    window.addEventListener('hashchange', onHashChange);

    // Navigation initiale
    const hash = window.location.hash.replace('#', '');
    if (hash && routes[hash]) {
      navigate(hash);
    } else {
      navigate('dashboard');
    }
  }

  /* --- Navigation --- */
  function navigate(viewName) {
    if (!routes[viewName]) return;
    currentView = viewName;
    window.location.hash = viewName;

    // Mettre à jour la sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Mettre à jour le titre du header
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
      headerTitle.textContent = routes[viewName].label;
    }

    // Rafraîchir les alertes dans le header
    updateAlertsBadge();

    // Rendre la vue
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = '<div class="text-center text-muted" style="padding:48px">Chargement...</div>';
      try {
        const viewModule = routes[viewName].view();
        if (viewModule && typeof viewModule.render === 'function') {
          viewModule.render(content);
        } else {
          content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>Module "${viewName}" non disponible</p></div>`;
        }
      } catch (e) {
        console.error(`Erreur rendu vue ${viewName}:`, e);
        content.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">⚠</span> Erreur lors du chargement : ${e.message}</div>`;
      }
    }

    // Fermer le panneau d'alertes si ouvert
    closeAlertsPanel();
  }

  function onHashChange() {
    const hash = window.location.hash.replace('#', '');
    if (hash && routes[hash] && hash !== currentView) {
      navigate(hash);
    }
  }

  /* --- Sidebar --- */
  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const navSections = [
      { title: 'Pilotage', items: ['dashboard'] },
      { title: 'Gestion opérationnelle', items: ['clients', 'offers', 'sessions'] },
      { title: 'Ressources', items: ['operators', 'modules', 'locations'] },
      { title: 'Configuration', items: ['settings'] }
    ];

    let html = `
      <div class="sidebar-brand">
        <svg width="38" height="38" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dst-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#e53935;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#ff6659;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#ab000d;stop-opacity:1" />
            </linearGradient>
            <filter id="dst-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#dst-grad)" stroke-width="3" filter="url(#dst-glow)"/>
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(229,57,53,0.3)" stroke-width="1"/>
          <text x="50" y="42" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="26" font-weight="900" fill="url(#dst-grad)" filter="url(#dst-glow)">DST</text>
          <line x1="22" y1="52" x2="78" y2="52" stroke="url(#dst-grad)" stroke-width="1.5" opacity="0.6"/>
          <text x="50" y="67" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="#a0a0a8" letter-spacing="3">SYSTEM</text>
          <line x1="50" y1="4" x2="50" y2="12" stroke="url(#dst-grad)" stroke-width="1.5" opacity="0.4"/>
          <line x1="50" y1="88" x2="50" y2="96" stroke="url(#dst-grad)" stroke-width="1.5" opacity="0.4"/>
          <line x1="4" y1="50" x2="12" y2="50" stroke="url(#dst-grad)" stroke-width="1.5" opacity="0.4"/>
          <line x1="88" y1="50" x2="96" y2="50" stroke="url(#dst-grad)" stroke-width="1.5" opacity="0.4"/>
        </svg>
        <div>
          <div class="brand-text">DST-SYSTEM</div>
          <div class="brand-sub">Drill &amp; Skills Training</div>
        </div>
      </div>
      <nav class="sidebar-nav">
    `;

    navSections.forEach(section => {
      html += `<div class="nav-section">${section.title}</div>`;
      section.items.forEach(key => {
        const route = routes[key];
        html += `
          <div class="nav-item" data-view="${key}">
            <span class="nav-icon">${route.icon}</span>
            <span>${route.label}</span>
          </div>
        `;
      });
    });

    html += `</nav>
      <div class="sidebar-footer">
        DST System &copy; ${new Date().getFullYear()}<br>
        <span class="text-muted">Outil de pilotage interne</span>
      </div>
    `;

    sidebar.innerHTML = html;

    // Attacher les événements de navigation
    sidebar.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        navigate(item.dataset.view);
      });
    });
  }

  /* --- Header --- */
  function renderHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    header.innerHTML = `
      <div class="header-title" id="header-title">Dashboard dirigeant</div>
      <div class="header-alerts">
        <span class="header-context" id="header-context"></span>
        <button class="header-alert-btn" id="alerts-toggle" title="Alertes stratégiques">
          ⚠ Alertes
          <span class="badge hidden" id="alerts-badge">0</span>
        </button>
      </div>
    `;

    // Panneau d'alertes
    const panel = document.createElement('div');
    panel.className = 'alerts-panel';
    panel.id = 'alerts-panel';
    document.body.appendChild(panel);

    // Toggle alertes
    document.getElementById('alerts-toggle').addEventListener('click', toggleAlertsPanel);

    // Fermer en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (alertsPanelOpen &&
          !e.target.closest('#alerts-panel') &&
          !e.target.closest('#alerts-toggle')) {
        closeAlertsPanel();
      }
    });

    updateHeaderContext();
    updateAlertsBadge();
  }

  function updateHeaderContext() {
    const ctx = document.getElementById('header-context');
    if (!ctx) return;
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    ctx.textContent = now.toLocaleDateString('fr-FR', opts);
  }

  /* --- Alertes --- */
  function updateAlertsBadge() {
    try {
      const alerts = Engine.computeAllAlerts();
      const badge = document.getElementById('alerts-badge');
      if (badge) {
        badge.textContent = alerts.length;
        badge.classList.toggle('hidden', alerts.length === 0);
      }
    } catch (e) {
      // Silencieux si le moteur n'est pas prêt
    }
  }

  function toggleAlertsPanel() {
    alertsPanelOpen = !alertsPanelOpen;
    const panel = document.getElementById('alerts-panel');
    if (panel) {
      panel.classList.toggle('open', alertsPanelOpen);
      if (alertsPanelOpen) {
        renderAlertsPanel();
      }
    }
  }

  function closeAlertsPanel() {
    alertsPanelOpen = false;
    const panel = document.getElementById('alerts-panel');
    if (panel) panel.classList.remove('open');
  }

  function renderAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    if (!panel) return;

    try {
      const alerts = Engine.computeAllAlerts();

      if (alerts.length === 0) {
        panel.innerHTML = `
          <div class="alert-item" style="justify-content:center; color: var(--color-success);">
            ✓ Aucune alerte active
          </div>
        `;
        return;
      }

      let html = '';
      alerts.forEach(alert => {
        const levelClass = alert.level === 'critical' ? 'level-critical' :
                           alert.level === 'warning' ? 'level-warning' : 'level-info';
        const icon = alert.level === 'critical' ? '⚠' :
                     alert.level === 'warning' ? '⚡' : 'ℹ';
        html += `
          <div class="alert-item ${levelClass}">
            <span>${icon}</span>
            <div>
              <div class="alert-type">${alert.context || alert.level}</div>
              <div>${alert.message}</div>
            </div>
          </div>
        `;
      });

      panel.innerHTML = html;
    } catch (e) {
      panel.innerHTML = `<div class="alert-item">Erreur chargement alertes</div>`;
    }
  }

  /* --- Utilitaire : rafraîchir la vue courante --- */
  function refresh() {
    navigate(currentView);
  }

  /* --- API publique --- */
  return {
    init,
    navigate,
    refresh,
    get currentView() { return currentView; }
  };
})();

/* --- Démarrage --- */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
