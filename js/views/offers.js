/* ============================================================
   DST-SYSTEM — Vue : Offres & Abonnements
   Gestion complète des offres commerciales (CRUD),
   suivi des abonnements, prix plancher, clonage.
   ============================================================ */

window.Views = window.Views || {};

Views.Offers = {

  /**
   * Point d'entrée unique — injecte le HTML et branche tous les listeners.
   * @param {HTMLElement} container — zone #content de l'application
   */
  render(container) {
    'use strict';

    /* ==========================================================
       ÉTAT LOCAL
       ========================================================== */

    let searchTerm = '';        // filtre recherche en cours
    let filterType = '';        // filtre par type d'offre
    let filterActive = '';      // filtre par statut actif

    /* ==========================================================
       HELPERS INTERNES
       ========================================================== */

    /** Classe CSS du tag selon le type d'offre */
    function tagClass(type) {
      const map = {
        one_shot: 'tag-blue',
        abonnement: 'tag-green',
        personnalisee: 'tag-yellow'
      };
      return map[type] || 'tag-neutral';
    }

    /** Récupère le libellé d'un client par son id */
    function clientLabel(id) {
      const c = DB.clients.getById(id);
      if (!c) return '(inconnu)';
      return c.name || c.label || (`${c.firstName || ''} ${c.lastName || ''}`).trim() || id;
    }

    /** Récupère le libellé d'un module par son id */
    function moduleLabel(id) {
      const m = DB.modules.getById(id);
      return m ? (m.name || m.label || id) : '(inconnu)';
    }

    /** Calcule les sessions restantes */
    function sessionsRemaining(offer) {
      const total = offer.nbSessions || 0;
      const consumed = offer.sessionsConsumed || 0;
      return Math.max(total - consumed, 0);
    }

    /** Détermine la couleur de la barre de progression */
    function progressColor(consumed, total) {
      if (total <= 0) return 'fill-green';
      const ratio = consumed / total;
      if (ratio >= 0.85) return 'fill-red';
      if (ratio >= 0.55) return 'fill-yellow';
      return 'fill-green';
    }

    /** Pourcentage de consommation (borné 0-100) */
    function progressPercent(consumed, total) {
      if (total <= 0) return 0;
      return Math.min(Math.round((consumed / total) * 100), 100);
    }

    /** Échappe le HTML pour éviter les injections */
    function esc(str) {
      if (str == null) return '';
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }

    /* ==========================================================
       RENDU — TABLEAU PRINCIPAL
       ========================================================== */

    function renderMain() {
      const offers = DB.offers.getAll();

      /* Filtrage */
      let filtered = offers;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        filtered = filtered.filter(o =>
          (o.label || '').toLowerCase().includes(q) ||
          (o.notes || '').toLowerCase().includes(q)
        );
      }
      if (filterType) {
        filtered = filtered.filter(o => o.type === filterType);
      }
      if (filterActive === 'active') {
        filtered = filtered.filter(o => o.active !== false);
      } else if (filterActive === 'inactive') {
        filtered = filtered.filter(o => o.active === false);
      }

      /* Tri par date de création décroissante */
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      /* Construction HTML */
      let html = `
        <div class="page-header">
          <h1>Offres & Abonnements</h1>
          <div class="actions">
            <button class="btn btn-primary" id="btn-new-offer">+ Nouvelle offre</button>
          </div>
        </div>

        <!-- Barre de filtres -->
        <div class="card">
          <div class="form-row" style="align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0;">
              <label>Recherche</label>
              <div class="search-bar" style="max-width:100%;">
                <span class="search-icon">&#128269;</span>
                <input type="text" id="offers-search" class="form-control"
                       placeholder="Rechercher une offre..." value="${esc(searchTerm)}">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>Type</label>
              <select id="offers-filter-type" class="form-control">
                <option value="">Tous les types</option>
                <option value="one_shot" ${filterType === 'one_shot' ? 'selected' : ''}>One-shot</option>
                <option value="abonnement" ${filterType === 'abonnement' ? 'selected' : ''}>Abonnement</option>
                <option value="personnalisee" ${filterType === 'personnalisee' ? 'selected' : ''}>Personnalis\u00e9e</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>Statut</label>
              <select id="offers-filter-active" class="form-control">
                <option value="">Tous</option>
                <option value="active" ${filterActive === 'active' ? 'selected' : ''}>Actives</option>
                <option value="inactive" ${filterActive === 'inactive' ? 'selected' : ''}>Inactives</option>
              </select>
            </div>
          </div>
        </div>`;

      if (filtered.length === 0) {
        html += `
          <div class="card">
            <div class="empty-state">
              <div class="empty-icon">&#128230;</div>
              <p>Aucune offre trouv\u00e9e.</p>
              <button class="btn btn-primary" id="btn-new-offer-empty">+ Cr\u00e9er une offre</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="card">
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Libell\u00e9</th>
                    <th>Type</th>
                    <th>Encaissement</th>
                    <th>Prix</th>
                    <th>Sessions</th>
                    <th>Statut</th>
                    <th class="actions-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>`;

        filtered.forEach(offer => {
          /* Modalités d'encaissement */
          const encaissementMap = {
            'comptant': '✓ Comptant',
            'mensuel': 'Mensuel',
            '2x': '2 fois',
            '3x': '3 fois',
            '4x': '4 fois'
          };
          const encaissementLabel = encaissementMap[offer.paymentTerms] || (offer.paymentTerms || '—');

          /* Sessions (affiché uniquement pour abonnements) */
          let sessionsHtml = '<span class="text-muted">—</span>';
          if (offer.type === 'abonnement' && offer.nbSessions > 0) {
            const consumed = offer.sessionsConsumed || 0;
            const total = offer.nbSessions;
            const remaining = sessionsRemaining(offer);
            const pct = progressPercent(consumed, total);
            const color = progressColor(consumed, total);
            sessionsHtml = `
              <div style="min-width:110px;">
                <span class="text-mono">${consumed} / ${total}</span>
                <span class="text-muted" style="font-size:0.72rem;"> (reste ${remaining})</span>
                <div class="progress-bar mt-8">
                  <div class="progress-fill ${color}" style="width:${pct}%;"></div>
                </div>
              </div>`;
          }

          /* Statut */
          const isActive = offer.active !== false;
          const statusHtml = isActive
            ? '<span class="tag tag-green">Active</span>'
            : '<span class="tag tag-neutral">Inactive</span>';

          html += `
                  <tr>
                    <td><strong>${esc(offer.label || '(sans nom)')}</strong></td>
                    <td><span class="tag ${tagClass(offer.type)}">${esc(Engine.offerTypeLabel(offer.type))}</span></td>
                    <td><small>${esc(encaissementLabel)}</small></td>
                    <td class="num">${Engine.fmt(offer.price || 0)} <small class="text-muted">${(() => {
                      var clients = (offer.clientIds || []).map(function(cid) { return DB.clients.getById(cid); }).filter(Boolean);
                      return clients.some(function(c) { return c.clientCategory === 'B2C'; }) ? 'TTC' : 'HT';
                    })()}</small></td>
                    <td>${sessionsHtml}</td>
                    <td>${statusHtml}</td>
                    <td class="actions-cell">
                      <button class="btn btn-sm btn-action-edit" data-id="${offer.id}" data-tooltip="Modifier">&#9998;</button>
                      <button class="btn btn-sm btn-warning btn-action-clone" data-id="${offer.id}" data-tooltip="Dupliquer">&#10697;</button>
                      <button class="btn btn-sm btn-action-delete" data-id="${offer.id}" data-tooltip="Supprimer">&#128465;</button>
                    </td>
                  </tr>`;
        });

        html += `
                </tbody>
              </table>
            </div>
          </div>`;
      }

      container.innerHTML = html;
      attachMainListeners();
    }

    /* ==========================================================
       LISTENERS — PAGE PRINCIPALE
       ========================================================== */

    function attachMainListeners() {
      /* Boutons "Nouvelle offre" */
      const btnNew = container.querySelector('#btn-new-offer');
      if (btnNew) btnNew.addEventListener('click', () => openModal(null));

      const btnNewEmpty = container.querySelector('#btn-new-offer-empty');
      if (btnNewEmpty) btnNewEmpty.addEventListener('click', () => openModal(null));

      /* Recherche */
      const searchInput = container.querySelector('#offers-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchTerm = e.target.value;
          renderMain();
          /* Restaurer le focus après re-rendu */
          const el = container.querySelector('#offers-search');
          if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
        });
      }

      /* Filtre type */
      const selType = container.querySelector('#offers-filter-type');
      if (selType) {
        selType.addEventListener('change', (e) => {
          filterType = e.target.value;
          renderMain();
        });
      }

      /* Filtre statut */
      const selActive = container.querySelector('#offers-filter-active');
      if (selActive) {
        selActive.addEventListener('change', (e) => {
          filterActive = e.target.value;
          renderMain();
        });
      }

      /* Boutons d'action sur chaque ligne */
      container.querySelectorAll('.btn-action-edit').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
      });

      container.querySelectorAll('.btn-action-clone').forEach(btn => {
        btn.addEventListener('click', () => cloneOffer(btn.dataset.id));
      });

      container.querySelectorAll('.btn-action-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteOffer(btn.dataset.id));
      });
    }

    /* ==========================================================
       CLONAGE D'UNE OFFRE
       ========================================================== */

    function cloneOffer(id) {
      const original = DB.offers.getById(id);
      if (!original) return;

      /* Copier tous les champs sauf id/dates techniques */
      const clone = {
        label: (original.label || '') + ' (copie)',
        type: original.type,
        clientIds: [...(original.clientIds || [])],
        moduleIds: [...(original.moduleIds || [])],
        price: original.price || 0,
        paymentTerms: original.paymentTerms || 'comptant',
        nbSessions: original.nbSessions || 0,
        recurrence: original.recurrence || null,
        sessionsConsumed: 0,
        startDate: original.startDate || '',
        endDate: original.endDate || '',
        notes: original.notes || '',
        active: true
      };

      DB.offers.create(clone);
      renderMain();
      Toast.show('Offre dupliquée.', 'success');
    }

    /* ==========================================================
       SUPPRESSION
       ========================================================== */

    function deleteOffer(id) {
      const offer = DB.offers.getById(id);
      if (!offer) return;

      const confirmed = confirmDelete(offer.label || '(sans nom)');
      if (!confirmed) return;

      const name = offer.label || '';
      DB.offers.delete(id);
      renderMain();
      Toast.show('Offre « ' + name + ' » supprimée.', 'warning');
    }

    /* ==========================================================
       MODALE — CRÉATION / ÉDITION
       ========================================================== */

    function openModal(offerId) {
      const isEdit = !!offerId;
      const offer = isEdit ? DB.offers.getById(offerId) : null;

      /* Valeurs par défaut pour la création */
      const data = {
        label: offer ? offer.label : '',
        type: offer ? offer.type : 'one_shot',
        clientIds: offer ? [...(offer.clientIds || [])] : [],
        moduleIds: offer ? [...(offer.moduleIds || [])] : [],
        price: offer ? (offer.price || 0) : 0,
        paymentTerms: offer ? (offer.paymentTerms || 'comptant') : 'comptant',
        nbSessions: offer ? (offer.nbSessions || 0) : 0,
        recurrence: offer ? (offer.recurrence || '') : '',
        sessionsConsumed: offer ? (offer.sessionsConsumed || 0) : 0,
        startDate: offer ? (offer.startDate || '') : '',
        endDate: offer ? (offer.endDate || '') : '',
        notes: offer ? (offer.notes || '') : '',
        active: offer ? (offer.active !== false) : true
      };

      /* Listes de référence */
      const allClients = DB.clients.getAll();
      const allModules = DB.modules.getAll();

      /* --- Construction des listes à cocher --- */

      function buildCheckboxList(items, selectedIds, namePrefix, labelFn) {
        if (items.length === 0) {
          return `<p class="text-muted" style="font-size:0.82rem;">Aucun \u00e9l\u00e9ment disponible.</p>`;
        }
        let html = '<div style="max-height:150px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;">';
        items.forEach(item => {
          const checked = selectedIds.includes(item.id) ? 'checked' : '';
          const lbl = labelFn(item);
          html += `
            <label class="form-check" style="margin-bottom:4px;">
              <input type="checkbox" name="${namePrefix}" value="${item.id}" ${checked}>
              <span>${esc(lbl)}</span>
            </label>`;
        });
        html += '</div>';
        return html;
      }

      const clientCheckboxes = buildCheckboxList(
        allClients,
        data.clientIds,
        'offer-clients',
        c => c.name || c.label || (`${c.firstName || ''} ${c.lastName || ''}`).trim() || c.id
      );

      const moduleCheckboxes = buildCheckboxList(
        allModules,
        data.moduleIds,
        'offer-modules',
        m => m.name || m.label || m.id
      );

      /* --- Options de récurrence --- */
      const recurrences = [
        { value: '', label: 'Aucune (one-shot)' },
        { value: 'mensuel', label: 'Mensuel' },
        { value: 'trimestriel', label: 'Trimestriel' },
        { value: 'semestriel', label: 'Semestriel' },
        { value: 'annuel', label: 'Annuel' }
      ];

      let recurrenceOptions = '';
      recurrences.forEach(r => {
        const sel = (data.recurrence === r.value) ? 'selected' : '';
        recurrenceOptions += `<option value="${r.value}" ${sel}>${r.label}</option>`;
      });

      /* --- Visibilité conditionnelle : champs abonnement --- */
      const showAboFields = data.type === 'abonnement';

      /* --- HTML de la modale --- */
      const modalTitle = isEdit ? 'Modifier l\u2019offre' : 'Nouvelle offre';

      let modalHtml = `
        <div class="modal-overlay" id="offer-modal-overlay">
          <div class="modal modal-lg">
            <div class="modal-header">
              <h2>${modalTitle}</h2>
              <button class="btn btn-sm btn-ghost" id="modal-close-x">&times;</button>
            </div>
            <div class="modal-body">

              <!-- Zone d'alerte prix plancher -->
              <div id="floor-alert" class="hidden"></div>

              <div class="form-row">
                <div class="form-group">
                  <label for="offer-label">Libell\u00e9 *</label>
                  <input type="text" id="offer-label" class="form-control"
                         placeholder="Ex : Pack Formation Q1 2025" value="${esc(data.label)}">
                </div>
                <div class="form-group">
                  <label for="offer-type">Type *</label>
                  <select id="offer-type" class="form-control">
                    <option value="one_shot" ${data.type === 'one_shot' ? 'selected' : ''}>One-shot</option>
                    <option value="abonnement" ${data.type === 'abonnement' ? 'selected' : ''}>Abonnement</option>
                    <option value="personnalisee" ${data.type === 'personnalisee' ? 'selected' : ''}>Personnalis\u00e9e</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="offer-price">Prix total HT (EUR) *</label>
                  <input type="number" id="offer-price" class="form-control" min="0" step="any"
                         value="${data.price}">
                  <span class="form-help" id="floor-hint"></span>
                </div>
                <div class="form-group">
                  <label for="offer-payment">Modalités d'encaissement</label>
                  <select id="offer-payment" class="form-control">
                    <option value="comptant" ${data.paymentTerms === 'comptant' ? 'selected' : ''}>✓ Comptant</option>
                    <option value="mensuel" ${data.paymentTerms === 'mensuel' ? 'selected' : ''}>Mensuel</option>
                    <option value="2x" ${data.paymentTerms === '2x' ? 'selected' : ''}>2 fois</option>
                    <option value="3x" ${data.paymentTerms === '3x' ? 'selected' : ''}>3 fois</option>
                    <option value="4x" ${data.paymentTerms === '4x' ? 'selected' : ''}>4 fois</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Statut</label>
                  <select id="offer-active" class="form-control">
                    <option value="true" ${data.active ? 'selected' : ''}>Active</option>
                    <option value="false" ${!data.active ? 'selected' : ''}>Inactive</option>
                  </select>
                </div>
              </div>

              <!-- Champs spécifiques abonnement -->
              <div id="abo-fields" class="${showAboFields ? '' : 'hidden'}">
                <div class="form-row">
                  <div class="form-group">
                    <label for="offer-nb-sessions">Nombre de sessions</label>
                    <input type="number" id="offer-nb-sessions" class="form-control" min="0" step="any"
                           value="${data.nbSessions}">
                  </div>
                  <div class="form-group">
                    <label for="offer-recurrence">R\u00e9currence</label>
                    <select id="offer-recurrence" class="form-control">
                      ${recurrenceOptions}
                    </select>
                  </div>
                  ${isEdit ? `
                  <div class="form-group">
                    <label for="offer-sessions-consumed">Sessions consomm\u00e9es</label>
                    <input type="number" id="offer-sessions-consumed" class="form-control" min="0" step="any"
                           value="${data.sessionsConsumed}">
                  </div>` : ''}
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="offer-start-date">Date de d\u00e9but</label>
                  <input type="date" id="offer-start-date" class="form-control" value="${esc(data.startDate)}">
                </div>
                <div class="form-group">
                  <label for="offer-end-date">Date de fin</label>
                  <input type="date" id="offer-end-date" class="form-control" value="${esc(data.endDate)}">
                </div>
              </div>

              <!-- Affectation modules -->
              <div class="form-group">
                <label>Module(s) inclus</label>
                <div id="modules-checkbox-list">
                  ${moduleCheckboxes}
                </div>
              </div>

              <!-- Notes -->
              <div class="form-group">
                <label for="offer-notes">Notes</label>
                <textarea id="offer-notes" class="form-control" rows="3"
                          placeholder="Remarques, conditions particuli\u00e8res...">${esc(data.notes)}</textarea>
              </div>

            </div>
            <div class="modal-footer">
              <button class="btn" id="modal-cancel">Annuler</button>
              <button class="btn btn-primary" id="modal-save">${isEdit ? 'Enregistrer' : 'Cr\u00e9er'}</button>
            </div>
          </div>
        </div>`;

      /* Injection de la modale dans le DOM */
      const wrapper = document.createElement('div');
      wrapper.innerHTML = modalHtml;
      document.body.appendChild(wrapper.firstElementChild);

      const overlay = document.getElementById('offer-modal-overlay');

      /* --- Vérification du prix plancher (à l'ouverture et au changement) --- */
      function checkFloorPrice() {
        const priceInput = overlay.querySelector('#offer-price');
        const nbSessionsInput = overlay.querySelector('#offer-nb-sessions');
        const typeSelect = overlay.querySelector('#offer-type');
        const floorAlert = overlay.querySelector('#floor-alert');
        const floorHint = overlay.querySelector('#floor-hint');

        const currentPrice = parseFloat(priceInput.value) || 0;
        const currentNbSessions = parseInt(nbSessionsInput ? nbSessionsInput.value : '1', 10) || 1;

        /* Récupérer les modules sélectionnés */
        const selectedModules = [];
        overlay.querySelectorAll('input[name="offer-modules"]:checked').forEach(cb => {
          selectedModules.push(cb.value);
        });

        /* Construire un objet offre partiel pour le calcul du plancher */
        const partialOffer = {
          type: typeSelect.value,
          moduleIds: selectedModules,
          nbSessions: currentNbSessions
        };

        const floor = Engine.computeOfferFloor(partialOffer);

        /* Afficher le prix plancher en indication */
        floorHint.textContent = `Prix plancher estim\u00e9 : ${Engine.fmt(floor)}`;

        /* Alerte si en dessous */
        if (currentPrice > 0 && currentPrice < floor) {
          floorAlert.className = 'alert alert-danger mb-16';
          floorAlert.innerHTML = `
            <span class="alert-icon">&#9888;</span>
            <div>
              <strong>Prix sous le seuil plancher</strong><br>
              Le prix saisi (${Engine.fmt(currentPrice)}) est inf\u00e9rieur au co\u00fbt plancher estim\u00e9 (${Engine.fmt(floor)}).
              Vous pouvez tout de m\u00eame enregistrer, mais la rentabilit\u00e9 n'est pas assur\u00e9e.
            </div>`;
        } else {
          floorAlert.className = 'hidden';
          floorAlert.innerHTML = '';
        }
      }

      /* Appel initial */
      checkFloorPrice();

      /* --- Écouteurs de la modale --- */

      /* Afficher/masquer les champs abonnement selon le type */
      const typeSelect = overlay.querySelector('#offer-type');
      typeSelect.addEventListener('change', () => {
        const aboFields = overlay.querySelector('#abo-fields');
        if (typeSelect.value === 'abonnement') {
          aboFields.classList.remove('hidden');
        } else {
          aboFields.classList.add('hidden');
        }
        checkFloorPrice();
      });

      /* Re-calcul plancher quand le prix, les sessions ou les modules changent */
      overlay.querySelector('#offer-price').addEventListener('input', checkFloorPrice);

      const nbSessionsInput = overlay.querySelector('#offer-nb-sessions');
      if (nbSessionsInput) {
        nbSessionsInput.addEventListener('input', checkFloorPrice);
      }

      overlay.querySelectorAll('input[name="offer-modules"]').forEach(cb => {
        cb.addEventListener('change', checkFloorPrice);
      });

      /* Fermeture de la modale */
      function closeModal() {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }

      overlay.querySelector('#modal-close-x').addEventListener('click', closeModal);
      overlay.querySelector('#modal-cancel').addEventListener('click', closeModal);

      /* Fermer en cliquant sur l'overlay (hors modale) */
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      /* Fermer avec Echap */
      function escHandler(e) {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      }
      document.addEventListener('keydown', escHandler);

      /* --- Sauvegarde --- */
      overlay.querySelector('#modal-save').addEventListener('click', () => {
        const label = overlay.querySelector('#offer-label').value.trim();
        if (!label) {
          alert('Le libell\u00e9 de l\u2019offre est obligatoire.');
          overlay.querySelector('#offer-label').focus();
          return;
        }

        const type = overlay.querySelector('#offer-type').value;
        const price = parseFloat(overlay.querySelector('#offer-price').value) || 0;
        const paymentTerms = overlay.querySelector('#offer-payment').value;
        const active = overlay.querySelector('#offer-active').value === 'true';
        const startDate = overlay.querySelector('#offer-start-date').value;
        const endDate = overlay.querySelector('#offer-end-date').value;
        const notes = overlay.querySelector('#offer-notes').value.trim();

        /* Champs abonnement */
        const nbSessionsEl = overlay.querySelector('#offer-nb-sessions');
        const nbSessions = nbSessionsEl ? (parseInt(nbSessionsEl.value, 10) || 0) : 0;

        const recurrenceEl = overlay.querySelector('#offer-recurrence');
        const recurrence = recurrenceEl ? (recurrenceEl.value || null) : null;

        const sessConsumedEl = overlay.querySelector('#offer-sessions-consumed');
        const sessionsConsumed = sessConsumedEl ? (parseInt(sessConsumedEl.value, 10) || 0) : (isEdit ? data.sessionsConsumed : 0);

        /* Modules sélectionnés */
        const selectedModuleIds = [];
        overlay.querySelectorAll('input[name="offer-modules"]:checked').forEach(cb => {
          selectedModuleIds.push(cb.value);
        });

        /* Vérification finale du prix plancher (alerte non bloquante) */
        const partialOffer = { type, moduleIds: selectedModuleIds, nbSessions };
        const floor = Engine.computeOfferFloor(partialOffer);
        if (price > 0 && price < floor) {
          const proceed = confirm(
            `Attention : le prix (${Engine.fmt(price)}) est inf\u00e9rieur au seuil plancher (${Engine.fmt(floor)}).\n` +
            `La rentabilit\u00e9 de cette offre n'est pas garantie.\n\nContinuer quand m\u00eame ?`
          );
          if (!proceed) return;
        }

        /* Objet offre à persister */
        const offerData = {
          label,
          type,
          clientIds: [...(data.clientIds || [])],
          moduleIds: selectedModuleIds,
          price,
          paymentTerms,
          nbSessions: type === 'abonnement' ? nbSessions : 0,
          recurrence: type === 'abonnement' ? recurrence : null,
          sessionsConsumed: type === 'abonnement' ? sessionsConsumed : 0,
          startDate,
          endDate,
          notes,
          active
        };

        if (isEdit) {
          DB.offers.update(offerId, offerData);
          Toast.show('Offre « ' + label + ' » mise à jour.', 'success');
        } else {
          DB.offers.create(offerData);
          Toast.show('Offre « ' + label + ' » créée.', 'success');
        }

        closeModal();
        renderMain();
      });
    }

    /* ==========================================================
       RENDU INITIAL
       ========================================================== */

    renderMain();
  }
};
