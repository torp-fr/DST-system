/* ============================================================
   DST-SYSTEM — Vue Clients (refonte)
   Gestion enrichie : CRUD, fiche détaillée, historique sessions,
   offres, lieux d'entraînement intégrés, KPIs client.
   ============================================================ */

window.Views = window.Views || {};

Views.Clients = (() => {
  'use strict';

  /* --- État interne du module --- */
  let _container = null;
  let _searchTerm = '';
  let _filterType = '';
  let _filterCategory = '';
  let _expandedClientId = null;
  let _detailTab = 'info'; // 'info' | 'sessions' | 'offers' | 'locations'

  /* -----------------------------------------------------------
     RENDU PRINCIPAL
     ----------------------------------------------------------- */

  function render(container) {
    _container = container;
    _renderPage();
  }

  function _renderPage() {
    const clients = DB.clients.getAll();
    const settings = DB.settings.get();
    const clientTypes = settings.clientTypes || [];

    const filtered = _applyFilters(clients);

    const activeCount = clients.filter(c => c.active !== false).length;
    const inactiveCount = clients.length - activeCount;
    const b2bCount = clients.filter(c => (c.clientCategory || 'B2B') === 'B2B').length;
    const b2cCount = clients.filter(c => c.clientCategory === 'B2C').length;

    /* Chiffre d'affaires total clients actifs */
    const allSessions = DB.sessions.getAll();
    let totalRevenue = 0;
    clients.filter(c => c.active !== false).forEach(c => {
      allSessions.filter(s => (s.clientIds || []).includes(c.id) || s.clientId === c.id)
        .filter(s => s.status !== 'annulee')
        .forEach(s => { totalRevenue += (s.price || 0); });
    });

    _container.innerHTML = `
      <!-- En-tête de page -->
      <div class="page-header">
        <h1>Gestion clients</h1>
        <div class="actions">
          <button class="btn btn-primary" id="btn-add-client">+ Nouveau client</button>
        </div>
      </div>

      <!-- KPI synthèse -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total clients</div>
          <div class="kpi-value">${clients.length}</div>
          <div class="kpi-detail">${activeCount} actif${activeCount > 1 ? 's' : ''} / ${inactiveCount} inactif${inactiveCount > 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">B2B / B2C</div>
          <div class="kpi-value">${b2bCount} / ${b2cCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">CA cumulé (actifs)</div>
          <div class="kpi-value">${Engine.fmt(totalRevenue)}</div>
          <div class="kpi-detail">Toutes sessions confondues</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Lieux enregistrés</div>
          <div class="kpi-value">${DB.locations.getAll().length}</div>
        </div>
      </div>

      <!-- Barre de recherche et filtres -->
      <div class="card">
        <div class="form-row" style="align-items:flex-end;">
          <div class="form-group" style="flex:2;margin-bottom:0;">
            <div class="search-bar">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="client-search" placeholder="Rechercher par nom, contact, secteur..."
                     value="${_escapeAttr(_searchTerm)}" />
            </div>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label style="font-size:0.75rem;color:var(--text-secondary);">Type</label>
            <select class="form-control" id="client-filter-type" style="width:100%;">
              <option value="">Tous les types</option>
              ${clientTypes.map(t => `
                <option value="${_escapeAttr(t)}" ${_filterType === t ? 'selected' : ''}>${_escapeHtml(t)}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:0.6;margin-bottom:0;">
            <label style="font-size:0.75rem;color:var(--text-secondary);">Catégorie</label>
            <select class="form-control" id="client-filter-category" style="width:100%;">
              <option value="">Toutes</option>
              <option value="B2B" ${_filterCategory === 'B2B' ? 'selected' : ''}>B2B</option>
              <option value="B2C" ${_filterCategory === 'B2C' ? 'selected' : ''}>B2C</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Tableau clients -->
      <div class="card">
        ${filtered.length > 0 ? _renderTable(filtered) : `
          <div class="empty-state">
            <div class="empty-icon">&#128101;</div>
            <p>Aucun client trouvé${_searchTerm || _filterType || _filterCategory ? ' pour ces critères.' : '. Créez votre premier client.'}</p>
            ${!_searchTerm && !_filterType && !_filterCategory ? '<button class="btn btn-primary" id="btn-empty-add">+ Nouveau client</button>' : ''}
          </div>
        `}
      </div>

      <!-- Panneau détail -->
      <div id="client-detail-panel"></div>
    `;

    _bindPageEvents(clientTypes);
  }

  /* -----------------------------------------------------------
     FILTRAGE
     ----------------------------------------------------------- */

  function _applyFilters(clients) {
    let result = clients;
    if (_filterType) {
      result = result.filter(c => c.type === _filterType);
    }
    if (_filterCategory) {
      result = result.filter(c => (c.clientCategory || 'B2B') === _filterCategory);
    }
    if (_searchTerm) {
      const term = _searchTerm.toLowerCase();
      result = result.filter(c =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.contactName || '').toLowerCase().includes(term) ||
        (c.contactEmail || '').toLowerCase().includes(term) ||
        (c.type || '').toLowerCase().includes(term) ||
        (c.sector || '').toLowerCase().includes(term) ||
        (c.city || '').toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    return result;
  }

  /* -----------------------------------------------------------
     TABLEAU CLIENTS
     ----------------------------------------------------------- */

  function _renderTable(clients) {
    const allSessions = DB.sessions.getAll();
    const rows = clients.map(client => {
      const sessCount = allSessions.filter(s =>
        (s.clientIds || []).includes(client.id) || s.clientId === client.id
      ).length;
      const tagClass = _typeTagClass(client.type);
      const isExpanded = _expandedClientId === client.id;
      const locationCount = DB.locations.filter(l => l.clientId === client.id).length;

      // Profitabilité du client
      const profitability = Engine.computeClientProfitability(client.id);
      const profitabilityClass = profitability.rentabilityPercent >= 30 ? 'tag-green'
        : profitability.rentabilityPercent >= 15 ? 'tag-yellow'
        : profitability.rentabilityPercent >= 0 ? 'tag-orange'
        : 'tag-red';
      const profitabilityLabel = profitability.rentabilityPercent.toFixed(1) + '%';

      return `
        <tr class="client-row ${isExpanded ? 'active' : ''}" data-id="${client.id}" style="cursor:pointer;">
          <td>
            <strong>${_escapeHtml(client.name || '—')}</strong>
            ${client.clientCategory ? '<span class="tag ' + (client.clientCategory === 'B2B' ? 'tag-blue' : 'tag-yellow') + '" style="margin-left:6px;font-size:0.6rem;">' + client.clientCategory + '</span>' : ''}
            ${client.sector ? '<br><span class="text-muted" style="font-size:0.75rem;">' + _escapeHtml(client.sector) + '</span>' : ''}
          </td>
          <td><span class="tag ${tagClass}">${_escapeHtml(client.type || 'N/C')}</span></td>
          <td>
            ${client.contactName ? _escapeHtml(client.contactName) : '<span class="text-muted">—</span>'}
            ${client.contactEmail ? '<br><small class="text-muted">' + _escapeHtml(client.contactEmail) + '</small>' : ''}
          </td>
          <td>${_escapeHtml(client.city || '—')}</td>
          <td class="num">${sessCount}</td>
          <td class="num">${locationCount}</td>
          <td>
            <span class="tag ${profitabilityClass}">${profitabilityLabel}</span>
          </td>
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
              <th>Nom / Secteur</th>
              <th>Type</th>
              <th>Contact</th>
              <th>Ville</th>
              <th>Sessions</th>
              <th>Lieux</th>
              <th>Rentabilité</th>
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
     FICHE DÉTAIL CLIENT (onglets)
     ----------------------------------------------------------- */

  function _toggleDetail(clientId) {
    if (_expandedClientId === clientId) {
      _expandedClientId = null;
      const panel = _container.querySelector('#client-detail-panel');
      if (panel) panel.innerHTML = '';
      _container.querySelectorAll('.client-row.active').forEach(r => r.classList.remove('active'));
      return;
    }
    _expandedClientId = clientId;
    _detailTab = 'info';
    _renderDetail(clientId);
    _container.querySelectorAll('.client-row').forEach(r => {
      r.classList.toggle('active', r.dataset.id === clientId);
    });
  }

  function _renderDetail(clientId) {
    const client = DB.clients.getById(clientId);
    if (!client) return;

    const panel = _container.querySelector('#client-detail-panel');
    if (!panel) return;

    const clientSessions = DB.sessions.filter(s =>
      (s.clientIds || []).includes(clientId) || s.clientId === clientId
    );
    clientSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const clientOffers = DB.offers.filter(o =>
      (o.clientIds && o.clientIds.includes(clientId)) || (o.clientId && o.clientId === clientId)
    );

    const clientLocations = DB.locations.filter(l => l.clientId === clientId);
    const clientSubscriptions = DB.clientSubscriptions.filter(s => s.clientId === clientId);

    const stats = _computeClientStats(clientSessions);

    const tabs = [
      { key: 'info', label: 'Informations' },
      { key: 'sessions', label: 'Sessions (' + clientSessions.length + ')' },
      { key: 'offers', label: 'Offres (' + clientOffers.length + ')' },
      { key: 'subscriptions', label: 'Abonnements (' + clientSubscriptions.length + ')' },
      { key: 'locations', label: 'Lieux (' + clientLocations.length + ')' }
    ];

    panel.innerHTML = `
      <div class="card mt-16" id="detail-card">
        <div class="card-header">
          <h2>Fiche client : ${_escapeHtml(client.name)}</h2>
          <button class="btn btn-sm" id="btn-close-detail">Fermer</button>
        </div>

        <!-- KPI client -->
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
          <div class="kpi-card">
            <div class="kpi-label">Sessions</div>
            <div class="kpi-value">${stats.totalSessions}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">CA facturé</div>
            <div class="kpi-value">${Engine.fmt(stats.totalSpent)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Coût moyen / session</div>
            <div class="kpi-value">${stats.totalSessions > 0 ? Engine.fmt(stats.avgSessionCost) : '—'}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Offres actives</div>
            <div class="kpi-value">${clientOffers.filter(o => o.active !== false).length}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Lieux</div>
            <div class="kpi-value">${clientLocations.length}</div>
          </div>
        </div>

        <!-- Onglets -->
        <div class="tabs mt-16" id="detail-tabs">
          ${tabs.map(t => `
            <button class="tab-btn ${_detailTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>
          `).join('')}
        </div>

        <!-- Contenu onglet -->
        <div id="detail-tab-content" style="margin-top:16px;">
          ${_renderDetailTabContent(client, clientSessions, clientOffers, clientLocations, clientSubscriptions, stats)}
        </div>
      </div>
    `;

    /* Écouteurs onglets */
    panel.querySelectorAll('#detail-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _detailTab = btn.dataset.tab;
        _renderDetail(clientId);
      });
    });

    panel.querySelector('#btn-close-detail').addEventListener('click', () => _toggleDetail(clientId));

    /* Bouton ajouter lieu */
    const btnAddLoc = panel.querySelector('#btn-add-location');
    if (btnAddLoc) {
      btnAddLoc.addEventListener('click', () => _openLocationModal(null, clientId));
    }

    /* Actions lieux */
    panel.querySelectorAll('.btn-edit-loc').forEach(btn => {
      btn.addEventListener('click', () => {
        const loc = DB.locations.getById(btn.dataset.id);
        if (loc) _openLocationModal(loc, clientId);
      });
    });
    panel.querySelectorAll('.btn-delete-loc').forEach(btn => {
      btn.addEventListener('click', () => {
        const loc = DB.locations.getById(btn.dataset.id);
        if (loc && confirm('Supprimer le lieu "' + (loc.name || '') + '" ?')) {
          DB.locations.delete(loc.id);
          _renderDetail(clientId);
          Toast.show('Lieu supprimé.', 'warning');
        }
      });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _renderDetailTabContent(client, sessions, offers, locations, subscriptions, stats) {
    switch (_detailTab) {
      case 'sessions': return _renderDetailSessions(client, sessions);
      case 'offers': return _renderDetailOffers(client, offers);
      case 'subscriptions': return _renderDetailSubscriptions(client, subscriptions);
      case 'locations': return _renderDetailLocations(client, locations);
      default: return _renderDetailInfo(client);
    }
  }

  /* --- Onglet Informations --- */
  function _renderDetailInfo(client) {
    const profitability = Engine.computeClientProfitability(client.id);

    function profitabilityCardClass(percent) {
      if (percent >= 30) return 'kpi-success';
      if (percent >= 15) return 'kpi-success';
      if (percent >= 0) return 'kpi-warning';
      return 'kpi-alert';
    }

    const profitabilityHTML = `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:0.95rem;font-weight:600;color:var(--text-heading);margin-bottom:12px;">📊 Rentabilité</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="kpi-card ${profitabilityCardClass(profitability.rentabilityPercent)}">
            <div class="kpi-label">Rentabilité</div>
            <div class="kpi-value">${Engine.fmtPercent(profitability.rentabilityPercent)}</div>
            <div class="kpi-detail">${profitability.status}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Sessions complétées</div>
            <div class="kpi-value">${profitability.completedSessions} / ${profitability.totalSessions}</div>
            <div class="kpi-detail">CA: ${Engine.fmt(profitability.totalRevenue)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Résultat net</div>
            <div class="kpi-value ${profitability.netResult >= 0 ? 'text-green' : 'text-red'}">${Engine.fmt(profitability.netResult)}</div>
            <div class="kpi-detail">Marge moy: ${profitability.avgMargin.toFixed(1)}€</div>
          </div>
        </div>
      </div>
    `;

    return profitabilityHTML + `
      <table class="data-table" style="font-size:0.85rem;">
        <tbody>
          <tr><td class="text-muted" style="width:160px;">Type</td><td><span class="tag ${_typeTagClass(client.type)}">${_escapeHtml(client.type || 'N/C')}</span></td></tr>
          <tr><td class="text-muted">Catégorie</td><td><span class="tag ${client.clientCategory === 'B2C' ? 'tag-yellow' : 'tag-blue'}">${_escapeHtml(client.clientCategory || 'B2B')}</span> <small class="text-muted">${client.clientCategory === 'B2C' ? 'Tarifs TTC' : 'Tarifs HT'}</small></td></tr>
          <tr><td class="text-muted">Secteur d'activité</td><td>${_escapeHtml(client.sector || '—')}</td></tr>
          <tr><td class="text-muted">Contact principal</td><td>${_escapeHtml(client.contactName || '—')}</td></tr>
          <tr><td class="text-muted">Email</td><td>${client.contactEmail ? '<a href="mailto:' + _escapeAttr(client.contactEmail) + '">' + _escapeHtml(client.contactEmail) + '</a>' : '—'}</td></tr>
          <tr><td class="text-muted">Téléphone</td><td>${_escapeHtml(client.contactPhone || '—')}</td></tr>
          <tr><td class="text-muted">Site web</td><td>${client.website ? '<a href="' + _escapeAttr(client.website) + '" target="_blank">' + _escapeHtml(client.website) + '</a>' : '—'}</td></tr>
          <tr><td class="text-muted">Adresse</td><td>${_escapeHtml(client.address || '—')}${client.city ? ', ' + _escapeHtml(client.city) : ''}${client.postalCode ? ' ' + _escapeHtml(client.postalCode) : ''}</td></tr>
          <tr><td class="text-muted">SIRET</td><td><span class="text-mono">${_escapeHtml(client.siret || '—')}</span></td></tr>
          <tr><td class="text-muted">Conditions de paiement</td><td>${_escapeHtml(client.paymentTerms || '—')}</td></tr>
          <tr><td class="text-muted">Priorité</td><td>${_renderPriority(client.priority)}</td></tr>
          <tr><td class="text-muted">Statut</td><td>${client.active !== false ? '<span class="tag tag-green">Actif</span>' : '<span class="tag tag-neutral">Inactif</span>'}</td></tr>
          ${client.notes ? '<tr><td class="text-muted">Notes</td><td style="white-space:pre-line;">' + _escapeHtml(client.notes) + '</td></tr>' : ''}
        </tbody>
      </table>
    `;
  }

  /* --- Onglet Sessions --- */
  function _renderDetailSessions(client, sessions) {
    if (sessions.length === 0) {
      return '<div class="empty-state" style="padding:24px;"><p class="text-muted">Aucune session enregistrée pour ce client.</p></div>';
    }
    return `
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
            ${sessions.map(s => {
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
    `;
  }

  /* --- Onglet Offres --- */
  function _renderDetailOffers(client, offers) {
    if (offers.length === 0) {
      return '<div class="empty-state" style="padding:24px;"><p class="text-muted">Aucune offre liée à ce client.</p></div>';
    }
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Intitulé</th>
              <th>Type</th>
              <th class="text-right">Nb sessions</th>
              <th class="text-right">Prix</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${offers.map(o => {
              const typeLabel = Engine.offerTypeLabel ? Engine.offerTypeLabel(o.type) : (o.type || '—');
              const isActive = o.active !== false;
              return `
                <tr>
                  <td>${_escapeHtml(o.label || o.name || '—')}</td>
                  <td><span class="tag tag-blue">${_escapeHtml(typeLabel)}</span></td>
                  <td class="num">${o.nbSessions || '—'}</td>
                  <td class="num">${Engine.fmt(o.price || 0)}</td>
                  <td>${isActive ? '<span class="tag tag-green">Active</span>' : '<span class="tag tag-neutral">Inactive</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* --- Onglet Abonnements clients --- */
  function _renderDetailSubscriptions(client, subscriptions) {
    let html = `
      <div class="flex-between mb-16">
        <span class="text-muted">${subscriptions.length} abonnement(s) personnalisé(s)</span>
        <button class="btn btn-sm btn-primary" id="btn-add-subscription">+ Nouvel abonnement</button>
      </div>
    `;

    if (subscriptions.length === 0) {
      html += '<div class="empty-state" style="padding:24px;"><p class="text-muted">Aucun abonnement personnalisé. Créez un abonnement pour parametrer une offre avec ce client.</p></div>';
      return html;
    }

    html += `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Offre</th>
              <th>Participants</th>
              <th>Rythme</th>
              <th class="text-right">Prix HT/an</th>
              <th class="text-right">Jours/an</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${subscriptions.map(sub => {
              const offer = DB.offers.getById(sub.offerId);
              const offerLabel = offer ? (offer.label || '(sans nom)') : '(offre supprimée)';
              const rhythmLabels = { 'mensuel': 'Mensuel', 'bimensuel': 'Bimensuel', 'hebdomadaire': 'Hebdomadaire', 'trimestriel': 'Trimestriel' };
              const rhythmLabel = rhythmLabels[sub.rythme] || sub.rythme || '—';

              return `
                <tr>
                  <td><strong>${_escapeHtml(offerLabel)}</strong></td>
                  <td class="num">${sub.participants || 1}</td>
                  <td><small>${_escapeHtml(rhythmLabel)}</small></td>
                  <td class="num">${Engine.fmt(sub.prixPersonnalise || 0)}</td>
                  <td class="num">${sub.volumeJours || '—'}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-edit-sub" data-id="${sub.id}" data-client="${client.id}" title="Modifier">&#9998;</button>
                    <button class="btn btn-sm btn-delete-sub" data-id="${sub.id}" title="Supprimer">&#128465;</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    setTimeout(() => {
      const btnAdd = _container.querySelector('#btn-add-subscription');
      if (btnAdd) {
        btnAdd.addEventListener('click', () => _openSubscriptionModal(null, client.id));
      }
      _container.querySelectorAll('.btn-edit-sub').forEach(btn => {
        btn.addEventListener('click', () => {
          const sub = DB.clientSubscriptions.getById(btn.dataset.id);
          if (sub) _openSubscriptionModal(sub, client.id);
        });
      });
      _container.querySelectorAll('.btn-delete-sub').forEach(btn => {
        btn.addEventListener('click', () => {
          const sub = DB.clientSubscriptions.getById(btn.dataset.id);
          if (sub && confirm('Supprimer cet abonnement ?')) {
            DB.clientSubscriptions.delete(sub.id);
            _renderDetail(_expandedClientId);
            Toast.show('Abonnement supprimé.', 'warning');
          }
        });
      });
    }, 0);

    return html;
  }

  /* --- Lieux --- */
  function _renderDetailLocations(client, locations) {
    let html = `
      <div class="flex-between mb-16">
        <span class="text-muted">${locations.length} lieu(x) associé(s)</span>
        <button class="btn btn-sm btn-primary" id="btn-add-location">+ Ajouter un lieu</button>
      </div>
    `;

    if (locations.length === 0) {
      html += '<div class="empty-state" style="padding:24px;"><p class="text-muted">Aucun lieu enregistré pour ce client. Ajoutez un lieu d\'entraînement.</p></div>';
      return html;
    }

    html += `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Ville</th>
              <th>Type</th>
              <th>Capacité</th>
              <th class="text-right">Coût / session</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${locations.map(l => `
              <tr>
                <td>
                  <strong>${_escapeHtml(l.name || '—')}</strong>
                  ${l.address ? '<br><span class="text-muted" style="font-size:0.75rem;">' + _escapeHtml(l.address) + '</span>' : ''}
                </td>
                <td>${_escapeHtml(l.city || '—')}</td>
                <td>${l.type ? '<span class="tag tag-neutral">' + _escapeHtml(l.type) + '</span>' : '—'}</td>
                <td class="num">${l.capacity || '—'}</td>
                <td class="num">${l.costPerSession ? Engine.fmt(l.costPerSession) : '—'}</td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-edit-loc" data-id="${l.id}" title="Modifier">&#9998;</button>
                  <button class="btn btn-sm btn-delete-loc" data-id="${l.id}" title="Supprimer">&#128465;</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  function _computeClientStats(sessions) {
    let totalSpent = 0;
    const validSessions = sessions.filter(s => s.status !== 'annulee');
    validSessions.forEach(s => { totalSpent += (s.price || 0); });
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
     MODAL FORMULAIRE CLIENT (CRÉER / MODIFIER)
     ----------------------------------------------------------- */

  function _openFormModal(client) {
    const isEdit = !!client;
    const settings = DB.settings.get();
    const clientTypes = settings.clientTypes || [];
    const c = client || {};
    const allSubscriptions = DB.clientSubscriptions.getAll();

    const isCustomType = c.type && !clientTypes.includes(c.type);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'client-modal-overlay';

    overlay.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier le client' : 'Nouveau client'}</h2>
          <button class="btn btn-sm btn-ghost" id="btn-modal-close">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Identité -->
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

          <div class="form-group ${isCustomType ? '' : 'hidden'}" id="custom-type-group">
            <label for="client-type-custom">Type personnalisé</label>
            <input type="text" class="form-control" id="client-type-custom"
                   value="${isCustomType ? _escapeAttr(c.type) : ''}" placeholder="Saisissez un type..." />
          </div>

          <!-- Catégorie et secteur -->
          <div class="form-row">
            <div class="form-group">
              <label>Catégorie de facturation</label>
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
            </div>
            <div class="form-group">
              <label for="client-sector">Secteur d'activité</label>
              <input type="text" class="form-control" id="client-sector"
                     value="${_escapeAttr(c.sector || '')}" placeholder="Ex : Défense, Sécurité privée, Formation..." />
            </div>
          </div>

          <!-- Contact -->
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
              <label for="client-website">Site web</label>
              <input type="url" class="form-control" id="client-website"
                     value="${_escapeAttr(c.website || '')}" placeholder="https://..." />
            </div>
          </div>

          <!-- Adresse -->
          <div class="form-group">
            <label for="client-address">Adresse</label>
            <input type="text" class="form-control" id="client-address"
                   value="${_escapeAttr(c.address || '')}" placeholder="Adresse complète" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="client-city">Ville</label>
              <input type="text" class="form-control" id="client-city"
                     value="${_escapeAttr(c.city || '')}" placeholder="Ville" />
            </div>
            <div class="form-group">
              <label for="client-postal-code">Code postal</label>
              <input type="text" class="form-control" id="client-postal-code"
                     value="${_escapeAttr(c.postalCode || '')}" placeholder="75000" />
            </div>
            <div class="form-group">
              <label for="client-siret">SIRET</label>
              <input type="text" class="form-control" id="client-siret"
                     value="${_escapeAttr(c.siret || '')}" placeholder="123 456 789 00012" />
            </div>
          </div>

          <!-- Commercial -->
          <div class="form-row">
            <div class="form-group">
              <label for="client-payment-terms">Conditions de paiement</label>
              <select class="form-control" id="client-payment-terms">
                <option value="" ${!c.paymentTerms ? 'selected' : ''}>Non renseigné</option>
                <option value="comptant" ${c.paymentTerms === 'comptant' ? 'selected' : ''}>Comptant</option>
                <option value="30j" ${c.paymentTerms === '30j' ? 'selected' : ''}>30 jours</option>
                <option value="45j" ${c.paymentTerms === '45j' ? 'selected' : ''}>45 jours fin de mois</option>
                <option value="60j" ${c.paymentTerms === '60j' ? 'selected' : ''}>60 jours</option>
                <option value="autre" ${c.paymentTerms === 'autre' ? 'selected' : ''}>Autre</option>
              </select>
            </div>
            <div class="form-group">
              <label for="client-priority">Priorité</label>
              <select class="form-control" id="client-priority">
                <option value="" ${!c.priority ? 'selected' : ''}>Non définie</option>
                <option value="haute" ${c.priority === 'haute' ? 'selected' : ''}>Haute</option>
                <option value="normale" ${c.priority === 'normale' ? 'selected' : ''}>Normale</option>
                <option value="basse" ${c.priority === 'basse' ? 'selected' : ''}>Basse</option>
              </select>
            </div>
          </div>

          <!-- Abonnement/Plan -->
          <div class="form-row">
            <div class="form-group">
              <label for="client-subscription">Abonnement / Plan principal</label>
              <select class="form-control" id="client-subscription">
                <option value="">-- Aucun abonnement --</option>
                ${allSubscriptions.map(sub => {
                  const offer = DB.offers.getById(sub.offerId);
                  const offerLabel = offer ? (offer.label || '(sans nom)') : '(offre supprimée)';
                  return `<option value="${sub.id}" ${c.primarySubscriptionId === sub.id ? 'selected' : ''}>${_escapeHtml(offerLabel)} — ${sub.participants} pers. — ${sub.rythme}</option>`;
                }).join('')}
              </select>
              <span class="form-help text-muted">Sélectionnez l'abonnement personnalisé auquel ce client a souscrit</span>
            </div>
          </div>

          <!-- Notes -->
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

    /* Type personnalisé */
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

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('#btn-modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    /* Sauvegarder */
    overlay.querySelector('#btn-modal-save').addEventListener('click', () => {
      const name = overlay.querySelector('#client-name').value.trim();
      if (!name) {
        overlay.querySelector('#client-name').style.borderColor = 'var(--accent-red)';
        overlay.querySelector('#client-name').focus();
        return;
      }

      let type = selectType.value;
      if (type === '__custom') {
        type = overlay.querySelector('#client-type-custom').value.trim() || 'Autre';
      }

      const clientCategory = (overlay.querySelector('input[name="clientCategory"]:checked') || {}).value || 'B2B';

      const data = {
        name,
        type,
        clientCategory,
        sector: overlay.querySelector('#client-sector').value.trim(),
        contactName: overlay.querySelector('#client-contact-name').value.trim(),
        contactEmail: overlay.querySelector('#client-contact-email').value.trim(),
        contactPhone: overlay.querySelector('#client-contact-phone').value.trim(),
        website: overlay.querySelector('#client-website').value.trim(),
        address: overlay.querySelector('#client-address').value.trim(),
        city: overlay.querySelector('#client-city').value.trim(),
        postalCode: overlay.querySelector('#client-postal-code').value.trim(),
        siret: overlay.querySelector('#client-siret').value.trim(),
        paymentTerms: overlay.querySelector('#client-payment-terms').value,
        priority: overlay.querySelector('#client-priority').value,
        primarySubscriptionId: overlay.querySelector('#client-subscription').value || null,
        notes: overlay.querySelector('#client-notes').value.trim(),
        active: overlay.querySelector('#client-active').checked
      };

      if (isEdit) {
        DB.clients.update(client.id, data);
        Toast.show('Client \u00ab ' + data.name + ' \u00bb mis \u00e0 jour.', 'success');
      } else {
        DB.clients.create(data);
        Toast.show('Client \u00ab ' + data.name + ' \u00bb cr\u00e9\u00e9.', 'success');
      }

      closeModal();
      if (isEdit && _expandedClientId === client.id) {
        _expandedClientId = client.id;
      }
      _renderPage();
    });

    overlay.querySelector('#client-name').focus();
  }

  /* -----------------------------------------------------------
     MODAL LIEU D'ENTRAÎNEMENT (CRÉER / MODIFIER)
     ----------------------------------------------------------- */

  function _openLocationModal(location, clientId) {
    const isEdit = !!location;
    const l = location || {};
    const allModules = DB.modules.getAll();
    const compatibleIds = l.compatibleModuleIds || [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'location-modal-overlay';

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier le lieu' : 'Nouveau lieu d\'entra\u00eenement'}</h2>
          <button class="btn btn-sm btn-ghost" id="btn-loc-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label for="loc-name">Nom du lieu *</label>
              <input type="text" class="form-control" id="loc-name"
                     value="${_escapeAttr(l.name || '')}" placeholder="Ex : Stand Alpha" required />
            </div>
            <div class="form-group">
              <label for="loc-type">Type</label>
              <select class="form-control" id="loc-type">
                <option value="" ${!l.type ? 'selected' : ''}>Non d\u00e9fini</option>
                <option value="stand_tir" ${l.type === 'stand_tir' ? 'selected' : ''}>Stand de tir</option>
                <option value="terrain" ${l.type === 'terrain' ? 'selected' : ''}>Terrain ext\u00e9rieur</option>
                <option value="salle" ${l.type === 'salle' ? 'selected' : ''}>Salle</option>
                <option value="site_urbain" ${l.type === 'site_urbain' ? 'selected' : ''}>Site urbain</option>
                <option value="autre" ${l.type === 'autre' ? 'selected' : ''}>Autre</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="loc-address">Adresse</label>
            <input type="text" class="form-control" id="loc-address"
                   value="${_escapeAttr(l.address || '')}" placeholder="Adresse compl\u00e8te" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="loc-city">Ville</label>
              <input type="text" class="form-control" id="loc-city"
                     value="${_escapeAttr(l.city || '')}" placeholder="Ville" />
            </div>
            <div class="form-group">
              <label for="loc-capacity">Capacit\u00e9 (personnes)</label>
              <input type="number" class="form-control" id="loc-capacity"
                     value="${l.capacity || ''}" min="0" step="1" placeholder="Ex : 20" />
            </div>
            <div class="form-group">
              <label for="loc-cost">Co\u00fbt / session (\u20ac)</label>
              <input type="number" class="form-control" id="loc-cost"
                     value="${l.costPerSession || ''}" min="0" step="any" placeholder="0" />
            </div>
          </div>

          <div class="form-group">
            <label for="loc-contact">Contact sur place</label>
            <input type="text" class="form-control" id="loc-contact"
                   value="${_escapeAttr(l.contactName || '')}" placeholder="Nom + t\u00e9l\u00e9phone" />
          </div>

          <div class="form-group">
            <label for="loc-equipment">\u00c9quipements disponibles</label>
            <textarea class="form-control" id="loc-equipment" rows="2"
                      placeholder="Cibles, simulateurs, protections...">${_escapeHtml(l.equipmentAvailable || '')}</textarea>
          </div>

          ${allModules.length > 0 ? `
          <div class="form-group">
            <label>Modules compatibles</label>
            <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;">
              ${allModules.map(m => `
                <label class="form-check" style="margin-bottom:4px;">
                  <input type="checkbox" name="loc-modules" value="${m.id}" ${compatibleIds.includes(m.id) ? 'checked' : ''} />
                  <span>${_escapeHtml(m.name || m.id)}</span>
                </label>
              `).join('')}
            </div>
          </div>` : ''}

          <div class="form-group">
            <label for="loc-notes">Notes</label>
            <textarea class="form-control" id="loc-notes" rows="2"
                      placeholder="Acc\u00e8s, restrictions, horaires...">${_escapeHtml(l.notes || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-check">
              <input type="checkbox" id="loc-active" ${l.active !== false ? 'checked' : ''} />
              Lieu actif
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="btn-loc-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-loc-save">${isEdit ? 'Enregistrer' : 'Cr\u00e9er'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-loc-close').addEventListener('click', closeModal);
    overlay.querySelector('#btn-loc-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelector('#btn-loc-save').addEventListener('click', () => {
      const name = overlay.querySelector('#loc-name').value.trim();
      if (!name) {
        overlay.querySelector('#loc-name').style.borderColor = 'var(--accent-red)';
        overlay.querySelector('#loc-name').focus();
        return;
      }

      const compatibleModuleIds = [];
      overlay.querySelectorAll('input[name="loc-modules"]:checked').forEach(cb => {
        compatibleModuleIds.push(cb.value);
      });

      const data = {
        name,
        clientId: clientId,
        type: overlay.querySelector('#loc-type').value,
        address: overlay.querySelector('#loc-address').value.trim(),
        city: overlay.querySelector('#loc-city').value.trim(),
        capacity: parseInt(overlay.querySelector('#loc-capacity').value, 10) || 0,
        costPerSession: parseFloat(overlay.querySelector('#loc-cost').value) || 0,
        contactName: overlay.querySelector('#loc-contact').value.trim(),
        equipmentAvailable: overlay.querySelector('#loc-equipment').value.trim(),
        compatibleModuleIds,
        notes: overlay.querySelector('#loc-notes').value.trim(),
        active: overlay.querySelector('#loc-active').checked
      };

      if (isEdit) {
        DB.locations.update(location.id, data);
        Toast.show('Lieu \u00ab ' + name + ' \u00bb mis \u00e0 jour.', 'success');
      } else {
        DB.locations.create(data);
        Toast.show('Lieu \u00ab ' + name + ' \u00bb cr\u00e9\u00e9.', 'success');
      }

      closeModal();
      _renderDetail(clientId);
    });

    overlay.querySelector('#loc-name').focus();
  }

  /* --- Modal Abonnement Client --- */
  function _openSubscriptionModal(subscription, clientId) {
    const isEdit = !!subscription;
    const s = subscription || {};
    const allOffers = DB.offers.getAll().filter(o => o.active !== false);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'subscription-modal-overlay';

    const rhythms = [
      { value: 'mensuel', label: 'Mensuel (12 sessions/an)' },
      { value: 'bimensuel', label: 'Bimensuel (6 sessions/an)' },
      { value: 'hebdomadaire', label: 'Hebdomadaire (52 sessions/an)' },
      { value: 'trimestriel', label: 'Trimestriel (4 sessions/an)' }
    ];

    function calculateVolume() {
      const rhythmVal = overlay.querySelector('#sub-rythme').value;
      const volumeMap = { 'mensuel': 12, 'bimensuel': 6, 'hebdomadaire': 52, 'trimestriel': 4 };
      const sessions = volumeMap[rhythmVal] || 0;
      return sessions;
    }

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier l\'abonnement' : 'Nouvel abonnement personnalis\u00e9'}</h2>
          <button class="btn btn-sm btn-ghost" id="btn-sub-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label for="sub-offer">Offre *</label>
              <select class="form-control" id="sub-offer" required>
                <option value="">-- S\u00e9lectionner une offre --</option>
                ${allOffers.map(o => `
                  <option value="${o.id}" ${s.offerId === o.id ? 'selected' : ''}>${_escapeHtml(o.label || '(sans nom)')}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="sub-participants">Nombre de participants</label>
              <input type="number" class="form-control" id="sub-participants" min="1" step="1"
                     value="${s.participants || 1}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="sub-rythme">Rythme de formation *</label>
              <select class="form-control" id="sub-rythme" required>
                ${rhythms.map(r => `
                  <option value="${r.value}" ${s.rythme === r.value ? 'selected' : ''}>${r.label}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="sub-volume">Sessions/an (calcul\u00e9)</label>
              <input type="number" class="form-control" id="sub-volume" disabled
                     value="${calculateVolume()}" />
            </div>
          </div>

          <div class="form-group">
            <label for="sub-prix">Prix HT/an personnalis\u00e9 (\u20ac) *</label>
            <input type="number" class="form-control" id="sub-prix" min="0" step="any"
                   value="${s.prixPersonnalise || ''}" placeholder="0" required />
            <span class="form-help text-muted">Laissez vide pour utiliser le prix de l'offre</span>
          </div>

          <div class="form-group">
            <label for="sub-notes">Notes / Conditions particuli\u00e8res</label>
            <textarea class="form-control" id="sub-notes" rows="3"
                      placeholder="Ex : Formation avanc\u00e9e, r\u00e9ductions volume...">${_escapeHtml(s.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="btn-sub-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-sub-save">${isEdit ? 'Enregistrer' : 'Cr\u00e9er'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const rythmeSelect = overlay.querySelector('#sub-rythme');
    const volumeInput = overlay.querySelector('#sub-volume');
    rythmeSelect.addEventListener('change', () => {
      volumeInput.value = calculateVolume();
    });

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-sub-close').addEventListener('click', closeModal);
    overlay.querySelector('#btn-sub-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelector('#btn-sub-save').addEventListener('click', () => {
      const offerId = overlay.querySelector('#sub-offer').value.trim();
      if (!offerId) {
        alert('V\u00e9uill\u00e9z s\u00e9lectionner une offre.');
        overlay.querySelector('#sub-offer').focus();
        return;
      }

      const prix = parseFloat(overlay.querySelector('#sub-prix').value);
      if (isNaN(prix) || prix <= 0) {
        alert('Le prix doit \u00eatre un nombre positif.');
        overlay.querySelector('#sub-prix').focus();
        return;
      }

      const volumeJours = calculateVolume();
      const data = {
        clientId: clientId,
        offerId: offerId,
        participants: parseInt(overlay.querySelector('#sub-participants').value, 10) || 1,
        rythme: overlay.querySelector('#sub-rythme').value,
        prixPersonnalise: prix,
        volumeJours: volumeJours,
        notes: overlay.querySelector('#sub-notes').value.trim()
      };

      if (isEdit) {
        DB.clientSubscriptions.update(subscription.id, data);
        Toast.show('Abonnement mis \u00e0 jour.', 'success');
      } else {
        DB.clientSubscriptions.create(data);
        Toast.show('Abonnement cr\u00e9\u00e9.', 'success');
      }

      closeModal();
      _renderDetail(clientId);
    });

    overlay.querySelector('#sub-offer').focus();
  }

  /* -----------------------------------------------------------
     SUPPRESSION CLIENT
     ----------------------------------------------------------- */

  function _confirmDelete(clientId) {
    const client = DB.clients.getById(clientId);
    if (!client) return;

    const linkedSessions = DB.sessions.filter(s =>
      (s.clientIds || []).includes(clientId) || s.clientId === clientId
    );
    const linkedLocations = DB.locations.filter(l => l.clientId === clientId);

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
              <span>Ce client est li\u00e9 \u00e0 <strong>${linkedSessions.length}</strong> session(s).</span>
            </div>
          ` : ''}
          ${linkedLocations.length > 0 ? `
            <div class="alert alert-warning mt-8">
              <span class="alert-icon">&#9888;</span>
              <span><strong>${linkedLocations.length}</strong> lieu(x) associ\u00e9(s) seront \u00e9galement supprim\u00e9(s).</span>
            </div>
          ` : ''}
          <p class="text-muted mt-8">Cette action est irr\u00e9versible.</p>
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
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelector('#btn-del-confirm').addEventListener('click', () => {
      const name = client.name || '';
      /* Supprimer les lieux associés */
      linkedLocations.forEach(l => DB.locations.delete(l.id));
      DB.clients.delete(clientId);
      if (_expandedClientId === clientId) _expandedClientId = null;
      closeModal();
      _renderPage();
      Toast.show('Client \u00ab ' + name + ' \u00bb supprim\u00e9.', 'warning');
    });
  }

  /* -----------------------------------------------------------
     ATTACHEMENT DES ÉVÉNEMENTS
     ----------------------------------------------------------- */

  function _bindPageEvents(clientTypes) {
    const btnAdd = _container.querySelector('#btn-add-client');
    if (btnAdd) btnAdd.addEventListener('click', () => _openFormModal(null));

    const btnEmptyAdd = _container.querySelector('#btn-empty-add');
    if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => _openFormModal(null));

    const searchInput = _container.querySelector('#client-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _searchTerm = e.target.value;
        _renderPage();
        const newInput = _container.querySelector('#client-search');
        if (newInput) { newInput.focus(); newInput.setSelectionRange(newInput.value.length, newInput.value.length); }
      });
    }

    const filterType = _container.querySelector('#client-filter-type');
    if (filterType) {
      filterType.addEventListener('change', (e) => { _filterType = e.target.value; _renderPage(); });
    }

    const filterCategory = _container.querySelector('#client-filter-category');
    if (filterCategory) {
      filterCategory.addEventListener('change', (e) => { _filterCategory = e.target.value; _renderPage(); });
    }

    _container.querySelectorAll('.client-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit-client') || e.target.closest('.btn-delete-client')) return;
        _toggleDetail(row.dataset.id);
      });
    });

    _container.querySelectorAll('.btn-edit-client').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const client = DB.clients.getById(btn.dataset.id);
        if (client) _openFormModal(client);
      });
    });

    _container.querySelectorAll('.btn-delete-client').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _confirmDelete(btn.dataset.id);
      });
    });

    if (_expandedClientId) {
      const exists = DB.clients.getById(_expandedClientId);
      if (exists) { _renderDetail(_expandedClientId); } else { _expandedClientId = null; }
    }
  }

  /* -----------------------------------------------------------
     UTILITAIRES
     ----------------------------------------------------------- */

  function _typeTagClass(type) {
    if (!type) return 'tag-neutral';
    const t = type.toLowerCase();
    if (t.includes('police') || t.includes('gendarmerie')) return 'tag-blue';
    if (t.includes('arm\u00e9e') || t.includes('armee') || t.includes('d\u00e9fense')) return 'tag-green';
    if (t.includes('entreprise')) return 'tag-yellow';
    if (t.includes('collectivit\u00e9') || t.includes('collectivite')) return 'tag-neutral';
    if (t.includes('s\u00e9curit\u00e9') || t.includes('securite')) return 'tag-blue';
    if (t.includes('association')) return 'tag-green';
    if (t.includes('particulier')) return 'tag-yellow';
    return 'tag-neutral';
  }

  function _sessionStatusTag(status) {
    const map = { planifiee: 'tag-blue', confirmee: 'tag-green', en_cours: 'tag-yellow', terminee: 'tag-neutral', annulee: 'tag-red' };
    return map[status] || 'tag-neutral';
  }

  function _renderPriority(priority) {
    if (!priority) return '<span class="text-muted">Non d\u00e9finie</span>';
    const map = {
      haute: '<span class="tag tag-red">Haute</span>',
      normale: '<span class="tag tag-blue">Normale</span>',
      basse: '<span class="tag tag-neutral">Basse</span>'
    };
    return map[priority] || '<span class="tag tag-neutral">' + _escapeHtml(priority) + '</span>';
  }

  function _formatDate(isoDate) {
    if (!isoDate) return '\u2014';
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return isoDate; }
  }

  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function _escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render };

})();
