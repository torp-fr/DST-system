/* ============================================================
   DST-SYSTEM — Moteur Économique
   Calculs : coûts sessions, coûts RH, marges, seuils, alertes
   ============================================================ */

const Engine = (() => {
  'use strict';

  /* ----------------------------------------------------------
     CALCULS RH — Bidirectionnel
     ---------------------------------------------------------- */

  /**
   * Calcul du coût entreprise à partir du net souhaité par l'opérateur.
   * net → brut → brut + charges patronales = coût entreprise
   */
  function netToCompanyCost(netDaily, status, settings) {
    const s = settings || DB.settings.get();
    switch (status) {
      case 'freelance': {
        // Freelance : facture TTC, le net est son prix HT
        // Le coût entreprise = net + charges estimées freelance
        const rate = s.freelanceChargeRate / 100;
        return {
          net: netDaily,
          gross: netDaily / (1 - rate),
          charges: (netDaily / (1 - rate)) - netDaily,
          companyCost: netDaily / (1 - rate)
        };
      }
      case 'interim': {
        // Intérim : coefficient appliqué sur le brut
        const chargeRate = s.employerChargeRate / 100;
        const gross = netDaily / (1 - 0.23); // ~23% salariales estimées
        const baseCost = gross * (1 + chargeRate);
        const companyCost = baseCost * s.interimCoefficient;
        return { net: netDaily, gross: round2(gross), charges: round2(companyCost - gross), companyCost: round2(companyCost) };
      }
      case 'contrat_journalier':
      case 'cdd':
      case 'cdi': {
        const chargeRate = s.employerChargeRate / 100;
        const gross = netDaily / (1 - 0.23);
        const companyCost = gross * (1 + chargeRate);
        // CDD : prime précarité 10% + congés payés 10%
        const cddMult = status === 'cdd' ? 1.20 : 1.0;
        return {
          net: netDaily,
          gross: round2(gross),
          charges: round2(gross * chargeRate * cddMult),
          companyCost: round2(companyCost * cddMult)
        };
      }
      case 'fondateur':
        return { net: netDaily, gross: netDaily, charges: 0, companyCost: 0 };
      default:
        return { net: netDaily, gross: netDaily, charges: 0, companyCost: netDaily };
    }
  }

  /**
   * Calcul du net à partir d'un coût max entreprise.
   * coût entreprise → brut → net
   */
  function companyCostToNet(maxCost, status, settings) {
    const s = settings || DB.settings.get();
    switch (status) {
      case 'freelance': {
        const rate = s.freelanceChargeRate / 100;
        const net = maxCost * (1 - rate);
        return { net: round2(net), gross: maxCost, charges: round2(maxCost - net), companyCost: maxCost };
      }
      case 'interim': {
        const chargeRate = s.employerChargeRate / 100;
        const baseCost = maxCost / s.interimCoefficient;
        const gross = baseCost / (1 + chargeRate);
        const net = gross * (1 - 0.23);
        return { net: round2(net), gross: round2(gross), charges: round2(maxCost - gross), companyCost: maxCost };
      }
      case 'contrat_journalier':
      case 'cdd':
      case 'cdi': {
        const chargeRate = s.employerChargeRate / 100;
        const cddMult = status === 'cdd' ? 1.20 : 1.0;
        const gross = maxCost / ((1 + chargeRate) * cddMult);
        const net = gross * (1 - 0.23);
        return { net: round2(net), gross: round2(gross), charges: round2(maxCost - gross), companyCost: maxCost };
      }
      case 'fondateur':
        return { net: maxCost, gross: maxCost, charges: 0, companyCost: 0 };
      default:
        return { net: maxCost, gross: maxCost, charges: 0, companyCost: maxCost };
    }
  }

  /**
   * Compare tous les statuts pour un objectif net donné.
   * Retourne un tableau trié par coût entreprise croissant.
   */
  function compareAllStatuses(netDaily, settings) {
    const s = settings || DB.settings.get();
    const statuses = ['freelance', 'interim', 'contrat_journalier', 'cdd', 'cdi'];
    return statuses.map(status => ({
      status,
      label: statusLabel(status),
      ...netToCompanyCost(netDaily, status, s)
    })).sort((a, b) => a.companyCost - b.companyCost);
  }

  /* ----------------------------------------------------------
     CALCULS SESSION
     ---------------------------------------------------------- */

  /**
   * Calcule le coût complet d'une session.
   */
  function computeSessionCost(session) {
    const s = DB.settings.get();
    const result = {
      operatorsCost: 0,
      modulesCost: 0,
      variableCosts: 0,
      fixedCostShare: 0,
      amortizationShare: 0,
      totalCost: 0,
      revenue: 0,
      margin: 0,
      marginPercent: 0,
      belowFloor: false,
      floorPrice: 0,
      alerts: []
    };

    // 1. Coûts opérateurs affectés
    if (session.operatorIds && session.operatorIds.length > 0) {
      session.operatorIds.forEach(opId => {
        const op = DB.operators.getById(opId);
        if (op) {
          const cost = getOperatorDailyCost(op, s);
          result.operatorsCost += cost;
        }
      });
    }

    // 2. Coûts modules
    if (session.moduleIds && session.moduleIds.length > 0) {
      session.moduleIds.forEach(modId => {
        const mod = DB.modules.getById(modId);
        if (mod) {
          result.modulesCost += (mod.fixedCost || 0) + (mod.variableCost || 0);
        }
      });
    }

    // 3. Coûts variables de la session
    if (session.variableCosts && session.variableCosts.length > 0) {
      session.variableCosts.forEach(vc => {
        result.variableCosts += (vc.amount || 0);
      });
    }

    // 4. Quote-part coûts fixes annuels
    const totalFixedAnnual = s.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const estSessions = Math.max(s.estimatedAnnualSessions, 1);
    result.fixedCostShare = round2(totalFixedAnnual / estSessions);

    // 5. Quote-part amortissements
    const totalAmort = s.equipmentAmortization.reduce((sum, a) => {
      const years = Math.max(a.durationYears || 1, 1);
      return sum + ((a.amount || 0) / years);
    }, 0);
    result.amortizationShare = round2(totalAmort / estSessions);

    // 6. Coût total
    result.totalCost = round2(
      result.operatorsCost +
      result.modulesCost +
      result.variableCosts +
      result.fixedCostShare +
      result.amortizationShare
    );

    // 7. Seuil plancher (coût total + marge minimale sécurité 5%)
    result.floorPrice = round2(result.totalCost * 1.05);

    // 8. Revenu (prix facturé)
    result.revenue = session.price || 0;

    // 9. Marge
    result.margin = round2(result.revenue - result.totalCost);
    result.marginPercent = result.revenue > 0
      ? round2((result.margin / result.revenue) * 100)
      : 0;

    // 10. Alertes
    if (result.revenue > 0 && result.revenue < result.floorPrice) {
      result.belowFloor = true;
      result.alerts.push({
        level: 'critical',
        message: `Prix (${fmt(result.revenue)}) sous le seuil plancher (${fmt(result.floorPrice)})`
      });
    }

    if (result.marginPercent < s.marginAlertThreshold && result.revenue > 0) {
      result.alerts.push({
        level: 'warning',
        message: `Marge (${result.marginPercent}%) inférieure au seuil d'alerte (${s.marginAlertThreshold}%)`
      });
    }

    if (result.marginPercent < s.targetMarginPercent && result.marginPercent >= s.marginAlertThreshold && result.revenue > 0) {
      result.alerts.push({
        level: 'info',
        message: `Marge (${result.marginPercent}%) sous la cible (${s.targetMarginPercent}%)`
      });
    }

    return result;
  }

  /**
   * Calcule le coût journalier d'un opérateur pour l'entreprise.
   */
  function getOperatorDailyCost(operator, settings) {
    const s = settings || DB.settings.get();
    if (operator.costMode === 'company_max') {
      return operator.companyCostDaily || 0;
    }
    // Mode net souhaité
    const calc = netToCompanyCost(operator.netDaily || 0, operator.status, s);
    return calc.companyCost;
  }

  /* ----------------------------------------------------------
     CALCULS OFFRE / ABONNEMENT
     ---------------------------------------------------------- */

  /**
   * Calcule le prix plancher d'une offre en fonction des sessions prévues.
   */
  function computeOfferFloor(offer) {
    let totalCost = 0;
    const nbSessions = offer.nbSessions || 1;

    // Estimer le coût moyen par session
    if (offer.moduleIds && offer.moduleIds.length > 0) {
      offer.moduleIds.forEach(modId => {
        const mod = DB.modules.getById(modId);
        if (mod) totalCost += (mod.fixedCost || 0) + (mod.variableCost || 0);
      });
    }

    const s = DB.settings.get();
    const totalFixed = s.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const estSessions = Math.max(s.estimatedAnnualSessions, 1);
    const fixedShare = totalFixed / estSessions;

    totalCost += fixedShare;
    totalCost *= nbSessions;

    return round2(totalCost * 1.05); // +5% seuil sécurité
  }

  /* ----------------------------------------------------------
     MOTEUR D'ALERTES GLOBAL
     ---------------------------------------------------------- */

  function computeAllAlerts() {
    const alerts = [];
    const s = DB.settings.get();
    const allSessions = DB.sessions.getAll();
    const allOperators = DB.operators.getAll();

    // 1. Sessions sous seuil plancher
    allSessions.forEach(session => {
      if (session.status === 'annulee') return;
      const cost = computeSessionCost(session);
      cost.alerts.forEach(a => {
        alerts.push({ ...a, context: `Session "${session.label || session.id}"`, sessionId: session.id });
      });
    });

    // 2. Surcharge opérateur
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const opSessionCount = {};

    allSessions.forEach(session => {
      if (session.status === 'annulee') return;
      const d = new Date(session.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        (session.operatorIds || []).forEach(opId => {
          opSessionCount[opId] = (opSessionCount[opId] || 0) + 1;
        });
      }
    });

    allOperators.forEach(op => {
      const count = opSessionCount[op.id] || 0;
      if (count >= s.operatorOverloadThreshold) {
        alerts.push({
          level: 'warning',
          message: `${op.firstName} ${op.lastName} : ${count} sessions ce mois (seuil : ${s.operatorOverloadThreshold})`,
          context: 'Surcharge RH',
          operatorId: op.id
        });
      }
    });

    // 3. Bascule CDI pertinente
    const yearSessions = allSessions.filter(sess => {
      const d = new Date(sess.date);
      return d.getFullYear() === currentYear && sess.status !== 'annulee';
    });

    allOperators.forEach(op => {
      if (op.status === 'cdi' || op.status === 'fondateur') return;
      const count = yearSessions.filter(sess =>
        (sess.operatorIds || []).includes(op.id)
      ).length;
      if (count >= s.cdiThreshold) {
        alerts.push({
          level: 'info',
          message: `${op.firstName} ${op.lastName} : ${count} sessions/an — envisager un CDI (seuil : ${s.cdiThreshold})`,
          context: 'Arbitrage RH',
          operatorId: op.id
        });
      }
    });

    // 4. Dépendance opérateur (un opérateur fait >40% des sessions)
    if (yearSessions.length > 5) {
      const opCounts = {};
      yearSessions.forEach(sess => {
        (sess.operatorIds || []).forEach(opId => {
          opCounts[opId] = (opCounts[opId] || 0) + 1;
        });
      });
      Object.entries(opCounts).forEach(([opId, count]) => {
        const percent = (count / yearSessions.length) * 100;
        if (percent > 40) {
          const op = DB.operators.getById(opId);
          if (op) {
            alerts.push({
              level: 'warning',
              message: `${op.firstName} ${op.lastName} assure ${round2(percent)}% des sessions — risque de dépendance`,
              context: 'Dépendance opérateur',
              operatorId: op.id
            });
          }
        }
      });
    }

    // 5. Modules non rentables
    const moduleRevenue = {};
    const moduleCosts = {};
    allSessions.forEach(sess => {
      if (sess.status === 'annulee') return;
      const cost = computeSessionCost(sess);
      const nbMods = (sess.moduleIds || []).length || 1;
      (sess.moduleIds || []).forEach(modId => {
        moduleRevenue[modId] = (moduleRevenue[modId] || 0) + ((sess.price || 0) / nbMods);
        moduleCosts[modId] = (moduleCosts[modId] || 0) + (cost.totalCost / nbMods);
      });
    });

    Object.entries(moduleCosts).forEach(([modId, totalC]) => {
      const totalR = moduleRevenue[modId] || 0;
      if (totalR > 0 && totalC > totalR) {
        const mod = DB.modules.getById(modId);
        if (mod) {
          alerts.push({
            level: 'warning',
            message: `Module "${mod.name}" : coût cumulé (${fmt(totalC)}) > revenu cumulé (${fmt(totalR)})`,
            context: 'Module non rentable',
            moduleId: modId
          });
        }
      }
    });

    return alerts;
  }

  /* ----------------------------------------------------------
     KPI DASHBOARD
     ---------------------------------------------------------- */

  function computeDashboardKPIs() {
    const s = DB.settings.get();
    const sessions = DB.sessions.getAll();
    const clients = DB.clients.getAll();
    const operators = DB.operators.getAll();
    const now = new Date();

    const activeClients = clients.filter(c => c.active !== false);
    const upcomingSessions = sessions.filter(sess => new Date(sess.date) >= now && sess.status !== 'annulee');
    const pastSessions = sessions.filter(sess => new Date(sess.date) < now && sess.status !== 'annulee');

    // Marge moyenne
    let totalMargin = 0;
    let countPriced = 0;
    pastSessions.forEach(sess => {
      if (sess.price > 0) {
        const cost = computeSessionCost(sess);
        totalMargin += cost.marginPercent;
        countPriced++;
      }
    });
    const avgMargin = countPriced > 0 ? round2(totalMargin / countPriced) : 0;

    // CA réalisé
    const totalRevenue = pastSessions.reduce((sum, s) => sum + (s.price || 0), 0);

    // CA prévisionnel
    const forecastRevenue = upcomingSessions.reduce((sum, s) => sum + (s.price || 0), 0);

    // Coût total réalisé
    let totalCosts = 0;
    pastSessions.forEach(sess => {
      totalCosts += computeSessionCost(sess).totalCost;
    });

    // Charge opérateur ce mois
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthSessions = sessions.filter(sess => {
      const d = new Date(sess.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && sess.status !== 'annulee';
    });

    const opLoad = {};
    monthSessions.forEach(sess => {
      (sess.operatorIds || []).forEach(opId => {
        opLoad[opId] = (opLoad[opId] || 0) + 1;
      });
    });
    const maxLoad = Object.values(opLoad).length > 0 ? Math.max(...Object.values(opLoad)) : 0;

    return {
      activeClients: activeClients.length,
      totalClients: clients.length,
      upcomingSessions: upcomingSessions.length,
      pastSessions: pastSessions.length,
      totalSessions: sessions.length,
      avgMargin,
      totalRevenue: round2(totalRevenue),
      forecastRevenue: round2(forecastRevenue),
      totalCosts: round2(totalCosts),
      netResult: round2(totalRevenue - totalCosts),
      totalOperators: operators.length,
      activeOperators: Object.keys(opLoad).length,
      maxOperatorLoad: maxLoad,
      operatorLoadThreshold: s.operatorOverloadThreshold,
      targetMargin: s.targetMarginPercent,
      monthSessions: monthSessions.length
    };
  }

  /* ----------------------------------------------------------
     UTILITAIRES
     ---------------------------------------------------------- */

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function fmt(n) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function fmtPercent(n) {
    return n.toFixed(1) + ' %';
  }

  function statusLabel(status) {
    const labels = {
      freelance: 'Freelance',
      interim: 'Intérim',
      contrat_journalier: 'Contrat journalier',
      cdd: 'CDD',
      cdi: 'CDI',
      fondateur: 'Fondateur'
    };
    return labels[status] || status;
  }

  function sessionStatusLabel(status) {
    const labels = {
      planifiee: 'Planifiée',
      confirmee: 'Confirmée',
      en_cours: 'En cours',
      terminee: 'Terminée',
      annulee: 'Annulée'
    };
    return labels[status] || status;
  }

  function offerTypeLabel(type) {
    const labels = {
      one_shot: 'One-shot',
      abonnement: 'Abonnement',
      personnalisee: 'Personnalisée'
    };
    return labels[type] || type;
  }

  /* ----------------------------------------------------------
     AMÉLIORATION P1 — Seuil plancher automatique
     ---------------------------------------------------------- */

  /** Calcule le seuil plancher journalier auto-calculé */
  function calculateSeuilPlancher(settings) {
    const s = settings || DB.settings.get();
    const totalFixed = s.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalAmort = s.equipmentAmortization.reduce((sum, a) => {
      const years = Math.max(a.durationYears || 1, 1);
      return sum + ((a.amount || 0) / years);
    }, 0);
    const nbJours = Math.max(s.nbJoursObjectifAnnuel || 50, 1);
    const totalVarDefaut = (s.defaultSessionVariableCosts || []).reduce((sum, v) => sum + (v.amount || 0), 0);
    return round2(((totalFixed + totalAmort) / nbJours) + totalVarDefaut);
  }

  /* ----------------------------------------------------------
     AMÉLIORATION P5 — Point mort + Trésorerie
     ---------------------------------------------------------- */

  /** Calcule le point mort annuel */
  function calculatePointMort() {
    const s = DB.settings.get();
    const sessions = DB.sessions.getAll();
    const totalFixed = s.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalAmort = s.equipmentAmortization.reduce((sum, a) => {
      const years = Math.max(a.durationYears || 1, 1);
      return sum + ((a.amount || 0) / years);
    }, 0);
    const totalCharges = totalFixed + totalAmort;

    const now = new Date();
    const currentYear = now.getFullYear();
    const pastSessions = sessions.filter(sess => {
      const d = new Date(sess.date);
      return d < now && d.getFullYear() === currentYear && sess.status !== 'annulee';
    });

    let margeTotale = 0;
    pastSessions.forEach(sess => {
      if (sess.price > 0) {
        const cost = computeSessionCost(sess);
        margeTotale += cost.margin;
      }
    });
    const margeMoyenne = pastSessions.length > 0 ? margeTotale / pastSessions.length : 0;

    if (margeMoyenne <= 0) {
      return { nbSessions: 0, realisees: pastSessions.length, restantes: 0, statut: 'Impossible', totalCharges };
    }

    const nbSessionsNecessaires = Math.ceil(totalCharges / margeMoyenne);
    const reste = nbSessionsNecessaires - pastSessions.length;
    return {
      nbSessions: nbSessionsNecessaires,
      realisees: pastSessions.length,
      restantes: Math.max(0, reste),
      statut: reste <= 0 ? 'Atteint' : 'En cours',
      totalCharges
    };
  }

  /** Calcule la trésorerie théorique */
  function calculateTresorerie() {
    const s = DB.settings.get();
    const sessions = DB.sessions.getAll();
    const now = new Date();
    const currentYear = now.getFullYear();

    const caRealise = sessions
      .filter(sess => new Date(sess.date) < now && sess.status !== 'annulee' && new Date(sess.date).getFullYear() === currentYear)
      .reduce((sum, sess) => sum + (sess.price || 0), 0);

    const totalFixed = s.fixedCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalAmort = s.equipmentAmortization.reduce((sum, a) => {
      const years = Math.max(a.durationYears || 1, 1);
      return sum + ((a.amount || 0) / years);
    }, 0);

    // Charges au prorata du temps écoulé dans l'année
    const dayOfYear = Math.ceil((now - new Date(currentYear, 0, 1)) / 86400000);
    const prorata = dayOfYear / 365;
    const chargesProrata = round2((totalFixed + totalAmort) * prorata);

    // Coûts variables réels des sessions passées
    let coutsVariablesReels = 0;
    sessions.filter(sess => new Date(sess.date) < now && sess.status !== 'annulee' && new Date(sess.date).getFullYear() === currentYear).forEach(sess => {
      const cost = computeSessionCost(sess);
      coutsVariablesReels += cost.operatorsCost + cost.modulesCost + cost.variableCosts;
    });

    const tresorerie = round2(caRealise - chargesProrata - coutsVariablesReels);
    return { caRealise: round2(caRealise), chargesProrata, coutsVariablesReels: round2(coutsVariablesReels), tresorerie };
  }

  /* ----------------------------------------------------------
     AMÉLIORATION P2 — Alertes RH enrichies
     Ajout à computeAllAlerts : requalification URSSAF,
     intérim >18 mois, surcharge enrichie
     ---------------------------------------------------------- */

  const _origComputeAllAlerts = computeAllAlerts;

  // Remplace par version enrichie
  computeAllAlerts = function() {
    const alerts = _origComputeAllAlerts();
    const s = DB.settings.get();
    const allSessions = DB.sessions.getAll();
    const allOperators = DB.operators.getAll();
    const now = new Date();

    // AMÉLIORATION P2-A : Requalification URSSAF (freelance >45j en 3 mois)
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    allOperators.filter(op => op.status === 'freelance' && op.active !== false).forEach(op => {
      const sessions3m = allSessions.filter(sess =>
        sess.status !== 'annulee' &&
        (sess.operatorIds || []).includes(op.id) &&
        new Date(sess.date) >= threeMonthsAgo && new Date(sess.date) <= now
      );
      if (sessions3m.length > 45) {
        alerts.push({
          level: 'critical',
          message: `${op.firstName} ${op.lastName} : ${sessions3m.length} jours en 3 mois — risque requalification URSSAF`,
          context: 'RH — Requalification',
          operatorId: op.id
        });
      } else if (sessions3m.length > 30) {
        alerts.push({
          level: 'warning',
          message: `${op.firstName} ${op.lastName} : ${sessions3m.length} jours en 3 mois — vigilance requalification`,
          context: 'RH — Requalification',
          operatorId: op.id
        });
      }
    });

    // AMÉLIORATION P2-B : Intérim >18 mois (obligation CDI)
    allOperators.filter(op => op.status === 'interim' && op.active !== false).forEach(op => {
      const totalSessions = allSessions.filter(sess =>
        sess.status !== 'annulee' &&
        (sess.operatorIds || []).includes(op.id)
      ).length;
      if (totalSessions > 365) {
        alerts.push({
          level: 'critical',
          message: `${op.firstName} ${op.lastName} : ${totalSessions} jours cumulés en intérim — obligation légale bascule CDI`,
          context: 'RH — Obligation CDI',
          operatorId: op.id
        });
      } else if (totalSessions > 270) {
        alerts.push({
          level: 'warning',
          message: `${op.firstName} ${op.lastName} : ${totalSessions} jours cumulés en intérim — approche seuil 18 mois`,
          context: 'RH — Obligation CDI',
          operatorId: op.id
        });
      }
    });

    // AMÉLIORATION P4 : Alertes consommation abonnements
    const allOffers = DB.offers.getAll();
    allOffers.filter(o => o.type === 'abonnement' && o.active !== false).forEach(abo => {
      const nbSessions = abo.nbSessions || 0;
      const consumed = abo.sessionsConsumed || 0;
      if (nbSessions <= 0) return;
      const pct = (consumed / nbSessions) * 100;

      if (pct >= 100) {
        alerts.push({
          level: 'critical',
          message: `${abo.label} : ${consumed}/${nbSessions} sessions consommées — abonnement épuisé`,
          context: 'Abonnement épuisé'
        });
      } else if (pct >= 80) {
        alerts.push({
          level: 'warning',
          message: `${abo.label} : ${pct.toFixed(0)}% consommé (${nbSessions - consumed} sessions restantes)`,
          context: 'Abonnement'
        });
      }

      // Alerte expiration date
      if (abo.endDate) {
        const endDate = new Date(abo.endDate);
        const daysLeft = Math.ceil((endDate - now) / 86400000);
        if (daysLeft < 0) {
          alerts.push({
            level: 'critical',
            message: `${abo.label} : abonnement expiré depuis ${Math.abs(daysLeft)} jours`,
            context: 'Abonnement expiré'
          });
        } else if (daysLeft <= 30) {
          alerts.push({
            level: 'warning',
            message: `${abo.label} : expire dans ${daysLeft} jours`,
            context: 'Abonnement — Expiration'
          });
        }
      }
    });

    return alerts;
  };

  /* --- API publique --- */
  return {
    netToCompanyCost,
    companyCostToNet,
    compareAllStatuses,
    computeSessionCost,
    getOperatorDailyCost,
    computeOfferFloor,
    computeAllAlerts,
    computeDashboardKPIs,
    calculateSeuilPlancher,
    calculatePointMort,
    calculateTresorerie,
    round2,
    fmt,
    fmtPercent,
    statusLabel,
    sessionStatusLabel,
    offerTypeLabel
  };
})();
