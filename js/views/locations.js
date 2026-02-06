/* ============================================================
   DST-SYSTEM — Vue : Gestion des Lieux
   CRUD complet pour les sites d'entraînement (stands de tir,
   salles CQB, terrains extérieurs, etc.)
   ============================================================ */

window.Views = window.Views || {};

Views.Locations = {

  /**
   * Point d'entrée — injecte le HTML dans le conteneur et
   * branche tous les écouteurs d'événements.
   */
  render(container) {
    'use strict';

    /* ----------------------------------------------------------
       État local de la vue
       ---------------------------------------------------------- */
    let searchTerm = '';

    /* ----------------------------------------------------------
       Helpers internes
       ---------------------------------------------------------- */

    /** Récupère les lieux filtrés selon la recherche courante. */
    function getFilteredLocations() {
      const all = DB.locations.getAll();
      if (!searchTerm) return all;
      const q = searchTerm.toLowerCase();
      return all.filter(loc =>
        (loc.name || '').toLowerCase().includes(q) ||
        (loc.city || '').toLowerCase().includes(q)
      );
    }

    /** Retourne le nombre de modules compatibles pour un lieu donné. */
    function compatibleCount(loc) {
      return (loc.compatibleModuleIds && loc.compatibleModuleIds.length) || 0;
    }

    /** Choisit la classe de tag CSS en fonction du type de lieu. */
    function typeTagClass(type) {
      const map = {
        'Stand de tir':      'tag-red',
        'Salle CQB':        'tag-yellow',
        'Terrain extérieur': 'tag-green',
        'Salle de cours':    'tag-blue',
        'Site client':       'tag-neutral',
        'Autre':             'tag-neutral'
      };
      return map[type] || 'tag-neutral';
    }

    /** Échappe le HTML pour éviter les injections XSS. */
    function esc(str) {
      if (str == null) return '';
      const el = document.createElement('span');
      el.textContent = String(str);
      return el.innerHTML;
    }

    /* ----------------------------------------------------------
       Construction du tableau principal
       ---------------------------------------------------------- */
    function buildTableHTML(locations) {
      if (locations.length === 0) {
        return `
          <div class="empty-state">
            <div class="empty-icon">&#x1F4CD;</div>
            <p>Aucun lieu enregistré pour le moment.</p>
            <button class="btn btn-primary" id="loc-empty-add">Ajouter un lieu</button>
          </div>`;
      }

      const rows = locations.map(loc => `
        <tr data-id="${esc(loc.id)}">
          <td>${esc(loc.name)}</td>
          <td>${esc(loc.city)}</td>
          <td><span class="tag ${typeTagClass(loc.type)}">${esc(loc.type || 'N/D')}</span></td>
          <td class="num">${loc.capacity != null ? loc.capacity : '—'}</td>
          <td class="num">${compatibleCount(loc)}</td>
          <td class="num">${Engine.fmt(loc.costPerSession || 0)}</td>
          <td>
            <span class="tag ${loc.active !== false ? 'tag-green' : 'tag-neutral'}">
              ${loc.active !== false ? 'Actif' : 'Inactif'}
            </span>
          </td>
          <td class="actions-cell">
            <button class="btn btn-sm btn-ghost loc-btn-edit" data-id="${esc(loc.id)}" title="Modifier">&#9998;</button>
            <button class="btn btn-sm btn-ghost loc-btn-delete" data-id="${esc(loc.id)}" title="Supprimer">&#128465;</button>
          </td>
        </tr>`).join('');

      return `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Ville</th>
                <th>Type</th>
                <th class="num">Capacité</th>
                <th class="num">Modules</th>
                <th class="num">Coût / session</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    /* ----------------------------------------------------------
       Construction du modal (création / édition)
       ---------------------------------------------------------- */
    function buildModalHTML(loc) {
      const isEdit     = !!loc;
      const title      = isEdit ? 'Modifier le lieu' : 'Nouveau lieu';
      const data       = loc || {};
      const allModules = DB.modules.getAll();
      const selected   = data.compatibleModuleIds || [];

      /* Types prédéfinis pour le champ libre (datalist) */
      const typeOptions = [
        'Stand de tir',
        'Salle CQB',
        'Terrain extérieur',
        'Salle de cours',
        'Site client',
        'Autre'
      ];

      /* Liste de modules avec cases à cocher */
      let modulesCheckboxes = '';
      if (allModules.length === 0) {
        modulesCheckboxes = '<p class="text-muted" style="font-size:.82rem;">Aucun module enregistré.</p>';
      } else {
        modulesCheckboxes = allModules.map(m => {
          const checked = selected.includes(m.id) ? 'checked' : '';
          return `
            <label class="form-check" style="margin-bottom:6px;">
              <input type="checkbox" name="compatibleModuleIds" value="${esc(m.id)}" ${checked}>
              <span>${esc(m.name)}</span>
            </label>`;
        }).join('');
      }

      return `
      <div class="modal-overlay" id="loc-modal-overlay">
        <div class="modal modal-lg">

          <div class="modal-header">
            <h2>${title}</h2>
            <button class="btn btn-sm btn-ghost" id="loc-modal-close">&times;</button>
          </div>

          <div class="modal-body">
            <form id="loc-form" autocomplete="off">
              ${isEdit ? `<input type="hidden" name="id" value="${esc(data.id)}">` : ''}

              <!-- Informations principales -->
              <div class="form-row">
                <div class="form-group">
                  <label for="loc-name">Nom du lieu *</label>
                  <input type="text" id="loc-name" name="name" class="form-control"
                         value="${esc(data.name)}" required placeholder="Ex : Stand municipal Villepinte">
                </div>
                <div class="form-group">
                  <label for="loc-city">Ville</label>
                  <input type="text" id="loc-city" name="city" class="form-control"
                         value="${esc(data.city)}" placeholder="Ex : Villepinte">
                </div>
              </div>

              <div class="form-group">
                <label for="loc-address">Adresse complète</label>
                <input type="text" id="loc-address" name="address" class="form-control"
                       value="${esc(data.address)}" placeholder="Rue, code postal…">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="loc-type">Type de lieu</label>
                  <input type="text" id="loc-type" name="type" class="form-control"
                         list="loc-type-list" value="${esc(data.type)}" placeholder="Sélectionner ou saisir…">
                  <datalist id="loc-type-list">
                    ${typeOptions.map(t => `<option value="${esc(t)}">`).join('')}
                  </datalist>
                </div>
                <div class="form-group">
                  <label for="loc-capacity">Capacité (participants)</label>
                  <input type="number" id="loc-capacity" name="capacity" class="form-control"
                         value="${data.capacity != null ? data.capacity : ''}" min="0" placeholder="Ex : 12">
                </div>
                <div class="form-group">
                  <label for="loc-cost">Coût par session</label>
                  <input type="number" id="loc-cost" name="costPerSession" class="form-control"
                         value="${data.costPerSession != null ? data.costPerSession : ''}" min="0" step="0.01"
                         placeholder="0 si propriétaire">
                  <span class="form-help">0 si lieu détenu en propre</span>
                </div>
              </div>

              <!-- Équipement disponible -->
              <div class="form-group">
                <label for="loc-equipment">Équipements disponibles sur place</label>
                <textarea id="loc-equipment" name="equipmentAvailable" class="form-control"
                          placeholder="Cibles, système de ventilation, éclairage modulable…">${esc(data.equipmentAvailable)}</textarea>
              </div>

              <!-- Contact sur place -->
              <div class="form-row">
                <div class="form-group">
                  <label for="loc-contact-name">Nom du contact</label>
                  <input type="text" id="loc-contact-name" name="contactName" class="form-control"
                         value="${esc(data.contactName)}" placeholder="Responsable du site">
                </div>
                <div class="form-group">
                  <label for="loc-contact-phone">Téléphone du contact</label>
                  <input type="tel" id="loc-contact-phone" name="contactPhone" class="form-control"
                         value="${esc(data.contactPhone)}" placeholder="06 XX XX XX XX">
                </div>
              </div>

              <!-- Options -->
              <div class="form-row">
                <div class="form-group">
                  <label>&nbsp;</label>
                  <label class="form-check">
                    <input type="checkbox" name="active" id="loc-active" ${data.active !== false ? 'checked' : ''}>
                    <span>Lieu actif</span>
                  </label>
                </div>
                <div class="form-group">
                  <label>&nbsp;</label>
                  <label class="form-check">
                    <input type="checkbox" name="shared" id="loc-shared" ${data.shared ? 'checked' : ''}>
                    <span>Mutualisable entre clients</span>
                  </label>
                </div>
              </div>

              <!-- Notes -->
              <div class="form-group">
                <label for="loc-notes">Notes internes</label>
                <textarea id="loc-notes" name="notes" class="form-control"
                          placeholder="Informations complémentaires…">${esc(data.notes)}</textarea>
              </div>

              <!-- Modules compatibles -->
              <div class="form-group">
                <label>Modules compatibles</label>
                <div id="loc-modules-list" style="max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;">
                  ${modulesCheckboxes}
                </div>
              </div>

            </form>
          </div>

          <div class="modal-footer">
            <button class="btn" id="loc-modal-cancel">Annuler</button>
            <button class="btn btn-primary" id="loc-modal-save">${isEdit ? 'Enregistrer' : 'Créer'}</button>
          </div>

        </div>
      </div>`;
    }

    /* ----------------------------------------------------------
       Collecte des données du formulaire
       ---------------------------------------------------------- */
    function collectFormData() {
      const form = document.getElementById('loc-form');
      if (!form) return null;

      /* Récupération des modules cochés */
      const moduleCheckboxes = form.querySelectorAll('input[name="compatibleModuleIds"]:checked');
      const compatibleModuleIds = Array.from(moduleCheckboxes).map(cb => cb.value);

      return {
        name:                form.querySelector('[name="name"]').value.trim(),
        address:             form.querySelector('[name="address"]').value.trim(),
        city:                form.querySelector('[name="city"]').value.trim(),
        type:                form.querySelector('[name="type"]').value.trim(),
        capacity:            form.querySelector('[name="capacity"]').value !== ''
                               ? parseInt(form.querySelector('[name="capacity"]').value, 10)
                               : null,
        costPerSession:      form.querySelector('[name="costPerSession"]').value !== ''
                               ? parseFloat(form.querySelector('[name="costPerSession"]').value)
                               : 0,
        equipmentAvailable:  form.querySelector('[name="equipmentAvailable"]').value.trim(),
        contactName:         form.querySelector('[name="contactName"]').value.trim(),
        contactPhone:        form.querySelector('[name="contactPhone"]').value.trim(),
        active:              form.querySelector('[name="active"]').checked,
        shared:              form.querySelector('[name="shared"]').checked,
        notes:               form.querySelector('[name="notes"]').value.trim(),
        compatibleModuleIds: compatibleModuleIds
      };
    }

    /* ----------------------------------------------------------
       Ouverture / fermeture du modal
       ---------------------------------------------------------- */
    function openModal(loc) {
      /* Supprime un éventuel modal existant */
      closeModal();

      const html = buildModalHTML(loc || null);
      document.body.insertAdjacentHTML('beforeend', html);

      /* Écouteurs du modal */
      const overlay   = document.getElementById('loc-modal-overlay');
      const btnClose  = document.getElementById('loc-modal-close');
      const btnCancel = document.getElementById('loc-modal-cancel');
      const btnSave   = document.getElementById('loc-modal-save');

      btnClose.addEventListener('click', closeModal);
      btnCancel.addEventListener('click', closeModal);

      /* Fermeture en cliquant sur le fond */
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });

      /* Sauvegarde */
      btnSave.addEventListener('click', function () {
        const data = collectFormData();
        if (!data) return;

        /* Validation minimale */
        if (!data.name) {
          document.getElementById('loc-name').focus();
          return;
        }

        const hiddenId = document.querySelector('#loc-form input[name="id"]');
        if (hiddenId) {
          /* Mode édition */
          DB.locations.update(hiddenId.value, data);
        } else {
          /* Mode création */
          DB.locations.create(data);
        }

        closeModal();
        refresh();
      });
    }

    function closeModal() {
      const existing = document.getElementById('loc-modal-overlay');
      if (existing) existing.remove();
    }

    /* ----------------------------------------------------------
       Suppression d'un lieu (avec confirmation)
       ---------------------------------------------------------- */
    function confirmDelete(id) {
      const loc = DB.locations.getById(id);
      if (!loc) return;

      /* Demande de confirmation simple */
      const ok = window.confirm(
        'Supprimer le lieu « ' + (loc.name || id) + ' » ?\nCette action est irréversible.'
      );
      if (!ok) return;

      DB.locations.delete(id);
      refresh();
    }

    /* ----------------------------------------------------------
       Rafraîchissement de la liste
       ---------------------------------------------------------- */
    function refresh() {
      const locations = getFilteredLocations();
      const tableZone = document.getElementById('loc-table-zone');
      if (tableZone) {
        tableZone.innerHTML = buildTableHTML(locations);
        attachTableListeners();
      }
    }

    /* ----------------------------------------------------------
       Branchement des écouteurs sur le tableau
       ---------------------------------------------------------- */
    function attachTableListeners() {
      /* Boutons Modifier */
      document.querySelectorAll('.loc-btn-edit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const loc = DB.locations.getById(this.dataset.id);
          if (loc) openModal(loc);
        });
      });

      /* Boutons Supprimer */
      document.querySelectorAll('.loc-btn-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
          confirmDelete(this.dataset.id);
        });
      });

      /* Bouton ajout depuis l'état vide */
      const emptyBtn = document.getElementById('loc-empty-add');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', function () { openModal(null); });
      }
    }

    /* ----------------------------------------------------------
       Rendu initial de la page
       ---------------------------------------------------------- */
    const locations = getFilteredLocations();

    container.innerHTML = `
      <div class="page-header">
        <h1>Lieux d'entraînement</h1>
        <div class="actions">
          <div class="search-bar">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="loc-search" placeholder="Rechercher un lieu…" value="${esc(searchTerm)}">
          </div>
          <button class="btn btn-primary" id="loc-btn-add">+ Nouveau lieu</button>
        </div>
      </div>

      <div class="card">
        <div id="loc-table-zone">
          ${buildTableHTML(locations)}
        </div>
      </div>`;

    /* ----------------------------------------------------------
       Écouteurs globaux de la page
       ---------------------------------------------------------- */

    /* Bouton Ajouter */
    document.getElementById('loc-btn-add').addEventListener('click', function () {
      openModal(null);
    });

    /* Barre de recherche (filtrage temps réel) */
    document.getElementById('loc-search').addEventListener('input', function () {
      searchTerm = this.value.trim();
      refresh();
    });

    /* Écouteurs du tableau (première passe) */
    attachTableListeners();
  }
};
