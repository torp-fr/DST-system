/* ============================================================
   DST-SYSTEM — Vue Opérateurs (Vivier RH)
   Gestion complète du pool d'opérateurs : CRUD, calcul de coûts
   bidirectionnel, arbitrage RH multi-statuts.
   ============================================================ */

window.Views = window.Views || {};

Views.Operators = (() => {
  'use strict';

  /* ----------------------------------------------------------
     CONSTANTES
     ---------------------------------------------------------- */

  /** Correspondance statut → classe CSS du tag */
  const STATUS_TAG_CLASS = {
    freelance:          'tag-blue',
    interim:            'tag-yellow',
    cdd:                'tag-yellow',
    cdi:                'tag-green',
    contrat_journalier: 'tag-neutral',
    fondateur:          'tag-red'
  };

  /** Liste ordonnée des statuts pour les selects */
  const STATUS_OPTIONS = [
    'freelance',
    'interim',
    'contrat_journalier',
    'cdd',
    'cdi',
    'fondateur'
  ];

  /* ----------------------------------------------------------
     ÉTAT LOCAL DE LA VUE
     ---------------------------------------------------------- */

  /** Référence vers le conteneur DOM principal */
  let _container = null;

  /** Filtre de recherche courant (nom ou statut) */
  let _searchQuery = '';

  /** Filtre par statut ('' = tous) */
  let _statusFilter = '';

  /* ----------------------------------------------------------
     POINT D'ENTRÉE — RENDER
     ---------------------------------------------------------- */

  /**
   * Rendu principal de la vue opérateurs.
   * @param {HTMLElement} container — élément DOM cible
   */
  function render(container) {
    _container = container;
    _searchQuery = '';
    _statusFilter = '';
    _renderPage();
  }

  /* ----------------------------------------------------------
     RENDU DE LA PAGE COMPLÈTE
     ---------------------------------------------------------- */

  /** Construit et injecte le HTML complet de la page */
  function _renderPage() {
    const operators = _getFilteredOperators();
    const allOperators = DB.operators.getAll();

    // KPI rapides
    const totalActive = allOperators.filter(op => op.active !== false).length;
    const totalPool = allOperators.length;
    const avgCost = _computeAverageCost(allOperators.filter(op => op.active !== false));

    _container.innerHTML = `
      <!-- En-tête de page -->
      <div class="page-header">
        <h1>Vivier RH — Opérateurs</h1>
        <div class="actions">
          <button class="btn btn-primary" id="btn-add-operator">+ Nouvel opérateur</button>
        </div>
      </div>

      <!-- KPI résumé -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Pool total</span>
          <span class="kpi-value">${totalPool}</span>
          <span class="kpi-detail">${totalActive} actif${totalActive > 1 ? 's' : ''}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Coût moyen / jour</span>
          <span class="kpi-value">${avgCost !== null ? Engine.fmt(avgCost) : '—'}</span>
          <span class="kpi-detail">Coût entreprise (actifs)</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Freelances</span>
          <span class="kpi-value">${allOperators.filter(o => o.status === 'freelance').length}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">CDI / Fondateurs</span>
          <span class="kpi-value">${allOperators.filter(o => o.status === 'cdi' || o.status === 'fondateur').length}</span>
        </div>
      </div>

      <!-- Barre de recherche et filtre -->
      <div class="card">
        <div class="flex-between gap-12" style="flex-wrap:wrap;">
          <div class="search-bar">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="search-operators" placeholder="Rechercher par nom, spécialité…"
                   value="${_escapeAttr(_searchQuery)}" />
          </div>
          <div class="flex gap-8" style="align-items:center;">
            <label style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">Filtrer par statut :</label>
            <select id="filter-status" class="form-control" style="width:auto;min-width:160px;">
              <option value="">Tous les statuts</option>
              ${STATUS_OPTIONS.map(s => `
                <option value="${s}" ${_statusFilter === s ? 'selected' : ''}>${Engine.statusLabel(s)}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Tableau des opérateurs -->
      <div class="card">
        ${operators.length === 0 ? _renderEmptyState() : _renderTable(operators)}
      </div>
    `;

    // Attacher les événements
    _bindPageEvents();
  }

  /* ----------------------------------------------------------
     RENDU DU TABLEAU
     ---------------------------------------------------------- */

  /**
   * Génère le HTML du tableau d'opérateurs.
   * @param {Array} operators — liste filtrée
   * @returns {string} HTML
   */
  function _renderTable(operators) {
    const settings = DB.settings.get();

    const rows = operators.map(op => {
      const cost = _getDisplayCost(op, settings);
      const tagClass = STATUS_TAG_CLASS[op.status] || 'tag-neutral';
      const specialties = (op.specialties || []).join(', ') || '—';
      const activeLabel = op.active !== false
        ? '<span class="tag tag-green">Actif</span>'
        : '<span class="tag tag-neutral">Inactif</span>';

      return `
        <tr>
          <td><strong>${_escape(op.firstName)} ${_escape(op.lastName)}</strong></td>
          <td><span class="tag ${tagClass}">${Engine.statusLabel(op.status)}</span></td>
          <td class="num">${cost !== null ? Engine.fmt(cost) : '—'}</td>
          <td>${_escape(specialties)}</td>
          <td>${activeLabel}</td>
          <td class="actions-cell">
            <button class="btn btn-sm" data-action="view" data-id="${op.id}" title="Voir détails & arbitrage">Détails</button>
            <button class="btn btn-sm" data-action="edit" data-id="${op.id}" title="Modifier">Modifier</button>
            <button class="btn btn-sm" data-action="delete" data-id="${op.id}" title="Supprimer" style="color:var(--accent-red-light);">Supprimer</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Statut</th>
              <th>Coût / jour</th>
              <th>Spécialités</th>
              <th>Actif</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /** Rendu de l'état vide (aucun opérateur trouvé) */
  function _renderEmptyState() {
    if (DB.operators.getAll().length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">&#128100;</div>
          <p>Aucun opérateur dans le vivier RH.</p>
          <button class="btn btn-primary" id="btn-add-operator-empty">+ Ajouter un opérateur</button>
        </div>
      `;
    }
    return `
      <div class="empty-state">
        <div class="empty-icon">&#128269;</div>
        <p>Aucun opérateur ne correspond aux critères de recherche.</p>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     MODALE — FORMULAIRE CRÉATION / ÉDITION
     ---------------------------------------------------------- */

  /**
   * Ouvre la modale de création ou d'édition d'un opérateur.
   * @param {object|null} operator — opérateur existant (null = création)
   */
  function _openFormModal(operator) {
    const isEdit = !!operator;
    const op = operator || _defaultOperator();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'operator-modal-overlay';

    overlay.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier l\'opérateur' : 'Nouvel opérateur'}</h2>
          <button class="btn btn-sm btn-ghost" id="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="operator-form" autocomplete="off">

            <!-- Identité -->
            <div class="form-row">
              <div class="form-group">
                <label for="op-firstName">Prénom *</label>
                <input type="text" id="op-firstName" class="form-control" required
                       value="${_escapeAttr(op.firstName)}" placeholder="Prénom" />
              </div>
              <div class="form-group">
                <label for="op-lastName">Nom *</label>
                <input type="text" id="op-lastName" class="form-control" required
                       value="${_escapeAttr(op.lastName)}" placeholder="Nom" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="op-email">Email</label>
                <input type="email" id="op-email" class="form-control"
                       value="${_escapeAttr(op.email)}" placeholder="email@exemple.fr" />
              </div>
              <div class="form-group">
                <label for="op-phone">Téléphone</label>
                <input type="text" id="op-phone" class="form-control"
                       value="${_escapeAttr(op.phone)}" placeholder="06 xx xx xx xx" />
              </div>
            </div>

            <!-- Statut et activité -->
            <div class="form-row">
              <div class="form-group">
                <label for="op-status">Statut *</label>
                <select id="op-status" class="form-control" required>
                  ${STATUS_OPTIONS.map(s => `
                    <option value="${s}" ${op.status === s ? 'selected' : ''}>${Engine.statusLabel(s)}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end;">
                <label class="form-check">
                  <input type="checkbox" id="op-active" ${op.active !== false ? 'checked' : ''} />
                  <span>Opérateur actif</span>
                </label>
              </div>
            </div>

            <!-- Mode de coût -->
            <div class="card" style="margin-top:8px;">
              <div class="card-header">
                <h3>Tarification</h3>
              </div>

              <div class="form-group">
                <label>Mode de calcul</label>
                <div class="flex gap-16" style="margin-top:4px;">
                  <label class="form-check">
                    <input type="radio" name="costMode" value="net_desired"
                           ${op.costMode !== 'company_max' ? 'checked' : ''} />
                    <span>Net souhaité par l'opérateur</span>
                  </label>
                  <label class="form-check">
                    <input type="radio" name="costMode" value="company_max"
                           ${op.costMode === 'company_max' ? 'checked' : ''} />
                    <span>Coût max entreprise</span>
                  </label>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group" id="group-netDaily">
                  <label for="op-netDaily">Net journalier souhaité (&euro;)</label>
                  <input type="number" id="op-netDaily" class="form-control" min="0" step="any"
                         value="${op.netDaily || ''}" placeholder="Ex : 250" />
                </div>
                <div class="form-group" id="group-companyCost">
                  <label for="op-companyCostDaily">Coût max entreprise / jour (&euro;)</label>
                  <input type="number" id="op-companyCostDaily" class="form-control" min="0" step="any"
                         value="${op.companyCostDaily || ''}" placeholder="Ex : 450" />
                </div>
              </div>

              <!-- Résultat du calcul en temps réel -->
              <div id="cost-preview" class="mt-8"></div>
            </div>

            <!-- Spécialités (tags) -->
            <div class="form-group mt-16">
              <label for="op-specialties">Spécialités</label>
              <input type="text" id="op-specialties" class="form-control"
                     value="${_escapeAttr((op.specialties || []).join(', '))}"
                     placeholder="Tir tactique, CQB, médical… (séparées par des virgules)" />
              <span class="form-help">Séparez chaque spécialité par une virgule.</span>
            </div>

            <!-- Notes -->
            <div class="form-group">
              <label for="op-notes">Notes</label>
              <textarea id="op-notes" class="form-control" rows="3"
                        placeholder="Informations complémentaires…">${_escape(op.notes || '')}</textarea>
            </div>

          </form>
        </div>
        <div class="modal-footer">
          <button class="btn" id="modal-cancel">Annuler</button>
          <button class="btn btn-primary" id="modal-save">${isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Initialiser la visibilité des champs de coût
    _toggleCostFields();

    // Calcul de coût initial si des valeurs existent
    _updateCostPreview();

    // --- Événements de la modale ---

    // Fermeture
    const closeModal = () => overlay.remove();
    overlay.querySelector('#modal-close').addEventListener('click', closeModal);
    overlay.querySelector('#modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Basculer entre les modes de coût
    overlay.querySelectorAll('input[name="costMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _toggleCostFields();
        _updateCostPreview();
      });
    });

    // Mise à jour du calcul en temps réel
    overlay.querySelector('#op-netDaily').addEventListener('input', _updateCostPreview);
    overlay.querySelector('#op-companyCostDaily').addEventListener('input', _updateCostPreview);
    overlay.querySelector('#op-status').addEventListener('change', _updateCostPreview);

    // Sauvegarde
    overlay.querySelector('#modal-save').addEventListener('click', () => {
      const form = overlay.querySelector('#operator-form');
      if (!form.reportValidity()) return;
      _saveOperator(isEdit ? op.id : null, overlay);
    });
  }

  /** Bascule la visibilité des champs selon le mode de coût */
  function _toggleCostFields() {
    const overlay = document.getElementById('operator-modal-overlay');
    if (!overlay) return;

    const mode = overlay.querySelector('input[name="costMode"]:checked').value;
    const groupNet = overlay.querySelector('#group-netDaily');
    const groupCompany = overlay.querySelector('#group-companyCost');

    if (mode === 'net_desired') {
      groupNet.style.display = '';
      groupCompany.style.display = 'none';
    } else {
      groupNet.style.display = 'none';
      groupCompany.style.display = '';
    }
  }

  /** Met à jour l'aperçu du calcul de coût dans la modale */
  function _updateCostPreview() {
    const overlay = document.getElementById('operator-modal-overlay');
    if (!overlay) return;

    const mode = overlay.querySelector('input[name="costMode"]:checked').value;
    const status = overlay.querySelector('#op-status').value;
    const preview = overlay.querySelector('#cost-preview');
    const settings = DB.settings.get();

    let calc = null;

    if (mode === 'net_desired') {
      const netVal = parseFloat(overlay.querySelector('#op-netDaily').value);
      if (!netVal || netVal <= 0) { preview.innerHTML = ''; return; }
      calc = Engine.netToCompanyCost(netVal, status, settings);
    } else {
      const costVal = parseFloat(overlay.querySelector('#op-companyCostDaily').value);
      if (!costVal || costVal <= 0) { preview.innerHTML = ''; return; }
      calc = Engine.companyCostToNet(costVal, status, settings);
    }

    if (!calc) { preview.innerHTML = ''; return; }

    preview.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi-card">
          <span class="kpi-label">Net / jour</span>
          <span class="kpi-value" style="font-size:1.2rem;">${Engine.fmt(calc.net)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Brut / jour</span>
          <span class="kpi-value" style="font-size:1.2rem;">${Engine.fmt(calc.gross)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Charges</span>
          <span class="kpi-value" style="font-size:1.2rem;">${Engine.fmt(calc.charges)}</span>
        </div>
        <div class="kpi-card${status === 'fondateur' ? '' : ' kpi-warning'}">
          <span class="kpi-label">Coût entreprise</span>
          <span class="kpi-value" style="font-size:1.2rem;">${Engine.fmt(calc.companyCost)}</span>
        </div>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     MODALE — VUE DÉTAILS + ARBITRAGE RH
     ---------------------------------------------------------- */

  /**
   * Ouvre la modale de détails d'un opérateur avec l'arbitrage multi-statuts.
   * @param {object} op — opérateur
   */
  function _openDetailModal(op) {
    const settings = DB.settings.get();

    // Calcul du coût actuel
    const currentCost = _computeOperatorCost(op, settings);

    // Net de référence pour l'arbitrage
    const referenceNet = currentCost ? currentCost.net : (op.netDaily || 0);

    // Comparaison de tous les statuts
    const comparison = referenceNet > 0
      ? Engine.compareAllStatuses(referenceNet, settings)
      : [];

    // Identifier le plus cher pour la couleur rouge
    const maxCost = comparison.length > 0
      ? comparison[comparison.length - 1].companyCost
      : 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>${_escape(op.firstName)} ${_escape(op.lastName)}</h2>
          <button class="btn btn-sm btn-ghost" id="detail-close">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Informations de base -->
          <div class="card">
            <div class="card-header">
              <h3>Informations</h3>
              <span class="tag ${STATUS_TAG_CLASS[op.status] || 'tag-neutral'}">${Engine.statusLabel(op.status)}</span>
            </div>
            <div class="form-row">
              <div>
                <span class="kpi-label">Email</span><br/>
                <span>${_escape(op.email || '—')}</span>
              </div>
              <div>
                <span class="kpi-label">Téléphone</span><br/>
                <span>${_escape(op.phone || '—')}</span>
              </div>
              <div>
                <span class="kpi-label">Actif</span><br/>
                <span>${op.active !== false ? '<span class="tag tag-green">Oui</span>' : '<span class="tag tag-neutral">Non</span>'}</span>
              </div>
            </div>
            ${(op.specialties && op.specialties.length > 0) ? `
              <div class="mt-16">
                <span class="kpi-label">Spécialités</span><br/>
                <div class="flex gap-8" style="flex-wrap:wrap;margin-top:4px;">
                  ${op.specialties.map(s => `<span class="tag tag-blue">${_escape(s)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            ${op.notes ? `
              <div class="mt-16">
                <span class="kpi-label">Notes</span><br/>
                <span style="white-space:pre-line;">${_escape(op.notes)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Coût actuel -->
          ${currentCost ? `
          <div class="card">
            <div class="card-header">
              <h3>Coût actuel — ${Engine.statusLabel(op.status)}</h3>
              <span class="tag tag-neutral">${op.costMode === 'company_max' ? 'Mode : coût max entreprise' : 'Mode : net souhaité'}</span>
            </div>
            <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
              <div class="kpi-card">
                <span class="kpi-label">Net / jour</span>
                <span class="kpi-value" style="font-size:1.3rem;">${Engine.fmt(currentCost.net)}</span>
              </div>
              <div class="kpi-card">
                <span class="kpi-label">Brut / jour</span>
                <span class="kpi-value" style="font-size:1.3rem;">${Engine.fmt(currentCost.gross)}</span>
              </div>
              <div class="kpi-card">
                <span class="kpi-label">Charges</span>
                <span class="kpi-value" style="font-size:1.3rem;">${Engine.fmt(currentCost.charges)}</span>
              </div>
              <div class="kpi-card">
                <span class="kpi-label">Coût entreprise</span>
                <span class="kpi-value" style="font-size:1.3rem;">${Engine.fmt(currentCost.companyCost)}</span>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Arbitrage RH — Comparaison de tous les statuts -->
          ${referenceNet > 0 ? `
          <div class="card">
            <div class="card-header">
              <h3>Arbitrage RH — Comparaison pour ${Engine.fmt(referenceNet)} net/jour</h3>
            </div>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;">
              Pour un même net journalier de <strong>${Engine.fmt(referenceNet)}</strong>,
              voici le coût entreprise selon chaque statut contractuel.
            </p>
            <div class="comparison-grid">
              ${comparison.map((item, idx) => {
                // Premier = recommandé (le moins cher), dernier = plus cher
                let cardClass = '';
                if (item.companyCost === 0) {
                  cardClass = 'recommended'; // Fondateur = coût 0
                } else if (idx === 0) {
                  cardClass = 'recommended';
                } else if (item.companyCost === maxCost && maxCost > 0) {
                  cardClass = 'not-recommended';
                }
                const isCurrent = item.status === op.status;
                return `
                  <div class="comparison-card ${cardClass}" ${isCurrent ? 'style="outline:2px solid var(--color-info);"' : ''}>
                    <div class="comp-label">${item.label}${isCurrent ? ' (actuel)' : ''}</div>
                    <div class="comp-value">${Engine.fmt(item.companyCost)}</div>
                    <div class="comp-detail">
                      Brut : ${Engine.fmt(item.gross)}<br/>
                      Charges : ${Engine.fmt(item.charges)}
                    </div>
                    ${idx === 0 && item.companyCost > 0 ? '<div class="comp-detail" style="margin-top:4px;"><strong style="color:var(--color-success);">Recommandé</strong></div>' : ''}
                    ${item.companyCost === maxCost && maxCost > 0 && idx === comparison.length - 1 ? '<div class="comp-detail" style="margin-top:4px;"><strong style="color:var(--accent-red-light);">Plus coûteux</strong></div>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
            ${comparison.length >= 2 && comparison[0].companyCost > 0 ? `
              <div class="mt-16" style="font-size:0.82rem;color:var(--text-secondary);">
                Écart entre le moins cher (<strong>${comparison[0].label}</strong>) et le plus cher
                (<strong>${comparison[comparison.length - 1].label}</strong>) :
                <strong style="color:var(--accent-red-light);">${Engine.fmt(comparison[comparison.length - 1].companyCost - comparison[0].companyCost)}</strong> / jour
                (${Engine.fmtPercent(((comparison[comparison.length - 1].companyCost - comparison[0].companyCost) / comparison[0].companyCost) * 100)})
              </div>
            ` : ''}
          </div>
          ` : `
          <div class="card">
            <div class="card-header"><h3>Arbitrage RH</h3></div>
            <p style="font-size:0.85rem;color:var(--text-muted);">
              Renseignez un tarif journalier pour cet opérateur afin d'afficher la comparaison multi-statuts.
            </p>
          </div>
          `}

        </div>
        <div class="modal-footer">
          <button class="btn" id="detail-close-footer">Fermer</button>
          <button class="btn btn-primary" id="detail-edit">Modifier</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Fermeture
    const closeDetail = () => overlay.remove();
    overlay.querySelector('#detail-close').addEventListener('click', closeDetail);
    overlay.querySelector('#detail-close-footer').addEventListener('click', closeDetail);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDetail();
    });

    // Bouton modifier → ouvre le formulaire
    overlay.querySelector('#detail-edit').addEventListener('click', () => {
      closeDetail();
      _openFormModal(op);
    });
  }

  /* ----------------------------------------------------------
     MODALE — CONFIRMATION DE SUPPRESSION
     ---------------------------------------------------------- */

  /**
   * Demande confirmation avant de supprimer un opérateur.
   * @param {object} op — opérateur à supprimer
   */
  function _confirmDelete(op) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h2>Confirmer la suppression</h2>
          <button class="btn btn-sm btn-ghost" id="del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:8px;">
            Voulez-vous vraiment supprimer l'opérateur
            <strong>${_escape(op.firstName)} ${_escape(op.lastName)}</strong> ?
          </p>
          <p style="font-size:0.82rem;color:var(--text-muted);">
            Cette action est irréversible. L'opérateur sera retiré du vivier RH.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn" id="del-cancel">Annuler</button>
          <button class="btn btn-primary" id="del-confirm" style="background:var(--accent-red);border-color:var(--accent-red);">Supprimer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeConfirm = () => overlay.remove();
    overlay.querySelector('#del-close').addEventListener('click', closeConfirm);
    overlay.querySelector('#del-cancel').addEventListener('click', closeConfirm);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeConfirm();
    });

    overlay.querySelector('#del-confirm').addEventListener('click', () => {
      DB.operators.delete(op.id);
      closeConfirm();
      _renderPage();
    });
  }

  /* ----------------------------------------------------------
     SAUVEGARDE D'UN OPÉRATEUR (CRÉATION OU MISE À JOUR)
     ---------------------------------------------------------- */

  /**
   * Collecte les données du formulaire et crée ou met à jour l'opérateur.
   * @param {string|null} operatorId — ID existant ou null pour création
   * @param {HTMLElement} overlay — élément modale à fermer après sauvegarde
   */
  function _saveOperator(operatorId, overlay) {
    const costMode = overlay.querySelector('input[name="costMode"]:checked').value;

    // Transformer les spécialités en tableau de tags propres
    const rawSpecialties = overlay.querySelector('#op-specialties').value;
    const specialties = rawSpecialties
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const data = {
      firstName:        overlay.querySelector('#op-firstName').value.trim(),
      lastName:         overlay.querySelector('#op-lastName').value.trim(),
      email:            overlay.querySelector('#op-email').value.trim(),
      phone:            overlay.querySelector('#op-phone').value.trim(),
      status:           overlay.querySelector('#op-status').value,
      active:           overlay.querySelector('#op-active').checked,
      costMode:         costMode,
      netDaily:         costMode === 'net_desired'
                          ? parseFloat(overlay.querySelector('#op-netDaily').value) || 0
                          : 0,
      companyCostDaily: costMode === 'company_max'
                          ? parseFloat(overlay.querySelector('#op-companyCostDaily').value) || 0
                          : 0,
      specialties:      specialties,
      notes:            overlay.querySelector('#op-notes').value.trim()
    };

    // Validation minimale
    if (!data.firstName || !data.lastName) return;

    if (operatorId) {
      DB.operators.update(operatorId, data);
    } else {
      DB.operators.create(data);
    }

    overlay.remove();
    _renderPage();
  }

  /* ----------------------------------------------------------
     ÉVÉNEMENTS DE LA PAGE
     ---------------------------------------------------------- */

  /** Attache tous les écouteurs d'événements de la page principale */
  function _bindPageEvents() {
    // Bouton ajout (en-tête)
    const btnAdd = _container.querySelector('#btn-add-operator');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => _openFormModal(null));
    }

    // Bouton ajout (état vide)
    const btnAddEmpty = _container.querySelector('#btn-add-operator-empty');
    if (btnAddEmpty) {
      btnAddEmpty.addEventListener('click', () => _openFormModal(null));
    }

    // Recherche textuelle
    const searchInput = _container.querySelector('#search-operators');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _searchQuery = e.target.value;
        _renderPage();
        // Remettre le focus et la position du curseur
        const newInput = _container.querySelector('#search-operators');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    // Filtre par statut
    const filterSelect = _container.querySelector('#filter-status');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        _statusFilter = e.target.value;
        _renderPage();
      });
    }

    // Actions sur les lignes du tableau (délégation d'événements)
    _container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const op = DB.operators.getById(id);
        if (!op) return;

        switch (action) {
          case 'view':
            _openDetailModal(op);
            break;
          case 'edit':
            _openFormModal(op);
            break;
          case 'delete':
            _confirmDelete(op);
            break;
        }
      });
    });
  }

  /* ----------------------------------------------------------
     UTILITAIRES INTERNES
     ---------------------------------------------------------- */

  /**
   * Retourne les opérateurs filtrés selon la recherche et le statut.
   * @returns {Array}
   */
  function _getFilteredOperators() {
    let operators = DB.operators.getAll();

    // Filtre par statut
    if (_statusFilter) {
      operators = operators.filter(op => op.status === _statusFilter);
    }

    // Filtre par recherche textuelle (nom, prénom, spécialités)
    if (_searchQuery.trim()) {
      const q = _searchQuery.toLowerCase().trim();
      operators = operators.filter(op => {
        const fullName = `${op.firstName} ${op.lastName}`.toLowerCase();
        const specs = (op.specialties || []).join(' ').toLowerCase();
        const statusText = Engine.statusLabel(op.status).toLowerCase();
        return fullName.includes(q) || specs.includes(q) || statusText.includes(q);
      });
    }

    // Tri : actifs en premier, puis par nom
    operators.sort((a, b) => {
      const activeA = a.active !== false ? 0 : 1;
      const activeB = b.active !== false ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr');
    });

    return operators;
  }

  /**
   * Retourne le coût entreprise journalier d'un opérateur pour l'affichage.
   * @param {object} op — opérateur
   * @param {object} settings — paramètres économiques
   * @returns {number|null}
   */
  function _getDisplayCost(op, settings) {
    if (op.status === 'fondateur') return 0;
    if (op.costMode === 'company_max') {
      return op.companyCostDaily || null;
    }
    if (op.netDaily && op.netDaily > 0) {
      const calc = Engine.netToCompanyCost(op.netDaily, op.status, settings);
      return calc.companyCost;
    }
    return null;
  }

  /**
   * Calcule le détail complet du coût pour un opérateur.
   * @param {object} op — opérateur
   * @param {object} settings — paramètres économiques
   * @returns {object|null}
   */
  function _computeOperatorCost(op, settings) {
    if (op.costMode === 'company_max' && op.companyCostDaily > 0) {
      return Engine.companyCostToNet(op.companyCostDaily, op.status, settings);
    }
    if (op.netDaily && op.netDaily > 0) {
      return Engine.netToCompanyCost(op.netDaily, op.status, settings);
    }
    return null;
  }

  /**
   * Calcule le coût entreprise moyen des opérateurs actifs.
   * @param {Array} operators — liste d'opérateurs actifs
   * @returns {number|null}
   */
  function _computeAverageCost(operators) {
    if (operators.length === 0) return null;
    const settings = DB.settings.get();
    let total = 0;
    let count = 0;

    operators.forEach(op => {
      const cost = _getDisplayCost(op, settings);
      if (cost !== null && cost > 0) {
        total += cost;
        count++;
      }
    });

    return count > 0 ? Engine.round2(total / count) : null;
  }

  /**
   * Retourne un objet opérateur par défaut pour le formulaire de création.
   * @returns {object}
   */
  function _defaultOperator() {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      status: 'freelance',
      active: true,
      costMode: 'net_desired',
      netDaily: 0,
      companyCostDaily: 0,
      specialties: [],
      notes: ''
    };
  }

  /**
   * Échappe le HTML pour éviter les injections XSS.
   * @param {string} str
   * @returns {string}
   */
  function _escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Échappe une chaîne pour utilisation dans un attribut HTML.
   * @param {string} str
   * @returns {string}
   */
  function _escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ----------------------------------------------------------
     API PUBLIQUE
     ---------------------------------------------------------- */

  return { render };

})();
