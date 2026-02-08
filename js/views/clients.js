/* ============================================================
   DST-SYSTEM — Vue Clients
   Gestion complète du fichier client : liste, CRUD, fiche
   détaillée avec historique sessions, offres et statistiques.
   ============================================================ */

window.Views = window.Views || {};

Views.Clients = (() => {
  'use strict';

  /* --- État interne du module --- */
  let _container = null;
  let _searchTerm = '';
  let _filterType = '';
  let _expandedClientId = null;

  /* -----------------------------------------------------------
     RENDU PRINCIPAL
     ----------------------------------------------------------- */

  function render(container) {
    _container = container;
    _renderPage();
  }

  /**
   * Reconstruit l'intégralité de la page clients.
   */
  function _renderPage() {
    const clients = DB.clients.getAll();
    const settings = DB.settings.get();
    const clientTypes = settings.clientTypes || [];

    /* Filtrage par recherche et type */
    const filtered = _applyFilters(clients);

    /* Compteurs pour les KPI */
    const activeCount = clients.filter(c => c.active !== false).length;
    const inactiveCount = clients.length - activeCount;

    _container.innerHTML = `
      <!-- En-tête de page -->
      <div class="page-header">
        <h1>Clients</h1>
        <div class="actions">
          <button class="btn btn-primary" id="btn-add-client">+ Nouveau client</button>
        </div>
      </div>

      <!-- KPI synthèse -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total clients</div>
          <div class="kpi-value">${clients.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Clients actifs</div>
          <div class="kpi-value">${activeCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Clients inactifs</div>
          <div class="kpi-value">${inactiveCount}</div>
        </div>
      </div>

      <!-- Barre de recherche et filtre type -->
      <div class="card">
        <div class="flex-between mb-16">
          <div class="search-bar">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="client-search" placeholder="Rechercher par nom ou contact..."
                   value="${_escapeAttr(_searchTerm)}" />
          </div>
          <div class="flex gap-8">
            <select class="form-control" id="client-filter-type" style="width:auto;min-width:180px;">
              <option value="">Tous les types</option>
              ${clientTypes.map(t => `
                <option value="${_escapeAttr(t)}" ${_filterType === t ? 'selected' : ''}>${_escapeHtml(t)}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Tableau clients -->
        ${filtered.length > 0 ? _renderTable(filtered) : `
          <div class="empty-state">
            <div class="empty-icon">&#128101;</div>
            <p>Aucun client trouvé${_searchTerm || _filterType ? ' pour ces critères.' : '. Créez votre premier client.'}</p>
            ${!_searchTerm && !_filterType ? '<button class="btn btn-primary" id="btn-empty-add">+ Nouveau client</button>' : ''}
          </div>
        `}
      </div>

      <!-- Panneau détail (inséré dynamiquement sous le tableau) -->
      <div id="client-detail-panel"></div>
    `;

    /* --- Attachement des écouteurs --- */
    _bindPageEvents(clientTypes);
  }

  /* -----------------------------------------------------------
     FILTRAGE
     ----------------------------------------------------------- */

  /**
   * Applique les filtres recherche + type sur la liste.
   */
  function _applyFilters(clients) {
    let result = clients;
    if (_filterType) {
      result = result.filter(c => c.type === _filterType);
    }
    if (_searchTerm) {
      const term = _searchTerm.toLowerCase();
      result = result.filter(c =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.contactName || '').toLowerCase().includes(term) ||
        (c.type || '').toLowerCase().includes(term)
      );
    }
    /* Tri alphabétique par nom */
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    return result;
  }

  /* -----------------------------------------------------------
     TABLEAU CLIENTS
     ----------------------------------------------------------- */

  /**
   * Génère le HTML du tableau des clients.
   */
  function _renderTable(clients) {
    const allSessions = DB.sessions.getAll();
    const rows = clients.map(client => {
      const sessCount = allSessions.filter(s => s.clientId === client.id).length;
      const tagClass = _typeTagClass(client.type);
      const isExpanded = _expandedClientId === client.id;
      return `
        <tr class="client-row ${isExpanded ? 'active' : ''}" data-id="${client.id}" style="cursor:pointer;">
          <td>
            <strong>${_escapeHtml(client.name || '—')}</strong>
            ${client.clientCategory ? '<span class="tag ' + (client.clientCategory === 'B2B' ? 'tag-blue' : 'tag-yellow') + '" style="margin-left:6px;font-size:0.6rem;">' + client.clientCategory + '</span>' : ''}
          </td>
          <td><span class="tag ${tagClass}">${_escapeHtml(client.type || 'N/C')}</span></td>
          <td>
            ${client.contactName ? _escapeHtml(client.contactName) : '<span class="text-muted">—</span>'}
            ${client.contactEmail ? `<br><small class="text-muted">${_escapeHtml(client.contactEmail)}</small>` : ''}
          </td>
          <td class="num">${sessCount}</td>
          <td>
            ${client.active !== false
              ? '<span class="tag tag-green">Actif</span>'
              : '<span class="tag tag-neutral">Inactif</span>'}
          </td>
          <td class="actions-cell">
            <button class="btn btn-sm btn-edit-client" data-id="${client.id}" title="Modifier">&#9998;</button>
            <button class="btn btn-sm btn-delete-client" data-id="${client.id}" title="Supprimer">&#128465;</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="data-table-wrap">
        <table class="data-table" id="clients-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Contact</th>
              <th>Sessions</th>
              <th>Statut</th>
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

  /* -----------------------------------------------------------
     FICHE DÉTAIL CLIENT
     ----------------------------------------------------------- */

  /**
   * Affiche ou masque la fiche détaillée d'un client.
   */
  function _toggleDetail(clientId) {
    if (_expandedClientId === clientId) {
      _expandedClientId = null;
      const panel = _container.querySelector('#client-detail-panel');
      if (panel) panel.innerHTML = '';
      /* Retirer la surbrillance de la ligne */
      _container.querySelectorAll('.client-row.active').forEach(r => r.classList.remove('active'));
      return;
    }
    _expandedClientId = clientId;
    _renderDetail(clientId);
    /* Mettre à jour la surbrillance des lignes */
    _container.querySelectorAll('.client-row').forEach(r => {
      r.classList.toggle('active', r.dataset.id === clientId);
    });
  }

  /**
   * Construit le panneau de détail pour un client donné.
   */
  function _renderDetail(clientId) {
    const client = DB.clients.getById(clientId);
    if (!client) return;

    const panel = _container.querySelector('#client-detail-panel');
    if (!panel) return;

    /* Récupérer les sessions liées */
    const clientSessions = DB.sessions.filter(s => s.clientId === clientId);
    clientSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    /* Récupérer les offres liées (clientIds contient l'id) */
    const clientOffers = DB.offers.filter(o =>
      (o.clientIds && o.clientIds.includes(clientId)) ||
      (o.clientId && o.clientId === clientId)
    );

    /* Statistiques */
    const stats = _computeClientStats(clientSessions);

    panel.innerHTML = `
      <div class="card mt-16" id="detail-card">
        <div class="card-header">
          <h2>Fiche client : ${_escapeHtml(client.name)}</h2>
          <button class="btn btn-sm" id="btn-close-detail">Fermer</button>
        </div>

        <!-- Résumé informations -->
        <div class="grid-2 mb-16">
          <div>
            <table class="data-table" style="font-size:0.85rem;">
              <tbody>
                <tr><td class="text-muted" style="width:140px;">Type</td><td><span class="tag ${_typeTagClass(client.type)}">${_escapeHtml(client.type || 'N/C')}</span></td></tr>
                <tr><td class="text-muted">Catégorie</td><td><span class="tag ${client.clientCategory === 'B2C' ? 'tag-yellow' : 'tag-blue'}">${_escapeHtml(client.clientCategory || 'B2B')}</span> <small class="text-muted">${client.clientCategory === 'B2C' ? 'Tarifs TTC' : 'Tarifs HT'}</small></td></tr>
                <tr><td class="text-muted">Contact</td><td>${_escapeHtml(client.contactName || '—')}</td></tr>
                <tr><td class="text-muted">Email</td><td>${client.contactEmail ? `<a href="mailto:${_escapeAttr(client.contactEmail)}">${_escapeHtml(client.contactEmail)}</a>` : '—'}</td></tr>
                <tr><td class="text-muted">Téléphone</td><td>${_escapeHtml(client.contactPhone || '—')}</td></tr>
                <tr><td class="text-muted">Adresse</td><td>${_escapeHtml(client.address || '—')}</td></tr>
                <tr><td class="text-muted">SIRET</td><td><span class="text-mono">${_escapeHtml(client.siret || '—')}</span></td></tr>
                <tr><td class="text-muted">Statut</td><td>${client.active !== false ? '<span class="tag tag-green">Actif</span>' : '<span class="tag tag-neutral">Inactif</span>'}</td></tr>
                ${client.notes ? `<tr><td class="text-muted">Notes</td><td>${_escapeHtml(client.notes)}</td></tr>` : ''}
              </tbody>
            </table>
          </div>
          <div>
            <!-- KPI client -->
            <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
              <div class="kpi-card">
                <div class="kpi-label">Sessions totales</div>
                <div class="kpi-value">${stats.totalSessions}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Total facturé</div>
                <div class="kpi-value">${Engine.fmt(stats.totalSpent)}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Coût moyen / session</div>
                <div class="kpi-value">${stats.totalSessions > 0 ? Engine.fmt(stats.avgSessionCost) : '—'}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Offres actives</div>
                <div class="kpi-value">${clientOffers.length}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Historique des sessions -->
        <div class="card-header">
          <h3>Historique des sessions</h3>
        </div>
        ${clientSessions.length > 0 ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Statut</th>
                  <th class="text-right">Prix facturé</th>
                  <th class="text-right">Coût total</th>
                  <th class="text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                ${clientSessions.map(s => {
                  const cost = Engine.computeSessionCost(s);
                  const statusLabel = Engine.sessionStatusLabel ? Engine.sessionStatusLabel(s.status) : (s.status || '—');
                  const isB2C = client.clientCategory === 'B2C';
                  const prixAffiche = isB2C && s.price ? Engine.computeTTC(s.price) : (s.price || 0);
                  const prixLabel = isB2C ? 'TTC' : 'HT';
                  return `
                    <tr>
                      <td>${_formatDate(s.date)}</td>
                      <td>${_escapeHtml(s.label || s.name || '—')}</td>
                      <td><span class="tag ${_sessionStatusTag(s.status)}">${_escapeHtml(statusLabel)}</span></td>
                      <td class="num">${Engine.fmt(prixAffiche)} <small class="text-muted">${prixLabel}</small></td>
                      <td class="num">${Engine.fmt(cost.totalCost)}</td>
                      <td class="num ${cost.marginPercent < 0 ? 'text-red' : ''}">${cost.marginPercent.toFixed(1)} %</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding:24px;">
            <p class="text-muted">Aucune session enregistrée pour ce client.</p>
          </div>
        `}

        <!-- Offres / abonnements -->
        <div class="card-header mt-24">
          <h3>Offres et abonnements</h3>
        </div>
        ${clientOffers.length > 0 ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Intitulé</th>
                  <th>Type</th>
                  <th class="text-right">Nb sessions</th>
                  <th class="text-right">Prix</th>
                </tr>
              </thead>
              <tbody>
                ${clientOffers.map(o => {
                  const typeLabel = Engine.offerTypeLabel ? Engine.offerTypeLabel(o.type) : (o.type || '—');
                  return `
                    <tr>
                      <td>${_escapeHtml(o.label || o.name || '—')}</td>
                      <td><span class="tag tag-blue">${_escapeHtml(typeLabel)}</span></td>
                      <td class="num">${o.nbSessions || '—'}</td>
                      <td class="num">${Engine.fmt(o.price || 0)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding:24px;">
            <p class="text-muted">Aucune offre liée à ce client.</p>
          </div>
        `}
      </div>
    `;

    /* Écouteur fermeture du panneau */
    const btnClose = panel.querySelector('#btn-close-detail');
    if (btnClose) {
      btnClose.addEventListener('click', () => _toggleDetail(clientId));
    }

    /* Scroll vers le panneau détail */
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Calcule les statistiques d'un client à partir de ses sessions.
   */
  function _computeClientStats(sessions) {
    let totalSpent = 0;
    const validSessions = sessions.filter(s => s.status !== 'annulee');
    validSessions.forEach(s => {
      totalSpent += (s.price || 0);
    });
    const avgSessionCost = validSessions.length > 0
      ? Engine.round2(totalSpent / validSessions.length)
      : 0;
    return {
      totalSessions: validSessions.length,
      totalSpent: Engine.round2(totalSpent),
      avgSessionCost
    };
  }

  /* -----------------------------------------------------------
     MODAL FORMULAIRE (CRÉER / MODIFIER)
     ----------------------------------------------------------- */

  /**
   * Affiche la modale de création ou d'édition d'un client.
   * @param {Object|null} client — null pour une création, objet pour édition.
   */
  function _openFormModal(client) {
    const isEdit = !!client;
    const settings = DB.settings.get();
    const clientTypes = settings.clientTypes || [];
    const c = client || {};

    /* Déterminer si le type actuel est un type personnalisé */
    const isCustomType = c.type && !clientTypes.includes(c.type);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'client-modal-overlay';

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier le client' : 'Nouveau client'}</h2>
          <button class="btn btn-sm btn-ghost" id="btn-modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label for="client-name">Nom / Raison sociale *</label>
              <input type="text" class="form-control" id="client-name"
                     value="${_escapeAttr(c.name || '')}" placeholder="Nom du client" required />
            </div>
            <div class="form-group">
              <label for="client-type">Type de client</label>
              <select class="form-control" id="client-type">
                ${clientTypes.map(t => `
                  <option value="${_escapeAttr(t)}" ${c.type === t ? 'selected' : ''}>${_escapeHtml(t)}</option>
                `).join('')}
                <option value="__custom" ${isCustomType ? 'selected' : ''}>Autre (saisie libre)...</option>
              </select>
            </div>
          </div>

          <!-- Champ type personnalisé (masqué par défaut) -->
          <div class="form-group ${isCustomType ? '' : 'hidden'}" id="custom-type-group">
            <label for="client-type-custom">Type personnalisé</label>
            <input type="text" class="form-control" id="client-type-custom"
                   value="${isCustomType ? _escapeAttr(c.type) : ''}" placeholder="Saisissez un type..." />
          </div>

          <!-- Catégorie B2B / B2C -->
          <div class="form-group">
            <label for="client-category">Catégorie de facturation</label>
            <div class="flex gap-16" style="margin-top:4px;">
              <label class="form-check">
                <input type="radio" name="clientCategory" value="B2B"
                       ${(c.clientCategory || 'B2B') === 'B2B' ? 'checked' : ''} />
                <span>B2B <small style="color:var(--text-muted);">(tarifs HT)</small></span>
              </label>
              <label class="form-check">
                <input type="radio" name="clientCategory" value="B2C"
                       ${c.clientCategory === 'B2C' ? 'checked' : ''} />
                <span>B2C <small style="color:var(--text-muted);">(tarifs TTC)</small></span>
              </label>
            </div>
            <span class="form-help">B2B : prix affichés HT. B2C : prix affichés TTC (TVA incluse).</span>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="client-contact-name">Nom du contact</label>
              <input type="text" class="form-control" id="client-contact-name"
                     value="${_escapeAttr(c.contactName || '')}" placeholder="Prénom Nom" />
            </div>
            <div class="form-group">
              <label for="client-contact-email">Email</label>
              <input type="email" class="form-control" id="client-contact-email"
                     value="${_escapeAttr(c.contactEmail || '')}" placeholder="contact@exemple.fr" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="client-contact-phone">Téléphone</label>
              <input type="tel" class="form-control" id="client-contact-phone"
                     value="${_escapeAttr(c.contactPhone || '')}" placeholder="06 00 00 00 00" />
            </div>
            <div class="form-group">
              <label for="client-siret">SIRET</label>
              <input type="text" class="form-control" id="client-siret"
                     value="${_escapeAttr(c.siret || '')}" placeholder="123 456 789 00012" />
            </div>
          </div>

          <div class="form-group">
            <label for="client-address">Adresse</label>
            <input type="text" class="form-control" id="client-address"
                   value="${_escapeAttr(c.address || '')}" placeholder="Adresse complète" />
          </div>

          <div class="form-group">
            <label for="client-notes">Notes internes</label>
            <textarea class="form-control" id="client-notes" rows="3"
                      placeholder="Remarques, contexte, historique...">${_escapeHtml(c.notes || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-check">
              <input type="checkbox" id="client-active" ${c.active !== false ? 'checked' : ''} />
              Client actif
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="btn-modal-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-modal-save">${isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    /* --- Écouteurs de la modale --- */

    /* Bascule type personnalisé */
    const selectType = overlay.querySelector('#client-type');
    const customGroup = overlay.querySelector('#custom-type-group');
    selectType.addEventListener('change', () => {
      if (selectType.value === '__custom') {
        customGroup.classList.remove('hidden');
        overlay.querySelector('#client-type-custom').focus();
      } else {
        customGroup.classList.add('hidden');
      }
    });

    /* Fermer la modale */
    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('#btn-modal-cancel').addEventListener('click', closeModal);

    /* Clic sur le fond sombre */
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    /* Sauvegarder */
    overlay.querySelector('#btn-modal-save').addEventListener('click', () => {
      const name = overlay.querySelector('#client-name').value.trim();
      if (!name) {
        overlay.querySelector('#client-name').style.borderColor = 'var(--accent-red)';
        overlay.querySelector('#client-name').focus();
        return;
      }

      /* Résoudre le type (standard ou personnalisé) */
      let type = selectType.value;
      if (type === '__custom') {
        type = overlay.querySelector('#client-type-custom').value.trim() || 'Autre';
      }

      /* Catégorie B2B / B2C */
      const clientCategory = (overlay.querySelector('input[name="clientCategory"]:checked') || {}).value || 'B2B';

      const data = {
        name,
        type,
        clientCategory,
        contactName: overlay.querySelector('#client-contact-name').value.trim(),
        contactEmail: overlay.querySelector('#client-contact-email').value.trim(),
        contactPhone: overlay.querySelector('#client-contact-phone').value.trim(),
        address: overlay.querySelector('#client-address').value.trim(),
        siret: overlay.querySelector('#client-siret').value.trim(),
        notes: overlay.querySelector('#client-notes').value.trim(),
        active: overlay.querySelector('#client-active').checked
      };

      if (isEdit) {
        DB.clients.update(client.id, data);
        Toast.show('Client « ' + data.name + ' » mis à jour.', 'success');
      } else {
        DB.clients.create(data);
        Toast.show('Client « ' + data.name + ' » créé.', 'success');
      }

      closeModal();
      /* Rafraîchir le panneau détail si ouvert sur ce client */
      if (isEdit && _expandedClientId === client.id) {
        _expandedClientId = client.id;
      }
      _renderPage();
    });

    /* Focus initial sur le champ nom */
    overlay.querySelector('#client-name').focus();
  }

  /* -----------------------------------------------------------
     SUPPRESSION CLIENT
     ----------------------------------------------------------- */

  /**
   * Affiche une modale de confirmation de suppression.
   */
  function _confirmDelete(clientId) {
    const client = DB.clients.getById(clientId);
    if (!client) return;

    /* Vérifier les sessions liées */
    const linkedSessions = DB.sessions.filter(s => s.clientId === clientId);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h2>Confirmer la suppression</h2>
          <button class="btn btn-sm btn-ghost" id="btn-del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>Voulez-vous vraiment supprimer le client <strong>${_escapeHtml(client.name)}</strong> ?</p>
          ${linkedSessions.length > 0 ? `
            <div class="alert alert-warning mt-16">
              <span class="alert-icon">&#9888;</span>
              <span>Ce client est lié à <strong>${linkedSessions.length}</strong> session(s). Les sessions ne seront pas supprimées mais perdront leur référence client.</span>
            </div>
          ` : ''}
          <p class="text-muted mt-8">Cette action est irréversible.</p>
        </div>
        <div class="modal-footer">
          <button class="btn" id="btn-del-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-del-confirm" style="background:var(--accent-red);border-color:var(--accent-red);">Supprimer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();

    overlay.querySelector('#btn-del-close').addEventListener('click', closeModal);
    overlay.querySelector('#btn-del-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector('#btn-del-confirm').addEventListener('click', () => {
      const name = client.name || '';
      DB.clients.delete(clientId);
      /* Fermer le détail si ouvert sur ce client */
      if (_expandedClientId === clientId) {
        _expandedClientId = null;
      }
      closeModal();
      _renderPage();
      Toast.show('Client « ' + name + ' » supprimé.', 'warning');
    });
  }

  /* -----------------------------------------------------------
     ATTACHEMENT DES ÉVÉNEMENTS
     ----------------------------------------------------------- */

  /**
   * Branche tous les écouteurs d'événements après le rendu HTML.
   */
  function _bindPageEvents(clientTypes) {
    /* Bouton nouveau client */
    const btnAdd = _container.querySelector('#btn-add-client');
    if (btnAdd) btnAdd.addEventListener('click', () => _openFormModal(null));

    /* Bouton ajout dans l'état vide */
    const btnEmptyAdd = _container.querySelector('#btn-empty-add');
    if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => _openFormModal(null));

    /* Champ de recherche */
    const searchInput = _container.querySelector('#client-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _searchTerm = e.target.value;
        _renderPage();
        /* Re-focus le champ recherche après le re-rendu */
        const newInput = _container.querySelector('#client-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    /* Filtre par type */
    const filterType = _container.querySelector('#client-filter-type');
    if (filterType) {
      filterType.addEventListener('change', (e) => {
        _filterType = e.target.value;
        _renderPage();
      });
    }

    /* Lignes du tableau — clic pour ouvrir la fiche détail */
    _container.querySelectorAll('.client-row').forEach(row => {
      row.addEventListener('click', (e) => {
        /* Ne pas ouvrir si clic sur un bouton d'action */
        if (e.target.closest('.btn-edit-client') || e.target.closest('.btn-delete-client')) return;
        _toggleDetail(row.dataset.id);
      });
    });

    /* Boutons modifier */
    _container.querySelectorAll('.btn-edit-client').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const client = DB.clients.getById(btn.dataset.id);
        if (client) _openFormModal(client);
      });
    });

    /* Boutons supprimer */
    _container.querySelectorAll('.btn-delete-client').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _confirmDelete(btn.dataset.id);
      });
    });

    /* Si un détail était ouvert, le ré-afficher */
    if (_expandedClientId) {
      const exists = DB.clients.getById(_expandedClientId);
      if (exists) {
        _renderDetail(_expandedClientId);
      } else {
        _expandedClientId = null;
      }
    }
  }

  /* -----------------------------------------------------------
     UTILITAIRES
     ----------------------------------------------------------- */

  /**
   * Retourne la classe CSS du tag selon le type de client.
   */
  function _typeTagClass(type) {
    if (!type) return 'tag-neutral';
    const t = type.toLowerCase();
    if (t.includes('police') || t.includes('gendarmerie')) return 'tag-blue';
    if (t.includes('armée') || t.includes('armee') || t.includes('défense')) return 'tag-green';
    if (t.includes('entreprise')) return 'tag-yellow';
    if (t.includes('collectivité') || t.includes('collectivite')) return 'tag-neutral';
    if (t.includes('sécurité') || t.includes('securite')) return 'tag-blue';
    if (t.includes('association')) return 'tag-green';
    if (t.includes('particulier')) return 'tag-yellow';
    return 'tag-neutral';
  }

  /**
   * Retourne la classe CSS du tag selon le statut de session.
   */
  function _sessionStatusTag(status) {
    const map = {
      planifiee: 'tag-blue',
      confirmee: 'tag-green',
      en_cours: 'tag-yellow',
      terminee: 'tag-neutral',
      annulee: 'tag-red'
    };
    return map[status] || 'tag-neutral';
  }

  /**
   * Formate une date ISO en format français lisible.
   */
  function _formatDate(isoDate) {
    if (!isoDate) return '—';
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return isoDate;
    }
  }

  /**
   * Échappe les caractères HTML pour éviter les injections.
   */
  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Échappe les caractères pour les attributs HTML.
   */
  function _escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* --- API publique du module --- */
  return { render };

})();
