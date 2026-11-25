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
  UI.closeModal = function () { modalEl.hidden = true; modalEl.innerHTML = ''; };
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
      row('Catapulte magnétique', 'Inspecte la catapulte de départ, « Choisir la cible », puis clique sur celle d’arrivée (48 cases max)'),
      row('Recherche', '« + File d’attente » enchaîne les recherches ; les laboratoires mettent en réserve ce qui servira plus tard'),
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
        line.appendChild(h('span', { class: 'garrow', 'data-bld': rec.machine }, thumb(rec.machine, 30), h('small', { text: mach.name })));
        Object.keys(rec.out).forEach(function (k, i) { if (i) line.appendChild(plus()); line.appendChild(chip(k, rec.out[k])); });
        right.appendChild(line);
        const t = CO.craftTime(rec), per = rec.out[id] / t;
        right.appendChild(h('div', { class: 'small', text: 'Cycle ' + fmtTime(t) + ' · ' + fmtRate(per) + ' par machine' }));
        if (!recOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Recherche requise : ' + TECHS[rec.tech].name }));
        else if (!machOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Machine à débloquer : ' + TECHS[mach.tech].name }));
      } else {
        right.appendChild(h('div', { class: 'gline' }, h('span', { class: 'garrow', 'data-bld': 'drill' }, thumb('drill', 30), h('small', { text: 'Foreuse' })), h('span', { class: 'gop', text: '➜' }), chip(id, 1)));
        right.appendChild(h('div', { class: 'small', text: 'Se récolte sur un gisement de ce minerai : ' + fmtRate(BUILDINGS.drill.rate * CO.mods.drill / 4) + ' par case couverte (' + fmtRate(BUILDINGS.drill.rate * CO.mods.drill) + ' pour une foreuse 2×2 entière).' }));
      }
      if (used[id]) {
        const u = h('div', { class: 'guse' }, h('span', { class: 'small', text: 'Sert à :' }));
        used[id].forEach(function (r) { u.appendChild(h('span', { class: 'gchip mini', 'data-item': r }, itemIcon(r, 2), h('small', { text: itemName(r) }))); });
        right.appendChild(u);
      }
      return h('div', { class: 'gcard' + (recOk && machOk ? '' : ' locked') }, left, right);
    }

    const body = h('div', { class: 'guide' },
      h('p', { class: 'small', text: 'Toutes les ressources du jeu et leur cycle de transformation. Les cadences tiennent compte de tes recherches. ★ = demandé par la station. Les éléments grisés sont à débloquer.' }));
    const sec = function (title, ids) {
      body.appendChild(h('div', { class: 'tier', text: title }));
      ids.forEach(function (id) { body.appendChild(card(id)); });
    };
    sec('Matières premières (gisements)', CO.ITEM_ORDER.filter(function (id) { return !RECIPES[id]; }));
    ['smelter', 'assembler', 'steelmill', 'fabricator', 'spaceyard'].forEach(function (m) {
      sec(BUILDINGS[m].name, CO.ITEM_ORDER.filter(function (id) { return RECIPES[id] && RECIPES[id].machine === m; }));
    });
    openModal('Ressources et recettes', body, [{ label: 'Fermer', primary: true }], 'wide');
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
    $('workers-wait').textContent = wait > 0 ? wait + ' en attente' : '';
    const total = CO.PHASES.length;
    const label = st.phase < total ? 'Station · étape ' + (st.phase + 1) + '/' + total + ' · ' + p.name : 'Station en orbite · ' + p.name;
    $('phase-label').textContent = label + ' · ' + Math.floor(pr * 100) + ' %';
    $('phase-bar').style.width = (pr * 100) + '%';
  }

  // -------------------------------------------------------- hint + status line
  function currentHint() {
    const st = CO.state;
    // The tutorial ends with the first delivery to the Port (or on any save already past step 1):
    // deleting every drill later on must not bring the beginner hints back.
    if (st.phase > 0 || st.stats.delivered > 0) return '';
    let drills = 0, belts = 0, smelters = 0, labs = 0;
    for (let i = 0; i < CO.world.list.length; i++) {
      const k = CO.world.list[i].kind;
      if (k === 'drill') drills++; else if (k === 'belt') belts++; else if (k === 'lab') labs++;
      else if (CO.world.list[i].type === 'smelter') smelters++;
    }
    if (!drills) return '① Pose une Foreuse (palette à gauche) sur un gisement coloré de la carte.';
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
  function updateStatus() {
    const st = CO.input.get(), hv = CO.input.hoverInfo();
    let txt = '';
    if (st.tool === 'build') {
      const def = BUILDINGS[st.buildType];
      txt = def.name + ' · ' + CO.DIR_ARROWS[st.rot] + ' · coût ' + CO.input.getCost() + ' ¢ · R pour tourner · glisser pour en poser plusieurs' + (def.kind === 'belt' ? ' (Ctrl : en L, Alt : à main levée)' : '');
    } else if (st.tool === 'paste') txt = 'Coller : clique pour poser la disposition · R pour tourner · Échap pour annuler · coût ' + CO.input.getCost() + ' ¢';
    else if (st.tool === 'select') txt = 'Sélection : tire un rectangle, puis Ctrl+C (copier), Suppr (supprimer)' + (st.selection.length ? ' · ' + st.selection.length + ' sélectionné(s)' : '');
    else if (st.tool === 'delete') txt = 'Suppression : tire un rectangle sur les bâtiments à détruire (remboursement intégral)';
    else if (st.tool === 'link') txt = 'Catapulte : clique sur la catapulte qui recevra les objets (cercle = portée de ' + BUILDINGS.driver.range + ' cases) · Échap ou clic droit pour annuler';
    else if (hv) {
      txt = hv.x + ', ' + hv.y;
      if (hv.b) txt += ' · ' + hv.b.def.name; else if (hv.ore) txt += ' · Gisement : ' + itemName(CO.ORE_IDS[hv.ore]);
    }
    $('status').textContent = txt;
  }

  // -------------------------------------------------------------- side panel
  const TABS = [['station', 'Station'], ['research', 'Recherche'], ['stats', 'Production'], ['info', 'Infos']];
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

  function renderStation(body) {
    const st = CO.state, p = CO.getPhase(st.phase), total = CO.PHASES.length;
    stationCv = h('canvas', { class: 'station-cv', width: 192, height: 128 });
    body.appendChild(stationCv);
    body.appendChild(h('div', { class: 'phase-title', text: (st.phase < total ? 'Étape ' + (st.phase + 1) + ' sur ' + total + ' — ' : 'Agrandissement — ') + p.name }));
    body.appendChild(h('p', { class: 'small', text: p.desc }));
    for (const id in p.need) {
      const have = Math.min(st.phaseHave[id] || 0, p.need[id]), pct = have / p.need[id] * 100, hint = craftHint(id);
      body.appendChild(h('div', { class: 'need' + (have >= p.need[id] ? ' done' : '') },
        itemIcon(id, 3),
        h('div', { class: 'need-main' },
          h('div', { class: 'need-top' }, h('span', { text: itemName(id) }), h('b', { text: have + ' / ' + p.need[id] })),
          h('div', { class: 'bar small' }, h('i', { style: 'width:' + pct + '%' })),
          hint ? h('div', { class: 'lock', text: '🔒 ' + hint }) : null)));
    }
    body.appendChild(h('p', { class: 'small', text: 'Récompense : ' + CO.fmt(p.reward) + ' ¢. Livre les objets au Port (4×4 au centre de la carte) ; le surplus est revendu.' }));
    const owned = st.land.reduce(function (a, v) { return a + v; }, 0);
    body.appendChild(section('Terrain', h('div', null,
      h('div', { class: 'need-top' }, h('span', { text: owned + ' parcelles sur ' + st.land.length }), h('b', { text: 'Prochaine : ' + CO.fmt(CO.landPrice()) + ' ¢' })),
      h('p', { class: 'small', text: 'Clique sur une parcelle assombrie qui touche ton terrain pour l’acheter. Chaque achat coûte 25 % de plus que le précédent ; le titane se trouve loin du Port.' }))));
    const wp = CO.workerPrice();
    body.appendChild(section('Ouvriers', h('div', null,
      h('div', { class: 'need-top' }, h('span', { text: st.workers + ' ouvrier(s) sur ' + CO.WORKERS.max }), h('b', { text: wp == null ? 'Équipe au complet' : 'Recrue : ' + CO.fmt(wp) + ' ¢' })),
      h('p', { class: 'small', text: 'Chaque bâtiment posé est un chantier : un ouvrier part du Port, vole jusqu’à lui et le construit (de ' + fmtTime(CO.BUILD_TIME.belt) + ' pour un convoyeur à ' + fmtTime(CO.BUILD_TIME.spaceyard) + ' pour un Chantier spatial). Plus d’ouvriers = plus de chantiers en même temps.' }),
      wp == null ? null : h('button', { class: 'btn primary', text: 'Recruter un ouvrier · ' + CO.fmt(wp) + ' ¢', onclick: function () {
        const err = CO.hireWorker();
        if (err) CO.emit('toast', err + ' (il faut ' + CO.fmt(wp) + ' ¢).', 'warn');
        else { CO.emit('toast', 'Nouvel ouvrier recruté : ' + CO.state.workers + ' en tout.', 'good'); CO.save.save(); }
      } }))));
    const list = h('div', { class: 'phase-list' });
    for (let i = 0; i < total; i++) {
      list.appendChild(h('div', { class: 'phase-row' + (i < st.phase ? ' done' : i === st.phase ? ' cur' : '') }, h('span', { text: i < st.phase ? '✔' : String(i + 1) }), h('span', { text: CO.PHASES[i].name })));
    }
    if (st.phase >= total) list.appendChild(h('div', { class: 'phase-row done' }, h('span', { text: '∞' }), h('span', { text: (st.phase - total) + ' extension(s) terminée(s)' })));
    body.appendChild(list);
  }

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
    const qb = queueBlock(), bb = bankBlock();
    if (qb) body.appendChild(qb);
    if (bb) body.appendChild(bb);
    const ids = Object.keys(TECHS).sort(function (a, b) { return depthOf(a, memo) - depthOf(b, memo); });
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
  /** Machines grouped by recipe (drills by ore): how many work, wait or are blocked, and what they lack. */
  function machineGroups() {
    const groups = {}, order = [];
    CO.world.list.forEach(function (b) {
      let key, item;
      if (b.kind === 'drill') { if (!b.ore) return; key = 'd:' + b.ore; item = b.ore; }
      else if (b.kind === 'machine') { if (!b.recipe) { key = 'none'; item = null; } else { key = 'm:' + b.recipe; item = Object.keys(RECIPES[b.recipe].out)[0]; } }
      else return;
      let g = groups[key];
      if (!g) { g = groups[key] = { item: item, drill: b.kind === 'drill', n: 0, work: 0, idle: 0, blocked: 0, miss: {} }; order.push(key); }
      g.n++;
      if (key === 'none') return;
      if (b.status === 'work') g.work++; else if (b.status === 'blocked') g.blocked++;
      else {
        g.idle++;
        const rec = RECIPES[b.recipe];
        for (const k in rec.in) if ((b.inBuf[k] || 0) < rec.in[k]) g.miss[k] = (g.miss[k] || 0) + 1;
      }
    });
    return order.map(function (k) { return groups[k]; });
  }
  function renderStats(body) {
    const st = CO.state;
    body.appendChild(h('p', { class: 'small', text: 'Cadences mesurées sur la dernière minute. Si un objet est plus utilisé que produit (en rouge), ses machines clientes vont manquer : ajoute des producteurs.' }));
    body.appendChild(h('div', { class: 'stat-money' }, h('span', { text: 'Revenus' }), h('b', { text: '+' + CO.fmt(CO.sim.moneyPerMin()) + ' ¢/min' })));
    let any = false;
    const tbl = h('table', { class: 'stats' }, h('tr', null, h('th', { text: '' }), h('th', { text: 'Objet /min' }),
      h('th', { text: 'Produit', 'data-tip': 'Produit|Sorti des foreuses et des machines, par minute' }), h('th', { text: 'Utilisé', 'data-tip': 'Utilisé|Consommé par les machines, les laboratoires et la station, par minute' }), h('th', { text: 'Vendu', 'data-tip': 'Vendu|Comptoirs de vente et surplus revendu par le Port, par minute' })));
    CO.ITEM_ORDER.forEach(function (id) {
      const tot = st.stats.produced[id] || 0, p = CO.sim.ratePerMin(id), u = CO.sim.usePerMin(id), s = CO.sim.soldPerMin(id);
      if (!tot && !u && !s) return;
      any = true;
      const short = u > p * 1.05 + 0.5;                  // used faster than made: buffers are draining
      tbl.appendChild(h('tr', { 'data-tip': itemName(id) + '|' + CO.fmt(tot) + ' produits au total' }, h('td', null, itemIcon(id, 2)), h('td', { class: 'sname', text: itemName(id) }),
        h('td', { text: fmtRpm(p) }), h('td', { class: short ? 'neg' : u > 0 ? 'pos' : '', text: fmtRpm(u) }), h('td', { class: 'muted', text: fmtRpm(s) })));
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
        g.item ? h('span', { class: 'c bad' }, h('i', { class: 'dot bad' }), String(g.blocked)) : null);
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
  function pill(cls, text) { return h('span', { class: 'pill ' + cls }, h('i'), text); }

  function statusPill(b) {
    if (b.site) return b.site.w ? pill('info', 'En construction') : pill('warn', 'Attend un ouvrier');
    switch (b.kind) {
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
      case 'router': return pill('info', b.type === 'splitter' ? (b.filter ? 'Filtré' : 'Équitable') : 'Fusion');
      default: return pill('info', b.items.length + ' objet(s)');
    }
  }
  function statusHelp(b) {
    if (b.site) return b.site.w ? 'Un ouvrier s’en occupe : ' + fmtTime(b.site.t) + ' de travail une fois sur place.' : 'Tous les ouvriers sont occupés : il sera construit dès qu’un se libère (recrute-en d’autres dans l’onglet Station).';
    if ((b.kind === 'machine' || b.kind === 'drill') && b.status === 'blocked') return 'Relie la flèche jaune à un convoyeur (ou à un bâtiment qui accepte la production).';
    if (b.kind === 'machine' && b.recipe && b.status === 'idle') return 'Amène les matières par convoyeur sur n’importe quel côté, sauf la sortie.';
    if (b.kind === 'drill' && !b.ore) return 'Déplace la foreuse sur un gisement coloré.';
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
    return h('div', { class: 'flow' }, side(rec.in), h('div', { class: 'flow-arrow', text: '➜' }), side(rec.out),
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
            h('button', { class: 'btn danger', text: '✖ Supprimer', onclick: function () { CO.input.deleteSelected(); } }))));
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
      const total = b.w * b.h, eq = CO.drillRate(b) * CO.craftTime(RECIPES.ingot_iron);   // how many smelters (current research) it can feed
      body.appendChild(section('Extraction', h('div', { class: 'icard flat' },
        b.ore ? h('div', { class: 'ore-row' }, itemIcon(b.ore, 4), h('div', null, h('b', { text: itemName(b.ore) }), h('div', { class: 'small', text: fmtRate(CO.drillRate(b)) + ' · ' + b.n + '/' + total + ' cases' }))) : h('div', { class: 'small', text: 'Aucun gisement sous la foreuse.' }),
        kv('Couverture', Math.round(b.n / total * 100) + ' %'),
        kv('Alimente', fmtNum(eq, 2) + ' fonderie(s)'),
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
    } else if (b.type === 'splitter') {
      const grid = h('div', { class: 'grid' });
      grid.appendChild(h('button', { class: 'rec' + (!b.filter ? ' active' : ''), onclick: function () { CO.history.configure(b, null); renderSide(true); } }, h('span', { class: 'none', text: '∅' }), h('span', { text: 'Aucun' })));
      CO.ITEM_ORDER.forEach(function (id) {
        grid.appendChild(h('button', { class: 'rec' + (b.filter === id ? ' active' : ''), 'data-item': id, onclick: function () { CO.history.configure(b, id); renderSide(true); } }, itemIcon(id, 3)));
      });
      body.appendChild(section('Filtre (l’objet choisi sort tout droit)', grid));
    } else if (b.items && b.items.length) {
      body.appendChild(section('Sur la case', stockChips(countBy(b.items.map(function (i) { return i.t; })))));
    }

    if (b.def.fixed) return;
    body.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn', text: '↻ Tourner (R)', onclick: function () { CO.history.rotate(b); renderSide(true); } }),
      h('button', { class: 'btn danger', text: '✖ Supprimer', onclick: function () { CO.input.deleteSelected(); } })));
  }

  /** Cheap signature of what the current tab displays: re-render only when it changes. */
  function signature() {
    const st = CO.state;
    switch (tab) {
      case 'station': return st.phase + ':' + JSON.stringify(st.phaseHave) + ':' + JSON.stringify(st.tech);
      case 'research': return st.research + JSON.stringify(st.researchProg) + JSON.stringify(st.tech) + JSON.stringify(st.researchBank) + st.researchQueue.join() + CO.world.list.length;
      case 'stats': return Math.floor(simTime) + ':' + st.phase;
      case 'info': {
        const b = CO.input.get().inspected;
        const sel = CO.input.get().selection.length;
        if (!b || b.dead) return 'none' + sel;
        const labSig = b.kind === 'lab' ? JSON.stringify(st.researchProg) + JSON.stringify(st.researchBank) + st.researchQueue.join() : '';
        const drvSig = b.kind === 'driver' ? (b.target || '') + ':' + !!CO.sim.driverTarget(b) : '';
        return b.id + ':' + (b.site ? 'S' + !!b.site.w : '') + ':' + b.dir + ':' + b.recipe + ':' + b.filter + ':' + b.status + ':' + (b.items ? b.items.length : b.q ? b.q.length : '') + ':' + JSON.stringify(b.inBuf || 0) + ':' + (b.outBuf ? b.outBuf.length : b.out ? b.out.length : '') + ':' + (st.research || '') + ':' + CO.mods.machine + ':' + CO.mods.drill + ':' + CO.mods.chest + labSig + drvSig;
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
    ({ station: renderStation, research: renderResearch, stats: renderStats, info: renderInfo })[tab](body);
    body.scrollTop = sc;
  }

  // ----------------------------------------------------------- phase dialogs
  CO.on('phase', function (index, p) {
    const total = CO.PHASES.length, last = index === total - 1;
    const cv = h('canvas', { class: 'station-cv big', width: 192, height: 128 });
    CO.drawStation(cv, index + 1, 0, 0);
    const next = CO.getPhase(index + 1);
    const body = h('div', null, cv,
      h('p', { text: last ? 'La station est lancée et en orbite. Ce que tu as bâti de tes mains brille là-haut. Merci d’avoir pris ton temps !' : p.name + ' est installée sur la station.' }),
      h('p', { class: 'small', text: 'Récompense : +' + CO.fmt(p.reward) + ' ¢' }),
      h('p', { class: 'small', text: (last ? 'Tu peux continuer : de nouvelles extensions seront demandées, de plus en plus grandes. ' : '') + 'Prochaine étape : ' + next.name + '.' }));
    openModal(last ? 'La station est en orbite !' : 'Étape terminée : ' + p.name, body, [{ label: 'Continuer', primary: true }]);
    UI.modalAnim = { cv: cv, phase: index + 1 };
    CO.save.save();
  });
  CO.on('unlock', function () { buildPalette(); });
  CO.on('loaded', function () { buildPalette(); lastSig = ''; renderSide(true); });
  CO.on('research', function () { lastSig = ''; });
  CO.on('land', function () { lastSig = ''; });
  CO.on('workers', function () { lastSig = ''; });
  CO.on('inspect', function () { if (CO.input.get().inspected) { if (tab !== 'info') setTab('info'); else renderSide(true); } else if (tab === 'info') renderSide(true); });
  CO.on('selection', function () { if (tab === 'info') renderSide(true); });

  // ----------------------------------------------------------------- per frame
  UI.update = function (dt) {
    simTime = CO.state.time;
    if (itemTipSrc && (!itemTipSrc.isConnected || !itemTipSrc.getClientRects().length)) { itemTip.hidden = true; itemTipKey = null; itemTipSrc = null; }   // hovered element was re-rendered or its dialog closed
    updateTopbar(); updatePalette(); updateToolbar(); updateHint(); updateStatus(); updateOreTip();
    renderSide(false);
    if (live && tab === 'info' && !live.b.dead) live.bar.style.width = (CO.clamp(live.pct(), 0, 1) * 100) + '%';
    if (stationCv && tab === 'station') CO.drawStation(stationCv, CO.state.phase, UI.phaseProgress(), performance.now() / 1000);
    if (UI.modalAnim && !modalEl.hidden) CO.drawStation(UI.modalAnim.cv, UI.modalAnim.phase, 0, performance.now() / 1000);
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
      tipEl.appendChild(h('span', null, h('b', { text: itemName(id) }), h('small', { text: 'Gisement · Foreuse : ' + fmtRate(BUILDINGS.drill.rate * CO.mods.drill) + ', Foreuse lourde : ' + fmtRate(BUILDINGS.drill_heavy.rate * CO.mods.drill) + ' (pleine couverture)' })));
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
      const r = BUILDINGS.drill.rate * CO.mods.drill;
      lines.push('Matière première · Foreuse : ' + fmtRate(r) + ' (Foreuse lourde : ' + fmtRate(BUILDINGS.drill_heavy.rate * CO.mods.drill) + ')');
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
      case 'router':
        out.push('Débit : ' + approx(1 / K.routerDelay, 'objets/s') + (type === 'splitter' ? ' répartis sur 3 sorties' : ' fusionnés vers la sortie')); break;
      case 'chest':
        out.push('Capacité : ' + CO.chestCap(def) + ' objets · sortie ' + approx(1 / K.chestDelay, 'objets/s')); break;
      case 'driver':
        out.push('Débit : ' + fmtRate(def.volley / def.reload) + ' (salves de ' + def.volley + ' toutes les ' + fmtTime(def.reload) + ')');
        out.push('Portée : ' + def.range + ' cases · réserve ' + def.capacity + ' objets'); break;
      case 'drill': {
        const r = def.rate * CO.mods.drill;
        out.push('Extraction : ' + fmtRate(r) + ' à pleine couverture (' + fmtRate(r / (def.w * def.h)) + ' par case)');
        out.push('Alimente ' + fmtNum(r * CO.craftTime(RECIPES.ingot_iron), 2) + ' fonderie(s) à pleine couverture');
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
    const side = $('side');
    side.addEventListener('pointerdown', function () { pressing = true; });
    window.addEventListener('pointerup', function () { setTimeout(function () { pressing = false; }, 60); });
    window.addEventListener('pointercancel', function () { pressing = false; });
    renderSide(true);
  };
})(window.CO = window.CO || {});
