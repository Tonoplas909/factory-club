/*
 * main.js — boot sequence and the main loop.
 * The simulation runs on a fixed 60 Hz step (independent of the screen refresh rate);
 * rendering happens once per animation frame. There is no catch-up after the tab was
 * hidden: the game simply pauses (no time pressure).
 */
(function (CO) {
  'use strict';
  const STEP = 1 / 60;
  const canvas = document.getElementById('game');

  CO.render.init(canvas);
  CO.input.init(canvas);
  CO.ui.init();
  CO.minimap.init();

  const restored = CO.save.load();
  if (!restored) {
    CO.save.newGame(1 + Math.floor(Math.random() * 99999));
    CO.ui.showHelp();                       // first launch: show the controls once
    CO.markVersionSeen();                   // a new player does not need the update history
  } else {
    // First reload after an update: show what changed since the version the player last saw (only the
    // latest update for players who had the game before the changelog existed).
    const seen = CO.seenVersion();
    if (seen == null || seen < CO.GAME_VERSION) {
      CO.ui.showChangelog(seen == null ? CO.GAME_VERSION - 1 : seen);
      CO.markVersionSeen();
    }
  }

  let last = performance.now(), acc = 0, time = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now; acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) { CO.sim.step(STEP); acc -= STEP; n++; }
    if (n === 8) acc = 0;                   // too slow: drop the backlog instead of spiralling
    time += dt;
    CO.input.update(dt);
    CO.render.draw(time, dt);
    CO.minimap.draw(dt);
    CO.ui.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Autosave: periodically, when the tab is hidden and when it closes.
  function autosave() { CO.save.save(); }
  setInterval(autosave, 15000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) autosave(); });
  window.addEventListener('beforeunload', autosave);
})(window.CO = window.CO || {});
