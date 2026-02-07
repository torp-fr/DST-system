/* ============================================================
   DST-SYSTEM — Vue : Catalogue des Modules de Formation
   Gestion CRUD complète des modules d'entraînement.
   Chaque module définit un objectif de session, ses coûts,
   ses contraintes et ses incompatibilités.
   ============================================================ */

window.Views = window.Views || {};

Views.Modules = {

  /* --- Point d'entrée principal --- */
  render(container) {
    'use strict';

    /* --------------------------------------------------------
       État local de la vue
       -------------------------------------------------------- */
    let searchQuery = '';
    let currentModal = null; // null | 'create' | moduleId (édition)

    /* --------------------------------------------------------
       Correspondance catégorie → classe CSS tag
       -------------------------------------------------------- */
    const CATEGORY_TAG_MAP = {
      'tir':          'tag-red',
      'cqb':          'tag-red',
      'stress':       'tag-yellow',
      'tactique':     'tag-blue',
      'secourisme':   'tag-green',
      'communication':'tag-blue',
      'leadership':   'tag-blue',
      'navigation':   'tag-neutral',
      'explosifs':    'tag-red',
      'renseignement':'tag-neutral'
    };

    /**
     * Retourne la classe CSS du tag pour une catégorie donnée.
     * Comparaison insensible à la casse, valeur par défaut neutre.
     */
    function categoryTagClass(category) {
      if (!category) return 'tag-neutral';
      const key = category.trim().toLowerCase();
      return CATEGORY_TAG_MAP[key] || 'tag-neutral';
    }

    /* --------------------------------------------------------
       Récupération et filtrage des modules
       -------------------------------------------------------- */

    /** Retourne tous les modules filtrés par la recherche courante. */
    function getFilteredModules() {
      const all = DB.modules.getAll();
      if (!searchQuery) return all;
      const q = searchQuery.toLowerCase();
      return all.filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q)
      );
    }

    /* --------------------------------------------------------
       Rendu principal
       -------------------------------------------------------- */

    function renderPage() {
      const modules = getFilteredModules();

      container.innerHTML = `
        <!-- En-tête de page -->
        <div class="page-header">
          <h1>Modules de formation</h1>
          <div class="actions">
            <div class="search-bar">
              <span class="search-icon">&#128269;</span>
              <input type="text"
                     id="mod-search"
                     class="form-control"
                     placeholder="Rechercher nom ou catégorie..."
                     value="${escapeAttr(searchQuery)}" />
            </div>
            <button class="btn btn-primary" id="btn-add-module">+ Nouveau module</button>
          </div>
        </div>

        <!-- Contenu principal -->
        ${modules.length === 0 ? renderEmptyState() : renderTable(modules)}
      `;

      /* --- Branchement des événements --- */
      bindPageEvents();
    }

    /* --------------------------------------------------------
       Rendu : état vide
       -------------------------------------------------------- */

    function renderEmptyState() {
      const hasSearch = searchQuery.length > 0;
      return `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon">&#128218;</div>
            <p>${hasSearch
              ? 'Aucun module ne correspond à votre recherche.'
              : 'Aucun module de formation enregistré.'
            }</p>
            ${hasSearch
              ? '<button class="btn btn-sm" id="btn-clear-search">Effacer la recherche</button>'
              : '<button class="btn btn-primary" id="btn-empty-add">Créer un premier module</button>'
            }
          </div>
        </div>
      `;
    }

    /* --------------------------------------------------------
       Rendu : tableau des modules
       -------------------------------------------------------- */

    function renderTable(modules) {
      const rows = modules.map(m => {
        /* Calcul du coût total affiché (fixe + variable) */
        const totalCost = (m.fixedCost || 0) + (m.variableCost || 0);
        const activeLabel = m.active !== false
          ? '<span class="tag tag-green">Actif</span>'
          : '<span class="tag tag-neutral">Inactif</span>';

        return `
          <tr data-id="${m.id}">
            <td>
              <strong>${escapeHtml(m.name || '')}</strong>
              ${m.objective ? `<br><span class="text-muted" style="font-size:0.78rem">${escapeHtml(truncate(m.objective, 60))}</span>` : ''}
            </td>
            <td><span class="tag ${categoryTagClass(m.category)}">${escapeHtml(m.category || '—')}</span></td>
            <td class="num">${m.requiredOperators || 1}</td>
            <td class="num" data-tooltip="Fixe : ${escapeAttr(Engine.fmt(m.fixedCost || 0))} + Variable : ${escapeAttr(Engine.fmt(m.variableCost || 0))}">
              ${Engine.fmt(totalCost)}
            </td>
            <td class="num">${m.duration ? m.duration + ' h' : '—'}</td>
            <td>${activeLabel}</td>
            <td class="actions-cell">
              <button class="btn btn-sm btn-ghost btn-edit" data-id="${m.id}" title="Modifier">&#9998;</button>
              <button class="btn btn-sm btn-ghost text-red btn-delete" data-id="${m.id}" title="Supprimer">&#128465;</button>
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
                  <th>Nom</th>
                  <th>Catégorie</th>
                  <th class="text-right">Opérateurs</th>
                  <th class="text-right">Coût session</th>
                  <th class="text-right">Durée</th>
                  <th>Statut</th>
                  <th class="text-right">Actions</th>
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

    /* --------------------------------------------------------
       Rendu : modale de création / édition
       -------------------------------------------------------- */

    /**
     * Affiche la modale de formulaire pour un module.
     * @param {Object|null} mod - module existant (édition) ou null (création)
     */
    function renderModal(mod) {
      const isEdit = !!mod;
      const title = isEdit ? 'Modifier le module' : 'Nouveau module de formation';
      const m = mod || {};

      /* Liste des autres modules pour les incompatibilités */
      const allModules = DB.modules.getAll().filter(x => !mod || x.id !== mod.id);
      const incompatibleIds = m.incompatibilities || [];

      /* Calcul d'aperçu coût */
      const previewFixedCost = m.fixedCost || 0;
      const previewVarCost = m.variableCost || 0;
      const previewTotal = previewFixedCost + previewVarCost;

      /* Construction des checkboxes d'incompatibilités */
      const incompatChecks = allModules.length > 0
        ? allModules.map(other => `
            <label class="form-check" style="margin-bottom:4px">
              <input type="checkbox"
                     name="incompat"
                     value="${other.id}"
                     ${incompatibleIds.includes(other.id) ? 'checked' : ''} />
              <span>${escapeHtml(other.name || other.id)}${other.category ? ' <span class="text-muted">(' + escapeHtml(other.category) + ')</span>' : ''}</span>
            </label>
          `).join('')
        : '<span class="text-muted">Aucun autre module disponible.</span>';

      /* Catégories suggérées (issues des modules existants + par défaut) */
      const existingCategories = [...new Set(
        DB.modules.getAll()
          .map(x => x.category)
          .filter(Boolean)
      )];
      const defaultCategories = ['Tir', 'CQB', 'Stress', 'Tactique', 'Secourisme'];
      const allCategories = [...new Set([...defaultCategories, ...existingCategories])];
      const datalistOptions = allCategories.map(c =>
        `<option value="${escapeAttr(c)}">`
      ).join('');

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'mod-modal-overlay';

      overlay.innerHTML = `
        <div class="modal modal-lg">
          <!-- En-tête modale -->
          <div class="modal-header">
            <h2>${title}</h2>
            <button class="btn btn-sm btn-ghost" id="btn-modal-close">&times;</button>
          </div>

          <!-- Corps du formulaire -->
          <div class="modal-body">
            <form id="mod-form" autocomplete="off">

              <!-- Bloc principal -->
              <div class="form-row">
                <div class="form-group">
                  <label for="mod-name">Nom du module *</label>
                  <input type="text" id="mod-name" class="form-control"
                         value="${escapeAttr(m.name || '')}"
                         placeholder="Ex : Tir de précision longue distance" required />
                </div>
                <div class="form-group">
                  <label for="mod-category">Catégorie</label>
                  <input type="text" id="mod-category" class="form-control"
                         list="dl-categories"
                         value="${escapeAttr(m.category || '')}"
                         placeholder="Ex : Tir, CQB, Stress..." />
                  <datalist id="dl-categories">${datalistOptions}</datalist>
                </div>
              </div>

              <div class="form-group">
                <label for="mod-objective">Objectif de la session *</label>
                <textarea id="mod-objective" class="form-control" rows="2"
                          placeholder="Décrivez l'objectif pédagogique clair de ce module..."
                          required>${escapeHtml(m.objective || '')}</textarea>
                <div class="form-help">Cet objectif sera affiché sur les documents de session.</div>
              </div>

              <div class="form-group">
                <label for="mod-description">Description complémentaire</label>
                <textarea id="mod-description" class="form-control" rows="2"
                          placeholder="Détails internes, notes pour les opérateurs...">${escapeHtml(m.description || '')}</textarea>
              </div>

              <!-- Bloc opérateurs et durée -->
              <div class="form-row">
                <div class="form-group">
                  <label for="mod-operators">Opérateurs requis</label>
                  <input type="number" id="mod-operators" class="form-control"
                         min="1" step="1"
                         value="${m.requiredOperators || 1}"
                         placeholder="1" />
                  <div class="form-help">Nombre minimum d'opérateurs pour animer ce module.</div>
                </div>
                <div class="form-group">
                  <label for="mod-duration">Durée (heures)</label>
                  <input type="number" id="mod-duration" class="form-control"
                         min="0.5" step="0.5"
                         value="${m.duration || ''}"
                         placeholder="Ex : 4" />
                </div>
                <div class="form-group">
                  <label>&nbsp;</label>
                  <label class="form-check" style="margin-top:4px">
                    <input type="checkbox" id="mod-active" ${m.active !== false ? 'checked' : ''} />
                    <span>Module actif</span>
                  </label>
                </div>
              </div>

              <!-- Bloc coûts -->
              <div class="card" style="margin-top:8px">
                <div class="card-header">
                  <h3>Coûts du module</h3>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="mod-fixed-cost">Coût fixe par session</label>
                    <input type="number" id="mod-fixed-cost" class="form-control"
                           min="0" step="0.01"
                           value="${m.fixedCost || 0}"
                           placeholder="0" />
                    <div class="form-help">Ajouté systématiquement à chaque session.</div>
                  </div>
                  <div class="form-group">
                    <label for="mod-var-cost">Coût variable par session</label>
                    <input type="number" id="mod-var-cost" class="form-control"
                           min="0" step="0.01"
                           value="${m.variableCost || 0}"
                           placeholder="0" />
                    <div class="form-help">Consommables, munitions, usure matériel...</div>
                  </div>
                </div>
                <!-- Aperçu automatique du coût total -->
                <div id="cost-preview" class="alert alert-info" style="margin-top:8px">
                  <span class="alert-icon">&#9432;</span>
                  <span>
                    <strong>Effet sur session :</strong>
                    Fixe ${Engine.fmt(previewFixedCost)} + Variable ${Engine.fmt(previewVarCost)}
                    = <strong>${Engine.fmt(previewTotal)}</strong> par session
                    ${(m.requiredOperators || 1) > 1
                      ? ` — Nécessite <strong>${m.requiredOperators} opérateurs</strong>`
                      : ''}
                  </span>
                </div>
              </div>

              <!-- Bloc contraintes et logistique -->
              <div class="card" style="margin-top:8px">
                <div class="card-header">
                  <h3>Contraintes &amp; logistique</h3>
                </div>
                <div class="form-group">
                  <label for="mod-location">Exigences de lieu</label>
                  <input type="text" id="mod-location" class="form-control"
                         value="${escapeAttr(m.locationRequirements || '')}"
                         placeholder="Ex : Stand de tir homologué 200m, terrain urbain..." />
                </div>
                <div class="form-group">
                  <label for="mod-equipment">Matériel nécessaire</label>
                  <textarea id="mod-equipment" class="form-control" rows="2"
                            placeholder="Ex : 10 simulateurs laser, cibles IPSC, chronographe...">${escapeHtml(m.equipmentNeeded || '')}</textarea>
                </div>
                <div class="form-group">
                  <label for="mod-security">Contraintes de sécurité</label>
                  <textarea id="mod-security" class="form-control" rows="2"
                            placeholder="Ex : Briefing sécurité obligatoire, périmètre bouclé...">${escapeHtml(m.securityConstraints || '')}</textarea>
                </div>
              </div>

              <!-- Bloc incompatibilités -->
              <div class="card" style="margin-top:8px">
                <div class="card-header">
                  <h3>Incompatibilités</h3>
                </div>
                <p class="text-muted mb-8" style="font-size:0.82rem">
                  Cochez les modules qui ne peuvent pas être combinés avec celui-ci dans une même session.
                </p>
                <div id="incompat-list" style="max-height:180px;overflow-y:auto">
                  ${incompatChecks}
                </div>
              </div>

            </form>
          </div>

          <!-- Pied de modale -->
          <div class="modal-footer">
            <button class="btn" id="btn-modal-cancel">Annuler</button>
            <button class="btn btn-primary" id="btn-modal-save">
              ${isEdit ? 'Enregistrer les modifications' : 'Créer le module'}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      bindModalEvents(overlay, mod);
    }

    /* --------------------------------------------------------
       Rendu : modale de confirmation de suppression
       -------------------------------------------------------- */

    function renderDeleteConfirm(mod) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'mod-delete-overlay';

      overlay.innerHTML = `
        <div class="modal" style="max-width:480px">
          <div class="modal-header">
            <h2>Confirmer la suppression</h2>
            <button class="btn btn-sm btn-ghost" id="btn-del-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger">
              <span class="alert-icon">&#9888;</span>
              <span>
                Vous êtes sur le point de supprimer le module
                <strong>${escapeHtml(mod.name || '')}</strong>.<br>
                Cette action est irréversible.
              </span>
            </div>
            ${checkModuleUsage(mod.id)}
          </div>
          <div class="modal-footer">
            <button class="btn" id="btn-del-cancel">Annuler</button>
            <button class="btn btn-primary" id="btn-del-confirm" style="background:var(--accent-red)">
              Supprimer définitivement
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      /* Événements de la modale de suppression */
      const close = () => { overlay.remove(); };
      overlay.querySelector('#btn-del-close').addEventListener('click', close);
      overlay.querySelector('#btn-del-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      overlay.querySelector('#btn-del-confirm').addEventListener('click', () => {
        /* Nettoyer les références d'incompatibilité dans les autres modules */
        removeIncompatibilityRefs(mod.id);
        DB.modules.delete(mod.id);
        close();
        renderPage();
      });
    }

    /**
     * Vérifie si le module est utilisé dans des sessions existantes.
     * Retourne un avertissement HTML le cas échéant.
     */
    function checkModuleUsage(moduleId) {
      const sessions = DB.sessions.getAll().filter(s =>
        (s.moduleIds || []).includes(moduleId)
      );
      if (sessions.length === 0) return '';
      return `
        <div class="alert alert-warning" style="margin-top:8px">
          <span class="alert-icon">&#9888;</span>
          <span>
            Ce module est référencé dans <strong>${sessions.length} session(s)</strong>.
            La suppression ne modifiera pas les sessions existantes, mais elles
            référenceront un module introuvable.
          </span>
        </div>
      `;
    }

    /**
     * Supprime l'ID du module des listes d'incompatibilités des autres modules.
     */
    function removeIncompatibilityRefs(moduleId) {
      const allModules = DB.modules.getAll();
      allModules.forEach(m => {
        if (m.incompatibilities && m.incompatibilities.includes(moduleId)) {
          const cleaned = m.incompatibilities.filter(id => id !== moduleId);
          DB.modules.update(m.id, { incompatibilities: cleaned });
        }
      });
    }

    /* --------------------------------------------------------
       Événements : page principale
       -------------------------------------------------------- */

    function bindPageEvents() {
      /* Barre de recherche */
      const searchInput = container.querySelector('#mod-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchQuery = e.target.value.trim();
          renderPage();
          /* Remettre le focus et le curseur dans le champ de recherche */
          const newInput = container.querySelector('#mod-search');
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(newInput.value.length, newInput.value.length);
          }
        });
      }

      /* Bouton "Effacer la recherche" (état vide avec filtre) */
      const btnClear = container.querySelector('#btn-clear-search');
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          searchQuery = '';
          renderPage();
        });
      }

      /* Boutons d'ajout (en-tête et état vide) */
      const btnAdd = container.querySelector('#btn-add-module');
      if (btnAdd) {
        btnAdd.addEventListener('click', () => renderModal(null));
      }
      const btnEmptyAdd = container.querySelector('#btn-empty-add');
      if (btnEmptyAdd) {
        btnEmptyAdd.addEventListener('click', () => renderModal(null));
      }

      /* Boutons d'action dans le tableau */
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const mod = DB.modules.getById(btn.dataset.id);
          if (mod) renderModal(mod);
        });
      });

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const mod = DB.modules.getById(btn.dataset.id);
          if (mod) renderDeleteConfirm(mod);
        });
      });
    }

    /* --------------------------------------------------------
       Événements : modale de formulaire
       -------------------------------------------------------- */

    function bindModalEvents(overlay, existingMod) {
      const isEdit = !!existingMod;

      /* Fermeture de la modale */
      const close = () => { overlay.remove(); };

      overlay.querySelector('#btn-modal-close').addEventListener('click', close);
      overlay.querySelector('#btn-modal-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      /* Mise à jour dynamique de l'aperçu des coûts */
      const fixedInput = overlay.querySelector('#mod-fixed-cost');
      const varInput = overlay.querySelector('#mod-var-cost');
      const opInput = overlay.querySelector('#mod-operators');
      const preview = overlay.querySelector('#cost-preview');

      function updateCostPreview() {
        const fc = parseFloat(fixedInput.value) || 0;
        const vc = parseFloat(varInput.value) || 0;
        const total = fc + vc;
        const ops = parseInt(opInput.value) || 1;

        preview.innerHTML = `
          <span class="alert-icon">&#9432;</span>
          <span>
            <strong>Effet sur session :</strong>
            Fixe ${Engine.fmt(fc)} + Variable ${Engine.fmt(vc)}
            = <strong>${Engine.fmt(total)}</strong> par session
            ${ops > 1 ? ` — Nécessite <strong>${ops} opérateurs</strong>` : ''}
          </span>
        `;
      }

      fixedInput.addEventListener('input', updateCostPreview);
      varInput.addEventListener('input', updateCostPreview);
      opInput.addEventListener('input', updateCostPreview);

      /* Sauvegarde */
      overlay.querySelector('#btn-modal-save').addEventListener('click', () => {
        const form = overlay.querySelector('#mod-form');

        /* Récupération des valeurs */
        const name = overlay.querySelector('#mod-name').value.trim();
        const objective = overlay.querySelector('#mod-objective').value.trim();
        const category = overlay.querySelector('#mod-category').value.trim();
        const description = overlay.querySelector('#mod-description').value.trim();
        const requiredOperators = parseInt(overlay.querySelector('#mod-operators').value) || 1;
        const duration = parseFloat(overlay.querySelector('#mod-duration').value) || 0;
        const active = overlay.querySelector('#mod-active').checked;
        const fixedCost = parseFloat(fixedInput.value) || 0;
        const variableCost = parseFloat(varInput.value) || 0;
        const locationRequirements = overlay.querySelector('#mod-location').value.trim();
        const equipmentNeeded = overlay.querySelector('#mod-equipment').value.trim();
        const securityConstraints = overlay.querySelector('#mod-security').value.trim();

        /* Incompatibilités sélectionnées */
        const incompatibilities = [];
        overlay.querySelectorAll('input[name="incompat"]:checked').forEach(cb => {
          incompatibilities.push(cb.value);
        });

        /* Validation minimale */
        if (!name) {
          highlightField(overlay.querySelector('#mod-name'));
          return;
        }
        if (!objective) {
          highlightField(overlay.querySelector('#mod-objective'));
          return;
        }

        /* Construction de l'objet module */
        const data = {
          name,
          description,
          objective,
          category,
          requiredOperators,
          fixedCost,
          variableCost,
          locationRequirements,
          equipmentNeeded,
          securityConstraints,
          incompatibilities,
          duration,
          active
        };

        if (isEdit) {
          DB.modules.update(existingMod.id, data);
          /* Synchroniser les incompatibilités bidirectionnelles */
          syncIncompatibilities(existingMod.id, incompatibilities);
        } else {
          const created = DB.modules.create(data);
          /* Synchroniser les incompatibilités bidirectionnelles */
          syncIncompatibilities(created.id, incompatibilities);
        }

        close();
        renderPage();
      });
    }

    /* --------------------------------------------------------
       Synchronisation bidirectionnelle des incompatibilités
       Quand A est marqué incompatible avec B, B est aussi
       marqué incompatible avec A.
       -------------------------------------------------------- */

    function syncIncompatibilities(moduleId, selectedIds) {
      const allModules = DB.modules.getAll();

      allModules.forEach(other => {
        if (other.id === moduleId) return;

        const otherIncompat = other.incompatibilities || [];
        const shouldBeIncompat = selectedIds.includes(other.id);
        const isCurrentlyIncompat = otherIncompat.includes(moduleId);

        if (shouldBeIncompat && !isCurrentlyIncompat) {
          /* Ajouter la référence réciproque */
          DB.modules.update(other.id, {
            incompatibilities: [...otherIncompat, moduleId]
          });
        } else if (!shouldBeIncompat && isCurrentlyIncompat) {
          /* Retirer la référence réciproque */
          DB.modules.update(other.id, {
            incompatibilities: otherIncompat.filter(id => id !== moduleId)
          });
        }
      });
    }

    /* --------------------------------------------------------
       Utilitaires
       -------------------------------------------------------- */

    /** Échappe les caractères HTML dangereux. */
    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /** Échappe pour utilisation dans les attributs HTML. */
    function escapeAttr(str) {
      return escapeHtml(String(str));
    }

    /** Tronque un texte à la longueur maximale spécifiée. */
    function truncate(str, max) {
      if (!str || str.length <= max) return str || '';
      return str.substring(0, max) + '...';
    }

    /** Met en surbrillance un champ invalide avec un effet temporaire. */
    function highlightField(el) {
      if (!el) return;
      el.style.borderColor = 'var(--accent-red)';
      el.focus();
      setTimeout(() => {
        el.style.borderColor = '';
      }, 2000);
    }

    /* --------------------------------------------------------
       Lancement du rendu initial
       -------------------------------------------------------- */
    renderPage();
  }
};
