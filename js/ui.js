/*
 * ui.js — all the HTML interface around the canvas: palette, toolbar, side panel
 * (station / research / production / inspector), hints, toasts, menu and dialogs.
 * Player-facing text is French.
 */
(function (CO) {
  'use strict';
  const h = CO.h, ITEMS = CO.ITEMS, BUILDINGS = CO.BUILDINGS, TECHS = CO.TECHS, RECIPES = CO.RECIPES;
  const UI = CO.ui = {};
  const $ = function (id) { return document.getElementById(id); };

  let tab = 'station', pressing = false, lastSig = '', modalEl, stationCv = null, simTime = 0;
  let palButtons = {};

  // ------------------------------------------------------------ small widgets
  function itemIcon(id, scale) {
    const c = h('canvas', { width: 8, height: 8, class: 'icon' });
    c.getContext('2d').drawImage(CO.sprites.item(id), 0, 0);
    c.style.width = c.style.height = (8 * (scale || 2)) + 'px';
    c.setAttribute('data-item', id);          // hover tooltip (see initItemTip)
    return c;
  }
  function thumb(type, size) {
    size = size || 36;
    const spr = CO.sprites.building(type, 0, 0), s = size / Math.max(spr.width, spr.height);
    const c = h('canvas', { width: size, height: size, class: 'thumb' });
    c.style.width = c.style.height = size + 'px';
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(spr, 0, 0, spr.width, spr.height, Math.round((size - spr.width * s) / 2), Math.round((size - spr.height * s) / 2), Math.round(spr.width * s), Math.round(spr.height * s));
    return c;
  }
  function costRow(cost, prog) {
    const row = h('div', { class: 'costs' });
    for (const id in cost) {
      const have = prog ? Math.min(prog[id] || 0, cost[id]) : null;
      row.appendChild(h('span', { class: 'cost' + (have !== null && have >= cost[id] ? ' ok' : '') }, itemIcon(id, 2),
        h('span', { text: have === null ? String(cost[id]) : have + '/' + cost[id] })));
    }
    return row;
  }
  function itemName(id) { return ITEMS[id].name; }

  // ------------------------------------------------------------------ toasts
  CO.on('toast', function (msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || 'info'), text: msg });
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3800);
  });

  // ------------------------------------------------------------------- modal
  UI.modalOpen = function () { return !modalEl.hidden; };
  // Dialogs that must not hide one another (changelog, then a notice...) wait their turn.
  const modalQueue = [];
  UI.closeModal = function () {
    modalEl.hidden = true; modalEl.innerHTML = '';
    if (modalQueue.length) setTimeout(function () { if (modalQueue.length) UI.whenFree(modalQueue.shift()); }, 0);
  };
  /** Run `fn` (which opens a dialog) now, or once the dialog on screen is closed. */
  UI.whenFree = function (fn) { if (UI.modalOpen()) modalQueue.push(fn); else fn(); };

  /** Update history: only the entries newer than `since`, or all of them when `since` is null. */
  UI.showChangelog = function (since) {
    const list = CO.CHANGELOG.filter(function (e) { return since == null || e.v > since; });
    const body = h('div', { class: 'changelog' }, list.map(function (e) {
      return h('div', { class: 'cl-entry' },
        h('div', { class: 'cl-head' }, h('b', { text: e.title }), h('span', { class: 'small', text: 'v' + e.v + ' · ' + e.date })),
        h('ul', null, e.items.map(function (t) { return h('li', { text: t }); })));
    }));
    const buttons = [{ label: 'Compris', primary: true }];
    if (since != null && list.length < CO.CHANGELOG.length) buttons.unshift({ label: 'Tout l’historique', run: function () { UI.showChangelog(null); } });
    UI.whenFree(function () { openModal(since == null ? 'Historique des mises à jour' : 'Nouveautés de la mise à jour', body, buttons, 'wide'); });
  };
  function openModal(title, body, buttons, cls) {
    modalEl.innerHTML = '';
    const box = h('div', { class: 'dialog' + (cls ? ' ' + cls : '') }, h('h2', { text: title }), body);
    const row = h('div', { class: 'dialog-buttons' });
    (buttons || [{ label: 'Fermer' }]).forEach(function (b) {
      row.appendChild(h('button', { class: 'btn' + (b.primary ? ' primary' : ''), text: b.label, onclick: function () { UI.closeModal(); if (b.run) b.run(); } }));
    });
    box.appendChild(row); modalEl.appendChild(box); modalEl.hidden = false;
  }
  UI.closeMenus = function () { $('menu').hidden = true; };

  // -------------------------------------------------------------------- menu
  function buildMenu() {
    const m = $('menu');
    const item = function (label, fn) { return h('button', { class: 'menu-item', text: label, onclick: function () { m.hidden = true; fn(); } }); };
    m.appendChild(item('Ressources et recettes', function () { showGuide(); }));
    m.appendChild(item('Aide et commandes', showHelp));
    m.appendChild(item('Nouveautés et historique', function () { UI.showChangelog(null); }));
    m.appendChild(item('Exporter la partie (fichier)', function () { CO.save.save(); CO.save.exportFile(); CO.emit('toast', 'Partie exportée.', 'good'); }));
    m.appendChild(item('Importer une partie…', function () { $('file-import').click(); }));
    m.appendChild(item('Nouvelle partie', function () {
      openModal('Nouvelle partie ?', h('p', { text: 'Ta usine actuelle sera remplacée. Pense à exporter ta partie si tu veux la garder.' }),
        [{ label: 'Annuler' }, { label: 'Recommencer', primary: true, run: function () { CO.save.newGame(); CO.save.save(); CO.emit('toast', 'Nouvelle partie : bonne construction !', 'good'); } }]);
    }));
    $('btn-menu').addEventListener('click', function (e) { e.stopPropagation(); m.hidden = !m.hidden; });
    document.addEventListener('click', function (e) { if (!m.contains(e.target)) m.hidden = true; });
    $('file-import').addEventListener('change', function (e) {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const rd = new FileReader();
      rd.onload = function () {
        if (CO.save.importText(String(rd.result))) CO.emit('toast', 'Partie importée.', 'good');
        else CO.emit('toast', 'Fichier de sauvegarde invalide.', 'warn');
      };
      rd.readAsText(f);
    });
  }

  function showHelp() {
    const row = function (k, t) { return h('tr', null, h('td', null, h('kbd', { text: k })), h('td', { text: t })); };
    const tbl = h('table', { class: 'keys' },
      row('Clic gauche', 'Utiliser l’outil actif (poser, inspecter…)'),
      row('Glisser', 'Poser plusieurs éléments d’un coup, en ligne droite (convoyeurs : sur un seul axe)'),
      row('Logistique', 'Porte de débordement (devant d’abord), de sous-débit (côtés d’abord), croisement, trieur inversé et extracteur : Infos pour leur filtre'),
      row('Ctrl + glisser', 'Convoyeurs en L jusqu’au curseur, sans toucher aux bâtiments sur le chemin'),
      row('Alt + glisser', 'Convoyeurs à main levée : ils suivent ton tracé'),
      row('Poser sur des convoyeurs', 'Un bâtiment posé sur des convoyeurs, séparateurs ou souterrains les remplace (remboursés)'),
      row('Clic droit', 'Désélectionner le bâtiment en cours de pose'),
      row('Clic droit (glisser)', 'Rectangle rouge : supprime tout ce qu’il touche — remboursement intégral'),
      row('R / Maj+R', 'Tourner / tourner à l’envers (la pièce à poser, le collage ou le bâtiment inspecté)'),
      row('Suppr', 'Supprimer la sélection ou le bâtiment sous le curseur'),
      row('V · E · X', 'Outils : Inspecter, Sélection (rectangle), Supprimer'),
      row('I', 'Ressources et recettes (cycles de transformation)'),
      row('1 … 9, 0', 'Choisir un bâtiment de la palette'),
      row('Ctrl+C / X / V', 'Copier, couper, coller une disposition (R tourne le collage)'),
      row('Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'),
      row('Molette', 'Zoom'),
      row('Flèches, WASD, ZQSD', 'Déplacer la caméra (ou Espace + glisser)'),
      row('Clic molette + glisser', 'Déplacer la caméra (avec n’importe quel outil)'),
      row('Ctrl + clic gauche', 'Sélectionner : glisser = rectangle, clic = ajouter / retirer un bâtiment. Un clic simple ailleurs désélectionne tout'),
      row('Sélection → Infos', 'Une recette (ou un filtre) par type de bâtiment sélectionné, appliquée à tous d’un coup (une seule annulation)'),
      row('Catapulte magnétique', 'Inspecte la catapulte de départ, « Choisir la cible », puis clique sur celle d’arrivée (48 cases max)'),
      row('Recherche', '« + File d’attente » enchaîne les recherches ; les laboratoires mettent en réserve ce qui servira plus tard'),
      row('Programme orbital', 'Recherche Astronautique : le Pas de tir reçoit 10 Modules de fusée et un Satellite ou une Sonde profonde, assemble la fusée et la lance. Les missions (onglet Station) donnent des bonus permanents : machines, foreuses, terrains moins chers, générateurs'),
      row('Drones', 'Recherche Drones logistiques : un Port de drones (portée 24 cases) envoie ses 4 drones chercher les objets des Coffres d’envoi (remplis par convoyeur) pour les porter aux Coffres de demande (objet choisi dans Infos, jusqu’à 40), qui les sortent par leur flèche'),
      row('Planètes', 'Les 8 extensions de la station terminées, la flèche ▶ au-dessus de l’image (onglet Station) emmène sur Kéora : autre carte, autres minerais et liquides, autres machines et recherches, avec un portail stellaire à construire. La flèche ◀ ramène sur la Terre ; la planète quittée est en pause. Argent, ouvriers et recherches acquises suivent'),
      row('Contrats', 'Après ta première livraison, le Port propose des contrats (onglet Station) : livre une quantité d’un objet avant la fin du temps pour une grosse récompense. Deux à la fois ; les livraisons au Port les remplissent avant la station'),
      row('Améliorations', 'Recherches Améliorations I et II : dans Infos, un bouton fait passer foreuses, machines, pompes et générateurs au niveau II (×1,5, coûte 2× le bâtiment) puis III (×2, 4× le bâtiment). Ils consomment plus de courant. Marche aussi sur toute une sélection'),
      row('Fluides', 'Recherche Hydraulique : une Pompe à eau posée sur un lac remplit les tuyaux qui la touchent. Les tuyaux qui se touchent partagent leur contenu (un seul fluide par réseau). La Centrale à vapeur (eau + charbon) donne 400 kW ; la Raffinerie transforme le pétrole en plastique et carburant'),
      row('Énergie', 'Foreuses, machines et laboratoires ont besoin de courant. Le Port fournit 150 kW autour de lui ; les Poteaux électriques alimentent ce qui touche leur zone et se relient tout seuls ; les Générateurs thermiques brûlent du charbon. Un réseau trop chargé ralentit toutes ses machines'),
      row('F', 'Pendant un collage ou la pose d’un plan : retourner la disposition (miroir gauche ↔ droite)'),
      row('Plans', 'Onglet Plans : garde une sélection comme plan nommé (commun à toutes tes parties) et repose-la quand tu veux'),
      row('Fantômes', 'Sans assez de crédits, ce que tu poses devient un fantôme bleu : un ouvrier le paie et le construit dès que les crédits arrivent. Le supprimer ne rembourse rien (il n’a rien coûté)'),
      row('M', 'Afficher / masquer la minicarte (en haut à droite) : un clic ou un glissé dessus déplace la caméra'),
      row('Tab', 'Changer de vue : isométrique (voxels) ou vue de dessus — un bâtiment haut devient transparent quand la souris passe derrière'),
      row('Ouvriers', 'Un bâtiment posé est un chantier : un ouvrier part du Port le construire. Recrute-en d’autres dans l’onglet Station'),
      row('Terrain', 'Clic sur une parcelle assombrie qui touche ton terrain pour l’acheter (chaque achat coûte 25 % de plus que le précédent)'),
      row('Tablette', 'Un doigt : outil actif · deux doigts : déplacer et zoomer'));
    openModal('Commandes', h('div', null,
      h('p', { text: 'Objectif : extraire, transformer, puis livrer les pièces au Port pour assembler la station. Pas de chronomètre : prends ton temps.' }), tbl,
      h('p', { class: 'small', text: 'Astuces : la flèche jaune d’une machine indique sa sortie. Les voyants : vert = en production, orange = attend des matières, rouge = sortie bloquée. Le Port revend automatiquement le surplus. L’onglet Production montre ce qui manque à chaque groupe de machines.' })));
  }

  // ------------------------------------------------ guide: all resources and recipes
  function showGuide() {
    const used = {}, forStation = {};
    for (const id in RECIPES) for (const k in RECIPES[id].in) (used[k] = used[k] || []).push(id);
    CO.PHASES.forEach(function (p) { for (const k in p.need) forStation[k] = true; });

    const chip = function (id, n) {
      return h('span', { class: 'gchip', 'data-item': id }, itemIcon(id, 3), n ? h('b', { text: '×' + n }) : null, h('small', { text: itemName(id) }));
    };
    const plus = function () { return h('span', { class: 'gop', text: '+' }); };

    function card(id) {
      const rec = RECIPES[id], it = ITEMS[id];
      const recOk = !rec || CO.isRecipeUnlocked(id);
      const mach = rec ? BUILDINGS[rec.machine] : null;
      const machOk = !mach || CO.isBuildingUnlocked(rec.machine);
      const left = h('div', { class: 'gleft' }, itemIcon(id, 4),
        h('div', null, h('b', { text: it.name }), h('div', { class: 'small', text: it.price + ' ¢ l’unité' + (forStation[id] ? ' · ★ station' : '') })));
      const right = h('div', { class: 'gright' });
      if (rec) {
        const line = h('div', { class: 'gline' });
        Object.keys(rec.in).forEach(function (k, i) { if (i) line.appendChild(plus()); line.appendChild(chip(k, rec.in[k])); });
        if (rec.fin) Object.keys(rec.fin).forEach(function (k) { if (line.children.length) line.appendChild(plus()); line.appendChild(chip(k, rec.fin[k])); });
        line.appendChild(h('span', { class: 'garrow', 'data-bld': rec.machine }, thumb(rec.machine, 30), h('small', { text: mach.name })));
        Object.keys(rec.out).forEach(function (k, i) { if (i) line.appendChild(plus()); line.appendChild(chip(k, rec.out[k])); });
        right.appendChild(line);
        const t = CO.craftTime(rec), per = rec.out[id] / t;
        right.appendChild(h('div', { class: 'small', text: 'Cycle ' + fmtTime(t) + ' · ' + fmtRate(per) + ' par machine' }));
        if (!recOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Recherche requise : ' + TECHS[rec.tech].name }));
        else if (!machOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Machine à débloquer : ' + TECHS[mach.tech].name }));
      } else {
        const dr = CO.planet().drill, rate = BUILDINGS[dr].rate * CO.mods.drill;
        right.appendChild(h('div', { class: 'gline' }, h('span', { class: 'garrow', 'data-bld': dr }, thumb(dr, 30), h('small', { text: BUILDINGS[dr].name })), h('span', { class: 'gop', text: '➜' }), chip(id, 1)));
        right.appendChild(h('div', { class: 'small', text: 'Se récolte sur un gisement de ce minerai : ' + fmtRate(rate / 4) + ' par case couverte (' + fmtRate(rate) + ' pour une foreuse 2×2 entière).' }));
      }
      if (used[id]) {
        const u = h('div', { class: 'guse' }, h('span', { class: 'small', text: 'Sert à :' }));
        used[id].forEach(function (r) { u.appendChild(h('span', { class: 'gchip mini', 'data-item': r }, itemIcon(r, 2), h('small', { text: itemName(r) }))); });
        right.appendChild(u);
      }
      return h('div', { class: 'gcard' + (recOk && machOk ? '' : ' locked') }, left, right);
    }

    const body = h('div', { class: 'guide' },
      h('p', { class: 'small', text: 'Les ressources de ' + CO.planet().name + ' et leur cycle de transformation. Les cadences tiennent compte de tes recherches. ★ = demandé ' + CO.planet().goalOf + '. Les éléments grisés sont à débloquer.' }));
    const sec = function (title, ids) {
      body.appendChild(h('div', { class: 'tier', text: title }));
      ids.forEach(function (id) { body.appendChild(card(id)); });
    };
    sec('Matières premières (gisements)', CO.ITEM_ORDER.filter(function (id) { return !RECIPES[id]; }));
    CO.planet().machines.forEach(function (m) {
      sec(BUILDINGS[m].name, CO.ITEM_ORDER.filter(function (id) { return RECIPES[id] && RECIPES[id].machine === m; }));
    });
    openModal('Ressources et recettes · ' + CO.planet().name, body, [{ label: 'Fermer', primary: true }], 'wide');
  }
  UI.showGuide = function () { showGuide(); };

  // ----------------------------------------------------------------- palette
  function buildPalette() {
    const pal = $('palette'); pal.innerHTML = ''; palButtons = {};
    const hot = CO.input.hotbar();
    let lastCat = '';
    CO.BUILD_ORDER.forEach(function (type) {
      const def = BUILDINGS[type];
      if (def.cat !== lastCat) { lastCat = def.cat; pal.appendChild(h('div', { class: 'pal-cat', text: def.cat })); }
      const unlocked = CO.isBuildingUnlocked(type), idx = hot.indexOf(type);
      const btn = h('button', {
        class: 'pal-item' + (unlocked ? '' : ' locked'), 'data-type': type,
        'data-bld': type,
        onclick: function () { CO.input.selectBuild(type); }
      }, thumb(type),
      h('span', { class: 'pal-name', text: def.name }),
      h('span', { class: 'pal-cost', text: unlocked ? def.cost + ' ¢' : '🔒 ' + TECHS[def.tech].name }),
      idx >= 0 && idx < 10 ? h('span', { class: 'pal-key', text: String((idx + 1) % 10) }) : null);
      palButtons[type] = btn; pal.appendChild(btn);
    });
  }
  function updatePalette() {
    const st = CO.input.get();
    for (const type in palButtons) {
      const b = palButtons[type], def = BUILDINGS[type];
      b.classList.toggle('active', st.tool === 'build' && st.buildType === type);
      b.classList.toggle('poor', CO.isBuildingUnlocked(type) && CO.state.money < def.cost);
    }
  }

  // ----------------------------------------------------------------- toolbar
  const toolBtns = {};
  function buildToolbar() {
    const tb = $('toolbar');
    const mk = function (id, label, title, fn) {
      const b = h('button', { class: 'tbtn', 'data-tip': label[1] + '|' + title, onclick: fn }, h('span', { class: 'tico', text: label[0] }), h('span', { class: 'tlab', text: label[1] }));
      toolBtns[id] = b; tb.appendChild(b); return b;
    };
    mk('inspect', ['✋', 'Inspecter'], 'Inspecter / déplacer la carte (V)', function () { CO.input.setTool('inspect'); });
    mk('select', ['▭', 'Sélection'], 'Sélectionner un rectangle (E)', function () { CO.input.setTool('select'); });
    mk('delete', ['✖', 'Supprimer'], 'Supprimer (X) : tire un rectangle. Le clic droit marche aussi.', function () { CO.input.setTool('delete'); });
    tb.appendChild(h('span', { class: 'sep' }));
    mk('rotate', ['↻', 'Tourner'], 'Tourner (R)', function () { CO.input.rotate(); });
    mk('undo', ['↶', 'Annuler'], 'Annuler (Ctrl+Z)', function () { CO.input.undo(); });
    mk('redo', ['↷', 'Rétablir'], 'Rétablir (Ctrl+Y)', function () { CO.input.redo(); });
    tb.appendChild(h('span', { class: 'sep' }));
    mk('copy', ['⧉', 'Copier'], 'Copier la sélection (Ctrl+C)', function () { CO.input.copy(); });
    mk('paste', ['▣', 'Coller'], 'Coller la disposition (Ctrl+V)', function () { CO.input.paste(); });
    mk('cut', ['✂', 'Couper'], 'Couper la sélection (Ctrl+X)', function () { CO.input.cut(); });
    tb.appendChild(h('span', { class: 'sep' }));
    mk('zoomin', ['＋', 'Zoom'], 'Zoom avant (+)', function () { CO.input.zoomBy(1.25); });
    mk('zoomout', ['－', 'Zoom'], 'Zoom arrière (-)', function () { CO.input.zoomBy(0.8); });
    mk('home', ['⌖', 'Port'], 'Recentrer sur le Port', function () { CO.input.centerOnPort(); });
    mk('view', ['◇', 'Vue'], 'Changer de vue (Tab) : isométrique en voxels ou vue de dessus', function () { CO.render.toggleMode(); });
    mk('guide', ['📖', 'Recettes'], 'Ressources et recettes (I)', function () { showGuide(); });
  }
  function updateToolbar() {
    const st = CO.input.get();
    ['inspect', 'select', 'delete'].forEach(function (t) { toolBtns[t].classList.toggle('active', st.tool === t); });
    toolBtns.paste.classList.toggle('active', st.tool === 'paste');
    toolBtns.undo.disabled = !CO.history.canUndo(); toolBtns.redo.disabled = !CO.history.canRedo();
    toolBtns.paste.disabled = !st.clipboard;
    toolBtns.copy.disabled = !st.selection.length && !st.inspected;
    toolBtns.cut.disabled = toolBtns.copy.disabled;
    $('btn-map').classList.toggle('active', CO.minimap.shown());
    toolBtns.view.querySelector('.tico').textContent = CO.render.mode === 'iso' ? '◇' : '□';
  }

  // ------------------------------------------------------------------ topbar
  UI.phaseProgress = function () {
    const st = CO.state, p = CO.getPhase(st.phase);
    let have = 0, need = 0;
    for (const k in p.need) { need += p.need[k]; have += Math.min(st.phaseHave[k] || 0, p.need[k]); }
    return need ? have / need : 0;
  };
  function updateTopbar() {
    const st = CO.state, p = CO.getPhase(st.phase), pr = UI.phaseProgress();
    $('money-val').textContent = CO.fmt(st.money) + ' ¢';
    const r = CO.sim.moneyPerMin();
    $('money-rate').textContent = r >= 1 ? '+' + CO.fmt(r) + '/min' : '';
    const busy = CO.sim.busyWorkers(), wait = CO.world.sites.length - busy;
    $('workers-val').textContent = busy + '/' + st.workers;
    const PWR = CO.power, pc = $('power');
    $('power-val').textContent = CO.fmt(Math.round(PWR.demand)) + '/' + CO.fmt(Math.round(PWR.supply)) + ' kW';
    pc.classList.toggle('short', PWR.demand > PWR.supply && PWR.supply > 0);
    pc.classList.toggle('dead', PWR.unpowered > 0);
    $('power-warn').textContent = PWR.unpowered ? PWR.unpowered + ' sans courant' : '';
    const gs = CO.ghostStats(), paidWait = wait - gs.n;
    $('workers-wait').textContent = [paidWait > 0 ? paidWait + ' en attente' : '', gs.n ? gs.n + ' fantôme(s)' : ''].filter(Boolean).join(' · ');
    const P = CO.planet(), total = CO.PHASES.length;
    const label = P.name + ' · ' + (p.done ? p.name : st.phase < total ? P.goal + ' · étape ' + (st.phase + 1) + '/' + total + ' · ' + p.name
      : P.goal + ' · ' + p.name + (isFinite(P.maxExt) ? ' / ' + P.maxExt : ''));
    $('phase-label').textContent = p.done ? label : label + ' · ' + Math.floor(pr * 100) + ' %';
    $('phase-bar').style.width = (p.done ? 100 : pr * 100) + '%';
  }

  // -------------------------------------------------------- hint + status line
  function currentHint() {
    const st = CO.state;
    // The tutorial ends with the first delivery to the Port (or on any save already past step 1):
    // deleting every drill later on must not bring the beginner hints back.
    if (st.planet > 0 || st.phase > 0 || st.stats.delivered > 0) return '';
    let drills = 0, belts = 0, smelters = 0, labs = 0;
    for (let i = 0; i < CO.world.list.length; i++) {
      const k = CO.world.list[i].kind;
      if (k === 'drill') drills++; else if (k === 'belt') belts++; else if (k === 'lab') labs++;
      else if (CO.world.list[i].type === 'smelter') smelters++;
    }
    if (!drills) return '① Pose une Foreuse (palette à gauche) sur un gisement coloré de la carte.';
    if (CO.power.unpowered > 0) return '⚡ Un bâtiment n’a pas de courant : rapproche-le du Port, ou relie-le avec des Poteaux électriques (catégorie Énergie de la palette).';
    if (!belts) return '② Relie la foreuse avec des convoyeurs : maintiens le clic et glisse. La touche R tourne la sortie.';
    if (!st.stats.sold) return '③ Termine la ligne par un Comptoir de vente (ou le Port, au centre) : les crédits montent !';
    if (!smelters) return '④ Un lingot vaut plus qu’un minerai : intercale une Fonderie (la flèche jaune = sa sortie).';
    if (!labs) return '⑤ Construis un Laboratoire, puis ouvre l’onglet Recherche pour débloquer de nouvelles machines.';
    if (!st.stats.delivered) return '⑥ Livre des plaques de fer et des engrenages au Port : c’est la première pièce de la station.';
    return '';
  }
  function updateHint() {
    const t = currentHint(), el = $('hint');
    el.textContent = t; el.hidden = !t;
  }
  function costText() {
    const g = CO.input.getGhostCost();
    return 'coût ' + CO.fmt(CO.input.getCost()) + ' ¢' + (g ? ' (dont ' + CO.fmt(g) + ' ¢ en fantômes)' : '');
  }
  function ghostLine() {
    const gs = CO.ghostStats();
    if (!gs.n) return null;
    return h('div', { class: 'need-top ghost-line' }, h('span', { text: gs.n + ' fantôme(s) en attente' }), h('b', { text: 'Reste à payer : ' + CO.fmt(gs.cost) + ' ¢' }));
  }
  function updateStatus() {
    const st = CO.input.get(), hv = CO.input.hoverInfo();
    let txt = '';
    if (st.tool === 'build') {
      const def = BUILDINGS[st.buildType];
      txt = def.name + ' · ' + CO.DIR_ARROWS[st.rot] + ' · ' + costText() + ' · R pour tourner · glisser pour en poser plusieurs' + (def.kind === 'belt' ? ' (Ctrl : en L, Alt : à main levée)' : '');
    } else if (st.tool === 'paste') txt = 'Coller : clique pour poser la disposition · R pour tourner · F pour retourner (miroir) · Échap pour annuler · ' + costText();
    else if (st.tool === 'select') txt = 'Sélection : tire un rectangle, puis Ctrl+C (copier), Suppr (supprimer)' + (st.selection.length ? ' · ' + st.selection.length + ' sélectionné(s)' : '');
    else if (st.tool === 'delete') txt = 'Suppression : tire un rectangle sur les bâtiments à détruire (remboursement intégral)';
    else if (st.tool === 'link') txt = 'Catapulte : clique sur la catapulte qui recevra les objets (cercle = portée de ' + BUILDINGS.driver.range + ' cases) · Échap ou clic droit pour annuler';
    else if (hv) {
      txt = hv.x + ', ' + hv.y;
      if (hv.b) txt += ' · ' + hv.b.def.name; else if (hv.ore) txt += ' · ' + oreLabel(hv.ore);
    }
    $('status').textContent = txt;
  }

  // -------------------------------------------------------------- side panel
  const TABS = [['station', 'Station'], ['research', 'Recherche'], ['stats', 'Production'], ['plans', 'Plans'], ['info', 'Infos']];
  function buildTabs() {
    const t = $('tabs'); t.innerHTML = '';
    TABS.forEach(function (x) {
      t.appendChild(h('button', { class: 'tab' + (tab === x[0] ? ' active' : ''), 'data-tab': x[0], text: x[1], onclick: function () { setTab(x[0]); } }));
    });
  }
  function setTab(t) {
    tab = t; lastSig = ''; stationCv = null;
    Array.prototype.forEach.call($('tabs').children, function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
    renderSide(true);
  }

  function craftHint(id) {
    const r = RECIPES[id];
    if (r && !CO.isRecipeUnlocked(id)) return 'Recherche requise : ' + TECHS[r.tech].name;
    return '';
  }

  /** "Programme orbital" section: current mission, payloads sent, bonuses earned. */
  function orbitSection(body) {
    const o = CO.state.orbit;
    if (!CO.state.tech.rocketry && !o.mission && !o.launches) return;
    const m = CO.getMission(o.mission), box = h('div', { class: 'icard flat' });
    box.appendChild(h('div', { class: 'ititle', text: (o.mission < CO.MISSIONS.length ? 'Mission ' + (o.mission + 1) + ' sur ' + CO.MISSIONS.length + ' — ' : '') + m.name }));
    box.appendChild(h('p', { class: 'small', text: m.desc + ' Récompense : ' + m.text + '.' }));
    box.appendChild(costRow(m.need, o.have));
    const done = [];
    for (let i = 0; i < Math.min(o.mission, CO.MISSIONS.length); i++) done.push(CO.MISSIONS[i].text);
    box.appendChild(h('div', { class: 'small', text: o.launches + ' lancement(s)' + (done.length ? ' · Bonus acquis : ' + done.join(', ') : '') }));
    box.appendChild(h('div', { class: 'small', text: 'Pas de tir : 10 Modules de fusée + 1 charge utile (Satellite ou Sonde profonde) par lancement.' }));
    body.appendChild(section('Programme orbital', box));
  }
  function contractSig() {
    const c = CO.state.contracts;
    if (!c || !CO.contracts.open()) return '';
    return c.offers.map(function (o) { return o.id; }).join() + '|' + c.active.map(function (a) { return a.id + ':' + a.have + ':' + Math.ceil((a.deadline - CO.state.time) / 5); }).join() + '|' + c.done;
  }
  function fmtClock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  /** "Contrats du Port" section of the Station tab: accepted contracts with their clock, then the offers. */
  function contractsSection(body) {
    if (!CO.contracts.open()) return;
    const C = CO.contracts, c = CO.state.contracts || C.fresh(), st = CO.state;
    const box = h('div', { class: 'contracts' });
    c.active.forEach(function (a) {
      const left = a.deadline - st.time, f = a.have / a.qty;
      box.appendChild(h('div', { class: 'ctr active' + (left < 60 ? ' late' : '') },
        h('div', { class: 'ctr-head' }, itemIcon(a.item, 3), h('b', { text: a.have + ' / ' + a.qty + ' ' + itemName(a.item) }),
          h('span', { class: 'ctr-time', text: '⏱ ' + fmtClock(left) })),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + (f * 100) + '%' })),
        h('div', { class: 'ctr-foot' }, h('span', { class: 'gold', text: '+' + CO.fmt(a.reward) + ' ¢' }),
          h('button', { class: 'btn small', text: 'Abandonner', onclick: function () { C.abandon(a.id); renderSide(true); } }))));
    });
    c.offers.forEach(function (o) {
      const full = c.active.length >= C.MAX_ACTIVE, normal = CO.ITEMS[o.item].price * o.qty;
      box.appendChild(h('div', { class: 'ctr' },
        h('div', { class: 'ctr-head' }, itemIcon(o.item, 3), h('b', { text: o.qty + ' ' + itemName(o.item) }), h('span', { class: 'ctr-time', text: '⏱ ' + Math.round(o.time / 60) + ' min' })),
        h('div', { class: 'ctr-foot' }, h('span', { class: 'gold', text: '+' + CO.fmt(o.reward) + ' ¢', 'data-tip': 'Récompense|Vendus au comptoir, ces objets rapporteraient ' + CO.fmt(normal) + ' ¢' }),
          h('span', null,
            h('button', { class: 'btn small', text: 'Refuser', onclick: function () { C.decline(o.id); renderSide(true); } }),
            h('button', { class: 'btn small primary', text: 'Accepter', disabled: full, 'data-tip': full ? 'Déjà ' + C.MAX_ACTIVE + ' contrats en cours' : null,
              onclick: function () { if (C.accept(o.id)) CO.emit('toast', 'Contrat accepté : livre ' + o.qty + ' × ' + itemName(o.item) + ' au Port.', 'info'); renderSide(true); } })))));
    });
    if (!c.offers.length && !c.active.length) box.appendChild(h('p', { class: 'note', text: 'Pas de contrat pour l’instant : le Port en proposera dès que ton usine produira.' }));
    box.appendChild(h('div', { class: 'small', text: 'Livre au Port : les contrats acceptés passent avant la station. Nouvelles offres dans ' + fmtClock(c.next - st.time) + ' · ' + c.done + ' rempli(s), ' + CO.fmt(c.earned) + ' ¢ gagnés.' }));
    body.appendChild(section('Contrats du Port (' + c.active.length + ' / ' + C.MAX_ACTIVE + ')', box));
  }
  /** Arrow next to the station picture towards planet `k` (`dir` −1 / +1), or nothing past the last planet. */
  function planetArrow(k, dir) {
    const Q = CO.PLANETS[k];
    if (!Q) return null;
    const open = CO.planetOpen(k), cur = CO.planet();
    const tip = open ? Q.name + '|' + Q.desc + '|' + (CO.planetVisited(k) ? 'Clique pour y retourner : ton usine t’y attend telle que tu l’as laissée.' : 'Clique pour t’y poser : une nouvelle carte, de nouveaux minerais et de nouvelles recherches.')
      : Q.name + ' 🔒|Termine les ' + cur.maxExt + ' extensions ' + cur.goalOf + ' pour y voyager.';
    return h('button', { class: 'planet-arrow ' + (dir < 0 ? 'left' : 'right') + (open ? '' : ' locked') + (open && !CO.planetVisited(k) ? ' new' : ''),
      'data-tip': tip, disabled: !open, onclick: function () { UI.travel(k); } }, h('span', { text: dir < 0 ? '◀' : '▶' }), h('small', { text: open ? Q.name : '🔒' }));
  }
  function renderStation(body) {
    const st = CO.state, p = CO.getPhase(st.phase), total = CO.PHASES.length, P = CO.planet();
    stationCv = h('canvas', { class: 'station-cv', width: 192, height: 128 });
    body.appendChild(h('div', { class: 'station-wrap' }, stationCv,
      h('div', { class: 'planet-name', text: P.name + (CO.PLANETS.length > 1 ? ' · ' + (st.planet + 1) + '/' + CO.PLANETS.length : '') }),
      planetArrow(st.planet - 1, -1), planetArrow(st.planet + 1, 1)));
    if (p.done) {
      const next = CO.PLANETS[st.planet + 1];
      body.appendChild(h('div', { class: 'phase-title', text: p.name }));
      body.appendChild(h('p', { class: 'small', text: 'Toutes les étapes et les ' + P.maxExt + ' extensions sont livrées. Le Port continue d’acheter ce que tu lui apportes.' }));
      if (next && CO.planetOpen(st.planet + 1)) body.appendChild(h('button', { class: 'btn primary travel-btn', text: (CO.planetVisited(st.planet + 1) ? 'Retourner sur ' : 'Voyager vers ') + next.name + ' ▶', onclick: function () { UI.travel(st.planet + 1); } }));
    } else {
      body.appendChild(h('div', { class: 'phase-title', text: (st.phase < total ? 'Étape ' + (st.phase + 1) + ' sur ' + total + ' — ' : 'Agrandissement — ') + p.name + (p.extension && isFinite(P.maxExt) ? ' / ' + P.maxExt : '') }));
      body.appendChild(h('p', { class: 'small', text: p.desc }));
    }
    for (const id in p.need) {
      const have = Math.min(st.phaseHave[id] || 0, p.need[id]), pct = have / p.need[id] * 100, hint = craftHint(id);
      body.appendChild(h('div', { class: 'need' + (have >= p.need[id] ? ' done' : '') },
        itemIcon(id, 3),
        h('div', { class: 'need-main' },
          h('div', { class: 'need-top' }, h('span', { text: itemName(id) }), h('b', { text: have + ' / ' + p.need[id] })),
          h('div', { class: 'bar small' }, h('i', { style: 'width:' + pct + '%' })),
          hint ? h('div', { class: 'lock', text: '🔒 ' + hint }) : null)));
    }
    if (!p.done) body.appendChild(h('p', { class: 'small', text: 'Récompense : ' + CO.fmt(p.reward) + ' ¢. Livre les objets au Port (4×4 au centre de la carte) ; le surplus est revendu.' }));
    if (st.planet === 0) orbitSection(body);
    contractsSection(body);
    const owned = st.land.reduce(function (a, v) { return a + v; }, 0);
    body.appendChild(section('Terrain · ' + P.name, h('div', null,
      h('div', { class: 'need-top' }, h('span', { text: owned + ' parcelles sur ' + st.land.length }), h('b', { text: 'Prochaine : ' + CO.fmt(CO.landPrice()) + ' ¢' })),
      h('p', { class: 'small', text: 'Clique sur une parcelle assombrie qui touche ton terrain pour l’acheter. Chaque achat coûte 25 % de plus que le précédent. ' + P.far }))));
    const wp = CO.workerPrice();
    body.appendChild(section('Ouvriers', h('div', null,
      h('div', { class: 'need-top' }, h('span', { text: st.workers + ' ouvrier(s) sur ' + CO.WORKERS.max }), h('b', { text: wp == null ? 'Équipe au complet' : 'Recrue : ' + CO.fmt(wp) + ' ¢' })),
      h('p', { class: 'small', text: 'Chaque bâtiment posé est un chantier : un ouvrier part du Port, vole jusqu’à lui et le construit (de ' + fmtTime(CO.BUILD_TIME.belt) + ' pour un convoyeur à ' + fmtTime(CO.BUILD_TIME.spaceyard) + ' pour un Chantier spatial). Plus d’ouvriers = plus de chantiers en même temps.' }),
      h('p', { class: 'small', text: 'Sans assez de crédits, ce que tu poses devient un fantôme (bleu) : un ouvrier le paie et le construit dès que les crédits arrivent.' }),
      ghostLine(),
      wp == null ? null : h('button', { class: 'btn primary', text: 'Recruter un ouvrier · ' + CO.fmt(wp) + ' ¢', onclick: function () {
        const err = CO.hireWorker();
        if (err) CO.emit('toast', err + ' (il faut ' + CO.fmt(wp) + ' ¢).', 'warn');
        else { CO.emit('toast', 'Nouvel ouvrier recruté : ' + CO.state.workers + ' en tout.', 'good'); CO.save.save(); }
      } }))));
    const list = h('div', { class: 'phase-list' });
    for (let i = 0; i < total; i++) {
      list.appendChild(h('div', { class: 'phase-row' + (i < st.phase ? ' done' : i === st.phase ? ' cur' : '') }, h('span', { text: i < st.phase ? '✔' : String(i + 1) }), h('span', { text: CO.PHASES[i].name })));
    }
    if (st.phase >= total) {
      const n = Math.min(st.phase - total, P.maxExt);
      list.appendChild(h('div', { class: 'phase-row done' }, h('span', { text: isFinite(P.maxExt) ? '✚' : '∞' }),
        h('span', { text: isFinite(P.maxExt) ? n + ' extension(s) sur ' + P.maxExt : n + ' extension(s) terminée(s)' })));
    }
    body.appendChild(list);
  }

  // ------------------------------------------------------------ planets
  /**
   * Travel to planet `k` with a short warp: the screen fills with streaking stars, the planet changes
   * under cover, then the new planet fades in with its name.
   */
  let warping = false;
  UI.travel = function (k) {
    if (warping || !CO.planetOpen(k) || k === CO.state.planet) return;
    warping = true;
    UI.closeModal();
    const Q = CO.PLANETS[k], el = h('div', { id: 'warp' }), cv = h('canvas'), title = h('div', { class: 'warp-title' }, h('small', { text: 'Cap sur' }), h('b', { text: Q.name }));
    el.appendChild(cv); el.appendChild(title); $('app').appendChild(el);
    const g = cv.getContext('2d'), rnd = CO.rng(k * 97 + 5), stars = [];
    for (let i = 0; i < 180; i++) stars.push({ a: rnd() * Math.PI * 2, d: rnd() * 0.2 + 0.02, v: 0.4 + rnd() * 1.4, c: rnd() });
    const T = 2.2, SWITCH = 0.9, t0 = performance.now();
    let switched = false;
    function frame(now) {
      const t = (now - t0) / 1000;
      if (!switched && t >= SWITCH) {
        switched = true;
        CO.travel(k);
        CO.save.save();
      }
      const w = cv.width = el.clientWidth, hh = cv.height = el.clientHeight, cx = w / 2, cy = hh / 2, R0 = Math.hypot(cx, cy);
      const fadeIn = Math.min(1, t / 0.45), fadeOut = t > T - 0.6 ? Math.max(0, (T - t) / 0.6) : 1;
      el.style.opacity = String(Math.min(fadeIn, fadeOut));
      g.fillStyle = '#05040a'; g.fillRect(0, 0, w, hh);
      const speed = t < SWITCH ? 0.4 + t * 2.4 : Math.max(0.3, 2.6 - (t - SWITCH) * 2.2);
      stars.forEach(function (s) {
        s.d += s.v * speed * 0.012 * (0.2 + s.d);
        if (s.d > 1.2) s.d = 0.02 + rnd() * 0.05;
        const r0 = s.d * R0, r1 = Math.max(r0 - speed * 18 * (0.3 + s.d), 0);
        g.strokeStyle = s.c > 0.7 ? '#9fe8ff' : s.c > 0.4 ? '#d8c8ff' : '#ffffff';
        g.globalAlpha = Math.min(1, s.d * 2.5);
        g.lineWidth = 1 + s.d * 2;
        g.beginPath(); g.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); g.lineTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); g.stroke();
      });
      g.globalAlpha = 1;
      title.style.opacity = String(t < SWITCH ? Math.min(1, t / 0.5) : 1);
      if (t < T) requestAnimationFrame(frame);
      else { el.remove(); warping = false; }
    }
    requestAnimationFrame(frame);
  };
  CO.on('travel', function (k, first) {
    CO.input.setTool('inspect');
    if (tab !== 'station') setTab('station');
    const Q = CO.PLANETS[k];
    CO.emit('toast', 'Bienvenue sur ' + Q.the + '.', 'good');
    if (!first) return;
    setTimeout(function () { UI.whenFree(function () {
      const cv = h('canvas', { class: 'station-cv big', width: 192, height: 128 });
      CO.drawStation(cv, 0, 0, 0, k);
      openModal('Bienvenue sur ' + Q.name, h('div', null, cv,
        h('p', { text: Q.desc }),
        h('p', { class: 'small', text: 'Nouvelle carte, nouveaux minerais, nouveaux liquides et nouvelles machines : la palette ne montre que ce qui existe ici. L’onglet Recherche a ses propres technologies ; ce que tu as appris sur ' + CO.PLANETS[k - 1].the + ' (convoyeurs, aiguillages, coffres, poteaux, améliorations) reste acquis.' }),
        h('p', { class: 'small', text: 'Objectif : ' + Q.phases.length + ' étapes ' + Q.goalOf + ', à livrer au Port. Ton argent et tes ouvriers t’ont suivi ; pendant ton absence, l’usine de ' + CO.PLANETS[k - 1].the + ' est en pause et reprend à ton retour (flèche ◀ au-dessus de l’image).' }),
        h('p', { class: 'small', text: 'Pour commencer : ' + BUILDINGS[Q.drill].name + ' sur un gisement près du Port, des convoyeurs, ' + BUILDINGS[Q.smelter].name + ', puis ' + BUILDINGS[Q.gen].name + ' (' + ITEMS[BUILDINGS[Q.gen].fuel].name.toLowerCase() + ' par convoyeur) quand le courant du Port ne suffit plus.' })),
        [{ label: 'C’est parti !', primary: true }]);
      UI.modalAnim = { cv: cv, phase: 0, planet: k };
    }); }, 200);
  });

  // ------------------------------------------------------------ land purchase
  /** Confirmation dialog to buy plot `p` (or a toast explaining why it cannot be bought). */
  UI.askBuyPlot = function (p) {
    if (UI.modalOpen()) return;
    const st = CO.state, price = CO.landPrice();
    if (!CO.plotBuyable(p)) { CO.emit('toast', 'Ce terrain est hors d’atteinte : achète d’abord une parcelle qui touche le tien.', 'warn'); return; }
    const raw = CO.plotOre(p), ore = {}, r = CO.plotRect(p), w = r.x1 - r.x0 + 1, hh = r.y1 - r.y0 + 1;
    Object.keys(raw).sort(function (a, b) { return raw[b] - raw[a]; }).forEach(function (k) { ore[k] = raw[k]; });
    const body = h('div', null,
      h('p', { text: 'Parcelle de ' + w + '×' + hh + ' cases. Une fois achetée, tu peux y construire.' }),
      section('Gisements (cases)', stockChips(ore)),
      h('p', { class: 'small', text: 'Prix : ' + CO.fmt(price) + ' ¢ · tu as ' + CO.fmt(Math.floor(st.money)) + ' ¢. La parcelle suivante coûtera ' + CO.fmt(CO.landPrice(st.landBought + 1)) + ' ¢.' }));
    const can = st.money >= price;
    if (!can) body.appendChild(h('p', { class: 'small', style: 'color:var(--bad)', text: 'Il te manque ' + CO.fmt(Math.ceil(price - st.money)) + ' ¢.' }));
    openModal('Acheter ce terrain ?', body, can ? [{ label: 'Annuler' }, { label: 'Acheter · ' + CO.fmt(price) + ' ¢', primary: true, run: function () {
      const err = CO.buyPlot(p);
      if (err) { CO.emit('toast', err + '.', 'warn'); return; }
      CO.emit('toast', 'Terrain acheté pour ' + CO.fmt(price) + ' ¢. Prochain : ' + CO.fmt(CO.landPrice()) + ' ¢.', 'good');
      CO.save.save();
    } }] : [{ label: 'Fermer' }]);
  };

  function depthOf(id, memo) {
    if (memo[id] != null) return memo[id];
    let d = 0; TECHS[id].req.forEach(function (r) { d = Math.max(d, depthOf(r, memo) + 1); });
    return (memo[id] = d);
  }
  function unlocksText(id) {
    const out = [];
    CO.BUILD_ORDER.forEach(function (b) { if (BUILDINGS[b].tech === id) out.push(BUILDINGS[b].name); });
    for (const r in RECIPES) if (RECIPES[r].tech === id) out.push('recette : ' + itemName(r));
    return out.join(', ');
  }
  /** Lab reserve chips (items delivered ahead for research not started yet). */
  function bankBlock() {
    const bank = CO.state.researchBank;
    if (!Object.keys(bank).length) return null;
    return h('div', { class: 'icard flat bank' },
      h('div', { class: 'small', text: 'Réserve des laboratoires : objets livrés d’avance, utilisés dès qu’une recherche qui les demande démarre.' }),
      stockChips(bank));
  }
  function queueBlock() {
    const st = CO.state;
    if (!st.researchQueue.length) return null;
    const box = h('div', { class: 'icard flat queue' }, h('div', { class: 'small', text: 'File d’attente : la suivante démarre seule quand la recherche en cours se termine.' }));
    if (st.research) {
      const cost = TECHS[st.research].cost;
      let have = 0, need = 0;
      for (const k in cost) { need += cost[k]; have += Math.min(cost[k], st.researchProg[k] || 0); }
      box.appendChild(h('div', { class: 'qrow cur' }, h('span', { class: 'qn', text: '▶' }), h('span', { class: 'qname', text: TECHS[st.research].name }),
        h('b', { text: Math.floor(have / need * 100) + ' %' })));
    }
    st.researchQueue.forEach(function (id, i) {
      box.appendChild(h('div', { class: 'qrow' }, h('span', { class: 'qn', text: String(i + 1) }), h('span', { class: 'qname', text: TECHS[id].name }),
        h('button', { class: 'btn small', 'data-tip': 'Retirer de la file', text: '✖', onclick: function () { CO.unqueueResearch(id); } })));
    });
    return box;
  }
  function renderResearch(body) {
    const st = CO.state, memo = {};
    let labs = 0; CO.world.list.forEach(function (b) { if (b.kind === 'lab') labs++; });
    if (!labs) body.appendChild(h('p', { class: 'note', text: 'Construis un Laboratoire (palette, « Autres ») et amène-lui, par convoyeur, les objets demandés par la recherche active.' }));
    else if (!st.research) body.appendChild(h('p', { class: 'note', text: 'Choisis une recherche : tes laboratoires consommeront les objets demandés. Ce qui servira plus tard est mis en réserve.' }));
    if (st.planet > 0) body.appendChild(h('p', { class: 'small', text: 'Recherches de ' + CO.planet().name + ', avec ses propres objets. Ce que tu as appris sur ' + CO.PLANETS[0].the + ' reste acquis.' }));
    const qb = queueBlock(), bb = bankBlock();
    if (qb) body.appendChild(qb);
    if (bb) body.appendChild(bb);
    const ids = Object.keys(TECHS).filter(function (id) { return CO.onPlanet(TECHS[id]); }).sort(function (a, b) { return depthOf(a, memo) - depthOf(b, memo); });
    let lastDepth = -1;
    ids.forEach(function (id) {
      const t = TECHS[id], d = memo[id];
      if (d !== lastDepth) { lastDepth = d; body.appendChild(h('div', { class: 'tier', text: 'Niveau ' + (d + 1) })); }
      const done = !!st.tech[id], active = st.research === id, avail = CO.isTechAvailable(id);
      const qi = st.researchQueue.indexOf(id), queued = qi >= 0;
      const card = h('div', { class: 'tech' + (done ? ' done' : active ? ' active' : queued ? ' queued' : !avail ? ' locked' : '') });
      card.appendChild(h('div', { class: 'tech-top' }, h('b', { text: t.name }),
        done ? h('span', { class: 'badge', text: '✔ Terminée' }) : active ? h('span', { class: 'badge gold', text: 'En cours' }) : queued ? h('span', { class: 'badge gold', text: 'File n° ' + (qi + 1) }) : null));
      card.appendChild(h('div', { class: 'small', text: t.desc }));
      const u = unlocksText(id);
      if (u) card.appendChild(h('div', { class: 'small unl', text: 'Débloque : ' + u }));
      if (!done) card.appendChild(costRow(t.cost, active ? st.researchProg : st.researchBank));
      if (!done && !avail) card.appendChild(h('div', { class: 'lock', text: 'Requiert : ' + t.req.filter(function (r) { return !st.tech[r]; }).map(function (r) { return TECHS[r].name; }).join(', ') }));
      if (!done) {
        let btn = null;
        if (active) btn = h('button', { class: 'btn small', text: 'Annuler la recherche', 'data-tip': 'Annuler la recherche|Les objets déjà livrés retournent dans la réserve.', onclick: function () { CO.setResearch(null); CO.startNextResearch(); } });
        else if (queued) btn = h('button', { class: 'btn small', text: 'Retirer de la file', onclick: function () { CO.unqueueResearch(id); } });
        else if (avail && !st.research) btn = h('button', { class: 'btn small primary', text: 'Rechercher', onclick: function () { CO.setResearch(id); } });
        else if (CO.canQueue(id)) btn = h('button', { class: 'btn small primary', text: '+ File d’attente', 'data-tip': 'File d’attente|Démarrera automatiquement après les recherches qui la précèdent.', onclick: function () { CO.queueResearch(id); } });
        if (btn) card.appendChild(btn);
        if (avail && st.research && !queued && !active) card.appendChild(h('button', { class: 'btn small', text: 'Commencer maintenant', 'data-tip': 'Commencer maintenant|Met en pause la recherche en cours (ses objets vont dans la réserve).', onclick: function () { CO.setResearch(id); } }));
      }
      body.appendChild(card);
    });
  }

  function fmtRpm(x) { return x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace('.', ','); }
  // ---- production curves
  let histRes = 1;                                  // curve window: index in CO.sim.HIST (10 min by default)
  const openCurves = {};                            // items whose curve is unfolded (kept across re-renders)
  const CHART_W = 300, CHART_H = 70, CHART_S = 2;   // CSS size of a chart; drawn at 2× to stay sharp
  /** Line chart of per-minute series (oldest first, the last sample is "now") over the chosen window. */
  function chart(series, colors, unit) {
    const cv = h('canvas', { class: 'chart', width: CHART_W * CHART_S, height: CHART_H * CHART_S });
    const g = cv.getContext('2d'), W = CHART_W, Hh = CHART_H, top = 12, bot = Hh - 13, slots = 59;
    g.scale(CHART_S, CHART_S);
    g.fillStyle = '#101014'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#26262d';
    for (let i = 0; i <= 3; i++) g.fillRect(0, Math.round(top + i * (bot - top) / 3), W, 1);
    g.font = '10px Consolas, "Courier New", monospace'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#9a9aa8';
    g.textAlign = 'left'; g.fillText('−' + CO.sim.HIST[histRes].label, 3, Hh - 2);
    g.textAlign = 'right'; g.fillText('maintenant', W - 3, Hh - 2);
    const n = series[0].length;
    if (n < 2) { g.textAlign = 'center'; g.fillText('Pas encore de données', W / 2, (top + bot) / 2 + 4); return cv; }
    let max = 0;
    series.forEach(function (sr) { sr.forEach(function (v) { if (v > max) max = v; }); });
    const scale = max > 0 ? max * 1.1 : 1;
    const X = function (i) { return W - 1 - (n - 1 - i) * (W - 2) / slots; };
    const Y = function (v) { return bot - v / scale * (bot - top); };
    series.forEach(function (sr, k) {
      if (k === 0) {                                // soft area under the first series
        g.globalAlpha = 0.18; g.fillStyle = colors[0];
        g.beginPath(); g.moveTo(X(0), bot);
        for (let i = 0; i < n; i++) g.lineTo(X(i), Y(sr[i]));
        g.lineTo(X(n - 1), bot); g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      g.strokeStyle = colors[k]; g.lineWidth = 1.5; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) { if (i) g.lineTo(X(i), Y(sr[i])); else g.moveTo(X(i), Y(sr[i])); }
      g.stroke();
    });
    g.fillStyle = '#ececf0'; g.textAlign = 'left';
    g.fillText(fmtRpm(max) + (unit || ' /min'), 3, 10);
    return cv;
  }
  /** Machines grouped by recipe (drills by ore): how many work, wait or are blocked, and what they lack. */
  function machineGroups() {
    const groups = {}, order = [];
    CO.world.list.forEach(function (b) {
      let key, item;
      if (b.kind === 'drill') { if (!b.ore) return; key = 'd:' + b.ore; item = b.ore; }
      else if (b.kind === 'machine') { if (!b.recipe) { key = 'none'; item = null; } else { key = 'm:' + b.recipe; item = Object.keys(RECIPES[b.recipe].out)[0]; } }
      else return;
      let g = groups[key];
      if (!g) { g = groups[key] = { item: item, drill: b.kind === 'drill', n: 0, work: 0, idle: 0, blocked: 0, off: 0, miss: {} }; order.push(key); }
      g.n++;
      if (key === 'none') return;
      if (b.status === 'work') g.work++; else if (b.status === 'blocked') g.blocked++; else if (b.status === 'nopower') g.off++;
      else {
        g.idle++;
        const rec = RECIPES[b.recipe];
        for (const k in rec.in) if ((b.inBuf[k] || 0) < rec.in[k]) g.miss[k] = (g.miss[k] || 0) + 1;
        if (rec.fin) for (const k in rec.fin) if (CO.fluid.amount(b, k) < rec.fin[k]) g.miss[k] = (g.miss[k] || 0) + 1;
      }
    });
    return order.map(function (k) { return groups[k]; });
  }
  function renderStats(body) {
    const st = CO.state;
    body.appendChild(h('p', { class: 'small', text: 'Cadences mesurées sur la dernière minute. Si un objet est plus utilisé que produit (en rouge), ses machines clientes vont manquer : ajoute des producteurs. Clique sur un objet pour voir sa courbe.' }));
    const seg = h('div', { class: 'seg', 'data-tip': 'Durée des courbes|L’historique repart de zéro quand la page est rechargée' }, h('span', { text: 'Courbes sur' }));
    CO.sim.HIST.forEach(function (w, i) {
      seg.appendChild(h('button', { class: 'btn small' + (i === histRes ? ' primary' : ''), text: w.label, onclick: function () { histRes = i; renderSide(true); } }));
    });
    body.appendChild(seg);
    body.appendChild(h('div', { class: 'stat-money' }, h('span', { text: 'Revenus' }), h('b', { text: '+' + CO.fmt(CO.sim.moneyPerMin()) + ' ¢/min' })));
    body.appendChild(chart([CO.sim.history(histRes, 'm')], ['#ffd37f']));
    body.appendChild(h('div', { class: 'stat-money' }, h('span', { text: 'Énergie' }),
      h('b', { style: CO.power.demand > CO.power.supply ? 'color:#ffb347' : '', text: CO.fmt(Math.round(CO.power.demand)) + ' / ' + CO.fmt(Math.round(CO.power.supply)) + ' kW' })));
    body.appendChild(chart([CO.sim.history(histRes, 'ps'), CO.sim.history(histRes, 'pd')], ['#84f491', '#ffb347'], ' kW'));
    body.appendChild(h('div', { class: 'legend' }, h('span', { class: 'lg-p', text: '— production' }), h('span', { class: 'lg-u', text: '— demande' })));
    let any = false;
    const tbl = h('table', { class: 'stats' }, h('tr', null, h('th', { text: '' }), h('th', { text: 'Objet /min' }),
      h('th', { text: 'Produit', 'data-tip': 'Produit|Sorti des foreuses et des machines, par minute' }), h('th', { text: 'Utilisé', 'data-tip': 'Utilisé|Consommé par les machines, les laboratoires et la station, par minute' }), h('th', { text: 'Vendu', 'data-tip': 'Vendu|Comptoirs de vente et surplus revendu par le Port, par minute' })));
    CO.ITEM_ORDER.forEach(function (id) {
      const tot = st.stats.produced[id] || 0, p = CO.sim.ratePerMin(id), u = CO.sim.usePerMin(id), s = CO.sim.soldPerMin(id);
      if (!tot && !u && !s) return;
      any = true;
      const short = u > p * 1.05 + 0.5;                  // used faster than made: buffers are draining
      const open = !!openCurves[id];
      tbl.appendChild(h('tr', { class: 'srow' + (open ? ' open' : ''), 'data-tip': itemName(id) + '|' + CO.fmt(tot) + ' produits au total|Clique pour ' + (open ? 'replier' : 'voir') + ' la courbe',
        onclick: function () { if (openCurves[id]) delete openCurves[id]; else openCurves[id] = true; renderSide(true); } },
        h('td', null, itemIcon(id, 2)), h('td', { class: 'sname', text: (open ? '▾ ' : '▸ ') + itemName(id) }),
        h('td', { text: fmtRpm(p) }), h('td', { class: short ? 'neg' : u > 0 ? 'pos' : '', text: fmtRpm(u) }), h('td', { class: 'muted', text: fmtRpm(s) })));
      if (open) {
        tbl.appendChild(h('tr', { class: 'scurve' }, h('td', { colspan: 5 },
          chart([CO.sim.history(histRes, 'p', id), CO.sim.history(histRes, 'u', id)], ['#84f491', '#ffb347']),
          h('div', { class: 'legend' }, h('span', { class: 'lg-p', text: '— produit' }), h('span', { class: 'lg-u', text: '— utilisé' }), h('span', { class: 'muted', text: 'par minute' })))));
      }
    });
    body.appendChild(any ? tbl : h('p', { class: 'note', text: 'Rien produit pour l’instant. Pose une Foreuse sur un gisement !' }));

    const groups = machineGroups();
    if (!groups.length) return;
    body.appendChild(h('div', { class: 'tier', text: 'Machines par recette' }));
    const list = h('div', { class: 'mgroups' });
    groups.forEach(function (g) {
      const head = g.item ? h('span', { class: 'mg-name' }, itemIcon(g.item, 2), h('span', { text: (g.drill ? 'Foreuses · ' : '') + itemName(g.item) }))
        : h('span', { class: 'mg-name' }, h('span', { class: 'qmark', text: '?' }), h('span', { text: 'Sans recette' }));
      const counts = h('span', { class: 'mg-counts', 'data-tip': 'État des machines|En production · en attente de matières · sortie bloquée' },
        h('b', { text: '×' + g.n }),
        g.item ? h('span', { class: 'c good' }, h('i', { class: 'dot good' }), String(g.work)) : null,
        g.item ? h('span', { class: 'c warn' }, h('i', { class: 'dot warn' }), String(g.idle)) : null,
        g.item ? h('span', { class: 'c bad' }, h('i', { class: 'dot bad' }), String(g.blocked)) : null,
        g.off ? h('span', { class: 'c off', 'data-tip': 'Sans courant|Ces machines attendent de l’électricité' }, h('i', { class: 'dot off' }), String(g.off)) : null);
      const row = h('div', { class: 'mgroup' }, head, counts);
      const miss = Object.keys(g.miss);
      if (miss.length) {
        const m = h('div', { class: 'mg-miss' }, h('span', { text: 'Manque :' }));
        miss.forEach(function (k) { m.appendChild(h('span', { class: 'chip2', 'data-item': k }, itemIcon(k, 2), h('b', { text: '×' + g.miss[k] }))); });
        row.appendChild(m);
      }
      if (g.blocked) row.appendChild(h('div', { class: 'mg-miss bad', text: g.blocked + ' bloquée(s) : leur production ne sort pas (sortie non reliée ou ligne saturée).' }));
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // ------------------------------------------------------------ info panel
  let live = null;   // {b, bar, pct}: progress bar updated every frame without re-rendering the panel

  // Exact-looking numbers: research bonuses give values like 0,3125/s or 4,57 s, so keep a few decimals.
  function fmtNum(x, digits) { return x.toLocaleString('fr-FR', { maximumFractionDigits: digits }); }
  function fmtRate(x) { return fmtNum(x, 7) + '/s'; }   // rates are binary fractions (n/128 at worst): 7 decimals are exact
  function fmtTime(t) { return fmtNum(t, 2) + ' s'; }
  function oreLabel(ore) {
    const id = CO.ORE_IDS[ore];
    return ITEMS[id].place || 'Gisement : ' + itemName(id);
  }
  function pill(cls, text) { return h('span', { class: 'pill ' + cls }, h('i'), text); }

  function statusPill(b) {
    if (b.site && !b.site.paid) return pill('info', 'Fantôme : attend des crédits');
    if (b.site) return b.site.w ? pill('info', 'En construction') : pill('warn', 'Attend un ouvrier');
    if (CO.render.noPower(b)) return pill('off', b.net ? 'Réseau sans puissance' : 'Pas de courant');
    switch (b.kind) {
      case 'generator':
        if (!b.def.fuel) return b.status === 'work' ? pill('good', 'Produit') : pill('info', 'Prête (aucune demande)');
        return b.status === 'work' ? pill('good', 'Brûle : ' + itemName(b.def.fuel).toLowerCase()) : b.status === 'nofuel' ? pill('bad', 'Plus de ' + itemName(b.def.fuel).toLowerCase())
          : b.status === 'nowater' ? pill('bad', 'Manque : ' + itemName(b.def.cool || 'water').toLowerCase()) : pill('info', 'En veille (aucune demande)');
      case 'launch_pad':
        if (b.phase === 'flight') return pill('good', 'Décollage');
        if (b.phase === 'build') return pill('good', 'Assemblage de la fusée');
        return pill(b.parts >= b.def.parts && b.payload ? 'warn' : 'info', 'Modules ' + b.parts + ' / ' + b.def.parts + (b.payload ? ' · ' + itemName(b.payload) : ' · sans charge'));
      case 'drone_hub': {
        const fly = (b.drones || []).filter(function (d) { return d.state !== 'idle'; }).length;
        return fly ? pill('good', fly + ' drone(s) en vol') : pill('info', 'Drones au repos');
      }
      case 'drone_provider': return pill('info', b.q.length + ' / ' + b.def.capacity);
      case 'drone_requester':
        return b.filter ? pill('info', 'Demande : ' + itemName(b.filter) + ' (' + b.q.length + ' / ' + b.def.want + ')') : pill('warn', 'Objet à choisir');
      case 'pump':
        if (!b.n) return pill('bad', 'Hors ' + ITEMS[b.def.fluid].place.toLowerCase());
        return b.status === 'nopipe' ? pill('warn', 'Aucun tuyau') : b.status === 'blocked' ? pill('bad', 'Tuyaux pleins') : pill('good', 'Pompe');
      case 'pipe': case 'fluid_tank': {
        const n = b.fnet;
        return n && n.amount > 0 ? pill('info', itemName(n.fluid) + ' · ' + Math.round(n.amount / n.cap * 100) + ' %') : pill('info', 'Vide');
      }
      case 'pole': return b.net ? pill(b.net.sat >= 1 ? 'good' : b.net.sat > 0 ? 'warn' : 'bad', 'Réseau ' + Math.round(b.net.sat * 100) + ' %') : pill('info', 'Isolé');
      case 'machine':
        if (!b.recipe) return pill('warn', 'Recette à choisir');
        return b.status === 'work' ? pill('good', 'En production') : b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('warn', 'Attend des matières');
      case 'drill':
        if (!b.ore) return pill('bad', 'Hors gisement');
        return b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('good', 'Extraction');
      case 'lab': return CO.state.research ? pill('good', 'Recherche en cours') : pill('warn', 'Aucune recherche (mise en réserve)');
      case 'driver': {
        const tg = CO.sim.driverTarget(b);
        if (b.target && !tg) return pill('bad', 'Cible introuvable');
        if (tg) return b.status === 'blocked' ? pill('bad', 'Cible pleine') : b.status === 'work' ? pill('good', 'Envoi') : pill('warn', 'Attend des objets');
        return b.q.length ? (b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('good', 'Réception')) : pill('info', 'Réceptrice');
      }
      case 'seller': case 'port': return pill('good', 'Actif');
      case 'chest': return pill('info', b.q.length + ' / ' + CO.chestCap(b.def));
      case 'router':
        switch (b.type) {
          case 'splitter': return pill('info', b.filter ? 'Filtré' : 'Équitable');
          case 'overflow': return pill('info', 'Devant d’abord');
          case 'underflow': return pill('info', 'Côtés d’abord');
          case 'sorter_inv': return b.filter ? pill('info', 'Trie : ' + itemName(b.filter)) : pill('warn', 'Aucun filtre : tout va tout droit');
          default: return pill('info', 'Fusion');
        }
      case 'junction': return pill('info', 'Croisement');
      case 'unloader':
        return b.status === 'work' ? pill('good', 'Extrait' + (b.filter ? ' : ' + itemName(b.filter) : ''))
          : b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('warn', 'Rien à extraire');
      default: return pill('info', b.items.length + ' objet(s)');
    }
  }
  function statusHelp(b) {
    if (b.site && !b.site.paid) return 'Posé sans assez de crédits : un ouvrier viendra le payer (' + CO.fmt(b.def.cost) + ' ¢) et le construire dès que tu les auras.';
    if (b.site) return b.site.w ? 'Un ouvrier s’en occupe : ' + fmtTime(b.site.t) + ' de travail une fois sur place.' : 'Tous les ouvriers sont occupés : il sera construit dès qu’un se libère (recrute-en d’autres dans l’onglet Station).';
    if (CO.render.noPower(b)) return b.net ? 'Son réseau ne produit rien : ajoute un générateur (et son combustible), ou relie le réseau au Port avec des poteaux.'
      : 'Aucun réseau électrique ne l’atteint : pose un Poteau électrique à moins de 2 cases de lui, relié au Port ou à un générateur.';
    if (b.kind === 'generator' && b.status === 'nofuel') return 'Amène du ' + itemName(b.def.fuel).toLowerCase() + ' par convoyeur, sur n’importe quel côté.';
    if (b.kind === 'generator' && b.status === 'nowater') return 'Relie la centrale à une pompe à eau par des tuyaux (un tuyau doit toucher la centrale).';
    if (b.kind === 'launch_pad' && b.phase === 'load') {
      const m = CO.getMission(CO.state.orbit.mission), need = Object.keys(m.need).filter(function (k) { return CO.orbit.missing(k) > 0; });
      return 'Amène ' + (b.def.parts - b.parts) + ' Module(s) de fusée' + (b.payload ? '' : ' et une charge utile (' + (need.length ? need.map(itemName).join(' ou ') : 'aucune n’est demandée') + ')') + ' par convoyeur, sur n’importe quel côté.';
    }
    if (b.kind === 'drone_requester' && !b.filter) return 'Choisis ci-dessous l’objet que les drones doivent apporter. Le coffre doit être à portée d’un Port de drones.';
    if (b.kind === 'drone_requester' && !(CO.drones.hubs || []).some(function (hb) { return hb.req && hb.req.indexOf(b) >= 0; })) return 'Aucun Port de drones ne l’atteint (24 cases autour du port).';
    if (b.kind === 'drone_provider' && !(CO.drones.hubs || []).some(function (hb) { return hb.prov && hb.prov.indexOf(b) >= 0; })) return 'Aucun Port de drones ne l’atteint (24 cases autour du port).';
    if (b.kind === 'pump' && b.status === 'nopipe') return 'Pose un tuyau qui touche la pompe, et mène-le jusqu’aux machines qui consomment.';
    if (b.kind === 'pump' && b.status === 'blocked') return 'Les tuyaux sont pleins : relie-les à ce qui consomme (centrale à vapeur, raffinerie) ou ajoute une cuve.';
    if (b.kind === 'machine' && b.recipe && b.status === 'idle' && RECIPES[b.recipe].fin) {
      const fin = RECIPES[b.recipe].fin;
      for (const k in fin) if (CO.fluid.amount(b, k) < fin[k]) return 'Il manque ' + itemName(k).toLowerCase() + ' : relie un tuyau qui en contient à n’importe quel côté.';
    }
    if (b.def.power && b.pw > 0 && b.pw < 1) return 'Le réseau manque de puissance : cette machine tourne à ' + Math.round(b.pw * 100) + ' % de sa vitesse. Ajoute des générateurs.';
    if ((b.kind === 'machine' || b.kind === 'drill') && b.status === 'blocked') return 'Relie la flèche jaune à un convoyeur (ou à un bâtiment qui accepte la production).';
    if (b.kind === 'machine' && b.recipe && b.status === 'idle') return 'Amène les matières par convoyeur sur n’importe quel côté, sauf la sortie.';
    if (b.kind === 'drill' && !b.ore) return 'Déplace la foreuse sur un gisement coloré.';
    if (b.kind === 'unloader' && b.status === 'idle') return 'Colle son dos ou ses côtés à un coffre, une machine ou une foreuse' + (b.filter ? ' qui contient ' + itemName(b.filter) : '') + ' ; sa flèche doit mener à un convoyeur.';
    if (b.kind === 'unloader' && b.status === 'blocked') return 'Relie sa flèche jaune à un convoyeur.';
    if (b.kind === 'lab' && !CO.state.research) return 'Choisis une recherche dans l’onglet Recherche. En attendant, ce qui servira à une recherche future est mis en réserve.';
    if (b.kind === 'driver') {
      const tg = CO.sim.driverTarget(b);
      if (b.target && !tg) return 'La catapulte visée a disparu ou est hors de portée : choisis une nouvelle cible.';
      if (tg && b.status === 'blocked') return 'La catapulte d’arrivée est pleine : relie sa flèche jaune à un convoyeur.';
      if (!tg && b.status === 'blocked') return 'Relie la flèche jaune à un convoyeur pour vider la catapulte.';
    }
    return '';
  }

  function section(title, node) { return h('div', { class: 'isec' }, h('div', { class: 'isec-t', text: title }), node); }
  function kv(label, value) { return h('div', { class: 'kv' }, h('span', { text: label }), h('b', { text: value })); }

  /** Inputs → outputs with the throughput of ONE machine, so ratios between stages are easy to plan. */
  function flowCard(rec) {
    const t = CO.craftTime(rec);
    const side = function (map) {
      const col = h('div', { class: 'flow-col' });
      for (const k in map) col.appendChild(h('div', { class: 'flow-item', 'data-item': k }, itemIcon(k, 3), h('b', { text: '×' + map[k] }), h('small', { text: fmtRate(map[k] / t) })));
      return col;
    };
    return h('div', { class: 'flow' }, side(Object.assign({}, rec.in, rec.fin || {})), h('div', { class: 'flow-arrow', text: '➜' }), side(rec.out),
      h('div', { class: 'flow-foot', text: 'Cycle : ' + fmtTime(t) + ' · cadence d’une machine' }));
  }

  function stockChips(map) {
    const row = h('div', { class: 'chips' });
    let n = 0;
    for (const k in map) if (map[k] > 0) { n++; row.appendChild(h('span', { class: 'chip2', 'data-item': k }, itemIcon(k, 2), h('b', { text: String(map[k]) }))); }
    return n ? row : h('div', { class: 'small', text: 'vide' });
  }
  function countBy(arr) { const m = {}; arr.forEach(function (k) { m[k] = (m[k] || 0) + 1; }); return m; }

  function progressBar(b, pct) {
    const bar = h('i'); live = { b: b, bar: bar, pct: pct };
    return h('div', { class: 'bar live' }, bar);
  }

  /**
   * Selection panel: one recipe (or filter) picker per type of machine (or sorter) selected, applied to
   * all the buildings of that type at once.
   */
  function batchSettings(body, selection) {
    const up = selection.filter(function (b) { return !b.dead && CO.nextLevel(b); });
    if (up.length) {
      const price = up.reduce(function (s, b) { return s + CO.upgradePrice(b); }, 0);
      body.appendChild(section('Amélioration', h('div', null,
        h('button', { class: 'btn primary', text: '⬆ Améliorer ' + up.length + ' bâtiment(s) d’un niveau · ' + CO.fmt(price) + ' ¢', onclick: function () {
          const n = CO.history.upgrade(up);
          if (n) CO.emit('toast', n + ' bâtiment(s) amélioré(s) d’un coup.', 'good');
          renderSide(true);
        } }),
        h('div', { class: 'small', text: 'Ceux qui manquent de crédits restent à leur niveau. Ctrl+Z annule tout (remboursé).' }))));
    }
    const byType = {};
    selection.forEach(function (b) { if (!b.dead) (byType[b.type] = byType[b.type] || []).push(b); });
    Object.keys(byType).forEach(function (t) {
      const list = byType[t], def = BUILDINGS[t], n = list.length;
      const same = function (key) { const v = list[0][key] || null; return list.every(function (b) { return (b[key] || null) === v; }) ? v : undefined; };
      const set = function (v) {
        const k = CO.history.configureMany(list, v);
        if (k) CO.emit('toast', def.name + ' : ' + k + ' réglé(s) d’un coup.', 'good');
        renderSide(true);
      };
      if (def.kind === 'machine') {
        const cur = same('recipe'), grid = h('div', { class: 'grid' });
        CO.recipesFor(t).forEach(function (r) {
          const ok = CO.isRecipeUnlocked(r.id), out = Object.keys(r.out)[0];
          grid.appendChild(h('button', { class: 'rec' + (cur === r.id ? ' active' : '') + (ok ? '' : ' locked'), disabled: !ok, 'data-item': out,
            onclick: function () { set(r.id); } }, itemIcon(out, 3), h('span', { text: itemName(out) }), ok ? null : h('em', { text: '🔒' })));
        });
        body.appendChild(section('Recette des ' + n + ' « ' + def.name + ' »' + (cur === undefined ? ' (mélangées)' : ''), grid));
      } else if (t === 'splitter' || t === 'sorter_inv' || t === 'unloader' || t === 'drone_requester') {
        const cur = same('filter'), grid = h('div', { class: 'grid' });
        grid.appendChild(h('button', { class: 'rec' + (cur === null ? ' active' : ''), onclick: function () { set(null); } }, h('span', { class: 'none', text: '∅' }), h('span', { text: 'Aucun' })));
        CO.ITEM_ORDER.forEach(function (id) {
          grid.appendChild(h('button', { class: 'rec' + (cur === id ? ' active' : ''), 'data-item': id, onclick: function () { set(id); } }, itemIcon(id, 3)));
        });
        body.appendChild(section('Filtre des ' + n + ' « ' + def.name + ' »' + (cur === undefined ? ' (mélangés)' : ''), grid));
      }
    });
  }

  function renderInfo(body) {
    live = null;
    const sel = CO.input.get(), b = sel.inspected;
    if (!b || b.dead) {
      if (sel.selection.length) {
        const counts = {};
        sel.selection.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
        const grid = h('div', { class: 'sel-grid' });
        for (const t in counts) grid.appendChild(h('div', { class: 'sel-item', 'data-bld': t }, thumb(t), h('b', { text: '×' + counts[t] })));
        body.appendChild(h('div', { class: 'icard' },
          h('div', { class: 'ititle', text: sel.selection.length + ' élément(s) sélectionné(s)' }), grid,
          h('div', { class: 'actions' },
            h('button', { class: 'btn', text: '⧉ Copier', onclick: function () { CO.input.copy(); } }),
            h('button', { class: 'btn', text: '★ Garder comme plan', onclick: UI.savePlan }),
            h('button', { class: 'btn danger', text: '✖ Supprimer', onclick: function () { CO.input.deleteSelected(); } }))));
        batchSettings(body, sel.selection);
      } else {
        body.appendChild(h('div', { class: 'empty' },
          h('div', { class: 'empty-ico', text: '✋' }),
          h('div', { class: 'ititle', text: 'Aucun bâtiment sélectionné' }),
          h('p', { class: 'small', text: 'Avec l’outil Inspecter, clique sur un bâtiment pour voir son état, ses cadences et régler sa recette.' }),
          h('div', { class: 'tips' },
            h('div', { class: 'tip' }, h('i', { class: 'dot good' }), h('span', { text: 'Vert : en production' })),
            h('div', { class: 'tip' }, h('i', { class: 'dot warn' }), h('span', { text: 'Orange : attend des matières' })),
            h('div', { class: 'tip' }, h('i', { class: 'dot bad' }), h('span', { text: 'Rouge : sortie bloquée' })),
            h('div', { class: 'tip' }, h('i', { class: 'dot gold' }), h('span', { text: 'Flèche jaune : sortie' }))),
          h('button', { class: 'btn', text: 'Aide et commandes', onclick: showHelp })));
      }
      return;
    }

    // ---- hero
    body.appendChild(h('div', { class: 'hero' }, h('span', { 'data-bld': b.type }, thumb(b.type, 60)),
      h('div', { class: 'hero-txt' },
        h('div', { class: 'ititle', text: b.def.name }),
        h('div', { class: 'hero-meta' },
          h('span', { class: 'tag', text: b.w + '×' + b.h }),
          b.def.fixed || b.kind === 'lab' || b.kind === 'seller' ? null : h('span', { class: 'tag', text: b.kind === 'driver' && b.target ? 'Lanceur' : 'Sortie ' + CO.DIR_ARROWS[b.dir] }),
          b.def.fixed ? null : h('span', { class: 'tag gold', text: b.def.cost + ' ¢' })))));
    const help = statusHelp(b);
    body.appendChild(h('div', { class: 'icard' }, statusPill(b), help ? h('div', { class: 'help', text: help }) : null,
      h('p', { class: 'small', text: b.def.desc })));

    if (b.site) {                                  // a site: only its progress (and, for machines, the recipe to preset)
      body.appendChild(section('Construction', progressBar(b, function () { return b.site ? b.site.p / b.site.t : 1; })));
      if (b.kind !== 'machine') return;
    }

    // ---- per kind
    if (b.kind === 'machine') {
      const grid = h('div', { class: 'grid' });
      CO.recipesFor(b.type).forEach(function (r) {
        const ok = CO.isRecipeUnlocked(r.id), out = Object.keys(r.out)[0];
        grid.appendChild(h('button', {
          class: 'rec' + (b.recipe === r.id ? ' active' : '') + (ok ? '' : ' locked'), disabled: !ok,
          'data-item': out,
          onclick: function () { CO.history.configure(b, r.id); renderSide(true); }
        }, itemIcon(out, 3), h('span', { text: itemName(out) }), ok ? null : h('em', { text: '🔒' })));
      });
      body.appendChild(section('Recette', grid));
      if (b.recipe && !b.site) {
        const rec = RECIPES[b.recipe];
        body.appendChild(section('Production', flowCard(rec)));
        body.appendChild(section('Cycle en cours', progressBar(b, function () { return b.crafting ? b.prog / CO.craftTime(rec) : 0; })));
        body.appendChild(h('div', { class: 'two' }, section('Stock entrant', stockChips(b.inBuf)), section('Prêt à sortir', stockChips(countBy(b.outBuf)))));
      }
    } else if (b.kind === 'drill') {
      const total = b.w * b.h, P = CO.planet(), eq = CO.drillRate(b) * CO.craftTime(RECIPES[P.refRecipe]);   // how many smelters (current research) it can feed
      body.appendChild(section('Extraction', h('div', { class: 'icard flat' },
        b.ore ? h('div', { class: 'ore-row' }, itemIcon(b.ore, 4), h('div', null, h('b', { text: itemName(b.ore) }), h('div', { class: 'small', text: fmtRate(CO.drillRate(b)) + ' · ' + b.n + '/' + total + ' cases' }))) : h('div', { class: 'small', text: 'Aucun gisement sous la foreuse.' }),
        kv('Couverture', Math.round(b.n / total * 100) + ' %'),
        kv('Alimente', fmtNum(eq, 2) + ' × ' + BUILDINGS[P.smelter].name),
        progressBar(b, function () { return Math.min(1, b.acc); }))));
    } else if (b.kind === 'chest') {
      const f = b.q.length / CO.chestCap(b.def);
      body.appendChild(section('Contenu', h('div', null,
        h('div', { class: 'bar' }, h('i', { style: 'width:' + (f * 100) + '%' })), stockChips(countBy(b.q)))));
    } else if (b.kind === 'lab') {
      const st = CO.state;
      if (st.research) {
        const t = TECHS[st.research];
        body.appendChild(section('Recherche : ' + t.name, costRow(t.cost, st.researchProg)));
      }
      const qb = queueBlock(), bb = bankBlock();
      if (qb) body.appendChild(section('File d’attente', qb));
      if (bb) body.appendChild(section('Réserve', bb));
    } else if (b.kind === 'driver') {
      const tg = CO.sim.driverTarget(b), def = b.def;
      const linkTxt = tg ? 'Envoie vers la catapulte en ' + tg.x + ', ' + tg.y + ' (' + Math.round(CO.sim.driverDist(b, tg)) + ' cases).'
        : b.target ? 'Cible en ' + b.tx + ', ' + b.ty + ' introuvable ou hors de portée.'
        : 'Aucune cible : cette catapulte reçoit les salves et sort les objets par sa flèche jaune.';
      body.appendChild(section('Liaison', h('div', { class: 'icard flat' },
        h('div', { class: 'small', text: linkTxt }),
        kv('Cadence max', fmtRate(def.volley / def.reload) + ' (salves de ' + def.volley + ')'),
        kv('Portée', def.range + ' cases'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', text: '⌖ Choisir la cible', onclick: function () { CO.input.startLink(b); } }),
          b.target ? h('button', { class: 'btn', text: 'Couper la liaison', onclick: function () { CO.history.configure(b, null); renderSide(true); } }) : null))));
      const f = b.q.length / def.capacity;
      body.appendChild(section('Stock (' + b.q.length + ' / ' + def.capacity + ')', h('div', null,
        h('div', { class: 'bar' }, h('i', { style: 'width:' + (f * 100) + '%' })), stockChips(countBy(b.q)))));
    } else if (b.kind === 'port') {
      const p = CO.getPhase(CO.state.phase);
      body.appendChild(section('Étape en cours', h('div', { class: 'icard flat' }, h('b', { text: p.name }), costRow(p.need, CO.state.phaseHave))));
    } else if (b.kind === 'launch_pad') {
      const m = CO.getMission(CO.state.orbit.mission);
      body.appendChild(section('Fusée', h('div', { class: 'icard flat' },
        kv('Modules', b.parts + ' / ' + b.def.parts), kv('Charge utile', b.payload ? itemName(b.payload) : '—'),
        b.phase === 'build' ? progressBar(b, function () { return b.phase === 'build' ? b.t / CO.orbit.ASSEMBLE : 1; }) : null)));
      body.appendChild(section('Mission : ' + m.name, costRow(m.need, CO.state.orbit.have)));
    } else if (b.kind === 'drone_provider' || b.kind === 'drone_requester' || b.kind === 'drone_hub') {
      if (b.kind === 'drone_hub') {
        const ds = b.drones || [];
        body.appendChild(section('Drones', h('div', { class: 'icard flat' }, kv('Drones', ds.length + ' · ' + ds.filter(function (d) { return d.state !== 'idle'; }).length + ' en vol'),
          kv('Portée', b.def.range + ' cases autour'), kv('Coffres reliés', (b.prov || []).length + ' d’envoi · ' + (b.req || []).length + ' de demande'),
          kv('Charge', CO.drones.CARRY + ' objets par vol'))));
      } else {
        body.appendChild(section('Contenu', stockChips(countBy(b.q))));
        if (b.kind === 'drone_requester') {
          const grid = h('div', { class: 'grid' });
          CO.ITEM_ORDER.forEach(function (id) {
            grid.appendChild(h('button', { class: 'rec' + (b.filter === id ? ' active' : ''), 'data-item': id, onclick: function () { CO.history.configure(b, id); renderSide(true); } }, itemIcon(id, 3)));
          });
          body.appendChild(section('Objet demandé (jusqu’à ' + b.def.want + ')', grid));
        }
      }
    } else if (b.type === 'splitter' || b.type === 'sorter_inv' || b.kind === 'unloader') {
      const grid = h('div', { class: 'grid' });
      grid.appendChild(h('button', { class: 'rec' + (!b.filter ? ' active' : ''), onclick: function () { CO.history.configure(b, null); renderSide(true); } }, h('span', { class: 'none', text: '∅' }), h('span', { text: 'Aucun' })));
      CO.ITEM_ORDER.forEach(function (id) {
        grid.appendChild(h('button', { class: 'rec' + (b.filter === id ? ' active' : ''), 'data-item': id, onclick: function () { CO.history.configure(b, id); renderSide(true); } }, itemIcon(id, 3)));
      });
      body.appendChild(section(b.type === 'splitter' ? 'Filtre (l’objet choisi sort tout droit)' : b.type === 'sorter_inv' ? 'Filtre (l’objet choisi sort sur les côtés)' : 'Filtre (n’extraire que cet objet)', grid));
    } else if (b.items && b.items.length) {
      body.appendChild(section('Sur la case', stockChips(countBy(b.items.map(function (i) { return i.t; })))));
    }

    upgradeInfo(body, b);
    powerInfo(body, b);
    fluidInfo(body, b);
    if (b.def.fixed) return;
    body.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn', text: '↻ Tourner (R)', onclick: function () { CO.history.rotate(b); renderSide(true); } }),
      h('button', { class: 'btn', text: '★ Plan', 'data-tip': 'Garder comme plan|Ajoute ce bâtiment (avec sa recette) à tes plans', onclick: UI.savePlan }),
      h('button', { class: 'btn danger', text: '✖ Supprimer', onclick: function () { CO.input.deleteSelected(); } })));
  }

  // ------------------------------------------------------------------- plans
  /** Dialog asking for a plan name; `done(name)` runs on validation (empty name → default). */
  function askName(title, initial, okLabel, done) {
    const input = h('input', { class: 'name-input', type: 'text', maxlength: 40, value: initial });
    const finish = function () { const v = input.value.trim() || initial; UI.closeModal(); done(v); };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      else if (e.key === 'Escape') { e.preventDefault(); UI.closeModal(); }
      e.stopPropagation();
    });
    openModal(title, h('div', null, input), [{ label: 'Annuler' }, { label: okLabel, primary: true, run: function () { done(input.value.trim() || initial); } }]);
    setTimeout(function () { input.focus(); input.select(); }, 0);
  }
  /** Save the current selection (or inspected building) as a new plan of the library. */
  UI.savePlan = function () {
    const bp = CO.input.blueprintOfSelection();
    if (!bp) { CO.emit('toast', 'Sélectionne d’abord des bâtiments (Ctrl + clic gauche glissé).', 'warn'); return; }
    askName('Garder comme plan', CO.plans.nextName(), 'Garder', function (name) {
      const p = CO.plans.add(name, bp);
      if (p) { CO.emit('toast', 'Plan « ' + name + ' » gardé : ' + bp.items.length + ' pièce(s). Retrouve-le dans l’onglet Plans.', 'good'); lastSig = ''; }
    });
  };
  function renderPlans(body) {
    const can = !!CO.input.blueprintOfSelection();
    body.appendChild(h('p', { class: 'small', text: 'Garde une disposition pour la reposer quand tu veux, dans toutes tes parties. Sélectionne des bâtiments (Ctrl + clic gauche glissé), puis garde-les comme plan. Pendant la pose : R tourne, F retourne (miroir). Sans assez de crédits, les pièces en trop deviennent des fantômes.' }));
    body.appendChild(h('button', { class: 'btn primary wide', text: '★ Garder la sélection comme plan', disabled: !can,
      'data-tip': can ? null : 'Rien de sélectionné|Ctrl + clic gauche glissé pour sélectionner des bâtiments', onclick: UI.savePlan }));
    const list = CO.plans.list();
    if (!list.length) { body.appendChild(h('p', { class: 'note', text: 'Aucun plan pour l’instant.' })); return; }
    const wrap = h('div', { class: 'plans' });
    list.forEach(function (p) {
      const bp = p.bp, locked = CO.plans.locked(bp), cost = CO.plans.cost(bp);
      wrap.appendChild(h('div', { class: 'plan-card' },
        h('div', { class: 'plan-pic' }, CO.plans.thumb(bp, 96, 72)),
        h('div', { class: 'plan-txt' },
          h('b', { class: 'plan-name', text: p.name }),
          h('div', { class: 'small', text: bp.items.length + ' pièce(s) · ' + bp.w + '×' + bp.h + ' cases' }),
          h('div', { class: 'small gold', text: CO.fmt(cost) + ' ¢' }),
          locked.length ? h('div', { class: 'small bad', text: '🔒 Pas encore débloqué : ' + locked.join(', ') + ' (ces pièces ne seront pas posées)' }) : null,
          h('div', { class: 'actions' },
            h('button', { class: 'btn small primary', text: 'Poser', onclick: function () { CO.input.loadBlueprint(bp); } }),
            h('button', { class: 'btn small', text: 'Renommer', onclick: function () {
              askName('Renommer le plan', p.name, 'Renommer', function (name) { CO.plans.rename(p.id, name); lastSig = ''; });
            } }),
            h('button', { class: 'btn small danger', text: 'Supprimer', onclick: function () {
              openModal('Supprimer ce plan ?', h('p', { text: '« ' + p.name + ' » sera retiré de tes plans. Ce qui est déjà construit ne bouge pas.' }),
                [{ label: 'Annuler' }, { label: 'Supprimer', primary: true, run: function () { CO.plans.remove(p.id); lastSig = ''; CO.emit('toast', 'Plan supprimé.', 'info'); } }]);
            } })))));
    });
    body.appendChild(wrap);
  }

  /** Power of a building: what it uses, or the network it belongs to (poles, generators, Port). */
  function powerInfo(body, b) {
    if (b.site) return;
    const net = b.net;
    const netRows = function (n) {
      return [kv('Production', CO.fmt(Math.round(n.supply)) + ' kW'), kv('Demande', CO.fmt(Math.round(n.demand)) + ' kW'),
        kv('Alimentation', Math.round(n.sat * 100) + ' %'),
        h('div', { class: 'small', text: 'Réseau : ' + n.gens.length + ' source(s) · ' + n.cons.length + ' machine(s) · ' + (n.nodes.length - n.gens.length) + ' poteau(x)' })];
    };
    if (b.def.power) {
      const rows = [kv('Consommation', b.def.power + ' kW en marche')];
      if (net) rows.push(kv('Vitesse', Math.round((b.pw || 0) * 100) + ' %'));
      else rows.push(h('div', { class: 'small', style: 'color:#b9a8ff', text: 'Non raccordé : aucun poteau, générateur ou Port ne le touche.' }));
      body.appendChild(section('Énergie', h('div', { class: 'icard flat' }, rows.concat(net ? netRows(net) : []))));
    } else if (b.kind === 'generator' || b.kind === 'pole' || b.kind === 'port') {
      const rows = [];
      if (b.def.gen) rows.push(kv('Puissance', CO.fmt(Math.round(b.def.gen * (b.kind === 'port' ? 1 : CO.lvlSpeed(b)))) + ' kW'));
      if (b.def.fuel) rows.push(kv(itemName(b.def.fuel), b.fuel + ' / ' + CO.power.FUEL_CAP + (b.burn > 0 ? ' · en cours : ' + fmtNum(b.burn, 1) + ' s' : '')));
      if (b.kind === 'pole') rows.push(kv('Portée', 'zone ' + (b.def.cover * 2 + 1) + '×' + (b.def.cover * 2 + 1) + ' · liaisons ' + b.def.reach + ' cases'));
      body.appendChild(section('Réseau électrique', h('div', { class: 'icard flat' }, rows.concat(net ? netRows(net) : []))));
    }
  }

  /** Level of an upgradable building and the button to raise it. */
  function upgradeInfo(body, b) {
    if (!CO.canUpgradeKind(b) || b.site) return;
    const U = CO.UPGRADE, l = b.lvl || 1, max = U.speed.length;
    const box = h('div', { class: 'icard flat' },
      kv('Niveau', U.names[l - 1] + ' / ' + U.names[max - 1]),
      kv(b.kind === 'generator' ? 'Production' : 'Vitesse', '×' + fmtNum(U.speed[l - 1], 1)),
      b.def.power ? kv('Consommation', '×' + fmtNum(U.power[l - 1], 1)) : null);
    if (l < max) {
      const next = CO.nextLevel(b), price = CO.upgradePrice(b), tech = TECHS[U.tech[l]];
      if (!next) box.appendChild(h('div', { class: 'small lock', text: '🔒 Niveau ' + U.names[l] + ' : recherche ' + tech.name }));
      else box.appendChild(h('button', { class: 'btn primary', disabled: CO.state.money < price,
        text: '⬆ Niveau ' + U.names[l] + ' (×' + fmtNum(U.speed[l], 1) + ') · ' + CO.fmt(price) + ' ¢',
        onclick: function () { if (CO.history.upgrade([b])) CO.emit('toast', b.def.name + ' amélioré au niveau ' + U.names[b.lvl - 1] + '.', 'good'); renderSide(true); } }));
    }
    body.appendChild(section('Amélioration', box));
  }

  /** Pipe networks a building belongs to (pipes, tanks) or uses (pumps, steam plants, refineries). */
  function fluidInfo(body, b) {
    if (b.site) return;
    const nets = b.fnet ? [b.fnet] : b.fnets;
    if (!nets || (!b.fnet && !b.def.fluidIO)) return;
    if (!nets.length) { body.appendChild(section('Fluides', h('div', { class: 'small', text: 'Aucun tuyau ne le touche.' }))); return; }
    const box = h('div', { class: 'icard flat' });
    nets.forEach(function (n) {
      const f = n.amount / n.cap;
      box.appendChild(kv(n.amount > 0 ? itemName(n.fluid) : 'Réseau vide', CO.fmt(Math.round(n.amount)) + ' / ' + CO.fmt(n.cap)));
      box.appendChild(h('div', { class: 'bar' }, h('i', { style: 'width:' + (f * 100) + '%' + (n.amount > 0 ? ';background:' + ITEMS[n.fluid].color : '') })));
      box.appendChild(h('div', { class: 'small', text: n.parts.length + ' tuyau(x) / cuve(s) · ' + n.users.length + ' bâtiment(s) relié(s)' }));
    });
    body.appendChild(section(nets.length > 1 ? 'Fluides (' + nets.length + ' réseaux)' : 'Fluides', box));
  }

  /** Cheap signature of what the current tab displays: re-render only when it changes. */
  function signature() {
    const st = CO.state;
    switch (tab) {
      case 'station': return st.planet + ':' + st.reached + ':' + JSON.stringify(st.orbit) + st.phase + ':' + JSON.stringify(st.phaseHave) + ':' + JSON.stringify(st.tech) + ':' + CO.ghostStats().cost + ':' + contractSig();
      case 'research': return st.research + JSON.stringify(st.researchProg) + JSON.stringify(st.tech) + JSON.stringify(st.researchBank) + st.researchQueue.join() + CO.world.list.length;
      case 'stats': return Math.floor(simTime) + ':' + st.phase;
      case 'plans': return CO.plans.rev + ':' + !!CO.input.blueprintOfSelection() + ':' + JSON.stringify(st.tech);
      case 'info': {
        const b = CO.input.get().inspected;
        const sel = CO.input.get().selection.length;
        if (!b || b.dead) return 'none' + sel + ':' + CO.input.get().selection.reduce(function (s, x) { return s + (x.lvl || 1); }, 0) + ':' + Math.floor(st.money / 100);
        const labSig = b.kind === 'lab' ? JSON.stringify(st.researchProg) + JSON.stringify(st.researchBank) + st.researchQueue.join() : '';
        const drvSig = b.kind === 'driver' ? (b.target || '') + ':' + !!CO.sim.driverTarget(b) : '';
        const fns = b.fnet ? [b.fnet] : b.fnets || [];
        const flSig = fns.map(function (n) { return (n.fluid || '') + Math.round(n.amount); }).join(',');
        const lpSig = b.kind === 'launch_pad' ? b.parts + b.phase + b.payload + JSON.stringify(st.orbit) : '';
        const drSig = lpSig + (b.drones ? b.drones.map(function (d) { return d.state[0]; }).join('') : '');
        const pwSig = drSig + flSig + ':' + Math.round((b.pw || 0) * 100) + (b.net ? ':' + Math.round(b.net.supply) + '/' + Math.round(b.net.demand) + '/' + b.net.cons.length + '/' + b.net.nodes.length : '') + (b.fuel != null ? ':' + b.fuel : '');
        return pwSig + ':L' + b.lvl + (CO.nextLevel(b) ? 'u' + (CO.state.money >= CO.upgradePrice(b)) : '') + b.id + ':' + (b.site ? 'S' + !!b.site.w + b.site.paid : '') + ':' + b.dir + ':' + b.recipe + ':' + b.filter + ':' + b.status + ':' + (b.items ? b.items.length : b.q ? b.q.length : '') + ':' + JSON.stringify(b.inBuf || 0) + ':' + (b.outBuf ? b.outBuf.length : b.out ? b.out.length : '') + ':' + (st.research || '') + ':' + CO.mods.machine + ':' + CO.mods.drill + ':' + CO.mods.chest + labSig + drvSig;
      }
    }
    return '';
  }
  function renderSide(force) {
    const body = $('tabbody');
    if (!force && (pressing || signature() === lastSig)) return;
    lastSig = signature();
    const sc = body.scrollTop;
    body.innerHTML = ''; stationCv = null; live = null;
    ({ station: renderStation, research: renderResearch, stats: renderStats, plans: renderPlans, info: renderInfo })[tab](body);
    body.scrollTop = sc;
  }

  // ----------------------------------------------------------- phase dialogs
  CO.on('phase', function (index, p) {
    const st = CO.state, P = CO.planet(), total = CO.PHASES.length, last = index === total - 1, k = st.planet;
    const cv = h('canvas', { class: 'station-cv big', width: 192, height: 128 });
    CO.drawStation(cv, index + 1, 0, 0);
    const next = CO.getPhase(index + 1), Q = CO.PLANETS[k + 1];
    const ext = isFinite(P.maxExt) ? ' (' + P.maxExt + ' en tout)' : '';
    let title, lines, buttons = [{ label: 'Continuer', primary: true }];
    if (next.done) {                                  // the last extension: the goal is complete
      title = P.done + ' !';
      lines = [k === 0 ? 'La station est complète : tous ses modules brillent en orbite. Elle est prête pour le grand voyage.' : 'Le portail est complet.'];
      if (Q) {
        lines.push('Un nouveau monde t’attend : ' + Q.name + '. ' + Q.desc + ' Flèche ▶ au-dessus de l’image ' + P.goalOf + ' (onglet Station) pour y aller, et ◀ pour revenir.');
        buttons = [{ label: 'Plus tard' }, { label: 'Voyager vers ' + Q.name + ' ▶', primary: true, run: function () { UI.travel(k + 1); } }];
      }
    } else if (last) {
      title = k === 0 ? 'La station est en orbite !' : 'Le portail est ouvert !';
      lines = [k === 0 ? 'La station est lancée et en orbite. Ce que tu as bâti de tes mains brille là-haut. Merci d’avoir pris ton temps !' : 'Le portail stellaire s’allume : un passage vers les étoiles. Merci d’avoir pris ton temps !',
        'Tu peux continuer : de nouvelles extensions seront demandées, de plus en plus grandes' + ext + '. Prochaine étape : ' + next.name + '.'];
    } else {
      title = 'Étape terminée : ' + p.name;
      lines = [p.name + (k === 0 ? ' est installée sur la station.' : ' : c’est fait.'), 'Prochaine étape : ' + next.name + (next.extension ? ext : '') + '.'];
    }
    const body = h('div', null, cv, h('p', { text: lines[0] }), h('p', { class: 'small', text: 'Récompense : +' + CO.fmt(p.reward) + ' ¢' }),
      lines.slice(1).map(function (t) { return h('p', { class: 'small', text: t }); }));
    openModal(title, body, buttons);
    UI.modalAnim = { cv: cv, phase: index + 1, planet: k };
    CO.save.save();
  });
  CO.on('unlock', function () { buildPalette(); });
  CO.on('loaded', function () {
    buildPalette(); lastSig = ''; renderSide(true);
    if (CO.save.powerNotice) {
      CO.save.powerNotice = false;
      setTimeout(function () { UI.whenFree(function () {
        openModal('Nouveau : l’électricité', h('div', null,
          h('p', { text: 'Les foreuses, machines et laboratoires ont maintenant besoin de courant pour fonctionner.' }),
          h('p', { text: 'Le Port fournit 150 kW autour de lui. Plus loin, pose des Poteaux électriques (4 ¢, catégorie Énergie de la palette) : chacun alimente les bâtiments qui touchent sa zone et se relie tout seul aux poteaux voisins.' }),
          h('p', { text: 'Pour produire plus, construis des Générateurs thermiques et nourris-les de charbon par convoyeur. Le compteur ⚡ en haut indique la production et la demande.' })),
          [{ label: 'Compris', primary: true }]);
      }); }, 300);
    }
  });
  CO.on('research', function () { lastSig = ''; });
  CO.on('land', function () { lastSig = ''; });
  CO.on('workers', function () { lastSig = ''; });
  CO.on('contracts', function () { lastSig = ''; });
  CO.on('orbit', function () { lastSig = ''; });
  CO.on('mission', function (m) {
    const last = m.id === 'mars';
    openModal(last ? 'Cap sur Mars !' : 'Mission accomplie', h('div', null,
      h('p', { text: last ? 'L’expédition est partie : ta station est devenue un port interplanétaire. Bravo, Macalamar ! Les missions profondes continuent pour qui veut aller plus loin.' : m.name + ' : réussi.' }),
      h('p', { class: 'small', text: 'Récompense : ' + m.text + '.' })), [{ label: 'Continuer', primary: true }]);
    CO.save.save();
  });
  CO.on('inspect', function () { if (CO.input.get().inspected) { if (tab !== 'info') setTab('info'); else renderSide(true); } else if (tab === 'info') renderSide(true); });
  CO.on('selection', function () {
    if (CO.input.get().selection.length && tab !== 'info') setTab('info');   // show the batch settings
    else if (tab === 'info') renderSide(true);
  });

  // ----------------------------------------------------------------- per frame
  UI.update = function (dt) {
    simTime = CO.state.time;
    if (itemTipSrc && (!itemTipSrc.isConnected || !itemTipSrc.getClientRects().length)) { itemTip.hidden = true; itemTipKey = null; itemTipSrc = null; }   // hovered element was re-rendered or its dialog closed
    updateTopbar(); updatePalette(); updateToolbar(); updateHint(); updateStatus(); updateOreTip();
    renderSide(false);
    if (live && tab === 'info' && !live.b.dead) live.bar.style.width = (CO.clamp(live.pct(), 0, 1) * 100) + '%';
    if (stationCv && tab === 'station') CO.drawStation(stationCv, CO.state.phase, UI.phaseProgress(), performance.now() / 1000);
    if (UI.modalAnim && !modalEl.hidden) CO.drawStation(UI.modalAnim.cv, UI.modalAnim.phase, 0, performance.now() / 1000, UI.modalAnim.planet);
  };

  // ------------------------------------------------- ore tooltip next to the mouse
  let tipEl = null, tipOre = -1;
  function updateOreTip() {
    const hv = CO.input.hoverInfo();
    if (hv && hv.mouse && !hv.b && !UI.modalOpen() && CO.world.inBounds(hv.x, hv.y) && !CO.ownsCell(hv.x, hv.y)) { landTip(hv); return; }
    const show = hv && hv.mouse && hv.ore && !hv.b && !UI.modalOpen();
    if (!show) { tipEl.hidden = true; tipOre = -1; return; }
    if (tipOre !== hv.ore) {                               // rebuild only when the hovered ore changes
      tipOre = hv.ore;
      const id = CO.ORE_IDS[hv.ore];
      tipEl.innerHTML = '';
      tipEl.appendChild(itemIcon(id, 3));
      const P = CO.planet(), pump = CO.BUILD_ORDER.filter(function (t) { return BUILDINGS[t].fluid === id; })[0];
      tipEl.appendChild(CO.isFluidOre(hv.ore)
        ? h('span', null, h('b', { text: oreLabel(hv.ore) }), h('small', { text: pump
          ? BUILDINGS[pump].name + ' : ' + fmtNum(BUILDINGS[pump].rate, 0) + ' ' + itemName(id).toLowerCase() + '/s (pleine couverture), à relier par des tuyaux · recherche ' + TECHS[BUILDINGS[pump].tech].name
          : 'Liquide : à pomper' }))
        : h('span', null, h('b', { text: itemName(id) }), h('small', { text: 'Gisement · ' + BUILDINGS[P.drill].name + ' : ' + fmtRate(BUILDINGS[P.drill].rate * CO.mods.drill) + ', ' + BUILDINGS[P.drillHeavy].name + ' : ' + fmtRate(BUILDINGS[P.drillHeavy].rate * CO.mods.drill) + ' (pleine couverture)' })));
    }
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    tipEl.style.left = Math.min(hv.sx + 16, window.innerWidth - w - 8) + 'px';
    tipEl.style.top = Math.min(hv.sy + 18, window.innerHeight - hh - 8) + 'px';
  }

  /** Tooltip over land not bought yet: price, reachability and the ore it holds. */
  function landTip(hv) {
    const p = CO.plotOf(hv.x, hv.y), ok = CO.plotBuyable(p), price = CO.landPrice(), rich = CO.state.money >= price;
    const key = 'L' + p + ':' + ok + ':' + price + ':' + rich;
    if (tipOre !== key) {
      tipOre = key;
      tipEl.innerHTML = '';
      const ore = CO.plotOre(p), ids = Object.keys(ore).sort(function (a, b) { return ore[b] - ore[a]; });
      tipEl.appendChild(h('span', null,
        h('b', { text: ok ? 'Terrain à vendre · ' + CO.fmt(price) + ' ¢' : 'Terrain hors d’atteinte' }),
        h('small', { text: (ids.length ? 'Gisements : ' + ids.map(function (id) { return itemName(id) + ' (' + ore[id] + ')'; }).join(', ') : 'Aucun gisement') }),
        h('small', { text: !ok ? 'Achète d’abord une parcelle qui touche ton terrain.' : rich ? 'Clic : acheter cette parcelle.' : 'Il te manque ' + CO.fmt(Math.ceil(price - CO.state.money)) + ' ¢.' })));
    }
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    tipEl.style.left = Math.min(hv.sx + 16, window.innerWidth - w - 8) + 'px';
    tipEl.style.top = Math.min(hv.sy + 18, window.innerHeight - hh - 8) + 'px';
  }

  // --------------------------------------------- custom tooltips (no native `title` anywhere)
  // Any element can carry one of:
  //   data-item="id"     an item: name, price, where it comes from and at what rate
  //   data-bld="type"    a building: cost, size, every throughput / cadence, description
  //   data-tip="Title|line|line"   a plain tooltip (first part in bold)
  let itemTip = null, itemTipKey = null, itemTipSrc = null;
  const TIP_SEL = '[data-item], [data-bld], [data-tip]';

  function approx(x, unit) {                                          // "4,85 objets/s", prefixed by ≈ when rounded
    const exact = Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
    return (exact ? '' : '≈ ') + fmtNum(x, 2) + ' ' + unit;
  }
  function tipBody(head, title, lines) {
    const span = h('span', null, h('b', { text: title }));
    lines.forEach(function (l) { if (l) span.appendChild(typeof l === 'string' ? h('small', { text: l }) : l); });
    return [head, span];
  }
  function itemTipContent(id) {
    const rec = RECIPES[id], it = ITEMS[id], lines = [it.price + ' ¢ l’unité'];
    if (rec) {
      const t = CO.craftTime(rec);
      lines.push('Fabriqué : ' + BUILDINGS[rec.machine].name + ' · ' + fmtRate(rec.out[id] / t) + ' par machine (cycle ' + fmtTime(t) + ')');
      if (!CO.isRecipeUnlocked(id)) lines.push(h('small', { class: 'tip-lock', text: '🔒 Recherche requise : ' + TECHS[rec.tech].name }));
    } else {
      const P = CO.planet(it.planet || 0), r = BUILDINGS[P.drill].rate * CO.mods.drill;
      lines.push('Matière première · ' + BUILDINGS[P.drill].name + ' : ' + fmtRate(r) + ' (' + BUILDINGS[P.drillHeavy].name + ' : ' + fmtRate(BUILDINGS[P.drillHeavy].rate * CO.mods.drill) + ')');
    }
    return tipBody(itemIcon(id, 3), it.name, lines);
  }
  /** Every throughput a building type offers, with the current research bonuses. */
  function rateLines(type) {
    const def = BUILDINGS[type], K = CO.sim.K, out = [];
    switch (def.kind) {
      case 'belt':
        out.push('Débit : ' + approx(def.speed / K.gap, 'objets/s') + ' · vitesse ' + fmtNum(def.speed, 2) + ' cases/s'); break;
      case 'tunnel_in': case 'tunnel_out':
        out.push('Débit : ' + approx(K.tunnelSpeed / K.gap, 'objets/s') + ' · jusqu’à ' + K.tunnelRange + ' cases sous terre'); break;
      case 'router': {
        const how = { splitter: ' répartis sur 3 sorties', merger: ' fusionnés vers la sortie', overflow: ' : devant, le surplus sur les côtés',
          underflow: ' : sur les côtés, devant quand ils sont pleins', sorter_inv: ' : l’objet filtré sur les côtés, le reste tout droit' };
        out.push('Débit : ' + approx(1 / K.routerDelay, 'objets/s') + (how[type] || '')); break;
      }
      case 'junction': out.push('Débit : ' + approx(1 / K.routerDelay, 'objets/s') + ' dans chaque sens, sans mélange'); break;
      case 'unloader': out.push('Extraction : ' + approx(1 / K.unloadDelay, 'objets/s') + ' depuis un coffre, une machine ou une foreuse voisins'); break;
      case 'chest':
        out.push('Capacité : ' + CO.chestCap(def) + ' objets · sortie ' + approx(1 / K.chestDelay, 'objets/s')); break;
      case 'driver':
        out.push('Débit : ' + fmtRate(def.volley / def.reload) + ' (salves de ' + def.volley + ' toutes les ' + fmtTime(def.reload) + ')');
        out.push('Portée : ' + def.range + ' cases · réserve ' + def.capacity + ' objets'); break;
      case 'drill': {
        const r = def.rate * CO.mods.drill;
        out.push('Extraction : ' + fmtRate(r) + ' à pleine couverture (' + fmtRate(r / (def.w * def.h)) + ' par case)');
        const P = CO.planet(def.planet || 0);
        out.push('Alimente ' + fmtNum(r * CO.craftTime(RECIPES[P.refRecipe]), 2) + ' × ' + BUILDINGS[P.smelter].name + ' à pleine couverture');
        break;
      }
      case 'machine':
        CO.recipesFor(type).forEach(function (rec) {
          const t = CO.craftTime(rec), ok = CO.isRecipeUnlocked(rec.id);
          const ins = Object.keys(rec.in).map(function (k) { return rec.in[k] + ' ' + itemName(k); }).join(' + ');
          out.push(h('small', { class: 'tip-rec' + (ok ? '' : ' locked') }, itemIcon(rec.id, 2),
            h('span', { text: (ok ? '' : '🔒 ') + itemName(rec.id) + ' : ' + fmtRate(rec.out[rec.id] / t) + ' · cycle ' + fmtTime(t) + ' · ' + ins })));
        });
        break;
      case 'lab': out.push('Consomme sans limite les objets de la recherche active (le surplus utile part en réserve)'); break;
      case 'seller': out.push('Achète tout ce qui arrive, sans limite de débit'); break;
      case 'port': out.push('Accepte tout, sans limite de débit (le surplus est revendu)'); break;
    }
    return out;
  }
  function buildingTipContent(type) {
    const def = BUILDINGS[type], lines = [def.cost + ' ¢ · ' + def.w + '×' + def.h];
    rateLines(type).forEach(function (l) { lines.push(l); });
    lines.push(h('small', { class: 'tip-desc', text: def.desc }));
    if (!CO.isBuildingUnlocked(type)) lines.push(h('small', { class: 'tip-lock', text: '🔒 Recherche requise : ' + TECHS[def.tech].name }));
    return tipBody(thumb(type, 36), def.name, lines);
  }
  function textTipContent(txt) {
    const parts = txt.split('|');
    return tipBody(null, parts[0], parts.slice(1));
  }

  function initItemTip() {
    itemTip = h('div', { id: 'itemtip', hidden: true }); $('app').appendChild(itemTip);
    function place(e) {
      const w = itemTip.offsetWidth, hh = itemTip.offsetHeight;
      itemTip.style.left = Math.max(4, Math.min(e.clientX + 16, window.innerWidth - w - 8)) + 'px';
      itemTip.style.top = Math.max(4, Math.min(e.clientY + 18, window.innerHeight - hh - 8)) + 'px';
    }
    function hide() { itemTip.hidden = true; itemTipKey = null; itemTipSrc = null; }
    document.addEventListener('mouseover', function (e) {
      const el = e.target.closest ? e.target.closest(TIP_SEL) : null;
      if (!el) { hide(); return; }
      const id = el.getAttribute('data-item'), bt = el.getAttribute('data-bld'), tx = el.getAttribute('data-tip');
      let key = null, build = null;
      if (id && ITEMS[id]) { key = 'i' + id; build = function () { return itemTipContent(id); }; }
      else if (bt && BUILDINGS[bt]) { key = 'b' + bt; build = function () { return buildingTipContent(bt); }; }
      else if (tx) { key = 't' + tx; build = function () { return textTipContent(tx); }; }
      if (!key) { hide(); return; }
      itemTipSrc = el;
      if (key !== itemTipKey) {
        itemTipKey = key; itemTip.innerHTML = '';
        build().forEach(function (n) { if (n) itemTip.appendChild(n); });
      }
      itemTip.hidden = false; place(e);
    });
    document.addEventListener('mousemove', function (e) { if (!itemTip.hidden) place(e); });
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) hide(); });
  }

  UI.showHelp = function () { showHelp(); };

  UI.init = function () {
    modalEl = $('modal');
    tipEl = h('div', { id: 'oretip', hidden: true }); $('app').appendChild(tipEl);
    initItemTip();
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) UI.closeModal(); });
    buildMenu(); buildPalette(); buildToolbar(); buildTabs();
    if (window.innerWidth < 1100) document.body.classList.add('side-collapsed');   // tablets: panel opens on demand
    $('btn-panel').addEventListener('click', function () { document.body.classList.toggle('side-collapsed'); });
    $('btn-map').addEventListener('click', function () { CO.minimap.toggle(); });
    const side = $('side');
    side.addEventListener('pointerdown', function () { pressing = true; });
    window.addEventListener('pointerup', function () { setTimeout(function () { pressing = false; }, 60); });
    window.addEventListener('pointercancel', function () { pressing = false; });
    renderSide(true);
  };
})(window.CO = window.CO || {});
