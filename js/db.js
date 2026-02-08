/* ============================================================
   DST-SYSTEM — Couche de persistance (localStorage)
   Gère toutes les entités métier avec CRUD complet.
   ============================================================ */

const DB = (() => {
  'use strict';

  const STORAGE_PREFIX = 'dst_';

  /* --- Helpers --- */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function now() {
    return new Date().toISOString();
  }

  function getStore(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(`DB: erreur lecture ${key}`, e);
      return [];
    }
  }

  function setStore(key, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    } catch (e) {
      console.error(`DB: erreur écriture ${key}`, e);
    }
  }

  function getConfig(key, defaultVal) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'config_' + key);
      return raw ? JSON.parse(raw) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  function setConfig(key, val) {
    localStorage.setItem(STORAGE_PREFIX + 'config_' + key, JSON.stringify(val));
  }

  /* --- Generic CRUD Factory --- */
  function createCRUD(storeName) {
    return {
      getAll() {
        return getStore(storeName);
      },
      getById(id) {
        return getStore(storeName).find(item => item.id === id) || null;
      },
      create(data) {
        const items = getStore(storeName);
        const record = {
          ...data,
          id: generateId(),
          createdAt: now(),
          updatedAt: now()
        };
        items.push(record);
        setStore(storeName, items);
        return record;
      },
      update(id, data) {
        const items = getStore(storeName);
        const idx = items.findIndex(item => item.id === id);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...data, updatedAt: now() };
        setStore(storeName, items);
        return items[idx];
      },
      delete(id) {
        const items = getStore(storeName);
        const filtered = items.filter(item => item.id !== id);
        setStore(storeName, filtered);
        return filtered.length < items.length;
      },
      count() {
        return getStore(storeName).length;
      },
      filter(predicate) {
        return getStore(storeName).filter(predicate);
      },
      find(predicate) {
        return getStore(storeName).find(predicate) || null;
      },
      clear() {
        setStore(storeName, []);
      }
    };
  }

  /* --- Entités métier --- */
  const operators   = createCRUD('operators');
  const modules     = createCRUD('modules');
  const clients     = createCRUD('clients');
  const offers      = createCRUD('offers');
  const sessions    = createCRUD('sessions');
  const locations   = createCRUD('locations');

  /* --- Paramètres économiques --- */
  const DEFAULT_SETTINGS = {
    // Coûts fixes annuels
    fixedCosts: [
      { label: 'Loyer / locaux', amount: 0 },
      { label: 'Assurances', amount: 0 },
      { label: 'Comptabilité / juridique', amount: 0 },
      { label: 'Logiciels / licences', amount: 0 },
      { label: 'Véhicules', amount: 0 },
      { label: 'Communication / marketing', amount: 0 },
      { label: 'Autres charges fixes', amount: 0 }
    ],
    // Taux charges patronales global (legacy, conservé pour rétrocompat)
    employerChargeRate: 45,

    /* ============================================================
       BARÈME CHARGES SOCIALES — Taux officiels France 2025
       Chaque ligne est paramétrable par l'utilisateur.
       ============================================================ */
    chargesConfig: {
      // Plafond Annuel de la Sécurité Sociale (2025)
      passAnnuel: 47100,
      // SMIC mensuel brut (2025 — 11,88 €/h × 151,67h)
      smicMensuelBrut: 1801.80,
      // Jours ouvrés moyens par an
      joursOuvresAn: 218,
      // Effectif entreprise : 'moins11' | 'de11a49' | '50etplus'
      effectif: 'moins11',

      /* --- Charges patronales (sur brut) --- */
      patronales: [
        { code: 'maladie',            taux: 13.00, tauxReduit: 7.00,  seuilSmic: 2.5,  label: 'Assurance maladie-maternité-invalidité-décès' },
        { code: 'vieillessePlaf',     taux: 8.55,  plafonnee: true,  label: 'Assurance vieillesse plafonnée' },
        { code: 'vieillesseDeplaf',   taux: 2.02,  label: 'Assurance vieillesse déplafonnée' },
        { code: 'allocFamiliales',    taux: 5.25,  tauxReduit: 3.45, seuilSmic: 3.5,  label: 'Allocations familiales' },
        { code: 'accidentsTravail',   taux: 1.50,  label: 'Accidents du travail / Maladies pro.' },
        { code: 'csa',               taux: 0.30,  label: 'Contribution solidarité autonomie (CSA)' },
        { code: 'assuranceChomage',   taux: 4.05,  label: 'Assurance chômage' },
        { code: 'ags',               taux: 0.15,  label: 'AGS (garantie des salaires)' },
        { code: 'retraiteT1',        taux: 4.72,  plafonnee: true,  label: 'Retraite complémentaire AGIRC-ARRCO T1' },
        { code: 'retraiteT2',        taux: 12.95, tranche2: true,   label: 'Retraite complémentaire AGIRC-ARRCO T2' },
        { code: 'cegT1',             taux: 1.29,  plafonnee: true,  label: 'CEG (Contribution Équilibre Général) T1' },
        { code: 'cegT2',             taux: 1.62,  tranche2: true,   label: 'CEG T2' },
        { code: 'cet',               taux: 0.21,  tranche2: true,   label: 'CET (Contribution Équilibre Technique)' },
        { code: 'fnal',              taux: 0.10,  plafonnee: true,  label: 'FNAL (Fonds National Aide au Logement)' },
        { code: 'formationPro',      taux: 0.55,  label: 'Formation professionnelle' },
        { code: 'taxeApprentissage', taux: 0.68,  label: 'Taxe d\'apprentissage' },
        { code: 'dialogueSocial',    taux: 0.016, label: 'Contribution au dialogue social' },
        { code: 'versementMobilite', taux: 0,     label: 'Versement mobilité (transport)' },
        { code: 'prevoyanceMutuelle',taux: 0,     label: 'Prévoyance / Mutuelle patronale' }
      ],

      /* --- Charges salariales (prélevées sur brut) --- */
      salariales: [
        { code: 'vieillessePlaf',     taux: 6.90,  plafonnee: true,   label: 'Assurance vieillesse plafonnée' },
        { code: 'vieillesseDeplaf',   taux: 0.40,  label: 'Assurance vieillesse déplafonnée' },
        { code: 'csgDeductible',      taux: 6.80,  assiette9825: true, label: 'CSG déductible' },
        { code: 'csgNonDeductible',   taux: 2.40,  assiette9825: true, label: 'CSG non déductible' },
        { code: 'crds',              taux: 0.50,  assiette9825: true, label: 'CRDS' },
        { code: 'retraiteT1',        taux: 3.15,  plafonnee: true,   label: 'Retraite complémentaire AGIRC-ARRCO T1' },
        { code: 'retraiteT2',        taux: 8.64,  tranche2: true,    label: 'Retraite complémentaire AGIRC-ARRCO T2' },
        { code: 'cegT1',             taux: 0.86,  plafonnee: true,   label: 'CEG T1' },
        { code: 'cegT2',             taux: 1.08,  tranche2: true,    label: 'CEG T2' },
        { code: 'cet',               taux: 0.14,  tranche2: true,    label: 'CET' }
      ],

      /* --- Spécificités CDD --- */
      cdd: {
        primePrecarite: 10,    // % du brut total
        indemniteCP: 10        // % du brut (+ prime précarité)
      },

      /* --- Spécificités Intérim --- */
      interim: {
        coefficientAgence: 2.0 // Coefficient facturé par l'agence
      },

      /* --- Spécificités Freelance / Auto-entrepreneur --- */
      freelance: {
        tauxCharges: 21.1      // % (BNC services libérales 2025)
      },

      /* --- Spécificités Fondateur --- */
      fondateur: {
        regime: 'tns',         // 'tns' | 'assimileSalarie'
        tauxTNS: 45            // % cotisations TNS approximatif
      }
    },
    // Marge cible (%)
    targetMarginPercent: 30,
    // Taux TVA (%)
    vatRate: 20,
    // Heures de travail par jour (pour calcul taux horaire → journalier)
    hoursPerDay: 7,
    // Amortissements matériels annuels
    equipmentAmortization: [
      { label: 'Simulateurs laser', amount: 0, durationYears: 5 },
      { label: 'Matériel pédagogique', amount: 0, durationYears: 3 },
      { label: 'Équipements de protection', amount: 0, durationYears: 3 },
      { label: 'Informatique / serveurs', amount: 0, durationYears: 4 }
    ],
    // Nombre estimé de sessions annuelles (pour répartition coûts fixes)
    estimatedAnnualSessions: 100,
    // Nombre de jours objectif annuels (pour seuil plancher)
    nbJoursObjectifAnnuel: 50,
    // Coûts variables par défaut par session
    defaultSessionVariableCosts: [
      { label: 'Consommables', amount: 0 },
      { label: 'Transport / déplacement', amount: 0 },
      { label: 'Location matériel', amount: 0 }
    ],
    // Types de clients (extensible)
    clientTypes: ['Collectivité', 'Police / Gendarmerie', 'Armée', 'Entreprise privée', 'Sécurité privée', 'Particulier', 'Association', 'Autre'],
    // Statuts opérateurs (extensible)
    operatorStatuses: ['freelance', 'interim', 'contrat_journalier', 'cdd', 'cdi', 'fondateur'],
    // Types d'offres
    offerTypes: ['one_shot', 'abonnement', 'personnalisee'],
    // Coefficients intérim
    interimCoefficient: 2.0,
    // Charges freelance estimées (%)
    freelanceChargeRate: 25,
    // Seuil alerte marge (%)
    marginAlertThreshold: 15,
    // Seuil alerte surcharge opérateur (sessions/mois)
    operatorOverloadThreshold: 15,
    // Seuil bascule CDI (sessions/an par opérateur)
    cdiThreshold: 80
  };

  const settings = {
    get() {
      return getConfig('settings', DEFAULT_SETTINGS);
    },
    set(data) {
      setConfig('settings', data);
    },
    update(partial) {
      const current = this.get();
      const merged = { ...current, ...partial };
      this.set(merged);
      return merged;
    },
    reset() {
      this.set(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    },
    getDefaults() {
      return { ...DEFAULT_SETTINGS };
    }
  };

  /* --- Export / Import complet --- */
  function exportAll() {
    return {
      version: 1,
      exportedAt: now(),
      data: {
        operators: operators.getAll(),
        modules: modules.getAll(),
        clients: clients.getAll(),
        offers: offers.getAll(),
        sessions: sessions.getAll(),
        locations: locations.getAll(),
        settings: settings.get()
      }
    };
  }

  function importAll(dump) {
    if (!dump || !dump.data) throw new Error('Format d\'import invalide');
    const d = dump.data;
    if (d.operators) setStore('operators', d.operators);
    if (d.modules) setStore('modules', d.modules);
    if (d.clients) setStore('clients', d.clients);
    if (d.offers) setStore('offers', d.offers);
    if (d.sessions) setStore('sessions', d.sessions);
    if (d.locations) setStore('locations', d.locations);
    if (d.settings) settings.set(d.settings);
  }

  function clearAll() {
    ['operators','modules','clients','offers','sessions','locations'].forEach(k => setStore(k, []));
    settings.reset();
  }

  /* --- API publique --- */
  return {
    operators,
    modules,
    clients,
    offers,
    sessions,
    locations,
    settings,
    exportAll,
    importAll,
    clearAll,
    generateId
  };
})();
