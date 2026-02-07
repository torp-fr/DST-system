/* ============================================================
   DST-SYSTEM — Vue Tableau de Bord (Dashboard)
   Poste de commandement stratégique pour le dirigeant.
   Synthèse économique, alertes, sessions, charge opérateurs.
   ============================================================ */

window.Views = window.Views || {};

Views.Dashboard = {

  /**
   * Rendu complet du tableau de bord exécutif.
   * @param {HTMLElement} container — élément DOM cible
   */
  render(container) {
    'use strict';

    const settings  = DB.settings.get();
    const kpis      = Engine.computeDashboardKPIs();
    const alerts    = Engine.computeAllAlerts();
    const sessions  = DB.sessions.getAll();
    const now       = new Date();

    /* ----------------------------------------------------------
       1. CONSTRUCTION DES CARTES KPI
       ---------------------------------------------------------- */

    /** Détermine la classe CSS de la marge en fonction des seuils */
    function marginClass(avgMargin) {
      if (avgMargin >= settings.targetMarginPercent) return 'kpi-success';
      if (avgMargin >= settings.marginAlertThreshold) return 'kpi-warning';
      return 'kpi-alert';
    }

    /** Détermine la classe CSS du résultat net */
    function netResultClass(val) {
      return val >= 0 ? 'kpi-success' : 'kpi-alert';
    }

    /** Détermine la classe CSS de la charge opérateur */
    function loadClass(maxLoad, threshold) {
      const ratio = threshold > 0 ? maxLoad / threshold : 0;
      if (ratio >= 1)   return 'kpi-alert';
      if (ratio >= 0.7) return 'kpi-warning';
      return '';
    }

    const kpiCardsHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Clients actifs</div>
          <div class="kpi-value">${kpis.activeClients}</div>
          <div class="kpi-detail">sur ${kpis.totalClients} au total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Sessions à venir</div>
          <div class="kpi-value">${kpis.upcomingSessions}</div>
          <div class="kpi-detail">${kpis.totalSessions} sessions au total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Sessions ce mois</div>
          <div class="kpi-value">${kpis.monthSessions}</div>
          <div class="kpi-detail">${kpis.activeOperators} opérateur(s) mobilisé(s)</div>
        </div>
        <div class="kpi-card ${marginClass(kpis.avgMargin)}">
          <div class="kpi-label">Marge moyenne</div>
          <div class="kpi-value">${Engine.fmtPercent(kpis.avgMargin)}</div>
          <div class="kpi-detail">Cible : ${Engine.fmtPercent(settings.targetMarginPercent)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CA réalisé</div>
          <div class="kpi-value text-mono">${Engine.fmt(kpis.totalRevenue)}</div>
          <div class="kpi-detail">${kpis.pastSessions} session(s) facturée(s)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CA prévisionnel</div>
          <div class="kpi-value text-mono">${Engine.fmt(kpis.forecastRevenue)}</div>
          <div class="kpi-detail">${kpis.upcomingSessions} session(s) planifiée(s)</div>
        </div>
        <div class="kpi-card ${netResultClass(kpis.netResult)}">
          <div class="kpi-label">Résultat net</div>
          <div class="kpi-value text-mono">${Engine.fmt(kpis.netResult)}</div>
          <div class="kpi-detail">Coûts totaux : ${Engine.fmt(kpis.totalCosts)}</div>
        </div>
        <div class="kpi-card ${loadClass(kpis.maxOperatorLoad, kpis.operatorLoadThreshold)}">
          <div class="kpi-label">Charge opérateur max</div>
          <div class="kpi-value">${kpis.maxOperatorLoad} <span style="font-size:0.9rem;font-weight:400;">sess/mois</span></div>
          <div class="kpi-detail">Seuil : ${kpis.operatorLoadThreshold} sessions/mois</div>
        </div>
      </div>
    `;

    /* ----------------------------------------------------------
       2. SECTION ALERTES INTELLIGENTES
       ---------------------------------------------------------- */

    function buildAlertsHTML() {
      if (alerts.length === 0) {
        return `
          <div class="card">
            <div class="card-header"><h2>Alertes intelligentes</h2></div>
            <div class="alert alert-success">
              <span class="alert-icon">&#10003;</span>
              <span>Aucune alerte — tous les indicateurs sont nominaux.</span>
            </div>
          </div>
        `;
      }

      /* Regrouper les alertes par contexte */
      const grouped = {};
      alerts.forEach(a => {
        const ctx = a.context || 'Général';
        if (!grouped[ctx]) grouped[ctx] = [];
        grouped[ctx].push(a);
      });

      /** Icône et classe selon le niveau d'alerte */
      function alertStyle(level) {
        switch (level) {
          case 'critical': return { cls: 'alert-danger',  icon: '\u26A0' };  // ⚠
          case 'warning':  return { cls: 'alert-warning', icon: '\u26A1' };  // ⚡
          case 'info':     return { cls: 'alert-info',    icon: '\u2139' };  // ℹ
          default:         return { cls: 'alert-info',    icon: '\u2139' };
        }
      }

      let alertsInner = '';
      Object.keys(grouped).forEach(ctx => {
        alertsInner += `<div class="mb-8" style="font-size:0.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">${escapeHTML(ctx)}</div>`;
        grouped[ctx].forEach(a => {
          const style = alertStyle(a.level);
          alertsInner += `
            <div class="alert ${style.cls}">
              <span class="alert-icon">${style.icon}</span>
              <span>${escapeHTML(a.message)}</span>
            </div>
          `;
        });
      });

      return `
        <div class="card">
          <div class="card-header">
            <h2>Alertes intelligentes</h2>
            <span class="tag tag-red">${alerts.length} alerte${alerts.length > 1 ? 's' : ''}</span>
          </div>
          ${alertsInner}
        </div>
      `;
    }

    /* ----------------------------------------------------------
       3. TABLEAU DES PROCHAINES SESSIONS
       ---------------------------------------------------------- */

    function buildUpcomingSessionsHTML() {
      /* Filtrer les sessions futures, trier par date, limiter à 10 */
      const upcoming = sessions
        .filter(s => new Date(s.date) >= now && s.status !== 'annulee')
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 10);

      if (upcoming.length === 0) {
        return `
          <div class="card">
            <div class="card-header"><h2>Prochaines sessions</h2></div>
            <div class="empty-state">
              <div class="empty-icon">&#128197;</div>
              <p>Aucune session à venir.</p>
            </div>
          </div>
        `;
      }

      /** Classe CSS pour le tag de statut */
      function statusTagClass(status) {
        switch (status) {
          case 'confirmee': return 'tag-green';
          case 'planifiee': return 'tag-blue';
          case 'en_cours':  return 'tag-yellow';
          case 'terminee':  return 'tag-neutral';
          case 'annulee':   return 'tag-red';
          default:          return 'tag-neutral';
        }
      }

      /** Formater la date en français court */
      function fmtDate(isoDate) {
        const d = new Date(isoDate);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }

      /** Récupérer les noms des clients liés à une session */
      function getClientNames(session) {
        const ids = session.clientIds || (session.clientId ? [session.clientId] : []);
        if (ids.length === 0) return '<span class="text-muted">—</span>';
        return ids.map(id => {
          const client = DB.clients.getById(id);
          return client ? escapeHTML(client.name || client.label || client.company || id) : escapeHTML(id);
        }).join(', ');
      }

      /** Récupérer le nom du lieu */
      function getLocationName(session) {
        if (!session.locationId) return '<span class="text-muted">—</span>';
        const loc = DB.locations.getById(session.locationId);
        return loc ? escapeHTML(loc.name || loc.label || session.locationId) : escapeHTML(session.locationId);
      }

      let rowsHTML = '';
      upcoming.forEach(sess => {
        const cost = Engine.computeSessionCost(sess);
        const marginDisplay = sess.price > 0
          ? `<span class="${cost.marginPercent < settings.marginAlertThreshold ? 'text-red' : cost.marginPercent < settings.targetMarginPercent ? 'text-yellow' : 'text-green'} font-bold">${Engine.fmtPercent(cost.marginPercent)}</span>`
          : '<span class="text-muted">—</span>';

        rowsHTML += `
          <tr>
            <td class="text-mono">${fmtDate(sess.date)}</td>
            <td>${escapeHTML(sess.label || sess.name || '—')}</td>
            <td>${getClientNames(sess)}</td>
            <td>${getLocationName(sess)}</td>
            <td><span class="tag ${statusTagClass(sess.status)}">${Engine.sessionStatusLabel(sess.status)}</span></td>
            <td class="num">${marginDisplay}</td>
          </tr>
        `;
      });

      return `
        <div class="card">
          <div class="card-header">
            <h2>Prochaines sessions</h2>
            <span class="text-muted" style="font-size:0.82rem;">${upcoming.length} session${upcoming.length > 1 ? 's' : ''} affichée${upcoming.length > 1 ? 's' : ''}</span>
          </div>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Client(s)</th>
                  <th>Lieu</th>
                  <th>Statut</th>
                  <th class="text-right">Marge %</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    /* ----------------------------------------------------------
       4. SYNTHÈSE ÉCONOMIQUE
       ---------------------------------------------------------- */

    function buildEconomicSummaryHTML() {
      /* Calcul des coûts fixes annuels totaux */
      const totalFixedAnnual = settings.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);

      /* Calcul des amortissements annuels totaux */
      const totalAmortAnnual = settings.equipmentAmortization.reduce((sum, a) => {
        const years = Math.max(a.durationYears || 1, 1);
        return sum + ((a.amount || 0) / years);
      }, 0);

      /* Quote-part par session */
      const estSessions = Math.max(settings.estimatedAnnualSessions, 1);
      const fixedPerSession = totalFixedAnnual / estSessions;
      const amortPerSession = totalAmortAnnual / estSessions;
      const costPerSession  = Engine.round2(fixedPerSession + amortPerSession);

      /* Comparaison visuelle marge cible vs marge réelle */
      const targetMargin = settings.targetMarginPercent;
      const actualMargin = kpis.avgMargin;
      const maxMarginScale = Math.max(targetMargin, actualMargin, 1);

      const targetBarWidth = Math.min((targetMargin / maxMarginScale) * 100, 100);
      const actualBarWidth = Math.min((actualMargin / maxMarginScale) * 100, 100);
      const actualBarColor = actualMargin >= targetMargin ? 'fill-green' : actualMargin >= settings.marginAlertThreshold ? 'fill-yellow' : 'fill-red';

      return `
        <div class="card">
          <div class="card-header"><h2>Synthèse économique</h2></div>

          <div class="grid-2 mb-16">
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Charges fixes / an</div>
              <div class="text-mono font-bold" style="font-size:1.2rem;">${Engine.fmt(totalFixedAnnual)}</div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Amortissements / an</div>
              <div class="text-mono font-bold" style="font-size:1.2rem;">${Engine.fmt(Engine.round2(totalAmortAnnual))}</div>
            </div>
          </div>

          <div class="mb-16">
            <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Coût fixe par session (quote-part)</div>
            <div class="text-mono font-bold" style="font-size:1.2rem;">${Engine.fmt(costPerSession)}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">
              Basé sur ${estSessions} sessions estimées/an (fixes : ${Engine.fmt(Engine.round2(fixedPerSession))} + amort. : ${Engine.fmt(Engine.round2(amortPerSession))})
            </div>
          </div>

          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Marge cible vs marge réelle</div>

            <div class="flex-between mb-8">
              <span style="font-size:0.82rem;">Cible</span>
              <span class="text-mono font-bold">${Engine.fmtPercent(targetMargin)}</span>
            </div>
            <div class="progress-bar mb-16" style="height:10px;">
              <div class="progress-fill fill-blue" style="width:${targetBarWidth}%;"></div>
            </div>

            <div class="flex-between mb-8">
              <span style="font-size:0.82rem;">Réelle</span>
              <span class="text-mono font-bold ${actualMargin >= targetMargin ? 'text-green' : actualMargin >= settings.marginAlertThreshold ? 'text-yellow' : 'text-red'}">${Engine.fmtPercent(actualMargin)}</span>
            </div>
            <div class="progress-bar" style="height:10px;">
              <div class="progress-fill ${actualBarColor}" style="width:${actualBarWidth}%;"></div>
            </div>

            ${actualMargin < targetMargin
              ? `<div style="font-size:0.78rem;color:var(--color-warning);margin-top:8px;">Écart : ${Engine.fmtPercent(Engine.round2(targetMargin - actualMargin))} sous la cible</div>`
              : `<div style="font-size:0.78rem;color:var(--color-success);margin-top:8px;">Marge supérieure à la cible de ${Engine.fmtPercent(Engine.round2(actualMargin - targetMargin))}</div>`
            }
          </div>
        </div>
      `;
    }

    /* ----------------------------------------------------------
       5. CHARGE OPÉRATEURS
       ---------------------------------------------------------- */

    function buildOperatorLoadHTML() {
      const operators  = DB.operators.getAll();
      const threshold  = settings.operatorOverloadThreshold;
      const currentMonth = now.getMonth();
      const currentYear  = now.getFullYear();

      /* Compter les sessions par opérateur ce mois-ci */
      const opSessionCount = {};
      sessions.forEach(sess => {
        if (sess.status === 'annulee') return;
        const d = new Date(sess.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          (sess.operatorIds || []).forEach(opId => {
            opSessionCount[opId] = (opSessionCount[opId] || 0) + 1;
          });
        }
      });

      /* Trier par charge décroissante, top 5 */
      const ranked = Object.entries(opSessionCount)
        .map(([opId, count]) => {
          const op = DB.operators.getById(opId);
          return {
            id: opId,
            name: op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : opId,
            count
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      if (ranked.length === 0) {
        return `
          <div class="card">
            <div class="card-header"><h2>Charge opérateurs — ce mois</h2></div>
            <div class="empty-state">
              <div class="empty-icon">&#128100;</div>
              <p>Aucun opérateur planifié ce mois-ci.</p>
            </div>
          </div>
        `;
      }

      /** Couleur de la barre selon le ratio charge/seuil */
      function barColor(count) {
        if (threshold <= 0) return 'fill-green';
        const ratio = count / threshold;
        if (ratio >= 1)   return 'fill-red';
        if (ratio >= 0.7) return 'fill-yellow';
        return 'fill-green';
      }

      let barsHTML = '';
      ranked.forEach(op => {
        const percent = threshold > 0 ? Math.min((op.count / threshold) * 100, 100) : 100;
        const colorClass = barColor(op.count);

        barsHTML += `
          <div class="mb-16">
            <div class="flex-between mb-8">
              <span style="font-size:0.88rem;">${escapeHTML(op.name)}</span>
              <span class="text-mono font-bold">${op.count} / ${threshold}</span>
            </div>
            <div class="progress-bar" style="height:10px;">
              <div class="progress-fill ${colorClass}" style="width:${percent}%;"></div>
            </div>
          </div>
        `;
      });

      return `
        <div class="card">
          <div class="card-header">
            <h2>Charge opérateurs — ce mois</h2>
            <span class="text-muted" style="font-size:0.82rem;">Top 5 — seuil : ${threshold} sess/mois</span>
          </div>
          ${barsHTML}
        </div>
      `;
    }

    /* ----------------------------------------------------------
       6. UTILITAIRE — Échappement HTML
       ---------------------------------------------------------- */

    function escapeHTML(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /* ----------------------------------------------------------
       7. ASSEMBLAGE FINAL
       ---------------------------------------------------------- */

    const today = now.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <span class="text-muted" style="font-size:0.82rem;">${escapeHTML(today)} — Poste de commandement stratégique</span>
        </div>
      </div>

      <!-- Indicateurs clés -->
      ${kpiCardsHTML}

      <!-- Alertes intelligentes -->
      ${buildAlertsHTML()}

      <!-- Prochaines sessions + Synthèse économique -->
      <div class="grid-2">
        <div>
          ${buildUpcomingSessionsHTML()}
        </div>
        <div>
          ${buildEconomicSummaryHTML()}
          ${buildOperatorLoadHTML()}
        </div>
      </div>
    `;
  }
};
