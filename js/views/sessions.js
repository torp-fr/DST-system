/* ============================================================
   DST-SYSTEM — Vue Sessions
   Module le plus central : relie clients, offres, modules,
   opérateurs et lieux. CRUD complet, calcul de coûts en temps
   réel, alertes, compatibilité, consommation abonnement.
   ============================================================ */

window.Views = window.Views || {};

Views.Sessions = {

  /* ==========================================================
     Point d'entrée — rendu dans le conteneur fourni
     ========================================================== */
  render(container) {
    'use strict';

    // --- État local ---
    let searchTerm = '';
    let filterStatus = 'all';

    // --- Données référentielles (rechargées à chaque rendu) ---
    const allClients   = () => DB.clients.getAll();
    const allOperators = () => DB.operators.getAll();
    const allModules   = () => DB.modules.getAll();
    const allLocations = () => DB.locations.getAll();
    const allOffers    = () => DB.offers.getAll();
    const allSessions  = () => DB.sessions.getAll();

    /* --------------------------------------------------------
       Helpers de lookup (résolution id → entité)
       -------------------------------------------------------- */
    function clientName(id) {
      const c = DB.clients.getById(id);
      return c ? (c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim()) : '—';
    }

    function operatorName(id) {
      const o = DB.operators.getById(id);
      return o ? `${o.firstName || ''} ${o.lastName || ''}`.trim() : '—';
    }

    function moduleName(id) {
      const m = DB.modules.getById(id);
      return m ? m.name : '—';
    }

    function locationName(id) {
      const l = DB.locations.getById(id);
      return l ? l.name : '—';
    }

    function offerLabel(id) {
      const o = DB.offers.getById(id);
      if (!o) return '—';
      return o.label || o.name || Engine.offerTypeLabel(o.type);
    }

    /* --------------------------------------------------------
       Correspondance statut → classe tag CSS
       -------------------------------------------------------- */
    function statusTagClass(status) {
      const map = {
        planifiee: 'tag-blue',
        confirmee: 'tag-green',
        en_cours:  'tag-yellow',
        terminee:  'tag-neutral',
        annulee:   'tag-red'
      };
      return map[status] || 'tag-neutral';
    }

    /* --------------------------------------------------------
       Classe CSS pour le niveau d'alerte Engine
       -------------------------------------------------------- */
    function alertCssClass(level) {
      if (level === 'critical') return 'alert-danger';
      if (level === 'warning')  return 'alert-warning';
      return 'alert-info';
    }

    function alertIcon(level) {
      if (level === 'critical') return '!!';
      if (level === 'warning')  return '!';
      return 'i';
    }

    /* --------------------------------------------------------
       Formater une date ISO en JJ/MM/AAAA
       -------------------------------------------------------- */
    function fmtDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return iso;
      return d.toLocaleDateString('fr-FR');
    }

    /* --------------------------------------------------------
       Raccourci liste tronquée (3 éléments max)
       -------------------------------------------------------- */
    function truncList(arr, mapFn, max) {
      max = max || 3;
      if (!arr || arr.length === 0) return '—';
      const mapped = arr.map(mapFn);
      if (mapped.length <= max) return mapped.join(', ');
      return mapped.slice(0, max).join(', ') + ` (+${mapped.length - max})`;
    }

    /* ==========================================================
       Rendu principal — en-tête + table ou état vide
       ========================================================== */
    function renderMain() {
      const sessions = allSessions();

      // Filtrage par statut
      let filtered = sessions;
      if (filterStatus !== 'all') {
        filtered = filtered.filter(s => s.status === filterStatus);
      }

      // Filtrage par recherche texte
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        filtered = filtered.filter(s => {
          const label = (s.label || '').toLowerCase();
          const clientNames = (s.clientIds || []).map(id => clientName(id).toLowerCase()).join(' ');
          const modNames = (s.moduleIds || []).map(id => moduleName(id).toLowerCase()).join(' ');
          const loc = locationName(s.locationId).toLowerCase();
          return label.includes(q) || clientNames.includes(q) || modNames.includes(q) || loc.includes(q);
        });
      }

      // Tri par date décroissante
      filtered.sort((a, b) => {
        const da = a.date ? new Date(a.date) : new Date(0);
        const db = b.date ? new Date(b.date) : new Date(0);
        return db - da;
      });

      // Compteurs par statut pour les onglets
      const countByStatus = {};
      sessions.forEach(s => {
        countByStatus[s.status] = (countByStatus[s.status] || 0) + 1;
      });

      container.innerHTML = `
        <!-- En-tête de page -->
        <div class="page-header">
          <h1>Sessions</h1>
          <div class="actions">
            <div class="search-bar">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="sess-search" class="form-control"
                     placeholder="Rechercher..." value="${searchTerm}">
            </div>
            <button class="btn btn-primary" id="btn-new-session">+ Nouvelle session</button>
          </div>
        </div>

        <!-- Onglets de filtre par statut -->
        <div class="tabs" id="sess-status-tabs">
          <button class="tab-btn ${filterStatus === 'all' ? 'active' : ''}" data-status="all">
            Toutes (${sessions.length})
          </button>
          <button class="tab-btn ${filterStatus === 'planifiee' ? 'active' : ''}" data-status="planifiee">
            Planifiées (${countByStatus.planifiee || 0})
          </button>
          <button class="tab-btn ${filterStatus === 'confirmee' ? 'active' : ''}" data-status="confirmee">
            Confirmées (${countByStatus.confirmee || 0})
          </button>
          <button class="tab-btn ${filterStatus === 'en_cours' ? 'active' : ''}" data-status="en_cours">
            En cours (${countByStatus.en_cours || 0})
          </button>
          <button class="tab-btn ${filterStatus === 'terminee' ? 'active' : ''}" data-status="terminee">
            Terminées (${countByStatus.terminee || 0})
          </button>
          <button class="tab-btn ${filterStatus === 'annulee' ? 'active' : ''}" data-status="annulee">
            Annulées (${countByStatus.annulee || 0})
          </button>
        </div>

        ${filtered.length === 0 ? renderEmptyState() : renderTable(filtered)}
      `;

      attachMainListeners(filtered);
    }

    /* ==========================================================
       Rendu de l'état vide
       ========================================================== */
    function renderEmptyState() {
      return `
        <div class="empty-state">
          <div class="empty-icon">&#128197;</div>
          <p>Aucune session ${filterStatus !== 'all' ? 'avec ce statut' : 'enregistrée'}.</p>
          <button class="btn btn-primary" id="btn-empty-new">+ Créer une session</button>
        </div>
      `;
    }

    /* ==========================================================
       Rendu de la table des sessions
       ========================================================== */
    function renderTable(sessions) {
      const rows = sessions.map(s => {
        const cost = Engine.computeSessionCost(s);
        const marginClass = cost.belowFloor ? 'text-red'
          : cost.marginPercent < (DB.settings.get().marginAlertThreshold || 15) ? 'text-yellow'
          : 'text-green';

        return `
          <tr data-id="${s.id}">
            <td>${fmtDate(s.date)}${s.time ? '<br><span class="text-muted" style="font-size:.75rem">' + s.time + '</span>' : ''}</td>
            <td><strong>${s.label || '—'}</strong></td>
            <td>${truncList(s.clientIds, clientName)}</td>
            <td>${truncList(s.moduleIds, moduleName, 2)}</td>
            <td>${truncList(s.operatorIds, operatorName, 2)}</td>
            <td>${locationName(s.locationId)}</td>
            <td class="num">${s.price ? Engine.fmt(s.price) : '—'}</td>
            <td class="num ${marginClass}">${s.price ? Engine.fmtPercent(cost.marginPercent) : '—'}</td>
            <td><span class="tag ${statusTagClass(s.status)}">${Engine.sessionStatusLabel(s.status)}</span></td>
            <td class="actions-cell">
              <button class="btn btn-sm btn-edit" data-id="${s.id}" title="Modifier">&#9998;</button>
              <button class="btn btn-sm btn-delete" data-id="${s.id}" title="Supprimer">&#128465;</button>
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div class="card">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Client(s)</th>
                  <th>Modules</th>
                  <th>Opérateurs</th>
                  <th>Lieu</th>
                  <th class="text-right">Prix</th>
                  <th class="text-right">Marge %</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    /* ==========================================================
       Écouteurs de la vue principale
       ========================================================== */
    function attachMainListeners(filteredSessions) {
      // Recherche
      const searchInput = container.querySelector('#sess-search');
      if (searchInput) {
        searchInput.addEventListener('input', e => {
          searchTerm = e.target.value;
          renderMain();
        });
      }

      // Onglets statut
      const tabs = container.querySelectorAll('#sess-status-tabs .tab-btn');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          filterStatus = tab.dataset.status;
          renderMain();
        });
      });

      // Bouton nouvelle session (en-tête et état vide)
      const btnNew = container.querySelector('#btn-new-session');
      if (btnNew) btnNew.addEventListener('click', () => openModal(null));

      const btnEmptyNew = container.querySelector('#btn-empty-new');
      if (btnEmptyNew) btnEmptyNew.addEventListener('click', () => openModal(null));

      // Boutons modifier
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const session = DB.sessions.getById(id);
          if (session) openModal(session);
        });
      });

      // Boutons supprimer
      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const session = DB.sessions.getById(id);
          if (session) openDeleteConfirm(session);
        });
      });
    }

    /* ==========================================================
       Modal de confirmation de suppression
       ========================================================== */
    function openDeleteConfirm(session) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:480px">
          <div class="modal-header">
            <h2>Supprimer la session</h2>
            <button class="btn btn-sm btn-close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p>Confirmez-vous la suppression de la session
               <strong>${session.label || '(sans libellé)'}</strong>
               du ${fmtDate(session.date)} ?</p>
            <p class="text-muted" style="margin-top:8px;font-size:.82rem">
              Cette action est irréversible.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel-del">Annuler</button>
            <button class="btn btn-primary btn-confirm-del">Supprimer</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Fermeture
      const close = () => { overlay.remove(); };
      overlay.querySelector('.btn-close-modal').addEventListener('click', close);
      overlay.querySelector('.btn-cancel-del').addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

      // Confirmation
      overlay.querySelector('.btn-confirm-del').addEventListener('click', () => {
        DB.sessions.delete(session.id);
        close();
        renderMain();
      });
    }

    /* ==========================================================
       Vérifications de compatibilité
       ========================================================== */

    /**
     * Vérifie les incompatibilités entre modules sélectionnés.
     * Retourne un tableau de messages d'avertissement.
     */
    function checkModuleIncompatibilities(moduleIds) {
      const warnings = [];
      if (!moduleIds || moduleIds.length < 2) return warnings;
      const mods = moduleIds.map(id => DB.modules.getById(id)).filter(Boolean);
      for (let i = 0; i < mods.length; i++) {
        for (let j = i + 1; j < mods.length; j++) {
          const a = mods[i];
          const b = mods[j];
          // Vérifier si a déclare b incompatible
          if (a.incompatibilities && a.incompatibilities.includes(b.id)) {
            warnings.push(`"${a.name}" et "${b.name}" sont déclarés incompatibles.`);
          }
          // Vérifier si b déclare a incompatible
          if (b.incompatibilities && b.incompatibilities.includes(a.id)) {
            if (!warnings.some(w => w.includes(a.name) && w.includes(b.name))) {
              warnings.push(`"${b.name}" et "${a.name}" sont déclarés incompatibles.`);
            }
          }
        }
      }
      return warnings;
    }

    /**
     * Vérifie si les modules sélectionnés sont compatibles avec le lieu choisi.
     * Retourne un tableau de messages d'avertissement.
     */
    function checkLocationCompatibility(locationId, moduleIds) {
      const warnings = [];
      if (!locationId || !moduleIds || moduleIds.length === 0) return warnings;
      const loc = DB.locations.getById(locationId);
      if (!loc || !loc.compatibleModuleIds) return warnings;
      moduleIds.forEach(modId => {
        if (!loc.compatibleModuleIds.includes(modId)) {
          const mod = DB.modules.getById(modId);
          warnings.push(
            `Le module "${mod ? mod.name : modId}" n'est pas compatible avec le lieu "${loc.name}".`
          );
        }
      });
      return warnings;
    }

    /* ==========================================================
       Informations abonnement (si offre de type abonnement)
       ========================================================== */
    function renderSubscriptionInfo(offerId) {
      if (!offerId) return '';
      const offer = DB.offers.getById(offerId);
      if (!offer || offer.type !== 'abonnement') return '';

      const total  = offer.nbSessions || 0;
      const used   = offer.sessionsConsumed || 0;
      const remain = Math.max(total - used, 0);
      const pct    = total > 0 ? Math.round((used / total) * 100) : 0;

      let fillClass = 'fill-green';
      if (pct >= 90) fillClass = 'fill-red';
      else if (pct >= 70) fillClass = 'fill-yellow';

      return `
        <div class="card" style="margin-top:12px;padding:14px">
          <div class="card-header" style="margin-bottom:8px">
            <h3>Consommation abonnement</h3>
          </div>
          <p style="font-size:.85rem;margin-bottom:8px">
            Offre : <strong>${offer.label || offer.name || Engine.offerTypeLabel(offer.type)}</strong>
          </p>
          <div class="flex-between mb-8" style="font-size:.82rem">
            <span>${used} / ${total} sessions consommées</span>
            <span class="${remain <= 2 ? 'text-red' : ''}">${remain} restante(s)</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${fillClass}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          ${remain === 0 ? '<p class="text-red" style="margin-top:6px;font-size:.8rem">Toutes les sessions de cet abonnement ont été consommées.</p>' : ''}
        </div>
      `;
    }

    /* ==========================================================
       Panneau de ventilation des coûts (temps réel)
       ========================================================== */
    function renderCostBreakdown(sessionData) {
      const cost = Engine.computeSessionCost(sessionData);

      // Alertes
      let alertsHtml = '';
      if (cost.alerts.length > 0) {
        alertsHtml = cost.alerts.map(a => `
          <div class="alert ${alertCssClass(a.level)}">
            <span class="alert-icon">${alertIcon(a.level)}</span>
            <span>${a.message}</span>
          </div>
        `).join('');
      }

      return `
        <div class="card" id="cost-breakdown-panel" style="margin-top:12px;padding:14px">
          <div class="card-header" style="margin-bottom:10px">
            <h3>Ventilation des coûts</h3>
          </div>

          ${alertsHtml}

          <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
            <div class="kpi-card" style="padding:12px">
              <span class="kpi-label">Opérateurs</span>
              <span class="kpi-value" style="font-size:1.1rem">${Engine.fmt(cost.operatorsCost)}</span>
            </div>
            <div class="kpi-card" style="padding:12px">
              <span class="kpi-label">Modules</span>
              <span class="kpi-value" style="font-size:1.1rem">${Engine.fmt(cost.modulesCost)}</span>
            </div>
            <div class="kpi-card" style="padding:12px">
              <span class="kpi-label">Coûts variables</span>
              <span class="kpi-value" style="font-size:1.1rem">${Engine.fmt(cost.variableCosts)}</span>
            </div>
            <div class="kpi-card" style="padding:12px">
              <span class="kpi-label">Quote-part fixe</span>
              <span class="kpi-value" style="font-size:1.1rem">${Engine.fmt(cost.fixedCostShare)}</span>
            </div>
            <div class="kpi-card" style="padding:12px">
              <span class="kpi-label">Amortissements</span>
              <span class="kpi-value" style="font-size:1.1rem">${Engine.fmt(cost.amortizationShare)}</span>
            </div>
          </div>

          <table style="width:100%;font-size:.85rem;border-collapse:collapse">
            <tr style="border-top:1px solid var(--border-color)">
              <td style="padding:6px 0;font-weight:600">Coût total</td>
              <td class="text-right text-mono" style="padding:6px 0">${Engine.fmt(cost.totalCost)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:600">Prix facturé</td>
              <td class="text-right text-mono" style="padding:6px 0">${Engine.fmt(cost.revenue)}</td>
            </tr>
            <tr style="border-top:1px solid var(--border-color)">
              <td style="padding:6px 0;font-weight:700">Marge</td>
              <td class="text-right text-mono ${cost.margin >= 0 ? 'text-green' : 'text-red'}" style="padding:6px 0">
                ${Engine.fmt(cost.margin)} (${Engine.fmtPercent(cost.marginPercent)})
              </td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:var(--text-muted)">Prix plancher</td>
              <td class="text-right text-mono" style="padding:6px 0;color:var(--text-muted)">
                ${Engine.fmt(cost.floorPrice)}
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    /* ==========================================================
       Sous-formulaire des coûts variables (ajout / suppression)
       ========================================================== */
    function renderVariableCostsSubform(variableCosts) {
      const lines = (variableCosts || []).map((vc, i) => `
        <div class="form-row" style="grid-template-columns:1fr 120px 40px;align-items:end;margin-bottom:6px" data-vc-idx="${i}">
          <div class="form-group" style="margin-bottom:0">
            ${i === 0 ? '<label>Libellé</label>' : ''}
            <input type="text" class="form-control vc-label" value="${vc.label || ''}" placeholder="Ex: Transport">
          </div>
          <div class="form-group" style="margin-bottom:0">
            ${i === 0 ? '<label>Montant</label>' : ''}
            <input type="number" class="form-control vc-amount" value="${vc.amount || 0}" min="0" step="any">
          </div>
          <div style="padding-bottom:2px">
            <button type="button" class="btn btn-sm vc-remove" data-idx="${i}" title="Retirer">&times;</button>
          </div>
        </div>
      `).join('');

      return `
        <div id="variable-costs-section">
          <label style="display:block;font-size:.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">
            Coûts variables
          </label>
          ${lines}
          <button type="button" class="btn btn-sm" id="btn-add-vc" style="margin-top:4px">+ Ajouter un coût</button>
        </div>
      `;
    }

    /* ==========================================================
       Rendu multi-select sous forme de checkboxes
       ========================================================== */
    function renderCheckboxGroup(name, options, selectedIds) {
      if (!options || options.length === 0) {
        return '<p class="text-muted" style="font-size:.82rem">Aucun élément disponible.</p>';
      }
      const sel = selectedIds || [];
      return `
        <div class="checkbox-group" style="max-height:160px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;background:var(--bg-input)">
          ${options.map(o => `
            <label class="form-check" style="margin-bottom:4px">
              <input type="checkbox" name="${name}" value="${o.id}" ${sel.includes(o.id) ? 'checked' : ''}>
              <span style="font-size:.85rem">${o.displayName}</span>
            </label>
          `).join('')}
        </div>
      `;
    }

    /* ==========================================================
       Modal de création / édition
       ========================================================== */
    function openModal(session) {
      const isEdit = !!session;
      const data = session ? { ...session } : {
        label: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        clientIds: [],
        offerId: '',
        moduleIds: [],
        operatorIds: [],
        locationId: '',
        price: 0,
        status: 'planifiee',
        variableCosts: [],
        recurrence: null,
        notes: ''
      };

      // Préparer les options pour les groupes de checkboxes
      const clientOpts = allClients().map(c => ({
        id: c.id,
        displayName: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.id
      }));

      const moduleOpts = allModules().map(m => ({
        id: m.id,
        displayName: m.name || m.id
      }));

      const operatorOpts = allOperators().map(o => ({
        id: o.id,
        displayName: `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.id
      }));

      const locations = allLocations();
      const offers    = allOffers();

      // Construire le HTML de la modale
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      function buildModalContent() {
        // Alertes de compatibilité
        const modWarnings = checkModuleIncompatibilities(data.moduleIds);
        const locWarnings = checkLocationCompatibility(data.locationId, data.moduleIds);
        const compatAlerts = [...modWarnings, ...locWarnings];
        const compatHtml = compatAlerts.length > 0
          ? compatAlerts.map(w => `
              <div class="alert alert-warning">
                <span class="alert-icon">!</span>
                <span>${w}</span>
              </div>
            `).join('')
          : '';

        return `
          <div class="modal modal-lg">
            <div class="modal-header">
              <h2>${isEdit ? 'Modifier la session' : 'Nouvelle session'}</h2>
              <button class="btn btn-sm btn-close-modal">&times;</button>
            </div>
            <div class="modal-body">

              ${compatHtml}

              <div class="grid-2">
                <!-- Colonne gauche : formulaire -->
                <div>
                  <!-- Libellé -->
                  <div class="form-group">
                    <label for="sess-label">Libellé</label>
                    <input type="text" id="sess-label" class="form-control"
                           value="${data.label || ''}" placeholder="Ex: Session CQP Sécurité">
                  </div>

                  <!-- Date / Heure -->
                  <div class="form-row" style="grid-template-columns:1fr 1fr">
                    <div class="form-group">
                      <label for="sess-date">Date</label>
                      <input type="date" id="sess-date" class="form-control" value="${data.date || ''}">
                    </div>
                    <div class="form-group">
                      <label for="sess-time">Heure</label>
                      <input type="time" id="sess-time" class="form-control" value="${data.time || ''}">
                    </div>
                  </div>

                  <!-- Statut / Récurrence -->
                  <div class="form-row" style="grid-template-columns:1fr 1fr">
                    <div class="form-group">
                      <label for="sess-status">Statut</label>
                      <select id="sess-status" class="form-control">
                        <option value="planifiee"  ${data.status === 'planifiee'  ? 'selected' : ''}>Planifiée</option>
                        <option value="confirmee"  ${data.status === 'confirmee'  ? 'selected' : ''}>Confirmée</option>
                        <option value="en_cours"   ${data.status === 'en_cours'   ? 'selected' : ''}>En cours</option>
                        <option value="terminee"   ${data.status === 'terminee'   ? 'selected' : ''}>Terminée</option>
                        <option value="annulee"    ${data.status === 'annulee'    ? 'selected' : ''}>Annulée</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="sess-recurrence">Récurrence</label>
                      <select id="sess-recurrence" class="form-control">
                        <option value=""            ${!data.recurrence               ? 'selected' : ''}>Aucune</option>
                        <option value="hebdomadaire" ${data.recurrence === 'hebdomadaire' ? 'selected' : ''}>Hebdomadaire</option>
                        <option value="mensuel"      ${data.recurrence === 'mensuel'      ? 'selected' : ''}>Mensuel</option>
                      </select>
                    </div>
                  </div>

                  <!-- Prix -->
                  <div class="form-group">
                    <label for="sess-price">Prix facturé (EUR)</label>
                    <input type="number" id="sess-price" class="form-control"
                           value="${data.price || 0}" min="0" step="any">
                  </div>

                  <!-- Lieu -->
                  <div class="form-group">
                    <label for="sess-location">Lieu</label>
                    <select id="sess-location" class="form-control">
                      <option value="">— Aucun —</option>
                      ${locations.map(l => `
                        <option value="${l.id}" ${data.locationId === l.id ? 'selected' : ''}>${l.name}</option>
                      `).join('')}
                    </select>
                  </div>

                  <!-- Offre liée -->
                  <div class="form-group">
                    <label for="sess-offer">Offre liée (optionnel)</label>
                    <select id="sess-offer" class="form-control">
                      <option value="">— Aucune —</option>
                      ${offers.map(o => `
                        <option value="${o.id}" ${data.offerId === o.id ? 'selected' : ''}>
                          ${o.label || o.name || Engine.offerTypeLabel(o.type)}${o.type === 'abonnement' ? ' [Abo]' : ''}
                        </option>
                      `).join('')}
                    </select>
                  </div>

                  <!-- Clients (multi-select) -->
                  <div class="form-group">
                    <label>Client(s)</label>
                    ${renderCheckboxGroup('clientIds', clientOpts, data.clientIds)}
                  </div>

                  <!-- Modules (multi-select) -->
                  <div class="form-group">
                    <label>Module(s)</label>
                    ${renderCheckboxGroup('moduleIds', moduleOpts, data.moduleIds)}
                  </div>

                  <!-- Opérateurs (multi-select) -->
                  <div class="form-group">
                    <label>Opérateur(s)</label>
                    ${renderCheckboxGroup('operatorIds', operatorOpts, data.operatorIds)}
                  </div>

                  <!-- Coûts variables -->
                  ${renderVariableCostsSubform(data.variableCosts)}

                  <!-- Notes -->
                  <div class="form-group" style="margin-top:12px">
                    <label for="sess-notes">Notes</label>
                    <textarea id="sess-notes" class="form-control" rows="3"
                              placeholder="Remarques, consignes particulières...">${data.notes || ''}</textarea>
                  </div>
                </div>

                <!-- Colonne droite : ventilation coûts + abonnement -->
                <div>
                  ${renderCostBreakdown(data)}
                  ${renderSubscriptionInfo(data.offerId)}
                </div>
              </div>

            </div>
            <div class="modal-footer">
              <button class="btn btn-cancel">Annuler</button>
              <button class="btn btn-primary btn-save">
                ${isEdit ? 'Enregistrer' : 'Créer la session'}
              </button>
            </div>
          </div>
        `;
      }

      overlay.innerHTML = buildModalContent();
      document.body.appendChild(overlay);

      /* ---- Collecte des valeurs courantes du formulaire ---- */
      function gatherFormData() {
        const form = overlay;
        data.label  = (form.querySelector('#sess-label')  || {}).value || '';
        data.date   = (form.querySelector('#sess-date')   || {}).value || '';
        data.time   = (form.querySelector('#sess-time')   || {}).value || '';
        data.status = (form.querySelector('#sess-status') || {}).value || 'planifiee';
        data.price  = parseFloat((form.querySelector('#sess-price') || {}).value) || 0;
        data.locationId  = (form.querySelector('#sess-location')   || {}).value || '';
        data.offerId     = (form.querySelector('#sess-offer')      || {}).value || '';
        data.notes       = (form.querySelector('#sess-notes')      || {}).value || '';

        const recVal = (form.querySelector('#sess-recurrence') || {}).value;
        data.recurrence = recVal || null;

        // Checkboxes multi-select
        data.clientIds = Array.from(form.querySelectorAll('input[name="clientIds"]:checked')).map(cb => cb.value);
        data.moduleIds = Array.from(form.querySelectorAll('input[name="moduleIds"]:checked')).map(cb => cb.value);
        data.operatorIds = Array.from(form.querySelectorAll('input[name="operatorIds"]:checked')).map(cb => cb.value);

        // Coûts variables
        data.variableCosts = [];
        form.querySelectorAll('[data-vc-idx]').forEach(row => {
          const lbl = (row.querySelector('.vc-label') || {}).value || '';
          const amt = parseFloat((row.querySelector('.vc-amount') || {}).value) || 0;
          data.variableCosts.push({ label: lbl, amount: amt });
        });

        return data;
      }

      /* ---- Rafraîchir le panneau de coûts et la compatibilité ---- */
      function refreshRightPanel() {
        gatherFormData();
        // Re-rendre entièrement la modale pour refléter les changements
        overlay.innerHTML = buildModalContent();
        attachModalListeners();
      }

      /* ---- Écouteurs internes de la modale ---- */
      function attachModalListeners() {
        const form = overlay;

        // Fermeture
        const closeModal = () => { overlay.remove(); };
        form.querySelector('.btn-close-modal').addEventListener('click', closeModal);
        form.querySelector('.btn-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

        // Champs qui déclenchent un recalcul des coûts
        const recalcFields = [
          '#sess-price', '#sess-location', '#sess-offer'
        ];
        recalcFields.forEach(sel => {
          const el = form.querySelector(sel);
          if (el) el.addEventListener('change', refreshRightPanel);
        });

        // Checkboxes modules, opérateurs, clients → recalcul
        form.querySelectorAll('input[name="moduleIds"], input[name="operatorIds"], input[name="clientIds"]').forEach(cb => {
          cb.addEventListener('change', refreshRightPanel);
        });

        // Coûts variables — montants → recalcul
        form.querySelectorAll('.vc-amount').forEach(input => {
          input.addEventListener('change', refreshRightPanel);
        });

        // Retirer un coût variable
        form.querySelectorAll('.vc-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            gatherFormData();
            const idx = parseInt(btn.dataset.idx, 10);
            data.variableCosts.splice(idx, 1);
            overlay.innerHTML = buildModalContent();
            attachModalListeners();
          });
        });

        // Ajouter un coût variable
        const btnAddVc = form.querySelector('#btn-add-vc');
        if (btnAddVc) {
          btnAddVc.addEventListener('click', () => {
            gatherFormData();
            data.variableCosts.push({ label: '', amount: 0 });
            overlay.innerHTML = buildModalContent();
            attachModalListeners();
          });
        }

        // --- Sauvegarde ---
        form.querySelector('.btn-save').addEventListener('click', () => {
          gatherFormData();

          // Validation minimale
          if (!data.date) {
            alert('Veuillez renseigner une date.');
            return;
          }

          // Déterminer si le statut vient de passer à « terminee »
          const previousStatus = session ? session.status : null;
          const newStatus = data.status;
          const justCompleted = (newStatus === 'terminee' && previousStatus !== 'terminee');

          if (isEdit) {
            DB.sessions.update(session.id, data);
          } else {
            DB.sessions.create(data);
          }

          // Mise à jour consommation abonnement si la session passe à « terminée »
          if (justCompleted && data.offerId) {
            const offer = DB.offers.getById(data.offerId);
            if (offer && offer.type === 'abonnement') {
              const consumed = (offer.sessionsConsumed || 0) + 1;
              DB.offers.update(offer.id, { sessionsConsumed: consumed });
            }
          }

          // Si session redevient non-terminée depuis terminée (annulation de complétion)
          if (isEdit && previousStatus === 'terminee' && newStatus !== 'terminee' && data.offerId) {
            const offer = DB.offers.getById(data.offerId);
            if (offer && offer.type === 'abonnement') {
              const consumed = Math.max((offer.sessionsConsumed || 0) - 1, 0);
              DB.offers.update(offer.id, { sessionsConsumed: consumed });
            }
          }

          closeModal();
          renderMain();
        });
      }

      attachModalListeners();
    }

    /* ==========================================================
       Lancement du premier rendu
       ========================================================== */
    renderMain();
  }
};
