/* ============================================================
   DST-SYSTEM — Moteur Économique
   Calculs : coûts sessions, coûts RH, marges, seuils, alertes
   ============================================================ */

const Engine = (() => {
  'use strict';

  /* ----------------------------------------------------------
     CALCULS RH — Barème détaillé des charges sociales françaises
     ---------------------------------------------------------- */

  /**
   * Récupère la configuration des charges depuis les paramètres.
   * Retourne le barème par défaut si absent.
   */
  function getChargesConfig(settings) {
    const s = settings || DB.settings.get();
    return s.chargesConfig || DB.settings.getDefaults().chargesConfig;
  }

  /**
   * Calcule le détail ligne par ligne des charges patronales et salariales
   * pour un brut annuel donné (salarié CDI / CDD / contrat journalier).
   *
   * @param {number} brutAnnuel — salaire brut annuel
   * @param {object} cc — chargesConfig
   * @returns {object} { patronales: [...], salariales: [...], totaux: {...} }
   */
  function computeChargesDetaillees(brutAnnuel, cc) {
    const passAnnuel  = cc.passAnnuel || 47100;
    const smicAnnuel  = (cc.smicMensuelBrut || 1801.80) * 12;
    const effectif    = cc.effectif || 'moins11';

    // Bases plafonnées
    const baseT1 = Math.min(brutAnnuel, passAnnuel);
    const baseT2 = Math.max(brutAnnuel - passAnnuel, 0);
    const ratioSmic = smicAnnuel > 0 ? brutAnnuel / smicAnnuel : 99;

    const detailPatronales = [];
    let totalPatronales = 0;

    // --- Charges patronales ---
    (cc.patronales || []).forEach(function(def) {
      let taux = def.taux || 0;
      let base = brutAnnuel;
      let note = '';

      // Taux réduit si sous seuil SMIC
      if (def.tauxReduit !== undefined && def.seuilSmic) {
        if (ratioSmic <= def.seuilSmic) {
          taux = def.tauxReduit;
          note = 'Taux réduit (≤' + def.seuilSmic + ' SMIC)';
        }
      }

      // FNAL : taux différent si ≥50 salariés
      if (def.code === 'fnal' && effectif === '50etplus') {
        taux = 0.50;
        note = 'Taux ≥50 salariés';
      }

      // Formation pro : taux différent si ≥11 salariés
      if (def.code === 'formationPro' && effectif !== 'moins11') {
        taux = 1.00;
        note = 'Taux ≥11 salariés';
      }

      // Plafonnement
      if (def.plafonnee) {
        base = baseT1;
        if (!note) note = 'Plafonné au PASS';
      } else if (def.tranche2) {
        base = baseT2;
        if (base === 0) note = 'N/A (brut ≤ PASS)';
        else note = note || 'Tranche 2 (au-delà du PASS)';
      }

      var montant = round2(base * taux / 100);
      totalPatronales += montant;

      detailPatronales.push({
        code: def.code, label: def.label, taux: taux,
        base: round2(base), montant: montant, note: note
      });
    });

    // --- Charges salariales ---
    const detailSalariales = [];
    let totalSalariales = 0;

    (cc.salariales || []).forEach(function(def) {
      var base = brutAnnuel;
      var note = '';

      if (def.assiette9825) {
        base = round2(brutAnnuel * 0.9825);
        note = 'Assiette 98,25% du brut';
      } else if (def.plafonnee) {
        base = baseT1;
        note = 'Plafonné au PASS';
      } else if (def.tranche2) {
        base = baseT2;
        if (base === 0) note = 'N/A (brut ≤ PASS)';
        else note = 'Tranche 2 (au-delà du PASS)';
      }

      var montant = round2(base * (def.taux || 0) / 100);
      totalSalariales += montant;

      detailSalariales.push({
        code: def.code, label: def.label, taux: def.taux || 0,
        base: round2(base), montant: montant, note: note
      });
    });

    var netAnnuel = round2(brutAnnuel - totalSalariales);
    var coutEntreprise = round2(brutAnnuel + totalPatronales);

    return {
      patronales: detailPatronales,
      salariales: detailSalariales,
      totaux: {
        brutAnnuel: round2(brutAnnuel),
        chargesPatronales: round2(totalPatronales),
        chargesSalariales: round2(totalSalariales),
        netAnnuel: netAnnuel,
        coutEntreprise: coutEntreprise,
        tauxPatronalesEffectif: brutAnnuel > 0 ? round2(totalPatronales / brutAnnuel * 100) : 0,
        tauxSalarialesEffectif: brutAnnuel > 0 ? round2(totalSalariales / brutAnnuel * 100) : 0
      }
    };
  }

  /**
   * Calcul itératif : net annuel → brut annuel (salarié).
   * Inverse de brut - chargesSalariales = net, résolu par convergence.
   *
   * @param {number} netAnnuel — salaire net annuel cible
   * @param {object} cc — chargesConfig
   * @returns {number} brut annuel
   */
  function netToBrutIteratif(netAnnuel, cc) {
    // Estimation initiale : net / (1 - ~22% charges salariales moyennes)
    var brut = netAnnuel / 0.78;
    for (var i = 0; i < 25; i++) {
      var detail = computeChargesDetaillees(brut, cc);
      var computedNet = detail.totaux.netAnnuel;
      var diff = netAnnuel - computedNet;
      if (Math.abs(diff) < 0.50) break;
      brut += diff;
      if (brut < 0) brut = 0;
    }
    return round2(brut);
  }

  /**
   * Calcul itératif : coût entreprise annuel → brut annuel (salarié).
   * Inverse de brut + chargesPatronales = coût, résolu par convergence.
   *
   * @param {number} coutAnnuel — coût entreprise annuel cible
   * @param {object} cc — chargesConfig
   * @returns {number} brut annuel
   */
  function coutEntrepriseToBrutIteratif(coutAnnuel, cc) {
    // Estimation initiale : coût / (1 + ~42% charges patronales moyennes)
    var brut = coutAnnuel / 1.42;
    for (var i = 0; i < 25; i++) {
      var detail = computeChargesDetaillees(brut, cc);
      var computedCout = detail.totaux.coutEntreprise;
      var diff = coutAnnuel - computedCout;
      if (Math.abs(diff) < 0.50) break;
      brut += diff * 0.7; // facteur d'amortissement pour stabilité
      if (brut < 0) brut = 0;
    }
    return round2(brut);
  }

  /**
   * Calcul complet du coût pour un statut donné, avec ventilation détaillée.
   *
   * @param {number} netJournalier — net souhaité par jour
   * @param {string} status — statut contractuel
   * @param {object} settings — paramètres complets
   * @returns {object} résultat avec ventilation
   */
  function computeCoutComplet(netJournalier, status, settings) {
    var s = settings || DB.settings.get();
    var cc = getChargesConfig(s);
    var joursAn = cc.joursOuvresAn || 218;

    switch (status) {

      case 'cdi':
      case 'contrat_journalier': {
        var netAnnuel = netJournalier * joursAn;
        var brutAnnuel = netToBrutIteratif(netAnnuel, cc);
        var details = computeChargesDetaillees(brutAnnuel, cc);
        return {
          status: status,
          netJournalier: round2(details.totaux.netAnnuel / joursAn),
          brutJournalier: round2(brutAnnuel / joursAn),
          chargesPatronalesJour: round2(details.totaux.chargesPatronales / joursAn),
          chargesSalarialesJour: round2(details.totaux.chargesSalariales / joursAn),
          coutEntrepriseJour: round2(details.totaux.coutEntreprise / joursAn),
          tauxPatronalesEffectif: details.totaux.tauxPatronalesEffectif,
          tauxSalarialesEffectif: details.totaux.tauxSalarialesEffectif,
          annuel: details.totaux,
          details: details
        };
      }

      case 'cdd': {
        var netAnnuelCDD = netJournalier * joursAn;
        var brutBaseCDD = netToBrutIteratif(netAnnuelCDD, cc);
        // Prime précarité sur brut de base
        var txPrecarite = (cc.cdd && cc.cdd.primePrecarite) || 10;
        var txCP = (cc.cdd && cc.cdd.indemniteCP) || 10;
        var primePrecarite = round2(brutBaseCDD * txPrecarite / 100);
        var indemniteCP = round2((brutBaseCDD + primePrecarite) * txCP / 100);
        // Brut total chargeable
        var brutTotalCDD = brutBaseCDD + primePrecarite + indemniteCP;
        var detailsCDD = computeChargesDetaillees(brutTotalCDD, cc);
        return {
          status: 'cdd',
          netJournalier: round2(netJournalier),
          brutBaseJour: round2(brutBaseCDD / joursAn),
          primePrecariteJour: round2(primePrecarite / joursAn),
          indemniteCP_Jour: round2(indemniteCP / joursAn),
          brutTotalJour: round2(brutTotalCDD / joursAn),
          chargesPatronalesJour: round2(detailsCDD.totaux.chargesPatronales / joursAn),
          chargesSalarialesJour: round2(detailsCDD.totaux.chargesSalariales / joursAn),
          coutEntrepriseJour: round2(detailsCDD.totaux.coutEntreprise / joursAn),
          tauxPatronalesEffectif: detailsCDD.totaux.tauxPatronalesEffectif,
          majorationCDD: round2((primePrecarite + indemniteCP) / joursAn),
          annuel: {
            brutBase: round2(brutBaseCDD),
            primePrecarite: primePrecarite,
            indemniteCP: indemniteCP,
            brutTotal: round2(brutTotalCDD),
            chargesPatronales: detailsCDD.totaux.chargesPatronales,
            chargesSalariales: detailsCDD.totaux.chargesSalariales,
            coutEntreprise: detailsCDD.totaux.coutEntreprise
          },
          details: detailsCDD
        };
      }

      case 'interim': {
        // L'entreprise paie la facture de l'agence d'intérim
        // L'agence facture : brut × coefficient (qui couvre salaire + charges + marge agence)
        var netAnnuelInt = netJournalier * joursAn;
        var brutBaseInt = netToBrutIteratif(netAnnuelInt, cc);
        var coeffAgence = (cc.interim && cc.interim.coefficientAgence) || 2.0;
        var factureAgenceAn = round2(brutBaseInt * coeffAgence);
        // Détail indicatif : ce que l'agence supporte
        var detailsInt = computeChargesDetaillees(brutBaseInt, cc);
        return {
          status: 'interim',
          netJournalier: round2(netJournalier),
          brutJournalier: round2(brutBaseInt / joursAn),
          coefficientAgence: coeffAgence,
          factureAgenceJour: round2(factureAgenceAn / joursAn),
          coutEntrepriseJour: round2(factureAgenceAn / joursAn),
          chargesEstimeesAgence: round2(detailsInt.totaux.chargesPatronales / joursAn),
          margeAgenceEstimee: round2((factureAgenceAn - detailsInt.totaux.coutEntreprise) / joursAn),
          annuel: {
            brutBase: round2(brutBaseInt),
            factureAgence: factureAgenceAn,
            coutEntreprise: factureAgenceAn
          },
          details: detailsInt
        };
      }

      case 'freelance': {
        // Freelance/auto-entrepreneur : facture HT = net / (1 - taux charges AE)
        var tauxAE = (cc.freelance && cc.freelance.tauxCharges) || 21.1;
        var factureHT = round2(netJournalier / (1 - tauxAE / 100));
        return {
          status: 'freelance',
          netJournalier: round2(netJournalier),
          factureHT_Jour: factureHT,
          chargesAutoEntrepreneur: round2(factureHT * tauxAE / 100),
          tauxChargesAE: tauxAE,
          coutEntrepriseJour: factureHT,
          annuel: {
            factureHT: round2(factureHT * joursAn),
            coutEntreprise: round2(factureHT * joursAn)
          },
          details: null // Pas de charges patronales pour l'entreprise
        };
      }

      case 'fondateur': {
        // Fondateur : coût 0 pour les sessions (rémunération = charge fixe)
        // Mais on peut calculer le coût réel TNS si demandé
        var regimeFond = (cc.fondateur && cc.fondateur.regime) || 'tns';
        if (regimeFond === 'assimileSalarie') {
          var resultAS = computeCoutComplet(netJournalier, 'cdi', s);
          resultAS.status = 'fondateur';
          resultAS.regime = 'assimileSalarie';
          resultAS.coutSessionJour = 0; // Pas imputé aux sessions
          return resultAS;
        }
        var tauxTNS = (cc.fondateur && cc.fondateur.tauxTNS) || 45;
        var cotisationsTNS = round2(netJournalier * tauxTNS / 100);
        return {
          status: 'fondateur',
          regime: 'tns',
          netJournalier: round2(netJournalier),
          cotisationsTNS_Jour: cotisationsTNS,
          coutReelJour: round2(netJournalier + cotisationsTNS),
          coutEntrepriseJour: 0, // Non imputé aux sessions
          coutSessionJour: 0,
          tauxTNS: tauxTNS,
          annuel: {
            netAnnuel: round2(netJournalier * joursAn),
            cotisationsTNS: round2(cotisationsTNS * joursAn),
            coutReel: round2((netJournalier + cotisationsTNS) * joursAn)
          },
          details: null
        };
      }

      default:
        return {
          status: status, netJournalier: netJournalier,
          coutEntrepriseJour: netJournalier,
          details: null
        };
    }
  }

  /* ----------------------------------------------------------
     FONCTIONS PUBLIQUES EXISTANTES — Rétrocompatibles
     Utilisent maintenant le calcul détaillé en interne.
     ---------------------------------------------------------- */

  /**
   * Calcul du coût entreprise à partir du net souhaité par l'opérateur.
   * Interface inchangée : retourne { net, gross, charges, companyCost }
   * + propriété « detailComplet » avec la ventilation complète.
   */
  function netToCompanyCost(netDaily, status, settings) {
    var s = settings || DB.settings.get();
    var complet = computeCoutComplet(netDaily, status, s);

    // Adapter au format historique { net, gross, charges, companyCost }
    switch (status) {
      case 'freelance':
        return {
          net: netDaily,
          gross: complet.factureHT_Jour,
          charges: complet.chargesAutoEntrepreneur,
          companyCost: complet.coutEntrepriseJour,
          detailComplet: complet
        };
      case 'interim':
        return {
          net: netDaily,
          gross: complet.brutJournalier,
          charges: round2(complet.coutEntrepriseJour - complet.brutJournalier),
          companyCost: complet.coutEntrepriseJour,
          detailComplet: complet
        };
      case 'cdd':
        return {
          net: netDaily,
          gross: complet.brutTotalJour,
          charges: complet.chargesPatronalesJour,
          companyCost: complet.coutEntrepriseJour,
          detailComplet: complet
        };
      case 'cdi':
      case 'contrat_journalier':
        return {
          net: complet.netJournalier,
          gross: complet.brutJournalier,
          charges: complet.chargesPatronalesJour,
          companyCost: complet.coutEntrepriseJour,
          detailComplet: complet
        };
      case 'fondateur':
        return {
          net: netDaily, gross: netDaily, charges: 0, companyCost: 0,
          detailComplet: complet
        };
      default:
        return { net: netDaily, gross: netDaily, charges: 0, companyCost: netDaily };
    }
  }

  /**
   * Calcul du net à partir d'un coût max entreprise.
   * Interface inchangée + « detailComplet ».
   */
  function companyCostToNet(maxCost, status, settings) {
    var s = settings || DB.settings.get();
    var cc = getChargesConfig(s);
    var joursAn = cc.joursOuvresAn || 218;

    switch (status) {
      case 'freelance': {
        var tauxAE = (cc.freelance && cc.freelance.tauxCharges) || 21.1;
        var net = round2(maxCost * (1 - tauxAE / 100));
        return { net: net, gross: maxCost, charges: round2(maxCost - net), companyCost: maxCost };
      }
      case 'interim': {
        var coeffAg = (cc.interim && cc.interim.coefficientAgence) || 2.0;
        var coutAn = maxCost * joursAn;
        var brutBaseAn = round2(coutAn / coeffAg);
        var detailInt = computeChargesDetaillees(brutBaseAn, cc);
        var netInt = round2(detailInt.totaux.netAnnuel / joursAn);
        return { net: netInt, gross: round2(brutBaseAn / joursAn), charges: round2(maxCost - brutBaseAn / joursAn), companyCost: maxCost };
      }
      case 'cdd': {
        // coûtEntreprise = brutTotal + chargesPatronales(brutTotal)
        // brutTotal = brutBase + primePrecarite + indemniteCP
        var txPrec = (cc.cdd && cc.cdd.primePrecarite) || 10;
        var txCPcdd = (cc.cdd && cc.cdd.indemniteCP) || 10;
        var coutAnCDD = maxCost * joursAn;
        var brutTotCDD = coutEntrepriseToBrutIteratif(coutAnCDD, cc);
        // brutTotal = brutBase × (1 + txPrec/100) × (1 + txCP/100) approx
        var multCDD = (1 + txPrec / 100) * (1 + txCPcdd / 100);
        var brutBaseCDD = round2(brutTotCDD / multCDD);
        var detailCDD = computeChargesDetaillees(brutBaseCDD, cc);
        var netCDD = round2(detailCDD.totaux.netAnnuel / joursAn);
        return { net: netCDD, gross: round2(brutTotCDD / joursAn), charges: round2(maxCost - brutTotCDD / joursAn), companyCost: maxCost };
      }
      case 'cdi':
      case 'contrat_journalier': {
        var coutAnnuelSal = maxCost * joursAn;
        var brutAnnuelSal = coutEntrepriseToBrutIteratif(coutAnnuelSal, cc);
        var detailSal = computeChargesDetaillees(brutAnnuelSal, cc);
        return {
          net: round2(detailSal.totaux.netAnnuel / joursAn),
          gross: round2(brutAnnuelSal / joursAn),
          charges: round2(detailSal.totaux.chargesPatronales / joursAn),
          companyCost: maxCost
        };
      }
      case 'fondateur':
        return { net: maxCost, gross: maxCost, charges: 0, companyCost: 0 };
      default:
        return { net: maxCost, gross: maxCost, charges: 0, companyCost: maxCost };
    }
  }

  /**
   * Compare tous les statuts pour un objectif net donné.
   * Retourne un tableau trié par coût entreprise croissant,
   * enrichi du détail complet par statut.
   */
  function compareAllStatuses(netDaily, settings) {
    var s = settings || DB.settings.get();
    var statuses = ['freelance', 'interim', 'contrat_journalier', 'cdd', 'cdi'];
    return statuses.map(function(status) {
      var calc = netToCompanyCost(netDaily, status, s);
      return {
        status: status,
        label: statusLabel(status),
        net: calc.net,
        gross: calc.gross,
        charges: calc.charges,
        companyCost: calc.companyCost,
        detailComplet: calc.detailComplet || null
      };
    }).sort(function(a, b) { return a.companyCost - b.companyCost; });
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

  /* ----------------------------------------------------------
     FONCTIONS TVA — HT / TTC
     ---------------------------------------------------------- */

  /**
   * Convertit un montant HT en TTC.
   * @param {number} ht — montant hors taxes
   * @param {number} [tauxTVA] — taux de TVA en % (défaut : settings.vatRate)
   * @returns {number} montant TTC
   */
  function computeTTC(ht, tauxTVA) {
    if (tauxTVA === undefined) {
      tauxTVA = (DB.settings.get().vatRate || 20);
    }
    return round2(ht * (1 + tauxTVA / 100));
  }

  /**
   * Convertit un montant TTC en HT.
   * @param {number} ttc — montant toutes taxes comprises
   * @param {number} [tauxTVA] — taux de TVA en % (défaut : settings.vatRate)
   * @returns {number} montant HT
   */
  function computeHT(ttc, tauxTVA) {
    if (tauxTVA === undefined) {
      tauxTVA = (DB.settings.get().vatRate || 20);
    }
    return round2(ttc / (1 + tauxTVA / 100));
  }

  /**
   * Retourne le montant de TVA sur un montant HT.
   */
  function computeMontantTVA(ht, tauxTVA) {
    if (tauxTVA === undefined) {
      tauxTVA = (DB.settings.get().vatRate || 20);
    }
    return round2(ht * tauxTVA / 100);
  }

  /* ----------------------------------------------------------
     FREELANCE TJM SUR FACTURE
     ---------------------------------------------------------- */

  /**
   * Mode "TJM sur facture" pour un freelance :
   * Le TJM saisi = montant de la facture HT = coût entreprise.
   * Retourne le détail (net estimé du freelance, charges AE, etc.).
   *
   * @param {number} tjmFacture — TJM sur la facture HT
   * @param {object} [settings] — paramètres
   * @returns {object}
   */
  function freelanceTjmFacture(tjmFacture, settings) {
    var s = settings || DB.settings.get();
    var cc = getChargesConfig(s);
    var tauxAE = (cc.freelance && cc.freelance.tauxCharges) || 21.1;
    var netFreelance = round2(tjmFacture * (1 - tauxAE / 100));
    return {
      mode: 'sur_facture',
      tjmFacture: round2(tjmFacture),
      netFreelance: netFreelance,
      chargesAE: round2(tjmFacture - netFreelance),
      tauxChargesAE: tauxAE,
      coutEntrepriseJour: round2(tjmFacture)
    };
  }

  /* ----------------------------------------------------------
     TAUX HORAIRE — Calculs et comparaison
     ---------------------------------------------------------- */

  /**
   * Calcule le coût entreprise à partir d'un taux horaire.
   * Convertit en journalier (taux × heures/jour) puis applique le calcul standard.
   *
   * @param {number} tauxHoraire — taux horaire (brut ou net selon le mode)
   * @param {string} status — statut contractuel
   * @param {string} mode — 'net' ou 'brut' (le taux saisi est net ou brut ?)
   * @param {object} [settings] — paramètres
   * @returns {object} { horaireInput, heuresJour, journalierEquivalent, coutEntrepriseJour, coutEntrepriseHeure, detail }
   */
  function computeCoutHoraire(tauxHoraire, status, mode, settings) {
    var s = settings || DB.settings.get();
    var heuresJour = s.hoursPerDay || 7;
    var netJournalier;

    if (mode === 'brut') {
      // Taux horaire brut → brut journalier → on inverse pour avoir le net
      var brutJournalier = tauxHoraire * heuresJour;
      var cc = getChargesConfig(s);
      var joursAn = cc.joursOuvresAn || 218;
      var brutAnnuel = brutJournalier * joursAn;

      if (status === 'freelance') {
        // Pour un freelance, brut = facture HT
        return {
          horaireInput: round2(tauxHoraire),
          heuresJour: heuresJour,
          mode: 'brut',
          journalierEquivalent: round2(brutJournalier),
          coutEntrepriseJour: round2(brutJournalier),
          coutEntrepriseHeure: round2(tauxHoraire),
          detail: freelanceTjmFacture(brutJournalier, s)
        };
      }

      if (status === 'interim') {
        // Intérim horaire : taux horaire × coeff agence
        var coeffAgence = (cc.interim && cc.interim.coefficientAgence) || 2.0;
        var factureHeure = round2(tauxHoraire * coeffAgence);
        return {
          horaireInput: round2(tauxHoraire),
          heuresJour: heuresJour,
          mode: 'brut',
          journalierEquivalent: round2(tauxHoraire * heuresJour),
          coutEntrepriseJour: round2(factureHeure * heuresJour),
          coutEntrepriseHeure: factureHeure,
          coefficientAgence: coeffAgence,
          detail: null
        };
      }

      // Salariés (CDI, CDD, contrat journalier)
      var details = computeChargesDetaillees(brutAnnuel, cc);
      netJournalier = round2(details.totaux.netAnnuel / joursAn);
      var complet = computeCoutComplet(netJournalier, status, s);
      return {
        horaireInput: round2(tauxHoraire),
        heuresJour: heuresJour,
        mode: 'brut',
        journalierEquivalent: round2(brutJournalier),
        coutEntrepriseJour: complet.coutEntrepriseJour,
        coutEntrepriseHeure: round2(complet.coutEntrepriseJour / heuresJour),
        detail: complet
      };
    }

    // Mode net (par défaut)
    netJournalier = tauxHoraire * heuresJour;
    var calc = netToCompanyCost(netJournalier, status, s);
    return {
      horaireInput: round2(tauxHoraire),
      heuresJour: heuresJour,
      mode: 'net',
      journalierEquivalent: round2(netJournalier),
      coutEntrepriseJour: calc.companyCost,
      coutEntrepriseHeure: round2(calc.companyCost / heuresJour),
      detail: calc
    };
  }

  /**
   * Compare le coût horaire vs journalier pour un opérateur donné.
   * Retourne quel mode est le plus rentable pour l'entreprise.
   *
   * @param {number} tauxHoraire — taux horaire (net ou brut)
   * @param {number} tauxJournalier — taux journalier (net ou brut)
   * @param {string} status — statut contractuel
   * @param {string} mode — 'net' ou 'brut'
   * @param {object} [settings] — paramètres
   * @returns {object} { horaire: {...}, journalier: {...}, recommendation, ecart, ecartPercent }
   */
  function compareHoraireJournalier(tauxHoraire, tauxJournalier, status, mode, settings) {
    var s = settings || DB.settings.get();
    var heuresJour = s.hoursPerDay || 7;

    // Coût via taux horaire
    var coutHoraire = computeCoutHoraire(tauxHoraire, status, mode, s);

    // Coût via taux journalier
    var coutJournalier;
    if (mode === 'brut' && (status === 'freelance' || status === 'interim')) {
      if (status === 'freelance') {
        coutJournalier = { coutEntrepriseJour: round2(tauxJournalier) };
      } else {
        var cc = getChargesConfig(s);
        var coeff = (cc.interim && cc.interim.coefficientAgence) || 2.0;
        coutJournalier = { coutEntrepriseJour: round2(tauxJournalier * coeff) };
      }
    } else if (mode === 'brut') {
      // Brut journalier → convertir en net pour le calcul
      var ccJ = getChargesConfig(s);
      var joursAnJ = ccJ.joursOuvresAn || 218;
      var detJ = computeChargesDetaillees(tauxJournalier * joursAnJ, ccJ);
      var netJ = round2(detJ.totaux.netAnnuel / joursAnJ);
      coutJournalier = netToCompanyCost(netJ, status, s);
    } else {
      coutJournalier = netToCompanyCost(tauxJournalier, status, s);
    }

    var coutH = coutHoraire.coutEntrepriseJour;
    var coutJ = coutJournalier.coutEntrepriseJour || coutJournalier.companyCost || 0;
    var ecart = round2(Math.abs(coutH - coutJ));
    var ecartPercent = coutJ > 0 ? round2((ecart / coutJ) * 100) : 0;

    var recommendation;
    if (coutH < coutJ) {
      recommendation = 'horaire';
    } else if (coutJ < coutH) {
      recommendation = 'journalier';
    } else {
      recommendation = 'equivalent';
    }

    return {
      horaire: {
        taux: round2(tauxHoraire),
        coutEntrepriseJour: coutH,
        coutEntrepriseHeure: coutHoraire.coutEntrepriseHeure,
        heuresJour: heuresJour
      },
      journalier: {
        taux: round2(tauxJournalier),
        coutEntrepriseJour: coutJ
      },
      recommendation: recommendation,
      ecart: ecart,
      ecartPercent: ecartPercent
    };
  }

  /* === RENTABILITÉ PAR CLIENT === */
  function computeClientProfitability(clientId) {
    const sessions = DB.sessions.getAll().filter(s => {
      return (s.clientIds && s.clientIds.includes(clientId)) || s.clientId === clientId;
    });

    const result = {
      totalSessions: sessions.length,
      completedSessions: 0,
      totalRevenue: 0,
      totalCosts: 0,
      netResult: 0,
      rentabilityPercent: 0,
      avgMargin: 0,
      status: 'Pas de données'
    };

    if (sessions.length === 0) return result;

    let totalMargin = 0;
    let countMargin = 0;

    sessions.forEach(s => {
      if (s.status === 'terminee') {
        result.completedSessions++;
      }

      if (s.price > 0 || s.price === 0) {
        // Calculer le coût de la session
        const cost = computeSessionCost(s);
        result.totalRevenue += (s.price || 0);
        result.totalCosts += cost.totalCost;
        totalMargin += cost.margin;
        countMargin++;
      }
    });

    result.avgMargin = countMargin > 0 ? round2(totalMargin / countMargin) : 0;
    result.netResult = round2(result.totalRevenue - result.totalCosts);
    result.rentabilityPercent = result.totalRevenue > 0
      ? round2((result.netResult / result.totalRevenue) * 100)
      : 0;

    // Déterminer le statut
    if (result.completedSessions === 0) {
      result.status = 'En cours';
    } else if (result.rentabilityPercent >= 30) {
      result.status = '✓ Très rentable';
    } else if (result.rentabilityPercent >= 15) {
      result.status = '✓ Rentable';
    } else if (result.rentabilityPercent >= 0) {
      result.status = '⚠ Acceptable';
    } else {
      result.status = '✗ Déficitaire';
    }

    return result;
  }

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
    computeClientProfitability,
    calculateSeuilPlancher,
    calculatePointMort,
    calculateTresorerie,
    // Nouvelles fonctions — calcul détaillé charges sociales
    getChargesConfig,
    computeChargesDetaillees,
    netToBrutIteratif,
    coutEntrepriseToBrutIteratif,
    computeCoutComplet,
    round2,
    fmt,
    fmtPercent,
    statusLabel,
    sessionStatusLabel,
    offerTypeLabel,
    // TVA
    computeTTC,
    computeHT,
    computeMontantTVA,
    // Freelance TJM sur facture
    freelanceTjmFacture,
    // Taux horaire
    computeCoutHoraire,
    compareHoraireJournalier
  };
})();
