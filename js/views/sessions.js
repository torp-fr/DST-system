/* ============================================================
   DST-SYSTEM — Vue Planning
   Planification simple : date + client + module + opérateur.
   Vue calendrier mensuel + liste, formulaire minimaliste.
   ============================================================ */

window.Views = window.Views || {};

Views.Sessions = (() => {
  'use strict';

  let _container = null;

  /* --- État du calendrier --- */
  let _viewYear  = new Date().getFullYear();
  let _viewMonth = new Date().getMonth(); // 0-indexed
  let _selectedDate = null;               // 'YYYY-MM-DD' ou null
  let _viewMode = 'calendar';             // 'calendar' | 'annual' | 'list'
  let _filterStatus = '';

  /* --- Constantes --- */
  const STATUS_OPTIONS = [
    { value: 'planifiee', label: 'Planifi\u00e9e',  tag: 'tag-blue' },
    { value: 'confirmee', label: 'Confirm\u00e9e',  tag: 'tag-green' },
    { value: 'en_cours',  label: 'En cours',        tag: 'tag-yellow' },
    { value: 'terminee',  label: 'Termin\u00e9e',   tag: 'tag-neutral' },
    { value: 'annulee',   label: 'Annul\u00e9e',    tag: 'tag-red' }
  ];

  const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const MONTHS_FR = [
    'Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin',
    'Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'
  ];

  /* === POINT D'ENTR\u00c9E === */
  function render(container) {
    _container = container;
    _renderPage();
  }

  /* === RENDU PRINCIPAL === */
  function _renderPage() {
    const sessions = DB.sessions.getAll();
    const today = new Date();
    const todayStr = _isoDate(today);

    /* KPI rapides */
    const thisMonth = sessions.filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d.getFullYear() === _viewYear && d.getMonth() === _viewMonth;
    });
    const upcoming = sessions.filter(s => s.date >= todayStr && s.status !== 'annulee')
      .sort((a, b) => a.date.localeCompare(b.date));
    const confirmedThisMonth = thisMonth.filter(s => s.status === 'confirmee' || s.status === 'en_cours').length;

    _container.innerHTML = `
      <div class="page-header">
        <h1>Planning</h1>
        <div class="actions">
          <button class="btn btn-sm ${_viewMode === 'annual' ? 'btn-primary' : ''}" id="btn-view-annual">Vue annuelle</button>
          <button class="btn btn-sm ${_viewMode === 'calendar' ? 'btn-primary' : ''}" id="btn-view-cal">Calendrier</button>
          <button class="btn btn-sm ${_viewMode === 'list' ? 'btn-primary' : ''}" id="btn-view-list">Liste</button>
          <button class="btn btn-primary" id="btn-add-session">+ Planifier</button>
        </div>
      </div>

      <!-- KPI -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">${MONTHS_FR[_viewMonth]} ${_viewYear}</div>
          <div class="kpi-value">${thisMonth.length}</div>
          <div class="kpi-detail">session${thisMonth.length > 1 ? 's' : ''} ce mois</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Confirm\u00e9es / En cours</div>
          <div class="kpi-value">${confirmedThisMonth}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Prochaine session</div>
          <div class="kpi-value" style="font-size:1rem;">${upcoming.length > 0 ? _formatDateFr(upcoming[0].date) : '\u2014'}</div>
          <div class="kpi-detail">${upcoming.length > 0 ? _esc(upcoming[0].label || _clientName(upcoming[0].clientIds)) : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">\u00c0 venir</div>
          <div class="kpi-value">${upcoming.length}</div>
        </div>
      </div>

      <!-- Contenu : calendrier ou liste -->
      <div id="planning-content">
        ${_viewMode === 'annual' ? _renderAnnual(sessions) : (_viewMode === 'calendar' ? _renderCalendar(sessions) : _renderList(sessions))}
      </div>

      <!-- D\u00e9tail du jour s\u00e9lectionn\u00e9 -->
      ${_viewMode === 'calendar' ? '<div id="day-detail"></div>' : ''}
    `;

    _bindEvents(sessions);
  }

  /* === CALENDRIER MENSUEL === */
  function _renderCalendar(sessions) {
    /* Sessions index\u00e9es par date */
    const byDate = {};
    sessions.forEach(s => {
      if (!s.date) return;
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    const firstDay = new Date(_viewYear, _viewMonth, 1);
    const lastDay  = new Date(_viewYear, _viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    /* Quel jour de la semaine commence le mois (lundi = 0) */
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const todayStr = _isoDate(new Date());

    let html = `
      <div class="card">
        <!-- Navigation mois -->
        <div class="flex-between mb-16">
          <button class="btn btn-sm" id="btn-prev-month">&larr;</button>
          <h2 style="font-size:1.1rem;">${MONTHS_FR[_viewMonth]} ${_viewYear}</h2>
          <button class="btn btn-sm" id="btn-next-month">&rarr;</button>
        </div>

        <!-- Grille calendrier -->
        <div class="cal-grid">
          ${DAYS_FR.map(d => `<div class="cal-header">${d}</div>`).join('')}
    `;

    /* Cases vides avant le 1er */
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="cal-day cal-empty"></div>';
    }

    /* Jours du mois */
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = _viewYear + '-' + String(_viewMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const daySessions = byDate[dateStr] || [];
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === _selectedDate;
      const hasItems = daySessions.length > 0;

      let dayClasses = 'cal-day';
      if (isToday) dayClasses += ' cal-today';
      if (isSelected) dayClasses += ' cal-selected';
      if (hasItems) dayClasses += ' cal-has-items';

      /* Indicateurs de sessions (petits points color\u00e9s) */
      let dots = '';
      if (hasItems) {
        const maxDots = Math.min(daySessions.length, 4);
        dots = '<div class="cal-dots">';
        for (let i = 0; i < maxDots; i++) {
          const s = daySessions[i];
          const dotColor = _statusColor(s.status);
          dots += `<span class="cal-dot" style="background:${dotColor};"></span>`;
        }
        if (daySessions.length > 4) {
          dots += `<span class="cal-dot-more">+${daySessions.length - 4}</span>`;
        }
        dots += '</div>';
      }

      html += `
        <div class="${dayClasses}" data-date="${dateStr}">
          <span class="cal-day-num">${day}</span>
          ${dots}
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  }

  /* === VUE ANNUELLE === */
  function _renderAnnual(sessions) {
    const byDate = {};
    sessions.forEach(s => {
      if (!s.date) return;
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    let html = `
      <div class="card">
        <div class="flex-between mb-16">
          <h2 style="font-size:1.1rem;">Année ${_viewYear}</h2>
          <div class="flex gap-8">
            <button class="btn btn-sm" id="btn-prev-year">&larr;</button>
            <button class="btn btn-sm" id="btn-next-year">&rarr;</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
    `;

    for (let m = 0; m < 12; m++) {
      const monthSessions = sessions.filter(s => {
        if (!s.date) return false;
        const d = new Date(s.date);
        return d.getFullYear() === _viewYear && d.getMonth() === m;
      });

      const monthCount = monthSessions.length;
      const confirmedCount = monthSessions.filter(s => s.status === 'confirmee' || s.status === 'en_cours').length;

      html += _renderMiniCalendar(m, _viewYear, byDate, monthCount, confirmedCount);
    }

    html += '</div></div>';
    return html;
  }

  /* === MINI-CALENDRIER POUR VUE ANNUELLE === */
  function _renderMiniCalendar(month, year, byDate, monthCount, confirmedCount) {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    let html = `
      <div class="mini-cal-container">
        <div style="padding:12px;border-bottom:1px solid var(--border-color);cursor:pointer;transition:all var(--transition-normal);" class="mini-cal-header" data-month="${month}">
          <div style="font-weight:700;color:var(--text-heading);margin-bottom:4px;">${MONTHS_FR[month]}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">
            ${monthCount} session${monthCount > 1 ? 's' : ''} • ${confirmedCount} confirmées
          </div>
        </div>
        <div class="mini-cal-grid">
          ${DAYS_FR.map(d => `<div class="mini-cal-header-day">${d.substring(0,1)}</div>`).join('')}
    `;

    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="mini-cal-day mini-cal-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const daySessions = byDate[dateStr] || [];
      const hasItems = daySessions.length > 0;

      let classes = 'mini-cal-day';
      if (hasItems) classes += ' mini-cal-has-items';

      let content = `<span class="mini-cal-day-num">${day}</span>`;
      if (hasItems) {
        const dot = `<span class="mini-cal-dot" style="background:${_statusColor(daySessions[0].status)};"></span>`;
        content += dot;
      }

      html += `<div class="${classes}" data-date="${dateStr}">${content}</div>`;
    }

    html += '</div></div>';
    return html;
  }

  /* === VUE LISTE === */
  function _renderList(sessions) {
    let filtered = sessions.filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d.getFullYear() === _viewYear && d.getMonth() === _viewMonth;
    });

    if (_filterStatus) {
      filtered = filtered.filter(s => s.status === _filterStatus);
    }

    filtered.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

    let html = `
      <div class="card">
        <div class="flex-between mb-16">
          <div class="flex gap-8" style="align-items:center;">
            <button class="btn btn-sm" id="btn-prev-month">&larr;</button>
            <h2 style="font-size:1.1rem;">${MONTHS_FR[_viewMonth]} ${_viewYear}</h2>
            <button class="btn btn-sm" id="btn-next-month">&rarr;</button>
          </div>
          <select class="form-control" id="filter-status-list" style="width:auto;min-width:150px;">
            <option value="">Tous les statuts</option>
            ${STATUS_OPTIONS.map(so => `<option value="${so.value}" ${_filterStatus === so.value ? 'selected' : ''}>${so.label}</option>`).join('')}
          </select>
        </div>
    `;

    if (filtered.length === 0) {
      html += '<div class="empty-state" style="padding:24px;"><p class="text-muted">Aucune session ce mois.</p></div>';
    } else {
      html += `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Client</th>
                <th>Module(s)</th>
                <th>Opérateur(s)</th>
                <th>Prix HT</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(s => `
                <tr>
                  <td>${_formatDateFr(s.date)}${s.time ? '<br><small class="text-muted">' + _esc(s.time) + '</small>' : ''}</td>
                  <td><strong>${_esc(s.label || '—')}</strong></td>
                  <td>${_clientName(s.clientIds)}</td>
                  <td><small>${_moduleNames(s.moduleIds)}</small></td>
                  <td><small>${_operatorNames(s.operatorIds)}</small></td>
                  <td class="num">${Engine.fmt(s.price || 0)}${s.encaissement ? ' <span style="color:var(--color-success);font-weight:600;">✓</span>' : ' <span style="color:var(--text-muted);">○</span>'}</td>
                  <td><span class="tag ${_statusTag(s.status)}">${_statusLabel(s.status)}</span></td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-edit-sess" data-id="${s.id}" title="Modifier">&#9998;</button>
                    <button class="btn btn-sm btn-del-sess" data-id="${s.id}" title="Supprimer">&#128465;</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /* === D\u00c9TAIL D'UN JOUR (sous le calendrier) === */
  function _renderDayDetail(dateStr, sessions) {
    const panel = _container.querySelector('#day-detail');
    if (!panel) return;

    const daySessions = sessions.filter(s => s.date === dateStr);
    daySessions.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const d = new Date(dateStr);
    const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let html = `
      <div class="card mt-16">
        <div class="card-header">
          <h2 style="text-transform:capitalize;">${label}</h2>
          <button class="btn btn-sm btn-primary" id="btn-add-on-date" data-date="${dateStr}">+ Planifier ce jour</button>
        </div>
    `;

    if (daySessions.length === 0) {
      html += '<div class="empty-state" style="padding:20px;"><p class="text-muted">Aucune session planifi\u00e9e ce jour.</p></div>';
    } else {
      html += daySessions.map(s => {
        const statusOpt = STATUS_OPTIONS.find(so => so.value === s.status) || STATUS_OPTIONS[0];
        const client = DB.clients.getById((s.clientIds && s.clientIds[0]) || s.clientId);
        return `
          <div class="planning-card" style="border-left:4px solid ${_statusColor(s.status)};">
            <div class="flex-between" style="align-items:flex-start;">
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <strong>${s.time ? _esc(s.time) + ' — ' : ''}${_esc(s.label || 'Session')}</strong>
                  <span class="tag ${statusOpt.tag}">${statusOpt.label}</span>
                </div>
                <div class="text-muted" style="font-size:0.82rem;margin-bottom:6px;">
                  <div><strong>Client :</strong> ${_esc(client ? client.name : '—')}</div>
                  <div><strong>Module(s) :</strong> ${_moduleNames(s.moduleIds)}</div>
                  <div><strong>Opérateur(s) :</strong> ${_operatorNames(s.operatorIds)}</div>
                  ${s.locationId ? `<div><strong>Lieu :</strong> ${_esc(_locationName(s.locationId))}</div>` : ''}
                  ${client && client.contactName ? `<div><strong>Contact :</strong> ${_esc(client.contactName)}${client.phone ? ' • ' + _esc(client.phone) : ''}</div>` : ''}
                </div>
                ${s.price > 0 ? `
                  <div style="font-size:0.85rem;margin-top:6px;">
                    <strong style="color:var(--text-heading);">Prix :</strong> ${Engine.fmt(s.price)}
                    ${s.encaissement ? ' <span style="color:var(--color-success);font-weight:600;">✓ Encaissée</span>' : ' <span style="color:var(--text-muted);">En attente</span>'}
                  </div>
                ` : ''}
                ${s.notes ? '<div class="text-muted" style="font-size:0.78rem;margin-top:6px;font-style:italic;">📝 ' + _esc(s.notes) + '</div>' : ''}
              </div>
              <div class="flex gap-8" style="align-items:center;flex-shrink:0;">
                <button class="btn btn-sm btn-edit-sess" data-id="${s.id}" title="Modifier">✎</button>
                <button class="btn btn-sm btn-del-sess" data-id="${s.id}" title="Supprimer">🗑</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    html += '</div>';
    panel.innerHTML = html;

    /* Bouton planifier ce jour */
    const btnAdd = panel.querySelector('#btn-add-on-date');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => _openFormModal(null, dateStr));
    }

    /* Actions modifier/supprimer */
    panel.querySelectorAll('.btn-edit-sess').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = DB.sessions.getById(btn.dataset.id);
        if (s) _openFormModal(s, null);
      });
    });
    panel.querySelectorAll('.btn-del-sess').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = DB.sessions.getById(btn.dataset.id);
        if (s) _confirmDelete(s);
      });
    });
  }

  /* === FORMULAIRE DE PLANIFICATION (création / modification) === */
  function _openFormModal(session, presetDate) {
    const isEdit = !!session;
    const s = session || {};

    const clients   = DB.clients.getAll().filter(c => c.active !== false);
    const modules   = DB.modules.getAll().filter(m => m.active !== false);
    const operators = DB.operators.getAll().filter(o => o.active !== false);
    const locations = DB.locations.getAll().filter(l => l.active !== false);
    const offers    = DB.offers.getAll().filter(o => o.active !== false);

    const dateVal = s.date || presetDate || _isoDate(new Date());
    const selectedClientId = (s.clientIds && s.clientIds[0]) || s.clientId;
    const selectedClient = selectedClientId ? DB.clients.getById(selectedClientId) : null;
    const clientLocations = selectedClientId ? locations.filter(l => l.clientId === selectedClientId) : [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <div class="modal-header">
          <h2>${isEdit ? 'Modifier la session' : 'Planifier une session'}</h2>
          <button class="btn btn-sm btn-ghost" id="fm-close">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Infos client (si sélectionné) -->
          ${selectedClient ? `
            <div style="background:var(--bg-tertiary);border-radius:8px;padding:12px;margin-bottom:16px;border-left:3px solid var(--color-info);">
              <div style="font-weight:600;color:var(--text-heading);margin-bottom:4px;">${_esc(selectedClient.name)}</div>
              ${selectedClient.contactName ? `<div style="font-size:0.85rem;color:var(--text-secondary);">Contact : <strong>${_esc(selectedClient.contactName)}</strong></div>` : ''}
              ${selectedClient.contactEmail ? `<div style="font-size:0.85rem;color:var(--text-secondary);">Email : <strong>${_esc(selectedClient.contactEmail)}</strong></div>` : ''}
              ${selectedClient.phone ? `<div style="font-size:0.85rem;color:var(--text-secondary);">Tél : <strong>${_esc(selectedClient.phone)}</strong></div>` : ''}
            </div>
          ` : ''}

          <!-- Date / Heure / Statut -->
          <div class="form-row">
            <div class="form-group">
              <label for="fm-date">Date *</label>
              <input type="date" class="form-control" id="fm-date" value="${dateVal}" required />
              <div id="date-warning" class="form-help" style="color:#d32f2f; display:none; margin-top:4px">
                ⚠ Cette date est dans le passé
              </div>
            </div>
            <div class="form-group">
              <label for="fm-time">Heure</label>
              <input type="time" class="form-control" id="fm-time" value="${_escAttr(s.time || '')}" />
            </div>
            <div class="form-group">
              <label for="fm-status">Statut</label>
              <select class="form-control" id="fm-status">
                ${STATUS_OPTIONS.map(so => `<option value="${so.value}" ${(s.status || 'planifiee') === so.value ? 'selected' : ''}>${so.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Libellé -->
          <div class="form-group">
            <label for="fm-label">Libellé</label>
            <input type="text" class="form-control" id="fm-label" value="${_escAttr(s.label || '')}" placeholder="Ex : Tir tactique Gendarmerie" />
          </div>

          <!-- Client -->
          <div class="form-group">
            <label for="fm-client">Client *</label>
            <select class="form-control" id="fm-client" required>
              <option value="">— Sélectionner un client —</option>
              ${clients.map(c => `<option value="${c.id}" ${(s.clientIds || []).includes(c.id) || s.clientId === c.id ? 'selected' : ''}>${_esc(c.name || c.id)}</option>`).join('')}
            </select>
          </div>

          <!-- Modules (multi-select) -->
          <div class="form-group">
            <label>Modules * <span style="font-size:0.75rem;color:var(--text-muted);">(sélectionnez un ou plusieurs)</span></label>
            <div id="fm-modules" style="max-height:140px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;background:var(--bg-input);">
              ${modules.map(m => `
                <label class="form-check" style="margin-bottom:6px;">
                  <input type="checkbox" name="modules" value="${m.id}" ${(s.moduleIds || []).includes(m.id) ? 'checked' : ''} />
                  <span>${_esc(m.name)}${m.category ? ' (' + _esc(m.category) + ')' : ''}</span>
                </label>
              `).join('')}
            </div>
            <div id="modules-error" style="color:#d32f2f;font-size:0.75rem;margin-top:4px;display:none;">Au moins un module requis</div>
          </div>

          <!-- Opérateurs (multi-select) -->
          <div class="form-group">
            <label>Opérateurs * <span style="font-size:0.75rem;color:var(--text-muted);">(sélectionnez un ou plusieurs)</span></label>
            <div id="fm-operators" style="max-height:140px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;background:var(--bg-input);">
              ${operators.map(o => {
                const name = ((o.firstName || '') + ' ' + (o.lastName || '')).trim();
                return `
                  <label class="form-check" style="margin-bottom:6px;">
                    <input type="checkbox" name="operators" value="${o.id}" ${(s.operatorIds || []).includes(o.id) ? 'checked' : ''} />
                    <span>${_esc(name)} <span style="color:var(--text-muted);font-size:0.8rem;">(${Engine.statusLabel(o.status)})</span></span>
                  </label>
                `;
              }).join('')}
            </div>
            <div id="operators-error" style="color:#d32f2f;font-size:0.75rem;margin-top:4px;display:none;">Au moins un opérateur requis</div>
          </div>

          <!-- Lieux (selon le client sélectionné) -->
          <div class="form-group">
            <label for="fm-location">Lieu(x) d'intervention <span style="font-size:0.75rem;color:var(--text-muted);">${clientLocations.length > 0 ? '(du client)' : '(aucun lieu pour ce client)'}</span></label>
            <select class="form-control" id="fm-location" ${clientLocations.length === 0 ? 'disabled' : ''}>
              <option value="">— Aucun lieu —</option>
              ${clientLocations.map(l => `<option value="${l.id}" ${s.locationId === l.id ? 'selected' : ''}>${_esc(l.name)}${l.city ? ' (' + _esc(l.city) + ')' : ''}</option>`).join('')}
              ${clientLocations.length === 0 ? `<option disabled>Ajouter des lieux dans le profil client</option>` : ''}
            </select>
          </div>

          <!-- Offre liée -->
          <div class="form-group">
            <label for="fm-offer">Offre liée</label>
            <select class="form-control" id="fm-offer">
              <option value="">— Aucune —</option>
              ${offers.map(o => `<option value="${o.id}" data-price="${o.price || 0}" ${s.offerId === o.id ? 'selected' : ''}>${_esc(o.label || o.name || o.id)}</option>`).join('')}
            </select>
            <div id="offer-info" style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;"></div>
          </div>

          <!-- Prix -->
          <div class="form-row">
            <div class="form-group">
              <label for="fm-price">Prix facturé HT (€) *</label>
              <input type="number" class="form-control" id="fm-price" value="${s.price || ''}" min="0" step="any" placeholder="0" required />
            </div>
            <div class="form-group">
              <label for="fm-encaissement">
                <input type="checkbox" id="fm-encaissement" ${s.encaissement ? 'checked' : ''} />
                <span style="margin-left:6px;">Encaissée</span>
              </label>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">Cochez si la facture est payée</div>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label for="fm-notes">Notes</label>
            <textarea class="form-control" id="fm-notes" rows="2" placeholder="Remarques...">${_esc(s.notes || '')}</textarea>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn" id="fm-cancel">Annuler</button>
          <button class="btn btn-primary" id="fm-save">${isEdit ? 'Enregistrer' : 'Planifier'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    /* Fermeture */
    const close = () => overlay.remove();
    overlay.querySelector('#fm-close').addEventListener('click', close);
    overlay.querySelector('#fm-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    /* Validation date */
    const dateInput = overlay.querySelector('#fm-date');
    const dateWarning = overlay.querySelector('#date-warning');
    const checkPastDate = () => {
      const dateVal = dateInput.value;
      if (dateVal) {
        const selectedDate = new Date(dateVal + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          dateWarning.style.display = '';
        } else {
          dateWarning.style.display = 'none';
        }
      } else {
        dateWarning.style.display = 'none';
      }
    };
    dateInput.addEventListener('change', checkPastDate);
    checkPastDate();

    /* Mise à jour des lieux selon le client sélectionné */
    const clientSelect = overlay.querySelector('#fm-client');
    const locationSelect = overlay.querySelector('#fm-location');
    const updateLocations = () => {
      const clientId = clientSelect.value;
      const newLocations = clientId ? locations.filter(l => l.clientId === clientId) : [];
      locationSelect.innerHTML = `<option value="">— Aucun lieu —</option>`;
      if (newLocations.length > 0) {
        locationSelect.disabled = false;
        newLocations.forEach(l => {
          const opt = document.createElement('option');
          opt.value = l.id;
          opt.textContent = _esc(l.name) + (l.city ? ' (' + _esc(l.city) + ')' : '');
          locationSelect.appendChild(opt);
        });
      } else {
        locationSelect.disabled = true;
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'Ajouter des lieux dans le profil client';
        locationSelect.appendChild(opt);
      }
    };
    clientSelect.addEventListener('change', updateLocations);

    /* Mise à jour du prix selon l'offre sélectionnée */
    const offerSelect = overlay.querySelector('#fm-offer');
    const priceInput = overlay.querySelector('#fm-price');
    const offerInfo = overlay.querySelector('#offer-info');
    const updateOfferPrice = () => {
      const selectedOpt = offerSelect.options[offerSelect.selectedIndex];
      const offerPrice = parseFloat(selectedOpt.dataset.price || 0);
      if (offerPrice > 0) {
        priceInput.value = offerPrice;
        offerInfo.textContent = 'Prix pré-rempli depuis l\'offre : ' + Engine.fmt(offerPrice);
      } else {
        offerInfo.textContent = '';
      }
    };
    offerSelect.addEventListener('change', updateOfferPrice);

    /* Sauvegarde */
    overlay.querySelector('#fm-save').addEventListener('click', () => {
      const date = overlay.querySelector('#fm-date').value;
      const clientId = overlay.querySelector('#fm-client').value;
      const moduleCheckboxes = Array.from(overlay.querySelectorAll('input[name="modules"]:checked'));
      const operatorCheckboxes = Array.from(overlay.querySelectorAll('input[name="operators"]:checked'));
      const price = parseFloat(overlay.querySelector('#fm-price').value) || 0;

      let isValid = true;

      if (!date) { _highlight(overlay.querySelector('#fm-date')); isValid = false; }
      if (!clientId) { _highlight(overlay.querySelector('#fm-client')); isValid = false; }

      if (moduleCheckboxes.length === 0) {
        overlay.querySelector('#modules-error').style.display = '';
        isValid = false;
      } else {
        overlay.querySelector('#modules-error').style.display = 'none';
      }

      if (operatorCheckboxes.length === 0) {
        overlay.querySelector('#operators-error').style.display = '';
        isValid = false;
      } else {
        overlay.querySelector('#operators-error').style.display = 'none';
      }

      if (!isValid) return;

      const previousStatus = session ? session.status : null;
      const newStatus = overlay.querySelector('#fm-status').value;

      const data = {
        date,
        time:        overlay.querySelector('#fm-time').value || '',
        label:       overlay.querySelector('#fm-label').value.trim(),
        status:      newStatus,
        clientIds:   [clientId],
        moduleIds:   moduleCheckboxes.map(cb => cb.value),
        operatorIds: operatorCheckboxes.map(cb => cb.value),
        locationId:  overlay.querySelector('#fm-location').value || '',
        offerId:     overlay.querySelector('#fm-offer').value || '',
        price:       price,
        encaissement: overlay.querySelector('#fm-encaissement').checked,
        notes:       overlay.querySelector('#fm-notes').value.trim(),
        variableCosts: isEdit ? (s.variableCosts || []) : []
      };

      if (isEdit) {
        DB.sessions.update(session.id, data);
        Toast.show('Session mise à jour.', 'success');
      } else {
        DB.sessions.create(data);
        Toast.show('Session planifiée.', 'success');
      }

      /* Gestion abonnement */
      const justCompleted = (newStatus === 'terminee' && previousStatus !== 'terminee');
      if (justCompleted && data.offerId) {
        const offer = DB.offers.getById(data.offerId);
        if (offer && offer.type === 'abonnement') {
          const consumed = (offer.sessionsConsumed || 0) + 1;
          const finalConsumed = Math.min(consumed, offer.nbSessions || 0);
          DB.offers.update(offer.id, { sessionsConsumed: finalConsumed });
        }
      }
      if (isEdit && previousStatus === 'terminee' && newStatus !== 'terminee' && data.offerId) {
        const offer = DB.offers.getById(data.offerId);
        if (offer && offer.type === 'abonnement') {
          DB.offers.update(offer.id, { sessionsConsumed: Math.max((offer.sessionsConsumed || 0) - 1, 0) });
        }
      }

      close();
      _selectedDate = data.date;
      _renderPage();
    });

    overlay.querySelector('#fm-date').focus();
  }

  /* === SUPPRESSION === */
  function _confirmDelete(session) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h2>Supprimer la session</h2>
          <button class="btn btn-sm btn-ghost" id="del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p>Supprimer <strong>${_esc(session.label || 'cette session')}</strong> du ${_formatDateFr(session.date)} ?</p>
          <p class="text-muted" style="margin-top:8px;font-size:0.82rem;">Cette action est irr\u00e9versible.</p>
        </div>
        <div class="modal-footer">
          <button class="btn" id="del-cancel">Annuler</button>
          <button class="btn btn-primary" id="del-confirm" style="background:var(--accent-red);border-color:var(--accent-red);">Supprimer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#del-close').addEventListener('click', close);
    overlay.querySelector('#del-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#del-confirm').addEventListener('click', () => {
      DB.sessions.delete(session.id);
      close();
      _renderPage();
      Toast.show('Session supprim\u00e9e.', 'warning');
    });
  }

  /* === \u00c9V\u00c9NEMENTS === */
  function _bindEvents(sessions) {
    /* Navigation mois */
    const btnPrev = _container.querySelector('#btn-prev-month');
    const btnNext = _container.querySelector('#btn-next-month');
    if (btnPrev) btnPrev.addEventListener('click', () => { _changeMonth(-1); });
    if (btnNext) btnNext.addEventListener('click', () => { _changeMonth(1); });

    /* Navigation année */
    const btnPrevYear = _container.querySelector('#btn-prev-year');
    const btnNextYear = _container.querySelector('#btn-next-year');
    if (btnPrevYear) btnPrevYear.addEventListener('click', () => { _viewYear--; _renderPage(); });
    if (btnNextYear) btnNextYear.addEventListener('click', () => { _viewYear++; _renderPage(); });

    /* Vue calendrier / liste / annuelle */
    const btnCal  = _container.querySelector('#btn-view-cal');
    const btnList = _container.querySelector('#btn-view-list');
    const btnAnnual = _container.querySelector('#btn-view-annual');
    if (btnCal)  btnCal.addEventListener('click', () => { _viewMode = 'calendar'; _selectedDate = null; _renderPage(); });
    if (btnList) btnList.addEventListener('click', () => { _viewMode = 'list'; _renderPage(); });
    if (btnAnnual) btnAnnual.addEventListener('click', () => { _viewMode = 'annual'; _renderPage(); });

    /* Bouton planifier */
    const btnAdd = _container.querySelector('#btn-add-session');
    if (btnAdd) btnAdd.addEventListener('click', () => _openFormModal(null, null));

    /* Filtre statut (liste) */
    const filterSel = _container.querySelector('#filter-status-list');
    if (filterSel) filterSel.addEventListener('change', (e) => { _filterStatus = e.target.value; _renderPage(); });

    /* Clics sur les jours du calendrier */
    _container.querySelectorAll('.cal-day:not(.cal-empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        _selectedDate = cell.dataset.date;
        /* Mettre \u00e0 jour la s\u00e9lection visuelle */
        _container.querySelectorAll('.cal-day.cal-selected').forEach(c => c.classList.remove('cal-selected'));
        cell.classList.add('cal-selected');
        _renderDayDetail(_selectedDate, sessions);
      });
    });

    /* Actions dans la liste */
    _container.querySelectorAll('.btn-edit-sess').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = DB.sessions.getById(btn.dataset.id);
        if (s) _openFormModal(s, null);
      });
    });
    _container.querySelectorAll('.btn-del-sess').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = DB.sessions.getById(btn.dataset.id);
        if (s) _confirmDelete(s);
      });
    });

    /* Mini calendrier - cliquer sur un mois pour le voir en détail */
    _container.querySelectorAll(".mini-cal-header").forEach(header => {
      header.addEventListener("click", () => {
        _viewMonth = parseInt(header.dataset.month);
        _viewMode = "calendar";
        _selectedDate = null;
        _renderPage();
      });
    });
    /* Afficher le d\u00e9tail du jour s\u00e9lectionn\u00e9 */
    if (_selectedDate) {
      _renderDayDetail(_selectedDate, sessions);
    }
  }

  function _changeMonth(delta) {
    _viewMonth += delta;
    if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; }
    if (_viewMonth < 0) { _viewMonth = 11; _viewYear--; }
    _selectedDate = null;
    _renderPage();
  }

  /* === UTILITAIRES === */

  function _clientName(ids) {
    if (!ids || ids.length === 0) return '\u2014';
    return ids.map(id => {
      const c = DB.clients.getById(id);
      return c ? (c.name || c.id) : '\u2014';
    }).join(', ');
  }

  function _moduleNames(ids) {
    if (!ids || ids.length === 0) return '\u2014';
    return ids.map(id => {
      const m = DB.modules.getById(id);
      return m ? (m.name || m.id) : '\u2014';
    }).join(', ');
  }

  function _operatorNames(ids) {
    if (!ids || ids.length === 0) return '\u2014';
    return ids.map(id => {
      const o = DB.operators.getById(id);
      return o ? ((o.firstName || '') + ' ' + (o.lastName || '')).trim() : '\u2014';
    }).join(', ');
  }

  function _locationName(id) {
    if (!id) return '\u2014';
    const l = DB.locations.getById(id);
    return l ? (l.name || l.id) : '\u2014';
  }

  function _statusTag(status) {
    const opt = STATUS_OPTIONS.find(so => so.value === status);
    return opt ? opt.tag : 'tag-neutral';
  }

  function _statusLabel(status) {
    const opt = STATUS_OPTIONS.find(so => so.value === status);
    return opt ? opt.label : status || '\u2014';
  }

  function _statusColor(status) {
    const map = {
      planifiee: 'var(--color-info)',
      confirmee: 'var(--color-success)',
      en_cours:  'var(--color-warning)',
      terminee:  'var(--text-muted)',
      annulee:   'var(--accent-red)'
    };
    return map[status] || 'var(--text-muted)';
  }

  function _isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _formatDateFr(iso) {
    if (!iso) return '\u2014';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return iso; }
  }

  function _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function _escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _highlight(el) {
    if (!el) return;
    el.style.borderColor = 'var(--accent-red)';
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; }, 2000);
  }

  return { render };
})();
