/*
 * contracts.js — orders from the Port. Once the tutorial is over, the Port offers a few contracts:
 * "deliver N of this item within M minutes". The player accepts some of them (MAX_ACTIVE at a time);
 * items arriving at the Port fill the accepted contracts first, then the station, then are sold.
 * A fulfilled contract pays well above the selling price; a contract that runs out of time is simply
 * lost (no penalty: the items already delivered were absorbed).
 *
 * Offers are sized on what the factory makes: an item produced so far, a quantity worth a fraction of
 * the current output over the deadline. They are renewed every REFRESH seconds.
 * Times are in simulated seconds (CO.state.time), saved with the game in CO.state.contracts.
 */
(function (CO) {
  'use strict';
  const C = CO.contracts = { OFFERS: 3, MAX_ACTIVE: 2, REFRESH: 180 };

  C.fresh = function () { return { offers: [], active: [], next: 0, done: 0, failed: 0, seq: 1, earned: 0 }; };
  function S() { return CO.state.contracts || (CO.state.contracts = C.fresh()); }
  /** Contracts start after the tutorial (first delivery to the Port). */
  C.open = function () { const st = CO.state; return st.phase > 0 || st.stats.delivered > 0; };

  function sig2(x) { if (x < 10) return Math.max(1, Math.round(x)); const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; }

  /** Items the factory can make: produced at least once, recipe unlocked, sold for something. */
  function candidates() {
    const st = CO.state, out = [];
    CO.ITEM_ORDER.forEach(function (id) {
      if (!(st.stats.produced[id] > 0) || !(CO.ITEMS[id].price > 0)) return;
      if (CO.RECIPES[id] && !CO.isRecipeUnlocked(id)) return;
      out.push({ id: id, rate: CO.sim.ratePerMin(id) });
    });
    return out;
  }

  function makeOffer(taken) {
    const all = candidates().filter(function (c) { return taken.indexOf(c.id) < 0; });
    if (!all.length) return null;
    // valuable items come up more often, but anything made can be ordered
    let sum = 0;
    const w = all.map(function (c) { const v = Math.sqrt(CO.ITEMS[c.id].price) * (c.rate > 0 ? 1.5 : 1); sum += v; return v; });
    let r = Math.random() * sum, k = 0;
    while (k < all.length - 1 && r > w[k]) { r -= w[k]; k++; }
    const it = all[k], minutes = 4 + Math.floor(Math.random() * 7);
    const perMin = Math.max(it.rate, 60 / Math.max(4, CO.ITEMS[it.id].price));   // something sensible even when idle
    const qty = Math.max(10, sig2(perMin * minutes * (0.35 + Math.random() * 0.4)));
    const reward = sig2(CO.ITEMS[it.id].price * qty * (1.6 + Math.random() * 0.8));
    return { id: S().seq++, item: it.id, qty: qty, have: 0, time: minutes * 60, reward: reward };
  }

  function refill(force) {
    const s = S(), st = CO.state;
    if (force) s.offers = [];
    const taken = s.offers.map(function (o) { return o.item; }).concat(s.active.map(function (a) { return a.item; }));
    while (s.offers.length < C.OFFERS) {
      const o = makeOffer(taken);
      if (!o) break;
      s.offers.push(o); taken.push(o.item);
    }
    s.next = st.time + C.REFRESH;
  }

  /** Accept offer `id`: its clock starts now. */
  C.accept = function (id) {
    const s = S(), i = s.offers.findIndex(function (o) { return o.id === id; });
    if (i < 0 || s.active.length >= C.MAX_ACTIVE) return false;
    const o = s.offers.splice(i, 1)[0];
    o.deadline = CO.state.time + o.time;
    s.active.push(o);
    CO.emit('contracts');
    return true;
  };
  C.decline = function (id) {
    const s = S();
    s.offers = s.offers.filter(function (o) { return o.id !== id; });
    CO.emit('contracts');
  };
  C.abandon = function (id) {
    const s = S();
    s.active = s.active.filter(function (o) { return o.id !== id; });
    CO.emit('contracts');
  };

  /** An item reaching the Port: does an accepted contract take it? */
  C.deliver = function (item) {
    const s = CO.state.contracts;
    if (!s || !s.active.length) return false;
    let best = null;
    for (let i = 0; i < s.active.length; i++) {
      const a = s.active[i];
      if (a.item === item && a.have < a.qty && (!best || a.deadline < best.deadline)) best = a;
    }
    if (!best) return false;
    best.have++;
    if (best.have >= best.qty) {
      s.active.splice(s.active.indexOf(best), 1);
      s.done++; s.earned += best.reward;
      CO.state.money += best.reward;
      CO.emit('toast', 'Contrat rempli : ' + best.qty + ' × ' + CO.ITEMS[item].name + ' · +' + CO.fmt(best.reward) + ' ¢', 'good');
      CO.emit('contracts');
    }
    return true;
  };

  /** Once per simulated second: deadlines and renewal of the offers. */
  C.update = function () {
    if (!C.open()) return;
    const s = S(), st = CO.state;
    for (let i = s.active.length - 1; i >= 0; i--) {
      const a = s.active[i];
      if (st.time > a.deadline) {
        s.active.splice(i, 1); s.failed++;
        CO.emit('toast', 'Contrat expiré : ' + a.have + ' / ' + a.qty + ' × ' + CO.ITEMS[a.item].name + '.', 'warn');
        CO.emit('contracts');
      }
    }
    if (st.time >= s.next || (!s.offers.length && s.active.length < C.MAX_ACTIVE && st.time >= s.next - C.REFRESH + 20)) {
      const first = !s.seq || s.seq === 1;
      refill(true);
      if (s.offers.length) { CO.emit('contracts'); if (first) CO.emit('toast', 'Le Port propose ses premiers contrats (onglet Station).', 'info'); }
    }
  };

  /** Saved form → live state (drops anything invalid). */
  C.restore = function (raw) {
    const s = C.fresh();
    if (!raw || typeof raw !== 'object') return s;
    const ok = function (o) { return o && CO.ITEMS[o.item] && !CO.ITEMS[o.item].fluid && o.qty > 0 && o.reward >= 0; };
    s.offers = (Array.isArray(raw.offers) ? raw.offers : []).filter(ok);
    s.active = (Array.isArray(raw.active) ? raw.active : []).filter(function (o) { return ok(o) && isFinite(o.deadline); }).slice(0, C.MAX_ACTIVE);
    s.next = Number(raw.next) || 0; s.done = raw.done | 0; s.failed = raw.failed | 0; s.seq = Math.max(1, raw.seq | 0); s.earned = Number(raw.earned) || 0;
    return s;
  };
})(window.CO = window.CO || {});
