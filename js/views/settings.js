/* ============================================================
   DST-SYSTEM — Vue Paramètres
   Gestion complète des paramètres économiques, RH, types
   extensibles, et import/export des données.
   ============================================================ */

window.Views = window.Views || {};

Views.Settings = {

  render(container) {
    'use strict';

    const settings = DB.settings.get();

    /* ----------------------------------------------------------
       État local mutable — copie de travail des paramètres
       ---------------------------------------------------------- */
    const state = {
      fixedCosts:      JSON.parse(JSON.stringify(settings.fixedCosts || [])),
      equipmentAmortization: JSON.parse(JSON.stringify(settings.equipmentAmortization || [])),
      defaultSessionVariableCosts: JSON.parse(JSON.stringify(settings.defaultSessionVariableCosts || [])),
      clientTypes:     [...(settings.clientTypes || [])],
      operatorStatuses: [...(settings.operatorStatuses || [])],
      offerTypes:      [...(settings.offerTypes || [])],
      employerChargeRate:       settings.employerChargeRate ?? 45,
      interimCoefficient:       settings.interimCoefficient ?? 2.0,
      freelanceChargeRate:      settings.freelanceChargeRate ?? 25,
      operatorOverloadThreshold: settings.operatorOverloadThreshold ?? 15,
      cdiThreshold:             settings.cdiThreshold ?? 80,
      targetMarginPercent:      settings.targetMarginPercent ?? 30,
      marginAlertThreshold:     settings.marginAlertThreshold ?? 15,
      vatRate:                  settings.vatRate ?? 20,
      estimatedAnnualSessions:  settings.estimatedAnnualSessions ?? 100
    };

    /* ----------------------------------------------------------
       Fonctions utilitaires de calcul
       ---------------------------------------------------------- */

    /** Total des coûts fixes annuels */
    function totalFixed() {
      return state.fixedCosts.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    }

    /** Total amortissement annuel */
    function totalAmortization() {
      return state.equipmentAmortization.reduce((s, a) => {
        const years = Math.max(parseFloat(a.durationYears) || 1, 1);
        return s + ((parseFloat(a.amount) || 0) / years);
      }, 0);
    }

    /** Quote-part coûts fixes par session */
    function fixedPerSession() {
      const est = Math.max(state.estimatedAnnualSessions, 1);
      return (totalFixed() + totalAmortization()) / est;
    }

    /* ----------------------------------------------------------
       Génération du HTML
       ---------------------------------------------------------- */

    /** Carte récapitulative KPI en haut de page */
    function renderSummary() {
      const tf = totalFixed();
      const ta = totalAmortization();
      const fps = fixedPerSession();
      return `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Coûts fixes / an</div>
            <div class="kpi-value text-mono">${Engine.fmt(tf)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Amortissements / an</div>
            <div class="kpi-value text-mono">${Engine.fmt(ta)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Charge fixe / session</div>
            <div class="kpi-value text-mono">${Engine.fmt(Engine.round2(fps))}</div>
            <div class="kpi-detail">Sur base de ${state.estimatedAnnualSessions} sessions/an</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Marge cible</div>
            <div class="kpi-value">${state.targetMarginPercent} %</div>
          </div>
        </div>`;
    }

    /** Section 1 — Coûts fixes annuels */
    function renderFixedCosts() {
      const rows = state.fixedCosts.map((c, i) => `
        <div class="form-inline mb-8" data-section="fixed" data-index="${i}">
          <div class="form-group" style="flex:2;margin-bottom:0">
            <input type="text" class="form-control fc-label" value="${escapeAttr(c.label)}" placeholder="Libellé">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="form-control fc-amount text-mono" value="${c.amount || 0}" min="0" step="100" placeholder="Montant">
          </div>
          <button class="btn btn-sm btn-ghost fc-remove" title="Supprimer">&times;</button>
        </div>`).join('');

      return `
        <div class="card" id="section-fixed">
          <div class="card-header">
            <h2>Coûts fixes annuels</h2>
            <button class="btn btn-sm" id="btn-add-fixed">+ Ajouter</button>
          </div>
          ${rows}
          <div class="flex-between mt-16" style="border-top:1px solid var(--border-color);padding-top:12px">
            <span class="text-muted">Total coûts fixes</span>
            <span class="font-bold text-mono" id="total-fixed">${Engine.fmt(totalFixed())}</span>
          </div>
        </div>`;
    }

    /** Section 2 — Amortissements matériels */
    function renderAmortization() {
      const rows = state.equipmentAmortization.map((a, i) => {
        const years = Math.max(parseFloat(a.durationYears) || 1, 1);
        const annual = (parseFloat(a.amount) || 0) / years;
        return `
        <div class="form-inline mb-8" data-section="amort" data-index="${i}">
          <div class="form-group" style="flex:2;margin-bottom:0">
            <input type="text" class="form-control am-label" value="${escapeAttr(a.label)}" placeholder="Libellé">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="form-control am-amount text-mono" value="${a.amount || 0}" min="0" step="100" placeholder="Montant achat">
          </div>
          <div class="form-group" style="flex:0.5;margin-bottom:0">
            <input type="number" class="form-control am-duration" value="${a.durationYears || 1}" min="1" max="30" step="1" placeholder="Années">
          </div>
          <span class="text-mono text-muted" style="min-width:90px;text-align:right" title="Amortissement annuel">${Engine.fmt(Engine.round2(annual))}/an</span>
          <button class="btn btn-sm btn-ghost am-remove" title="Supprimer">&times;</button>
        </div>`;
      }).join('');

      return `
        <div class="card" id="section-amort">
          <div class="card-header">
            <h2>Amortissements matériels</h2>
            <button class="btn btn-sm" id="btn-add-amort">+ Ajouter</button>
          </div>
          <div class="form-inline mb-8 text-muted" style="font-size:0.75rem">
            <span style="flex:2">Libellé</span>
            <span style="flex:1">Montant achat</span>
            <span style="flex:0.5">Durée (ans)</span>
            <span style="min-width:90px;text-align:right">Amort./an</span>
            <span style="width:36px"></span>
          </div>
          ${rows}
          <div class="flex-between mt-16" style="border-top:1px solid var(--border-color);padding-top:12px">
            <span class="text-muted">Total amortissement annuel</span>
            <span class="font-bold text-mono" id="total-amort">${Engine.fmt(Engine.round2(totalAmortization()))}</span>
          </div>
        </div>`;
    }

    /** Section 3 — Coûts variables par défaut (par session) */
    function renderVariableCosts() {
      const rows = state.defaultSessionVariableCosts.map((v, i) => `
        <div class="form-inline mb-8" data-section="var" data-index="${i}">
          <div class="form-group" style="flex:2;margin-bottom:0">
            <input type="text" class="form-control vc-label" value="${escapeAttr(v.label)}" placeholder="Libellé">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="form-control vc-amount text-mono" value="${v.amount || 0}" min="0" step="10" placeholder="Montant par défaut">
          </div>
          <button class="btn btn-sm btn-ghost vc-remove" title="Supprimer">&times;</button>
        </div>`).join('');

      return `
        <div class="card" id="section-variable">
          <div class="card-header">
            <h2>Coûts variables par défaut (par session)</h2>
            <button class="btn btn-sm" id="btn-add-var">+ Ajouter</button>
          </div>
          <p class="form-help mb-16">Ces coûts seront pré-remplis lors de la création d'une nouvelle session.</p>
          ${rows}
        </div>`;
    }

    /** Section 4 — Paramètres RH */
    function renderHR() {
      return `
        <div class="card" id="section-rh">
          <div class="card-header">
            <h2>Paramètres RH</h2>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rh-employer-charge">Charges patronales (%)</label>
              <input type="number" id="rh-employer-charge" class="form-control" value="${state.employerChargeRate}" min="0" max="100" step="0.5">
              <span class="form-help">Taux appliqué sur le brut pour les salariés</span>
            </div>
            <div class="form-group">
              <label for="rh-interim-coeff">Coefficient intérim</label>
              <input type="number" id="rh-interim-coeff" class="form-control" value="${state.interimCoefficient}" min="1" max="5" step="0.1">
              <span class="form-help">Multiplicateur appliqué au coût de base intérim</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rh-freelance-charge">Charges freelance estimées (%)</label>
              <input type="number" id="rh-freelance-charge" class="form-control" value="${state.freelanceChargeRate}" min="0" max="100" step="0.5">
              <span class="form-help">Estimation des charges sociales freelance</span>
            </div>
            <div class="form-group">
              <label for="rh-overload">Seuil surcharge (sessions/mois)</label>
              <input type="number" id="rh-overload" class="form-control" value="${state.operatorOverloadThreshold}" min="1" max="50" step="1">
              <span class="form-help">Alerte si un opérateur dépasse ce seuil mensuel</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rh-cdi-threshold">Seuil bascule CDI (sessions/an)</label>
              <input type="number" id="rh-cdi-threshold" class="form-control" value="${state.cdiThreshold}" min="1" max="365" step="1">
              <span class="form-help">Suggestion de CDI si un opérateur atteint ce nombre annuel</span>
            </div>
          </div>
        </div>`;
    }

    /** Section 5 — Paramètres économiques */
    function renderEconomic() {
      return `
        <div class="card" id="section-eco">
          <div class="card-header">
            <h2>Paramètres économiques</h2>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="eco-target-margin">Marge cible (%)</label>
              <input type="number" id="eco-target-margin" class="form-control" value="${state.targetMarginPercent}" min="0" max="100" step="0.5">
              <span class="form-help">Objectif de marge sur chaque session</span>
            </div>
            <div class="form-group">
              <label for="eco-margin-alert">Seuil alerte marge (%)</label>
              <input type="number" id="eco-margin-alert" class="form-control" value="${state.marginAlertThreshold}" min="0" max="100" step="0.5">
              <span class="form-help">Alerte si la marge tombe sous ce seuil</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="eco-vat">Taux TVA (%)</label>
              <input type="number" id="eco-vat" class="form-control" value="${state.vatRate}" min="0" max="30" step="0.1">
            </div>
            <div class="form-group">
              <label for="eco-est-sessions">Sessions estimées / an</label>
              <input type="number" id="eco-est-sessions" class="form-control" value="${state.estimatedAnnualSessions}" min="1" max="1000" step="1">
              <span class="form-help">Base de répartition des coûts fixes par session</span>
            </div>
          </div>
        </div>`;
    }

    /** Section 6 — Types extensibles */
    function renderTypes() {
      /* Types clients — éditable */
      const clientTags = state.clientTypes.map((t, i) => `
        <span class="tag tag-blue" style="gap:6px">
          ${escapeHTML(t)}
          <span class="ct-remove" data-index="${i}" style="cursor:pointer;opacity:0.7" title="Supprimer">&times;</span>
        </span>`).join('');

      /* Statuts opérateurs — lecture seule */
      const opTags = state.operatorStatuses.map(s =>
        `<span class="tag tag-neutral">${Engine.statusLabel ? Engine.statusLabel(s) : escapeHTML(s)}</span>`
      ).join('');

      /* Types d'offres — lecture seule */
      const offerTags = state.offerTypes.map(t =>
        `<span class="tag tag-neutral">${Engine.offerTypeLabel ? Engine.offerTypeLabel(t) : escapeHTML(t)}</span>`
      ).join('');

      return `
        <div class="card" id="section-types">
          <div class="card-header">
            <h2>Types extensibles</h2>
          </div>

          <div class="form-group">
            <label>Types de clients</label>
            <div class="flex gap-8 mb-8" style="flex-wrap:wrap" id="client-types-list">
              ${clientTags}
            </div>
            <div class="form-inline">
              <input type="text" id="input-new-client-type" class="form-control" placeholder="Nouveau type client" style="max-width:260px">
              <button class="btn btn-sm" id="btn-add-client-type">+ Ajouter</button>
            </div>
          </div>

          <div class="form-group mt-16">
            <label>Statuts opérateurs <span class="text-muted" style="text-transform:none;font-weight:400">(définis par le système)</span></label>
            <div class="flex gap-8" style="flex-wrap:wrap">
              ${opTags}
            </div>
          </div>

          <div class="form-group mt-16">
            <label>Types d'offres <span class="text-muted" style="text-transform:none;font-weight:400">(définis par le système)</span></label>
            <div class="flex gap-8" style="flex-wrap:wrap">
              ${offerTags}
            </div>
          </div>
        </div>`;
    }

    /** Section 7 — Données (export / import / reset) */
    function renderData() {
      return `
        <div class="card" id="section-data">
          <div class="card-header">
            <h2>Données</h2>
          </div>
          <div class="alert alert-info mb-16">
            <span class="alert-icon">&#9432;</span>
            <span>L'export génère un fichier JSON contenant toutes les données de l'application (paramètres, clients, opérateurs, sessions, etc.).</span>
          </div>
          <div class="flex gap-12" style="flex-wrap:wrap">
            <button class="btn" id="btn-export">Exporter toutes les données (JSON)</button>
            <label class="btn" style="cursor:pointer">
              Importer des données (JSON)
              <input type="file" id="input-import" accept=".json,application/json" style="display:none">
            </label>
            <button class="btn btn-warning" id="btn-reset">Réinitialiser toutes les données</button>
          </div>
          <div id="data-feedback" class="mt-16"></div>
        </div>`;
    }

    /* ----------------------------------------------------------
       Assemblage de la page
       ---------------------------------------------------------- */
    container.innerHTML = `
      <div class="page-header">
        <h1>Paramètres</h1>
        <div class="actions">
          <button class="btn btn-primary" id="btn-save-settings">Enregistrer les paramètres</button>
        </div>
      </div>

      ${renderSummary()}

      <div class="alert alert-warning mb-16">
        <span class="alert-icon">&#9888;</span>
        <span>Les modifications ne sont prises en compte qu'après avoir cliqué sur <strong>Enregistrer</strong>.</span>
      </div>

      <div class="grid-2">
        <div>
          ${renderFixedCosts()}
          ${renderAmortization()}
          ${renderVariableCosts()}
        </div>
        <div>
          ${renderHR()}
          ${renderEconomic()}
          ${renderTypes()}
        </div>
      </div>

      ${renderData()}

      <!-- Modale de confirmation de réinitialisation -->
      <div id="modal-reset-overlay" class="modal-overlay hidden">
        <div class="modal" style="max-width:480px">
          <div class="modal-header">
            <h2>Confirmer la réinitialisation</h2>
            <button class="btn btn-sm btn-ghost" id="modal-reset-close">&times;</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom:12px">Cette action va <strong>supprimer définitivement toutes les données</strong> de l'application :</p>
            <ul style="margin-left:18px;margin-bottom:16px;color:var(--text-secondary)">
              <li>Clients, opérateurs, sessions, offres, modules, lieux</li>
              <li>Tous les paramètres seront restaurés aux valeurs par défaut</li>
            </ul>
            <div class="form-group">
              <label for="reset-confirm-input">Tapez <strong style="color:var(--accent-red-light)">SUPPRIMER</strong> pour confirmer</label>
              <input type="text" id="reset-confirm-input" class="form-control" placeholder="SUPPRIMER" autocomplete="off">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn" id="modal-reset-cancel">Annuler</button>
            <button class="btn btn-warning" id="modal-reset-confirm" disabled>Réinitialiser</button>
          </div>
        </div>
      </div>
    `;

    /* ----------------------------------------------------------
       Raccourcis vers les éléments du DOM
       ---------------------------------------------------------- */
    const $  = (sel) => container.querySelector(sel);
    const $$ = (sel) => container.querySelectorAll(sel);

    /* ----------------------------------------------------------
       Fonctions de mise à jour partielle (sans re-render complet)
       ---------------------------------------------------------- */

    /** Met à jour les totaux affichés et les KPI du résumé */
    function refreshTotals() {
      const elFixed = $('#total-fixed');
      const elAmort = $('#total-amort');
      if (elFixed) elFixed.textContent = Engine.fmt(totalFixed());
      if (elAmort) elAmort.textContent = Engine.fmt(Engine.round2(totalAmortization()));

      /* KPI résumé */
      const kpis = $$('.kpi-card .kpi-value');
      if (kpis.length >= 4) {
        kpis[0].textContent = Engine.fmt(totalFixed());
        kpis[1].textContent = Engine.fmt(Engine.round2(totalAmortization()));
        kpis[2].textContent = Engine.fmt(Engine.round2(fixedPerSession()));
        kpis[3].textContent = state.targetMarginPercent + ' %';
      }
      /* Détail sous la charge fixe/session */
      const detail = container.querySelector('.kpi-card:nth-child(3) .kpi-detail');
      if (detail) detail.textContent = 'Sur base de ' + state.estimatedAnnualSessions + ' sessions/an';
    }

    /** Recharge une section de liste éditable et réattache les listeners */
    function reRenderSection(sectionId, renderFn) {
      const wrapper = $('#section-' + sectionId);
      if (!wrapper) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = renderFn();
      const newCard = tmp.firstElementChild;
      wrapper.replaceWith(newCard);
      attachListEditListeners();
      refreshTotals();
    }

    /* ----------------------------------------------------------
       Collecte des valeurs depuis le DOM → state
       ---------------------------------------------------------- */

    function syncFixedCostsFromDOM() {
      const rows = $$('[data-section="fixed"]');
      state.fixedCosts = Array.from(rows).map(row => ({
        label:  row.querySelector('.fc-label').value.trim(),
        amount: parseFloat(row.querySelector('.fc-amount').value) || 0
      }));
    }

    function syncAmortFromDOM() {
      const rows = $$('[data-section="amort"]');
      state.equipmentAmortization = Array.from(rows).map(row => ({
        label:         row.querySelector('.am-label').value.trim(),
        amount:        parseFloat(row.querySelector('.am-amount').value) || 0,
        durationYears: parseInt(row.querySelector('.am-duration').value, 10) || 1
      }));
    }

    function syncVariableCostsFromDOM() {
      const rows = $$('[data-section="var"]');
      state.defaultSessionVariableCosts = Array.from(rows).map(row => ({
        label:  row.querySelector('.vc-label').value.trim(),
        amount: parseFloat(row.querySelector('.vc-amount').value) || 0
      }));
    }

    function syncScalarsFromDOM() {
      state.employerChargeRate       = parseFloat($('#rh-employer-charge').value) || 0;
      state.interimCoefficient       = parseFloat($('#rh-interim-coeff').value) || 1;
      state.freelanceChargeRate      = parseFloat($('#rh-freelance-charge').value) || 0;
      state.operatorOverloadThreshold = parseInt($('#rh-overload').value, 10) || 1;
      state.cdiThreshold             = parseInt($('#rh-cdi-threshold').value, 10) || 1;
      state.targetMarginPercent      = parseFloat($('#eco-target-margin').value) || 0;
      state.marginAlertThreshold     = parseFloat($('#eco-margin-alert').value) || 0;
      state.vatRate                  = parseFloat($('#eco-vat').value) || 0;
      state.estimatedAnnualSessions  = parseInt($('#eco-est-sessions').value, 10) || 1;
    }

    /** Synchronise l'intégralité du state depuis les valeurs DOM */
    function syncAllFromDOM() {
      syncFixedCostsFromDOM();
      syncAmortFromDOM();
      syncVariableCostsFromDOM();
      syncScalarsFromDOM();
    }

    /* ----------------------------------------------------------
       Listeners — Listes éditables (ajout, suppression, édition)
       ---------------------------------------------------------- */

    function attachListEditListeners() {

      /* --- Coûts fixes : modification en temps réel --- */
      $$('[data-section="fixed"] .fc-label, [data-section="fixed"] .fc-amount').forEach(input => {
        input.addEventListener('input', () => {
          syncFixedCostsFromDOM();
          refreshTotals();
        });
      });

      /* --- Coûts fixes : suppression d'une ligne --- */
      $$('.fc-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          syncFixedCostsFromDOM();
          const idx = parseInt(btn.closest('[data-section="fixed"]').dataset.index, 10);
          state.fixedCosts.splice(idx, 1);
          reRenderSection('fixed', renderFixedCosts);
        });
      });

      /* --- Amortissements : modification en temps réel --- */
      $$('[data-section="amort"] .am-label, [data-section="amort"] .am-amount, [data-section="amort"] .am-duration').forEach(input => {
        input.addEventListener('input', () => {
          syncAmortFromDOM();
          reRenderSection('amort', renderAmortization);
        });
      });

      /* --- Amortissements : suppression d'une ligne --- */
      $$('.am-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          syncAmortFromDOM();
          const idx = parseInt(btn.closest('[data-section="amort"]').dataset.index, 10);
          state.equipmentAmortization.splice(idx, 1);
          reRenderSection('amort', renderAmortization);
        });
      });

      /* --- Coûts variables : modification en temps réel --- */
      $$('[data-section="var"] .vc-label, [data-section="var"] .vc-amount').forEach(input => {
        input.addEventListener('input', () => {
          syncVariableCostsFromDOM();
        });
      });

      /* --- Coûts variables : suppression d'une ligne --- */
      $$('.vc-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          syncVariableCostsFromDOM();
          const idx = parseInt(btn.closest('[data-section="var"]').dataset.index, 10);
          state.defaultSessionVariableCosts.splice(idx, 1);
          reRenderSection('variable', renderVariableCosts);
        });
      });

      /* --- Types clients : suppression --- */
      $$('.ct-remove').forEach(span => {
        span.addEventListener('click', () => {
          const idx = parseInt(span.dataset.index, 10);
          state.clientTypes.splice(idx, 1);
          reRenderSection('types', renderTypes);
        });
      });
    }

    /* ----------------------------------------------------------
       Listeners — Boutons d'ajout de lignes
       ---------------------------------------------------------- */

    function attachAddButtons() {

      /* Ajout coût fixe */
      const btnAddFixed = $('#btn-add-fixed');
      if (btnAddFixed) {
        btnAddFixed.addEventListener('click', () => {
          syncFixedCostsFromDOM();
          state.fixedCosts.push({ label: '', amount: 0 });
          reRenderSection('fixed', renderFixedCosts);
          attachAddButtons();
          /* Focus sur le dernier champ ajouté */
          const inputs = $$('[data-section="fixed"] .fc-label');
          if (inputs.length) inputs[inputs.length - 1].focus();
        });
      }

      /* Ajout amortissement */
      const btnAddAmort = $('#btn-add-amort');
      if (btnAddAmort) {
        btnAddAmort.addEventListener('click', () => {
          syncAmortFromDOM();
          state.equipmentAmortization.push({ label: '', amount: 0, durationYears: 3 });
          reRenderSection('amort', renderAmortization);
          attachAddButtons();
          const inputs = $$('[data-section="amort"] .am-label');
          if (inputs.length) inputs[inputs.length - 1].focus();
        });
      }

      /* Ajout coût variable */
      const btnAddVar = $('#btn-add-var');
      if (btnAddVar) {
        btnAddVar.addEventListener('click', () => {
          syncVariableCostsFromDOM();
          state.defaultSessionVariableCosts.push({ label: '', amount: 0 });
          reRenderSection('variable', renderVariableCosts);
          attachAddButtons();
          const inputs = $$('[data-section="var"] .vc-label');
          if (inputs.length) inputs[inputs.length - 1].focus();
        });
      }

      /* Ajout type client */
      const btnAddCT = $('#btn-add-client-type');
      if (btnAddCT) {
        btnAddCT.addEventListener('click', addClientType);
      }
      const inputCT = $('#input-new-client-type');
      if (inputCT) {
        inputCT.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); addClientType(); }
        });
      }
    }

    function addClientType() {
      const input = $('#input-new-client-type');
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      if (state.clientTypes.includes(val)) {
        input.value = '';
        return;
      }
      state.clientTypes.push(val);
      input.value = '';
      reRenderSection('types', renderTypes);
      attachAddButtons();
    }

    /* ----------------------------------------------------------
       Listeners — Paramètres scalaires (RH + éco) : rafraîchir KPI
       ---------------------------------------------------------- */

    function attachScalarListeners() {
      const scalarIds = [
        'rh-employer-charge', 'rh-interim-coeff', 'rh-freelance-charge',
        'rh-overload', 'rh-cdi-threshold',
        'eco-target-margin', 'eco-margin-alert', 'eco-vat', 'eco-est-sessions'
      ];
      scalarIds.forEach(id => {
        const el = $('#' + id);
        if (el) {
          el.addEventListener('input', () => {
            syncScalarsFromDOM();
            refreshTotals();
          });
        }
      });
    }

    /* ----------------------------------------------------------
       Listeners — Sauvegarde
       ---------------------------------------------------------- */

    function attachSaveButton() {
      const btnSave = $('#btn-save-settings');
      if (!btnSave) return;

      btnSave.addEventListener('click', () => {
        /* Synchroniser toutes les valeurs depuis le DOM */
        syncAllFromDOM();

        /* Construire l'objet de mise à jour */
        const update = {
          fixedCosts:                  state.fixedCosts,
          equipmentAmortization:       state.equipmentAmortization,
          defaultSessionVariableCosts: state.defaultSessionVariableCosts,
          clientTypes:                 state.clientTypes,
          employerChargeRate:          state.employerChargeRate,
          interimCoefficient:          state.interimCoefficient,
          freelanceChargeRate:         state.freelanceChargeRate,
          operatorOverloadThreshold:   state.operatorOverloadThreshold,
          cdiThreshold:                state.cdiThreshold,
          targetMarginPercent:         state.targetMarginPercent,
          marginAlertThreshold:        state.marginAlertThreshold,
          vatRate:                     state.vatRate,
          estimatedAnnualSessions:     state.estimatedAnnualSessions
        };

        DB.settings.update(update);

        /* Confirmation visuelle */
        showFeedback('Paramètres enregistrés avec succès.', 'success');
      });
    }

    /* ----------------------------------------------------------
       Listeners — Export / Import / Reset
       ---------------------------------------------------------- */

    function attachDataActions() {

      /* --- Export JSON --- */
      const btnExport = $('#btn-export');
      if (btnExport) {
        btnExport.addEventListener('click', () => {
          try {
            const data = DB.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            a.download = 'dst-system-export-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showFeedback('Export terminé.', 'success');
          } catch (err) {
            showFeedback('Erreur lors de l\'export : ' + err.message, 'error');
          }
        });
      }

      /* --- Import JSON --- */
      const inputImport = $('#input-import');
      if (inputImport) {
        inputImport.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = JSON.parse(evt.target.result);
              DB.importAll(data);
              showFeedback('Import réussi. Rechargement des paramètres...', 'success');
              /* Recharger la vue avec les nouvelles données */
              setTimeout(() => Views.Settings.render(container), 600);
            } catch (err) {
              showFeedback('Erreur lors de l\'import : ' + err.message, 'error');
            }
          };
          reader.onerror = () => {
            showFeedback('Impossible de lire le fichier.', 'error');
          };
          reader.readAsText(file);

          /* Réinitialiser l'input pour permettre un nouveau choix du même fichier */
          inputImport.value = '';
        });
      }

      /* --- Réinitialisation — ouvrir la modale --- */
      const btnReset = $('#btn-reset');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          const overlay = $('#modal-reset-overlay');
          if (overlay) overlay.classList.remove('hidden');
          const confirmInput = $('#reset-confirm-input');
          if (confirmInput) { confirmInput.value = ''; confirmInput.focus(); }
          const btnConfirm = $('#modal-reset-confirm');
          if (btnConfirm) btnConfirm.disabled = true;
        });
      }

      /* --- Modale : vérification du mot de confirmation --- */
      const confirmInput = $('#reset-confirm-input');
      const btnConfirm   = $('#modal-reset-confirm');
      if (confirmInput && btnConfirm) {
        confirmInput.addEventListener('input', () => {
          btnConfirm.disabled = confirmInput.value.trim() !== 'SUPPRIMER';
        });
      }

      /* --- Modale : confirmer la réinitialisation --- */
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
          try {
            DB.clearAll();
            showFeedback('Toutes les données ont été réinitialisées.', 'success');
            closeResetModal();
            /* Recharger la vue avec les paramètres par défaut */
            setTimeout(() => Views.Settings.render(container), 600);
          } catch (err) {
            showFeedback('Erreur lors de la réinitialisation : ' + err.message, 'error');
          }
        });
      }

      /* --- Modale : annuler / fermer --- */
      const btnCancel    = $('#modal-reset-cancel');
      const btnCloseModal = $('#modal-reset-close');
      [btnCancel, btnCloseModal].forEach(btn => {
        if (btn) btn.addEventListener('click', closeResetModal);
      });

      /* Fermer la modale en cliquant sur l'overlay */
      const overlay = $('#modal-reset-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeResetModal();
        });
      }
    }

    function closeResetModal() {
      const overlay = $('#modal-reset-overlay');
      if (overlay) overlay.classList.add('hidden');
    }

    /* ----------------------------------------------------------
       Feedback utilisateur (messages temporaires)
       ---------------------------------------------------------- */

    function showFeedback(message, type) {
      const zone = $('#data-feedback');
      if (!zone) return;
      const cssClass = type === 'success' ? 'alert-success' :
                       type === 'error'   ? 'alert-danger'  : 'alert-info';
      const icon = type === 'success' ? '&#10003;' :
                   type === 'error'   ? '&#10007;' : '&#9432;';
      zone.innerHTML = `
        <div class="alert ${cssClass}">
          <span class="alert-icon">${icon}</span>
          <span>${escapeHTML(message)}</span>
        </div>`;
      /* Disparition automatique après 5 secondes */
      setTimeout(() => { if (zone) zone.innerHTML = ''; }, 5000);
    }

    /* ----------------------------------------------------------
       Échappement HTML / attributs
       ---------------------------------------------------------- */

    function escapeHTML(str) {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    function escapeAttr(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    /* ----------------------------------------------------------
       Initialisation de tous les listeners
       ---------------------------------------------------------- */
    attachListEditListeners();
    attachAddButtons();
    attachScalarListeners();
    attachSaveButton();
    attachDataActions();
  }
};
