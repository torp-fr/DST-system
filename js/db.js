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
    // Taux charges patronales (%)
    employerChargeRate: 45,
    // Marge cible (%)
    targetMarginPercent: 30,
    // Taux TVA (%)
    vatRate: 20,
    // Amortissements matériels annuels
    equipmentAmortization: [
      { label: 'Simulateurs laser', amount: 0, durationYears: 5 },
      { label: 'Matériel pédagogique', amount: 0, durationYears: 3 },
      { label: 'Équipements de protection', amount: 0, durationYears: 3 },
      { label: 'Informatique / serveurs', amount: 0, durationYears: 4 }
    ],
    // Nombre estimé de sessions annuelles (pour répartition coûts fixes)
    estimatedAnnualSessions: 100,
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
