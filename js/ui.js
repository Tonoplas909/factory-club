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
  function thumb(type) {
    const spr = CO.sprites.building(type, 0, 0), s = 36 / Math.max(spr.width, spr.height);
    const c = h('canvas', { width: 36, height: 36, class: 'thumb' });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(spr, 0, 0, spr.width, spr.height, Math.round((36 - spr.width * s) / 2), Math.round((36 - spr.height * s) / 2), Math.round(spr.width * s), Math.round(spr.height * s));
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
  function openModal(title, body, buttons) {
    modalEl.innerHTML = '';
    const box = h('div', { class: 'dialog' }, h('h2', { text: title }), body);
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
      row('Clic droit', 'Désélectionner le bâtiment en cours de pose'),
      row('Clic droit (glisser)', 'Rectangle rouge : supprime tout ce qu’il touche — remboursement intégral'),
      row('R / Maj+R', 'Tourner / tourner à l’envers'),
      row('Suppr', 'Supprimer la sélection ou le bâtiment sous le curseur'),
      row('V · E · X', 'Outils : Inspecter, Sélection (rectangle), Supprimer'),
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

  function statusText(b) {
    switch (b.kind) {
      case 'machine':
        if (!b.recipe) return 'Choisis une recette ci-dessous.';
        return b.status === 'work' ? 'En production' : b.status === 'blocked' ? 'Sortie bloquée : relie la flèche jaune à un convoyeur' : 'En attente de matières';
      case 'drill':
        if (!b.ore) return 'Aucun gisement sous la foreuse.';
        return itemName(b.ore) + ' · ' + b.n + ' case(s) · ' + (b.n * b.def.perTile * CO.mods.drill).toFixed(2) + '/s' + (b.status === 'blocked' ? ' · sortie bloquée' : '');
      case 'belt': case 'tunnel_in': case 'tunnel_out': return b.items.length + ' objet(s) sur la case';
      case 'chest': return b.q.length + ' / ' + b.def.capacity + ' objets';
      case 'lab': return CO.state.research ? 'Recherche : ' + TECHS[CO.state.research].name : 'Aucune recherche active (onglet Recherche).';
      case 'seller': return 'Achète tout à prix fixe.';
      case 'port': return 'Livraisons pour la station ; surplus revendu.';
      case 'router': return b.type === 'splitter' ? (b.filter ? 'Filtre : ' + itemName(b.filter) + ' tout droit' : 'Répartition équitable') : 'Fusionne les flux';
    }
    return '';
  }

  function renderInfo(body) {
    const sel = CO.input.get(), b = sel.inspected;
    if (!b || b.dead) {
      if (sel.selection.length) {
        body.appendChild(h('p', { class: 'note', text: sel.selection.length + ' élément(s) sélectionné(s).' }));
        body.appendChild(h('button', { class: 'btn', text: 'Copier (Ctrl+C)', onclick: function () { CO.input.copy(); } }));
        body.appendChild(h('button', { class: 'btn danger', text: 'Supprimer (Suppr)', onclick: function () { CO.input.deleteSelected(); } }));
      } else {
        body.appendChild(h('p', { class: 'note', text: 'Clique sur un bâtiment avec l’outil Inspecter pour voir son état et régler sa recette.' }));
        body.appendChild(h('button', { class: 'btn', text: 'Aide et commandes', onclick: showHelp }));
      }
      return;
    }
    body.appendChild(h('div', { class: 'insp-head' }, thumb(b.type), h('div', null, h('b', { text: b.def.name }), h('div', { class: 'small', text: b.w + '×' + b.h + ' · sortie ' + CO.DIR_ARROWS[b.dir] }))));
    body.appendChild(h('p', { class: 'status-line', text: statusText(b) }));
    body.appendChild(h('p', { class: 'small', text: b.def.desc }));

    if (b.kind === 'machine') {
      body.appendChild(h('div', { class: 'sub', text: 'Recette' }));
      const grid = h('div', { class: 'grid' });
      CO.recipesFor(b.type).forEach(function (r) {
        const ok = CO.isRecipeUnlocked(r.id), out = Object.keys(r.out)[0];
        const ins = Object.keys(r.in).map(function (k) { return r.in[k] + '× ' + itemName(k); }).join(' + ');
        grid.appendChild(h('button', {
          class: 'rec' + (b.recipe === r.id ? ' active' : '') + (ok ? '' : ' locked'), disabled: !ok,
          title: itemName(out) + ' ×' + r.out[out] + ' ← ' + ins + ' (' + r.time + ' s)' + (ok ? '' : '\nRecherche requise : ' + TECHS[r.tech].name),
          onclick: function () { CO.history.configure(b, r.id); renderSide(true); }
        }, itemIcon(out, 3), h('span', { text: itemName(out) })));
      });
      body.appendChild(grid);
      if (b.recipe) {
        const r = RECIPES[b.recipe];
        body.appendChild(h('div', { class: 'small', text: Object.keys(r.in).map(function (k) { return r.in[k] + '× ' + itemName(k); }).join(' + ') + ' → ' + Object.keys(r.out).map(function (k) { return r.out[k] + '× ' + itemName(k); }).join(' + ') + ' · ' + (r.time / CO.mods.machine).toFixed(1) + ' s' }));
        const bufs = Object.keys(b.inBuf).filter(function (k) { return b.inBuf[k] > 0; }).map(function (k) { return b.inBuf[k] + '× ' + itemName(k); });
        body.appendChild(h('div', { class: 'small', text: 'Stock entrant : ' + (bufs.join(', ') || 'vide') + ' · sortie en attente : ' + b.outBuf.length }));
      }
    }
    if (b.type === 'splitter') {
      body.appendChild(h('div', { class: 'sub', text: 'Filtre (l’objet choisi sort tout droit, les autres sur les côtés)' }));
      const grid = h('div', { class: 'grid' });
      grid.appendChild(h('button', { class: 'rec' + (!b.filter ? ' active' : ''), text: 'Aucun', onclick: function () { CO.history.configure(b, null); renderSide(true); } }));
      CO.ITEM_ORDER.forEach(function (id) {
        grid.appendChild(h('button', { class: 'rec' + (b.filter === id ? ' active' : ''), title: itemName(id), onclick: function () { CO.history.configure(b, id); renderSide(true); } }, itemIcon(id, 3)));
      });
      body.appendChild(grid);
    }
    if (b.def.fixed) return;
    body.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn', text: 'Tourner (R)', onclick: function () { CO.history.rotate(b); renderSide(true); } }),
      h('button', { class: 'btn danger', text: 'Supprimer', onclick: function () { CO.input.deleteSelected(); } })));
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
        return b.id + ':' + b.dir + ':' + b.recipe + ':' + b.filter + ':' + b.status + ':' + (b.items ? b.items.length : b.q ? b.q.length : '') + ':' + Object.keys(b.inBuf || {}).length + ':' + (st.research || '');
      }
    }
    return '';
  }
  function renderSide(force) {
    const body = $('tabbody');
    if (!force && (pressing || signature() === lastSig)) return;
    lastSig = signature();
    const sc = body.scrollTop;
    body.innerHTML = ''; stationCv = null;
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
    updateTopbar(); updatePalette(); updateToolbar(); updateHint(); updateStatus();
    renderSide(false);
    if (stationCv && tab === 'station') CO.drawStation(stationCv, CO.state.phase, UI.phaseProgress(), performance.now() / 1000);
    if (UI.modalAnim && !modalEl.hidden) CO.drawStation(UI.modalAnim.cv, UI.modalAnim.phase, 0, performance.now() / 1000);
  };

  UI.showHelp = function () { showHelp(); };

  UI.init = function () {
    modalEl = $('modal');
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
