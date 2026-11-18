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
    c.title = ITEMS[id].name;
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
      row('Glisser', 'Poser plusieurs éléments d’un coup (les convoyeurs suivent ton tracé)'),
      row('Poser sur des convoyeurs', 'Un bâtiment posé sur des convoyeurs, séparateurs ou souterrains les remplace (remboursés)'),
      row('Clic droit', 'Désélectionner le bâtiment en cours de pose'),
      row('Clic droit (glisser)', 'Rectangle rouge : supprime tout ce qu’il touche — remboursement intégral'),
      row('R / Maj+R', 'Tourner / tourner à l’envers'),
      row('Suppr', 'Supprimer la sélection ou le bâtiment sous le curseur'),
      row('V · E · X', 'Outils : Inspecter, Sélection (rectangle), Supprimer'),
      row('I', 'Ressources et recettes (cycles de transformation)'),
      row('1 … 9, 0', 'Choisir un bâtiment de la palette'),
      row('Ctrl+C / X / V', 'Copier, couper, coller une disposition (R tourne le collage)'),
      row('Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'),
      row('Molette', 'Zoom'),
      row('Flèches, WASD, ZQSD', 'Déplacer la caméra (ou clic milieu, ou Espace + glisser)'),
      row('Tablette', 'Un doigt : outil actif · deux doigts : déplacer et zoomer'));
    openModal('Commandes', h('div', null,
      h('p', { text: 'Objectif : extraire, transformer, puis livrer les pièces au Port pour assembler la station. Pas de chronomètre : prends ton temps.' }), tbl,
      h('p', { class: 'small', text: 'Astuces : la flèche jaune d’une machine indique sa sortie. Les voyants : vert = en production, orange = attend des matières, rouge = sortie bloquée. Le Port revend automatiquement le surplus.' })));
  }

  // ------------------------------------------------ guide: all resources and recipes
  function showGuide() {
    const used = {}, forStation = {};
    for (const id in RECIPES) for (const k in RECIPES[id].in) (used[k] = used[k] || []).push(id);
    CO.PHASES.forEach(function (p) { for (const k in p.need) forStation[k] = true; });

    const chip = function (id, n) {
      return h('span', { class: 'gchip', title: itemName(id) }, itemIcon(id, 3), n ? h('b', { text: '×' + n }) : null, h('small', { text: itemName(id) }));
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
        line.appendChild(h('span', { class: 'garrow' }, thumb(rec.machine, 30), h('small', { text: mach.name })));
        Object.keys(rec.out).forEach(function (k, i) { if (i) line.appendChild(plus()); line.appendChild(chip(k, rec.out[k])); });
        right.appendChild(line);
        const t = CO.craftTime(rec), per = rec.out[id] / t;
        right.appendChild(h('div', { class: 'small', text: 'Cycle ' + t.toFixed(1).replace('.', ',') + ' s · ' + fmtRate(per) + ' par machine' }));
        if (!recOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Recherche requise : ' + TECHS[rec.tech].name }));
        else if (!machOk) right.appendChild(h('div', { class: 'lock', text: '🔒 Machine à débloquer : ' + TECHS[mach.tech].name }));
      } else {
        right.appendChild(h('div', { class: 'gline' }, h('span', { class: 'garrow' }, thumb('drill', 30), h('small', { text: 'Foreuse' })), h('span', { class: 'gop', text: '➜' }), chip(id, 1)));
        right.appendChild(h('div', { class: 'small', text: 'Se récolte sur un gisement de ce minerai : ' + fmtRate(BUILDINGS.drill.rate * CO.mods.drill / 4) + ' par case couverte (' + fmtRate(BUILDINGS.drill.rate * CO.mods.drill) + ' pour une foreuse 2×2 entière).' }));
      }
      if (used[id]) {
        const u = h('div', { class: 'guse' }, h('span', { class: 'small', text: 'Sert à :' }));
        used[id].forEach(function (r) { u.appendChild(h('span', { class: 'gchip mini', title: itemName(r) }, itemIcon(r, 2), h('small', { text: itemName(r) }))); });
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
        title: def.name + ' — ' + def.cost + ' ¢ — ' + def.w + '×' + def.h + '\n' + def.desc + (unlocked ? '' : '\nRecherche requise : ' + TECHS[def.tech].name),
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
      const b = h('button', { class: 'tbtn', title: title, onclick: fn }, h('span', { class: 'tico', text: label[0] }), h('span', { class: 'tlab', text: label[1] }));
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
    const total = CO.PHASES.length;
    const label = st.phase < total ? 'Station · étape ' + (st.phase + 1) + '/' + total + ' · ' + p.name : 'Station en orbite · ' + p.name;
    $('phase-label').textContent = label + ' · ' + Math.floor(pr * 100) + ' %';
    $('phase-bar').style.width = (pr * 100) + '%';
  }

  // -------------------------------------------------------- hint + status line
  function currentHint() {
    const st = CO.state;
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
      txt = def.name + ' · ' + CO.DIR_ARROWS[st.rot] + ' · coût ' + CO.input.getCost() + ' ¢ · R pour tourner · glisser pour en poser plusieurs';
    } else if (st.tool === 'paste') txt = 'Coller : clique pour poser la disposition · R pour tourner · Échap pour annuler · coût ' + CO.input.getCost() + ' ¢';
    else if (st.tool === 'select') txt = 'Sélection : tire un rectangle, puis Ctrl+C (copier), Suppr (supprimer)' + (st.selection.length ? ' · ' + st.selection.length + ' sélectionné(s)' : '');
    else if (st.tool === 'delete') txt = 'Suppression : tire un rectangle sur les bâtiments à détruire (remboursement intégral)';
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
    const list = h('div', { class: 'phase-list' });
    for (let i = 0; i < total; i++) {
      list.appendChild(h('div', { class: 'phase-row' + (i < st.phase ? ' done' : i === st.phase ? ' cur' : '') }, h('span', { text: i < st.phase ? '✔' : String(i + 1) }), h('span', { text: CO.PHASES[i].name })));
    }
    if (st.phase >= total) list.appendChild(h('div', { class: 'phase-row done' }, h('span', { text: '∞' }), h('span', { text: (st.phase - total) + ' extension(s) terminée(s)' })));
    body.appendChild(list);
  }

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
  function renderResearch(body) {
    const st = CO.state, memo = {};
    let labs = 0; CO.world.list.forEach(function (b) { if (b.kind === 'lab') labs++; });
    if (!labs) body.appendChild(h('p', { class: 'note', text: 'Construis un Laboratoire (palette, « Autres ») et amène-lui, par convoyeur, les objets demandés par la recherche active.' }));
    else if (!st.research) body.appendChild(h('p', { class: 'note', text: 'Choisis une recherche : tes laboratoires consommeront les objets demandés.' }));
    const ids = Object.keys(TECHS).sort(function (a, b) { return depthOf(a, memo) - depthOf(b, memo); });
    let lastDepth = -1;
    ids.forEach(function (id) {
      const t = TECHS[id], d = memo[id];
      if (d !== lastDepth) { lastDepth = d; body.appendChild(h('div', { class: 'tier', text: 'Niveau ' + (d + 1) })); }
      const done = !!st.tech[id], active = st.research === id, avail = CO.isTechAvailable(id);
      const card = h('div', { class: 'tech' + (done ? ' done' : active ? ' active' : !avail ? ' locked' : '') });
      card.appendChild(h('div', { class: 'tech-top' }, h('b', { text: t.name }), done ? h('span', { class: 'badge', text: '✔ Terminée' }) : null));
      card.appendChild(h('div', { class: 'small', text: t.desc }));
      const u = unlocksText(id);
      if (u) card.appendChild(h('div', { class: 'small unl', text: 'Débloque : ' + u }));
      if (!done) card.appendChild(costRow(t.cost, active ? st.researchProg : null));
      if (!done && !avail) card.appendChild(h('div', { class: 'lock', text: 'Requiert : ' + t.req.filter(function (r) { return !st.tech[r]; }).map(function (r) { return TECHS[r].name; }).join(', ') }));
      if (!done && avail) card.appendChild(h('button', { class: 'btn small' + (active ? '' : ' primary'), text: active ? 'Annuler la recherche' : 'Rechercher', onclick: function () { CO.setResearch(active ? null : id); } }));
      body.appendChild(card);
    });
  }

  function renderStats(body) {
    const st = CO.state;
    body.appendChild(h('p', { class: 'small', text: 'Cadence mesurée sur la dernière minute : repère les goulots et optimise !' }));
    body.appendChild(h('div', { class: 'stat-money' }, h('span', { text: 'Revenus' }), h('b', { text: '+' + CO.fmt(CO.sim.moneyPerMin()) + ' ¢/min' })));
    let any = false;
    const tbl = h('table', { class: 'stats' }, h('tr', null, h('th', { text: '' }), h('th', { text: 'Objet' }), h('th', { text: '/min' }), h('th', { text: 'Total' })));
    CO.ITEM_ORDER.forEach(function (id) {
      const tot = st.stats.produced[id] || 0;
      if (!tot) return;
      any = true;
      tbl.appendChild(h('tr', null, h('td', null, itemIcon(id, 2)), h('td', { text: itemName(id) }), h('td', { text: CO.sim.ratePerMin(id).toFixed(1) }), h('td', { text: CO.fmt(tot) })));
    });
    body.appendChild(any ? tbl : h('p', { class: 'note', text: 'Rien produit pour l’instant. Pose une Foreuse sur un gisement !' }));
  }

  // ------------------------------------------------------------ info panel
  let live = null;   // {b, bar, pct}: progress bar updated every frame without re-rendering the panel

  function fmtRate(x) { return (Math.round(x * 1000) / 1000).toLocaleString('fr-FR') + '/s'; }
  function pill(cls, text) { return h('span', { class: 'pill ' + cls }, h('i'), text); }

  function statusPill(b) {
    switch (b.kind) {
      case 'machine':
        if (!b.recipe) return pill('warn', 'Recette à choisir');
        return b.status === 'work' ? pill('good', 'En production') : b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('warn', 'Attend des matières');
      case 'drill':
        if (!b.ore) return pill('bad', 'Hors gisement');
        return b.status === 'blocked' ? pill('bad', 'Sortie bloquée') : pill('good', 'Extraction');
      case 'lab': return CO.state.research ? pill('good', 'Recherche en cours') : pill('warn', 'Aucune recherche');
      case 'seller': case 'port': return pill('good', 'Actif');
      case 'chest': return pill('info', b.q.length + ' / ' + CO.chestCap(b.def));
      case 'router': return pill('info', b.type === 'splitter' ? (b.filter ? 'Filtré' : 'Équitable') : 'Fusion');
      default: return pill('info', b.items.length + ' objet(s)');
    }
  }
  function statusHelp(b) {
    if ((b.kind === 'machine' || b.kind === 'drill') && b.status === 'blocked') return 'Relie la flèche jaune à un convoyeur (ou à un bâtiment qui accepte la production).';
    if (b.kind === 'machine' && b.recipe && b.status === 'idle') return 'Amène les matières par convoyeur sur n’importe quel côté, sauf la sortie.';
    if (b.kind === 'drill' && !b.ore) return 'Déplace la foreuse sur un gisement coloré.';
    if (b.kind === 'lab' && !CO.state.research) return 'Choisis une recherche dans l’onglet Recherche.';
    return '';
  }

  function section(title, node) { return h('div', { class: 'isec' }, h('div', { class: 'isec-t', text: title }), node); }
  function kv(label, value) { return h('div', { class: 'kv' }, h('span', { text: label }), h('b', { text: value })); }

  /** Inputs → outputs with the throughput of ONE machine, so ratios between stages are easy to plan. */
  function flowCard(rec) {
    const t = CO.craftTime(rec);
    const side = function (map) {
      const col = h('div', { class: 'flow-col' });
      for (const k in map) col.appendChild(h('div', { class: 'flow-item', title: itemName(k) }, itemIcon(k, 3), h('b', { text: '×' + map[k] }), h('small', { text: fmtRate(map[k] / t) })));
      return col;
    };
    return h('div', { class: 'flow' }, side(rec.in), h('div', { class: 'flow-arrow', text: '➜' }), side(rec.out),
      h('div', { class: 'flow-foot', text: 'Cycle : ' + t.toFixed(1).replace('.', ',') + ' s · cadence d’une machine' }));
  }

  function stockChips(map) {
    const row = h('div', { class: 'chips' });
    let n = 0;
    for (const k in map) if (map[k] > 0) { n++; row.appendChild(h('span', { class: 'chip2', title: itemName(k) }, itemIcon(k, 2), h('b', { text: String(map[k]) }))); }
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
        for (const t in counts) grid.appendChild(h('div', { class: 'sel-item', title: BUILDINGS[t].name }, thumb(t), h('b', { text: '×' + counts[t] })));
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
    body.appendChild(h('div', { class: 'hero' }, thumb(b.type, 60),
      h('div', { class: 'hero-txt' },
        h('div', { class: 'ititle', text: b.def.name }),
        h('div', { class: 'hero-meta' },
          h('span', { class: 'tag', text: b.w + '×' + b.h }),
          b.def.fixed ? null : h('span', { class: 'tag', text: 'Sortie ' + CO.DIR_ARROWS[b.dir] }),
          b.def.fixed ? null : h('span', { class: 'tag gold', text: b.def.cost + ' ¢' })))));
    const help = statusHelp(b);
    body.appendChild(h('div', { class: 'icard' }, statusPill(b), help ? h('div', { class: 'help', text: help }) : null,
      h('p', { class: 'small', text: b.def.desc })));

    // ---- per kind
    if (b.kind === 'machine') {
      const grid = h('div', { class: 'grid' });
      CO.recipesFor(b.type).forEach(function (r) {
        const ok = CO.isRecipeUnlocked(r.id), out = Object.keys(r.out)[0];
        grid.appendChild(h('button', {
          class: 'rec' + (b.recipe === r.id ? ' active' : '') + (ok ? '' : ' locked'), disabled: !ok,
          title: ok ? itemName(out) : 'Recherche requise : ' + TECHS[r.tech].name,
          onclick: function () { CO.history.configure(b, r.id); renderSide(true); }
        }, itemIcon(out, 3), h('span', { text: itemName(out) }), ok ? null : h('em', { text: '🔒' })));
      });
      body.appendChild(section('Recette', grid));
      if (b.recipe) {
        const rec = RECIPES[b.recipe];
        body.appendChild(section('Production', flowCard(rec)));
        body.appendChild(section('Cycle en cours', progressBar(b, function () { return b.crafting ? b.prog / CO.craftTime(rec) : 0; })));
        body.appendChild(h('div', { class: 'two' }, section('Stock entrant', stockChips(b.inBuf)), section('Prêt à sortir', stockChips(countBy(b.outBuf)))));
      }
    } else if (b.kind === 'drill') {
      const total = b.w * b.h, eq = CO.drillRate(b) / 0.5;
      body.appendChild(section('Extraction', h('div', { class: 'icard flat' },
        b.ore ? h('div', { class: 'ore-row' }, itemIcon(b.ore, 4), h('div', null, h('b', { text: itemName(b.ore) }), h('div', { class: 'small', text: fmtRate(CO.drillRate(b)) + ' · ' + b.n + '/' + total + ' cases' }))) : h('div', { class: 'small', text: 'Aucun gisement sous la foreuse.' }),
        kv('Couverture', Math.round(b.n / total * 100) + ' %'),
        kv('Alimente', (Math.round(eq * 10) / 10).toLocaleString('fr-FR') + ' fonderie(s)'),
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
    } else if (b.kind === 'port') {
      const p = CO.getPhase(CO.state.phase);
      body.appendChild(section('Étape en cours', h('div', { class: 'icard flat' }, h('b', { text: p.name }), costRow(p.need, CO.state.phaseHave))));
    } else if (b.type === 'splitter') {
      const grid = h('div', { class: 'grid' });
      grid.appendChild(h('button', { class: 'rec' + (!b.filter ? ' active' : ''), onclick: function () { CO.history.configure(b, null); renderSide(true); } }, h('span', { class: 'none', text: '∅' }), h('span', { text: 'Aucun' })));
      CO.ITEM_ORDER.forEach(function (id) {
        grid.appendChild(h('button', { class: 'rec' + (b.filter === id ? ' active' : ''), title: itemName(id), onclick: function () { CO.history.configure(b, id); renderSide(true); } }, itemIcon(id, 3)));
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
      case 'research': return st.research + JSON.stringify(st.researchProg) + JSON.stringify(st.tech) + CO.world.list.length;
      case 'stats': return Math.floor(simTime) + ':' + st.phase;
      case 'info': {
        const b = CO.input.get().inspected;
        const sel = CO.input.get().selection.length;
        if (!b || b.dead) return 'none' + sel;
        return b.id + ':' + b.dir + ':' + b.recipe + ':' + b.filter + ':' + b.status + ':' + (b.items ? b.items.length : b.q ? b.q.length : '') + ':' + JSON.stringify(b.inBuf || 0) + ':' + (b.outBuf ? b.outBuf.length : b.out ? b.out.length : '') + ':' + (st.research || '');
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
  CO.on('inspect', function () { if (CO.input.get().inspected) { if (tab !== 'info') setTab('info'); else renderSide(true); } else if (tab === 'info') renderSide(true); });
  CO.on('selection', function () { if (tab === 'info') renderSide(true); });

  // ----------------------------------------------------------------- per frame
  UI.update = function (dt) {
    simTime = CO.state.time;
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
    const show = hv && hv.mouse && hv.ore && !hv.b && !UI.modalOpen();
    if (!show) { tipEl.hidden = true; tipOre = -1; return; }
    if (tipOre !== hv.ore) {                               // rebuild only when the hovered ore changes
      tipOre = hv.ore;
      const id = CO.ORE_IDS[hv.ore];
      tipEl.innerHTML = '';
      tipEl.appendChild(itemIcon(id, 3));
      tipEl.appendChild(h('span', null, h('b', { text: itemName(id) }), h('small', { text: 'Gisement · pose une Foreuse dessus' })));
    }
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    tipEl.style.left = Math.min(hv.sx + 16, window.innerWidth - w - 8) + 'px';
    tipEl.style.top = Math.min(hv.sy + 18, window.innerHeight - hh - 8) + 'px';
  }

  UI.showHelp = function () { showHelp(); };

  UI.init = function () {
    modalEl = $('modal');
    tipEl = h('div', { id: 'oretip', hidden: true }); $('app').appendChild(tipEl);
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
