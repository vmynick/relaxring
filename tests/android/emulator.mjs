// Android-emulátoros (vagy USB-s telefonos) végponttól végpontig teszt. Kézzel futtatandó, a CI nem futtatja.
// Előfeltétel: futó emulátor vagy telefon (adb devices), rajta Chrome; adb a PATH-ban.
//   node tests/android/emulator.mjs [kimeneti mappa] [cím]
// Cím nélkül ezt a munkakönyvtárat szolgálja ki a gépről (adb reverse, http://localhost:4180/), így a még nem
// publikált változat is tesztelhető, a frissítés pedig egy régebbi git-változatról (OLD, alapból 1.2.1) indul.
// Címmel (pl. https://vmynick.github.io/relaxring/) az élő oldalt teszteli.
// A valódi telefonos Chrome-ot vezérli (Playwright _android), és az Android rendszerállapotait is nézi: médiamenet,
// hangfókusz, rezgés, ébren tartás, forgatás, megosztó lap, letöltés, repülőgép üzemmód, bejövő hívás, telepítés,
// mély alvás (Doze) és energiatakarékos mód, processzorhasználat, kis kijelző és nagyított oldal, minden hang.
// A végén jelentes.html készül a képernyőképekkel.
import { _android } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const APP = fileURLToPath(new globalThis.URL('../..', import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(APP, '..', 'emulator-teszt'));
const LIVE = process.argv[3], PORT = 4180, OLD = process.env.OLD || 'e499a39';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;   // pl. ONLY=Frissítés,Mentés: csak ezek a csoportok
const SITE = LIVE || `http://localhost:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^\d\d_.*\.png$/.test(f)) fs.rmSync(path.join(OUT, f));
const wait = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => execFileSync('adb', a).toString();

// ---------------------------------------------------------------- helyi kiszolgáló (régi és új változat)
let root = APP, down = false, server, oldDir;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg' };
if (!LIVE) {
  oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relaxring-old-'));
  for (const f of execFileSync('git', ['-C', APP, 'ls-tree', '-r', '--name-only', OLD]).toString().split('\n').filter(Boolean)) {
    fs.mkdirSync(path.join(oldDir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(oldDir, f), execFileSync('git', ['-C', APP, 'show', `${OLD}:${f}`], { maxBuffer: 1 << 26 }));
  }
  server = http.createServer(async (req, res) => {
    if (down) return req.socket.destroy();             // „nincs hálózat”: az adb reverse a repülőgép üzemmódot megkerülné
    let p = decodeURIComponent(new globalThis.URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const base = root === APP ? APP : oldDir, f = path.normalize(path.join(base, p));
    if (!f.startsWith(path.normalize(base))) return res.writeHead(403).end();
    try {
      let body = await fs.promises.readFile(f);
      if (p === '/sw.js') body = body.toString().replace('__VERSION__', root === APP ? 'new' : 'old');   // mint a közzétételkor
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(PORT, '127.0.0.1');
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
}

// ---------------------------------------------------------------- eszköz, segédek
const [dev] = await _android.devices();
if (!dev) { console.error('Nincs Android-eszköz (adb devices).'); process.exit(1); }
const sh = async c => (await dev.shell(c)).toString();
const results = [], shots = [];
let group = '';
let step = '';                                 // hibánál kiírjuk, melyik lépésnél akadt el
async function check(name, fn) {
  if (ONLY && !ONLY.includes(group)) return;
  const t = Date.now();
  let r;
  step = '';
  try { r = await fn(); } catch (e) {
    r = { ok: false, info: 'HIBA' + (step ? ` (${step})` : '') + ': ' + String(e.message || e).split('\n')[0].slice(0, 300) };
    const log = String(e.message || '').split('\n').filter(l => /^\s+- /.test(l)).slice(-3).map(l => l.trim()).join(' | ');   // a Playwright utolsó lépései
    if (log) r.info += ' [' + log.slice(0, 300) + ']';
    try { await shot('hiba', `Hiba: ${group} / ${name}`); } catch {}
  }
  if (typeof r !== 'object' || r === null) r = { ok: !!r };
  results.push({ group, name, ok: !!r.ok, warn: !!r.warn, info: r.info || '', ms: Date.now() - t });
  console.log(`${r.ok ? (r.warn ? 'FIGY' : ' OK ') : 'HIBA'} │ ${group} │ ${name}${r.info ? ' │ ' + r.info : ''}`);
}
async function shot(n, cap) { const f = `${String(shots.length + 1).padStart(2, '0')}_${n}.png`; fs.writeFileSync(path.join(OUT, f), await dev.screenshot()); shots.push([f, cap]); }
const key = k => sh(`input keyevent ${k}`);

await sh('echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line');
await sh('settings put system accelerometer_rotation 0; settings put system user_rotation 0; locksettings set-disable true; svc power stayon true; cmd uimode night no');
await key('KEYCODE_WAKEUP'); await sh('wm dismiss-keyguard');
let ctx = await dev.launchBrowser();
let page = ctx.pages()[0] || await ctx.newPage();
for (const p of ctx.pages()) if (p !== page) await p.close();          // előző futásból megmaradt lapok
page.on('dialog', d => d.accept());
async function relaunch() {                   // a Chrome újraindítása: a kijelzőméret-váltás bezárja a vezérelt lapot
  try { await ctx.close(); } catch {}
  ctx = await dev.launchBrowser();
  page = ctx.pages()[0] || await ctx.newPage();
  for (const p of ctx.pages()) if (p !== page) await p.close();
  page.on('dialog', d => d.accept());
  await page.goto(SITE); await page.waitForFunction(() => typeof start === 'function');
}
const info = { model: dev.model(), android: (await sh('getprop ro.build.version.release')).trim(),
  chrome: ((await sh('dumpsys package com.android.chrome')).match(/versionName=(\S+)/) || [])[1], url: SITE };
console.log('Eszköz:', info);

let VER = '';
async function fresh(state = {}) {           // tiszta állapot a megadott beállításokkal, és újratöltés
  await page.evaluate(() => { try { if (typeof run !== 'undefined' && run) stop(); } catch (e) {} });
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem('legzo', JSON.stringify(s)); },
    { hint2: 3, hintTb: 3, newsSeen: VER, hvOk: true, lang: 'en', persistAsked: true, noInstall: true, ...state });
  await page.bringToFront(); await page.reload();
  await page.waitForFunction(() => typeof start === 'function' && !!document.getElementById('ringBtn'));
}
const ev = (f, a) => page.evaluate(f, a);
const tabState = { mode: 'tabata', shown: ['box', '478', 'tabata'], tabs: [{ id: 't1', n: 'Reggeli', work: 5, rest: 5, rounds: 3, sets: 1, prep: 0, brk: 60, ex: 'Squats\nPush-ups\nLunges', wu: 0, cd: 0, col: { work: '#7B4FD0' }, snd: {} }], tabSel: 't1' };
async function touchHold(sel, ms) {         // valódi érintés: lenyomás, tartás, felengedés (CDP)
  const b = await page.locator(sel).boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2, cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await wait(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function uiText() { await sh('uiautomator dump /sdcard/ui.xml >/dev/null'); return sh('cat /sdcard/ui.xml'); }
async function uiFind(re) {                // natív Android-felület eleme szöveg alapján: [szöveg, x, y]
  const xml = await uiText(), m = [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].find(n => re.test(n[1]));
  return m ? [m[1], (+m[2] + +m[4]) >> 1, (+m[3] + +m[5]) >> 1] : null;
}
async function uiTap(re, tries = 1) {
  for (let k = 0; k < tries; k++) { const m = await uiFind(re); if (m) { await sh(`input tap ${m[1]} ${m[2]}`); return m[0]; } await wait(1000); }
  return '';
}
// rezgések a Chrome-tól egy időpont óta (a rendszer csak az utolsó néhányat tartja meg, ezért időbélyeg szerint)
const devNow = async () => (await sh('date +"%m-%d %H:%M:%S"')).trim();
const vibSince = async t => (await sh('dumpsys vibrator_manager')).split('\n').filter(l => /com\.android\.chrome/.test(l) && (l.match(/\d\d-\d\d \d\d:\d\d:\d\d/) || [''])[0] >= t).length;

// ---------------------------------------------------------------- 1. frissítés
group = 'Frissítés';
if (!LIVE) {
  await check(`régi változatról (${OLD}) az újra: „új verzió” jelzés, adatok átvétele, „mi újság”`, async () => {
    root = 'old';
    try { return await update(); }
    catch (e) { root = APP; await clearSite(); throw e; }      // hiba esetén se maradjon a régi változat a többi tesztnek
    finally { root = APP; }
  });
}
async function clearSite() {                    // az oldal minden tárolt adata (service worker, gyorsítótár, localStorage) törlődik
  if (page.url() === 'about:blank') await page.goto(SITE);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: SITE.replace(/\/$/, ''), storageTypes: 'all' }); await cdp.detach();
  await page.reload();
}
async function update() {
    step = 'régi változat betöltése';
    await page.goto(SITE);
    await clearSite();
    step = 'régi service worker';
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(async e => {
      throw new Error(e.message.split('\n')[0] + '; állapot: ' + await ev(async () => JSON.stringify((await navigator.serviceWorker.getRegistrations()).map(r => [r.active && r.active.state, r.installing && r.installing.state, r.waiting && r.waiting.state]))));
    });
    await ev(() => localStorage.setItem('legzo', JSON.stringify({ lang: 'hu', mode: 'own', shown: ['own', 'box', 'calm'], own: [5, 2, 7, 0],
      tab: { work: 30, rest: 15, rounds: 5 }, log: { '2026-10-01': 300, '2026-10-02': 420 }, sessions: 3, newsSeen: '1.2.1', hint2: 3, hintTb: 3, persistAsked: true, noInstall: true })));
    step = 'régi változat az adatokkal';
    await page.reload(); await page.waitForFunction(() => typeof st === 'object');
    const v0 = await ev(() => APP_VER);
    await shot('regi_valtozat', `A régi változat (${v0}) fut a telefonon, saját ritmussal`);
    root = APP;
    step = '„új verzió” jelzés';
    await page.reload();
    await page.waitForFunction(() => document.getElementById('notice').classList.contains('show') && !document.getElementById('nact').hidden, null, { timeout: 90000 });
    const n1 = await ev(() => document.getElementById('ntext').textContent);
    await shot('frissites_jelzes', `Új verzió jelzés: „${n1}”`);
    step = 'frissítés gomb';
    await Promise.all([page.waitForNavigation(), page.click('#nact')]);
    await page.waitForFunction(() => typeof APP_VER === 'string' && typeof st === 'object');
    await wait(1500);
    const r = await ev(() => ({ v: APP_VER, note: document.getElementById('ntext').textContent, c: st.customs[0], t: st.tabs[0], mode: st.mode, lang: st.lang, total: st.totalSec, sess: st.sessions, own: 'own' in st, tab: 'tab' in st }));
    await shot('frissites_utan', `Frissítés után (${r.v}): „${r.note}”`);
    const ok = r.v !== v0 && r.c.p.join() === '5,2,7,0' && r.t.work === 30 && r.t.rounds === 5 && r.mode === 'own' && r.lang === 'hu' && r.total === 720 && !r.own && !r.tab;
    return { ok, info: `${v0} → ${r.v}; jelzés: „${n1}”; utána: „${r.note}”; saját ritmus: ${r.c.p.join('·')}; Tabata: ${r.t.work}/${r.t.rest} ×${r.t.rounds}; ritmus: ${r.mode}; nyelv: ${r.lang}; összes idő: ${r.total} mp; ${r.sess} gyakorlás` };
}
if (LIVE) {
  await check('élő oldal: frissítés jelzése, ha a gyorsítótárban régebbi van', async () => {
    await page.goto(SITE);
    const v0 = await ev(() => APP_VER), live = (await (await fetch(SITE)).text()).match(/v:'([\d.]+)'/)[1];
    if (v0 === live) return { ok: true, warn: true, info: `már a friss verzió fut (${v0}), nem volt mit frissíteni` };
    await page.waitForFunction(() => document.getElementById('notice').classList.contains('show') && !document.getElementById('nact').hidden, null, { timeout: 90000 });
    await Promise.all([page.waitForNavigation(), page.click('#nact')]);
    await page.waitForFunction(() => typeof APP_VER === 'string');
    const v1 = await ev(() => APP_VER);
    return { ok: v1 === live, info: `${v0} → ${v1}` };
  });
}
if (page.url() === 'about:blank' || !page.url().startsWith(SITE)) { await page.goto(SITE); await page.waitForFunction(() => typeof APP_VER === 'string'); }
VER = await ev(() => APP_VER);

// ---------------------------------------------------------------- 2. nyelvek, feliratok
group = 'Nyelvek';
await check('első indításkor a telefon nyelve', async () => {
  await ev(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => typeof st === 'object');
  const r = await ev(() => ({ lang: st.lang, nav: navigator.language, note: document.getElementById('ntext').textContent, w: innerWidth, h: innerHeight }));
  await shot('elso_inditas', `Első indítás: „${r.note}”`);
  return { ok: r.lang === r.nav.slice(0, 2), info: `telefon: ${r.nav} → app: ${r.lang}; nézet: ${r.w}×${r.h} px; „${r.note}”` };
});
async function audit() {                      // mind a 20 nyelv: a ritmusgombok, a körszavak és a Beállítások oldalai; a hibák listája
  return ev(async () => {
    const out = [], wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    for (const l of Object.keys(T)) {
      applyLang(l); closeSheet();
      for (const tri of [['box', '478', 'calm'], ['sigh', 'coh', 'relax'], ['slow', 'own', 'tabata'], ['equal', 'long', 'bee'], ['tri', 'nadi', 'wake'], ['kapal', 'whm', 'box']]) {
        st.shown = tri; renderModes(); await wait();
        document.querySelectorAll('#modes button span').forEach(s => { if (s.scrollWidth > s.clientWidth + 1) out.push(`${l}: gomb „${s.textContent}”`); });
      }
      const d1 = r1.offsetWidth, sc = { in2: 1.6, prep: 1.3, rest: 1.3, retain: 1.18 };
      for (const k of ['in', 'in2', 'out', 'hum', 'pump', 'pwr', 'retain', 'rest', 'prep', 'start', 'done', 'paused']) {
        ph.textContent = L[k]; fitRing(k); const rg = document.createRange(); rg.selectNodeContents(ph);
        if (rg.getBoundingClientRect().width > d1 * .92 * (sc[k] || 1) || rg.getClientRects().length > 1) out.push(`${l}: körszó „${L[k]}”`);
      }
      openSheet();
      for (const pg of ['main', 'journal', 'rhythms', 'tabata', 'session', 'sound', 'look', 'lang', 'backup', 'about']) {
        showPage(pg); await wait();
        const right = document.getElementById('sheetBody').getBoundingClientRect().right;
        document.querySelectorAll(`.page[data-page="${pg}"] *`).forEach(e => {
          if (!e.offsetParent || e.matches('svg,svg *,input,option')) return;
          const cs = getComputedStyle(e);
          if (e.scrollWidth > e.clientWidth + 1 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && !e.matches('em,.rrow b,.hrow span,.bar span')) out.push(`${l}/${pg}: „${e.textContent.trim().slice(0, 30)}” levágva`);
          if (e.getBoundingClientRect().right > right + 1) out.push(`${l}/${pg}: <${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}> „${e.textContent.trim().slice(0, 30)}” kilóg`);
        });
        const h = document.getElementById('sheetTitle'); if (h.scrollWidth > h.clientWidth + 1) out.push(`${l}: cím „${h.textContent}”`);
      }
      closeSheet();
    }
    applyLang('en'); idleLabel();
    return [...new Set(out)];
  });
}
const auditInfo = bad => bad.slice(0, 12).join('; ') + (bad.length > 12 ? ` … (+${bad.length - 12})` : '');
await check('mind a 20 nyelv a telefon szélességén: semmi nem lóg ki, nem vágódik le', async () => {
  await fresh();
  const bad = await audit();
  return { ok: bad.length === 0, info: bad.length ? auditInfo(bad) : `${await ev(() => innerWidth)} px széles nézetben is minden kifér` };
});
await check('hosszú feliratok kicsinyítve: finn körszó, portugál Tabata, horvát cím, orosz megosztás', async () => {
  await fresh({ lang: 'fi', mode: 'whm', shown: ['whm', 'box', 'calm'] });
  await page.click('#ringBtn'); await wait(3500);
  const fi = await ev(() => [ph.textContent, getComputedStyle(ph).fontSize]);
  await shot('finn_mely_legzes', `Finn: „${fi[0]}” a körben (${fi[1]})`);
  await ev(() => stop());
  const r = [];
  for (const [l, pg, sel] of [['pt', 'tabata', '#tsteps .stepper:last-child span'], ['hr', 'backup', '#sheetTitle'], ['ru', 'main', '#shareBtn span']]) {
    await ev(([l, pg]) => { applyLang(l); openSheet(); if (pg !== 'main') openPage(pg); }, [l, pg]); await wait(400);
    await page.locator(sel).scrollIntoViewIfNeeded();
    const x = await ev(s => { const e = document.querySelector(s); return [e.textContent, getComputedStyle(e).fontSize, e.scrollWidth <= e.clientWidth + 1, Math.round(e.getBoundingClientRect().height)]; }, sel);
    await shot(`${l}_${pg}`, `${l}: „${x[0]}” (${x[1]}${x[3] > 30 ? ', két sorban' : ''})`);
    r.push(`${l}: „${x[0]}” ${x[1]}${x[3] > 30 ? ' két sorban' : ''}${x[2] ? '' : ' LEVÁGVA'}`);
    await ev(() => closeSheet());
  }
  return { ok: !r.some(x => /LEVÁGVA/.test(x)), info: `fi: „${fi[0]}” ${fi[1]}; ` + r.join('; ') };
});
await check('nyelvválasztó: a nyelvek saját nevükön', async () => {
  await fresh();
  await ev(() => { openSheet(); openPage('lang'); }); await wait(500); await shot('nyelvvalaszto', 'Nyelvválasztó');
  const names = await ev(() => [...document.querySelectorAll('#langOpts button')].map(b => b.textContent));
  await ev(() => closeSheet());
  return { ok: names.includes('Magyar') && names.includes('Українська') && names.length === 20, info: names.join(', ') };
});

// ---------------------------------------------------------------- kis kijelző, nagyított oldal
// A rendszer betűméretét (font_scale) a Chrome 145 nem adja tovább; a Chrome saját szövegnagyítása az oldalt nagyítja,
// ami olyan, mintha keskenyebb lenne a kijelző: ezt a képsűrűséggel (wm density) állítjuk elő.
group = 'Kijelzők';
for (const [name, cmd, strict, tag] of [
  ['kis telefon (320 dp széles)', 'wm size 720x1520; wm density 360', true, 'kis_telefon'],
  ['nagyított oldal (a Chrome 130%-os szövegnagyítása, kb. 258 px széles)', 'wm density 624', false, 'nagyitott']]) {
  await check(`${name}: mind a 20 nyelv, főképernyő, Tabata`, async () => {
    await sh(cmd); await wait(2500);
    try {
      await relaunch(); await fresh();
      const bad = await audit(), w = await ev(() => `${innerWidth}×${innerHeight} px`);
      await fresh({ lang: 'hu', mode: 'nadi', shown: ['nadi', 'box', 'tabata'] });
      await page.click('#ringBtn'); await wait(1500);
      await shot(`${tag}_legzes`, `${name}: váltott orrlyukú légzés`);
      await fresh({ ...tabState, lang: 'de' });
      await page.click('#ringBtn'); await wait(1500);
      await shot(`${tag}_tabata`, `${name}: Tabata, németül`);
      await ev(() => stop());
      return { ok: strict ? !bad.length : true, warn: !strict && bad.length > 0, info: `${w}: ` + (bad.length ? `${bad.length} gond: ${auditInfo(bad)}` : 'minden kifér') };
    } finally { await sh('wm size reset; wm density reset'); await wait(2500); await relaunch(); }
  });
}

// ---------------------------------------------------------------- 3. légzés valós időben
group = 'Légzés';
await check('teljes gyakorlás valós időben (doboz, 1 légzés): hang, rezgés, ébren tartás, médiamenet, napló, kitüntetés', async () => {
  await fresh({ mode: 'box', durType: 'br', breaths: 1, stats: true, full: true });
  const v0 = await devNow();
  await page.click('#ringBtn');
  await wait(1500);
  const s = await ev(() => ({ run, ph: ph.textContent, ac: ac && ac.state, wake: !!wake && !wake.released, fs: !!document.fullscreenElement, media: media && !media.paused }));
  await shot('legzes_belegzes', 'Doboz légzés, belégzés (teljes képernyő)');
  const ms = await sh('dumpsys media_session');
  const msOk = /RelaxRing\+ – Box/.test(ms) && /state=PlaybackState \{state=(3|PLAYING)/.test(ms);
  const keep = /KEEP_SCREEN_ON/.test(await sh('dumpsys window windows | grep -E "Window #|mAttrs|fl="'));
  await wait(3000);
  const ph2 = await ev(() => ph.textContent);
  await wait(12500);
  const end = await ev(() => ({ ph: ph.textContent, run, hist: st.hist.length, note: document.getElementById('ntext').textContent }));
  await shot('legzes_vege', `Vége: „${end.ph}”, jelzés: „${end.note}”`);
  const vib = await vibSince(v0);
  const ok = s.run && s.ph === 'Inhale' && s.ac === 'running' && s.wake && ph2 === 'Hold' && end.ph === 'Well done' && end.hist === 1 && msOk && vib >= 4;
  return { ok, info: `hang: ${s.ac}; ébren tartás: ${s.wake}; teljes képernyő: ${s.fs}; háttérhurok szól: ${s.media}; médiamenet „RelaxRing+ – Box”, lejátszás: ${msOk}; KEEP_SCREEN_ON: ${keep}; rezgés: ${vib}×; 4 mp után „${ph2}”; a végén „${end.ph}”; napló: ${end.hist}; jelzés: „${end.note}”` };
});
await check('napló: szint, kitüntetések, munkamenetek', async () => {
  await ev(() => { openSheet(); openPage('journal'); }); await wait(600);
  const r = await ev(() => document.getElementById('statsBox').innerText.replace(/\s+/g, ' ').trim());
  await page.locator('#statsBox').scrollIntoViewIfNeeded(); await wait(300);
  await shot('naplo_kituntetesek', 'Napló: szint és kitüntetések');
  await ev(() => closeSheet());
  return { ok: r.length > 20 && /First step/.test(r), info: `„${r.slice(0, 160)}…”` };
});
await check('gyorsindítás az ikonról (?r=478)', async () => {
  await page.goto(SITE + '?r=478');
  await page.waitForFunction(() => typeof run !== 'undefined' && run, null, { timeout: 5000 });
  const r = await ev(() => ({ mode: st.mode, ph: ph.textContent, url: location.search }));
  await ev(() => stop());
  return { ok: r.mode === '478' && r.url === '', info: `ritmus: ${r.mode}, „${r.ph}”` };
});
await check('sötét mód és háttérkép', async () => {
  // A telefon sötét témáját (cmd uimode night yes) a Chrome csak újraindítás után adja tovább, ezért itt a Chrome emulálja.
  await fresh({ scene: true, color: 'tenger' });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await wait(800);
  const r = await ev(() => ({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor }));
  await shot('sotet_mod', 'Sötét mód, Tenger téma háttérképpel');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] }); await cdp.detach();
  const lum = (r.bg.match(/\d+/g) || []).slice(0, 3).reduce((a, x) => a + +x, 0) / 3;
  return { ok: r.dark && lum < 80, info: `sötét: ${r.dark}; háttér: ${r.bg}` };
});

// ---------------------------------------------------------------- 4. lezárt képernyő, médiagombok, hívás
group = 'Lezárt képernyő';
await check('kikapcsolt képernyővel is fut tovább', async () => {
  await fresh({ mode: 'calm', dur: 3 });
  await page.click('#ringBtn'); await wait(2000);
  const e0 = await ev(() => elapsed);
  await key('KEYCODE_SLEEP');
  await wait(20000);
  const e1 = await ev(() => ({ elapsed, run, ph: ph.textContent }));
  const notif = /RelaxRing\+ – Calm/.test(await sh('dumpsys media_session'));
  await key('KEYCODE_WAKEUP'); await wait(1500); await sh('wm dismiss-keyguard'); await wait(1000);
  await sh('cmd statusbar expand-notifications'); await wait(2000);
  await shot('ertesites_mediavezerlo', 'Értesítési sáv: médiavezérlő a gyakorlás nevével');
  await sh('cmd statusbar collapse'); await wait(800);
  return { ok: e1.run && e1.elapsed - e0 >= 18 && e1.elapsed - e0 <= 23 && notif, info: `20 mp kikapcsolt képernyő alatt ${e1.elapsed - e0} mp telt el a gyakorlásban (fut: ${e1.run}); médiamenet „RelaxRing+ – Calm”: ${notif}` };
});
await check('médiagombok: szünet, folytatás, fülhallgató-gomb (kikapcsolt és bekapcsolt képernyőn)', async () => {
  // Kikapcsolt képernyőn a fülhallgató gombja a rendszer médiaszolgáltatásán át érkezik (az „input keyevent” ott nem jut el)
  const dsp = async k => { await sh(`cmd media_session dispatch ${k}`); await wait(1200); return ev(() => paused); };
  await key('KEYCODE_SLEEP'); await wait(1500);
  const a = await dsp('pause'), b = await dsp('play'), c = await dsp('headsethook'), d = await dsp('headsethook');
  await key('KEYCODE_WAKEUP'); await sh('wm dismiss-keyguard'); await wait(800);
  await key('KEYCODE_MEDIA_PAUSE'); await wait(1200);
  const e = await ev(() => paused);
  await key('KEYCODE_MEDIA_PLAY'); await wait(1200);
  const f = await ev(() => paused);
  const s = x => x ? 'szünet' : 'fut';
  return { ok: a && !b && c && !d && e && !f, info: `kikapcsolt képernyő: szünet → ${s(a)}, lejátszás → ${s(b)}, fülhallgató → ${s(c)}, újra → ${s(d)}; bekapcsolt képernyő: szünet gomb → ${s(e)}, lejátszás → ${s(f)}` };
});
await check('bejövő hívás szünetelteti', async () => {
  if (!dev.serial().startsWith('emulator')) return { ok: true, warn: true, info: 'csak emulátoron szimulálható' };
  const p0 = await ev(() => run && !paused);
  adb('emu', 'gsm', 'call', '5551234'); await wait(5000);
  const p1 = await ev(() => paused);
  await shot('bejovo_hivas', 'Bejövő hívás közben');
  adb('emu', 'gsm', 'cancel', '5551234'); await wait(3000);
  await key('KEYCODE_WAKEUP'); await sh('wm dismiss-keyguard');
  const p2 = await ev(() => paused);
  await ev(() => stop());
  return { ok: p0 && p1, info: `hívás előtt fut: ${p0}; csengetéskor szünet: ${p1}; a hívás után: ${p2 ? 'szünetel (érintésre folytatható)' : 'fut'}` };
});

// ---------------------------------------------------------------- akkumulátor: mély alvás, energiatakarékos mód, processzor
group = 'Akkumulátor';
async function cpuTimes() {                    // a Chrome folyamatainak és a hangszervernek eddigi processzorideje (mp)
  const ps = (await sh('ps -A -o PID,NAME')).split('\n').map(l => l.trim().split(/\s+/)).filter(x => /^(com\.android\.chrome|audioserver)/.test(x[1] || '') && !/zygote/.test(x[1]));
  const out = {};
  for (const [pid, name] of ps) {
    const st = await sh(`cat /proc/${pid}/stat 2>/dev/null`), f = st.slice(st.lastIndexOf(')') + 2).split(' ');
    if (f.length < 13) continue;
    const k = /audioserver/.test(name) ? 'hangszerver' : /sandboxed/.test(name) ? 'oldal' : /privileged/.test(name) ? 'GPU és hang' : 'böngésző';
    out[k] = (out[k] || 0) + (+f[11] + +f[12]) / 100;           // utime + stime, 100 tikk/mp
  }
  return out;
}
const cpuPct = (a, b, secs) => Object.keys(b).reduce((x, k) => x + b[k] - (a[k] || 0), 0) / secs * 100;
const cpuParts = (a, b, secs) => Object.keys(b).map(k => `${k} ${((b[k] - (a[k] || 0)) / secs * 100).toFixed(1)}%`).join(', ');
await check('3 perc kikapcsolt képernyővel: pontos idő és processzorhasználat, ebből 90 mp mély alvásban (Doze) energiatakarékos módban', async () => {
  await fresh({ mode: 'calm', dur: 5 });
  await key('KEYCODE_SLEEP'); await wait(2000);
  const b0 = await cpuTimes(); await wait(30000); const b1 = await cpuTimes();       // összevetésnek: tétlen Chrome
  await key('KEYCODE_WAKEUP'); await sh('wm dismiss-keyguard'); await wait(1000);
  await page.click('#ringBtn'); await wait(3000);
  await key('KEYCODE_SLEEP'); await wait(2000);
  const e0 = await ev(() => elapsed), r0 = Date.now(), c0 = await cpuTimes();
  await wait(90000);
  const e1 = await ev(() => elapsed), r1 = Date.now(), c1 = await cpuTimes();
  let deep = '';
  await sh('dumpsys battery unplug; cmd power set-mode 1; dumpsys deviceidle force-idle');
  try { await wait(90000); deep = (await sh('dumpsys deviceidle get deep')).trim(); }
  finally { await sh('dumpsys deviceidle unforce; dumpsys battery reset; cmd power set-mode 0'); }
  const e2 = await ev(() => ({ elapsed, run, paused })), r2 = Date.now(), c2 = await cpuTimes();
  const playing = /PlaybackState \{state=(3|PLAYING)/.test(await sh('dumpsys media_session'));
  await key('KEYCODE_WAKEUP'); await sh('wm dismiss-keyguard'); await wait(1000);
  await shot('harom_perc_utan', '3 perc kikapcsolt képernyő után (90 mp mély alvással)');
  await ev(() => stop());
  const s1 = Math.round((r1 - r0) / 1000), s2 = Math.round((r2 - r1) / 1000), d1 = e1 - e0 - s1, d2 = e2.elapsed - e1 - s2;
  return { ok: e2.run && !e2.paused && Math.abs(d1) <= 2 && Math.abs(d2) <= 2 && deep === 'IDLE' && playing,
    info: `normál: ${s1} mp alatt ${e1 - e0} mp telt el a gyakorlásban; mély alvás (${deep}) + energiatakarékos mód: ${s2} mp alatt ${e2.elapsed - e1} mp; fut: ${e2.run}; médiavezérlő: ${playing ? 'lejátszás' : 'NEM'}` +
      `; processzor (egy mag %-ában) – tétlen Chrome: ${cpuPct(b0, b1, 30).toFixed(1)}%, gyakorlás: ${cpuPct(c0, c1, s1).toFixed(1)}% (${cpuParts(c0, c1, s1)}), mély alvásban: ${cpuPct(c1, c2, s2).toFixed(1)}%` };
});

// ---------------------------------------------------------------- 5. hangos vezetés
group = 'Hangos vezetés';
await check('telefon felolvasója (magyar): időzítés, mért késés', async () => {
  await fresh({ lang: 'hu', mode: 'box', speak: true, vk: 'tts', durType: 'br', breaths: 1 });
  await ev(() => { window.said = []; const o = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { const t = performance.now(), s = u.onstart; u.onstart = e => { window.said.push([u.text, t, performance.now()]); s && s(e); }; o(u); }; });
  await page.click('#ringBtn'); await wait(14000);
  // a gyakorlás órája (t0) az első szó megszólalásakor indul: minden időt ehhez mérünk
  const r = await ev(() => ({ said: window.said.map(s => [s[0], Math.round(s[1] - t0), Math.round(s[2] - t0)]), lag: st.ttsLag, voice: ttsVoice() && ttsVoice().lang }));
  await ev(() => stop());
  const off = r.said.map(s => { const x = s[2] % 4000; return x > 2000 ? x - 4000 : x; });
  return { ok: r.said.length >= 3 && r.said[1][0] === 'Tartás' && Math.abs(off[0]) <= 100 && off.slice(1).every(x => Math.abs(x) <= 400),
    info: `hang: ${r.voice}; bemondások (kérés → megszólalás, a kör indulásától): ${r.said.map(s => `${s[0]} ${(s[1] / 1000).toFixed(2)} → ${(s[2] / 1000).toFixed(2)} mp`).join(', ')}; tanult késés: ${r.lag} ms; a váltáshoz képest: ${off.map(x => (x > 0 ? '+' : '') + x + ' ms').join(', ')}` };
});
await check('felvett női hang (magyar): letöltés, dekódolás, a váltáskor szól', async () => {
  await fresh({ lang: 'hu', mode: 'nadi', shown: ['nadi', 'box', 'calm'], speak: true, vk: 'f', durType: 'br', breaths: 1 });
  await page.waitForFunction(() => !!vbuf, null, { timeout: 20000 });
  await ev(() => { window.rec = []; const o = playRec; playRec = k => { window.rec.push([k.join('+'), Math.round(performance.now() - t0)]); return o(k); }; });
  await page.click('#ringBtn'); await wait(4500);
  const r = await ev(() => ({ rec: window.rec, ac: ac.state, dur: vbuf.duration.toFixed(1) }));
  await shot('valtott_orrlyuk', 'Váltott orrlyukú légzés (magyar, felvett hang)');
  await ev(() => stop());
  return { ok: r.rec.length >= 2 && r.rec[0][0] === 'in+viaL' && r.ac === 'running', info: `mp3 dekódolva (${r.dur} mp); lejátszott szavak: ${r.rec.map(x => `${x[0]} @${(x[1] / 1000).toFixed(2)}`).join(', ')}` };
});

await check('mind a 29 felvett hang: letöltés, dekódolás Androidon, egyik szó sem néma', async () => {
  await fresh();
  const r = await ev(async () => {
    const out = [];
    for (const [lang, gs] of Object.entries(VOX)) for (const [g, v] of Object.entries(gs)) {
      try {
        const b = await (await fetch('voice/' + v.src)).arrayBuffer();
        const buf = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(b.slice(0));
        const d = buf.getChannelData(0), sr = buf.sampleRate, end = Math.max(...Object.values(v.clips).map(c => c[0] + c[1]));
        const silent = Object.entries(v.clips).filter(([, [s0, len]]) => { let a = 0; const i0 = Math.floor(s0 * sr), n = Math.floor(len * sr);
          for (let j = 0; j < n; j++) a += (d[i0 + j] || 0) ** 2; return !(Math.sqrt(a / n) > .01); }).map(([k]) => k);
        out.push({ id: lang + '-' + g, ok: buf.duration >= end - .05 && !silent.length, dur: buf.duration, kb: b.byteLength / 1024, silent });
      } catch (e) { out.push({ id: lang + '-' + g, ok: false, err: String(e) }); }
    }
    return out;
  });
  const bad = r.filter(x => !x.ok);
  return { ok: r.length === 29 && !bad.length, info: `${r.length} hang, összesen ${Math.round(r.reduce((a, x) => a + (x.kb || 0), 0))} KB` +
    (bad.length ? '; hibás: ' + bad.map(x => `${x.id} ${x.err || 'néma: ' + x.silent.join(',')}`).join('; ') : '; mind rendben: ' + r.map(x => x.id).join(' ')) };
});
await check('a telefon felolvasója mind a 20 nyelven: van-e hang, megszólal-e', async () => {
  await fresh({ speak: true });
  await page.click('#setBtn'); await ev(() => closeSheet());       // a felolvasóhoz felhasználói koppintás kell
  const r = await ev(async () => {
    const out = [];
    for (const l of Object.keys(T)) {
      applyLang(l); const v = ttsVoice();
      if (!v) { out.push([l, '', 'nincs hang']); continue; }
      const res = await new Promise(done => { const u = new SpeechSynthesisUtterance(L.in), t = performance.now(); u.voice = v; u.lang = v.lang; u.volume = .4;
        u.onstart = () => done(Math.round(performance.now() - t)); u.onerror = e => done('hiba: ' + e.error); setTimeout(() => done('nem szólalt meg'), 8000); speechSynthesis.speak(u); });
      speechSynthesis.cancel(); await new Promise(x => setTimeout(x, 300));
      out.push([l, v.lang, res]);
    }
    applyLang('en'); return out;
  });
  const bad = r.filter(x => typeof x[2] !== 'number');
  return { ok: true, warn: bad.length > 0, info: (bad.length ? `nem szól: ${bad.map(x => x[0] + ' (' + x[2] + ')').join(', ')}; ` : 'mind a 20 nyelv megszólal; ') + r.filter(x => typeof x[2] === 'number').map(x => `${x[0]} ${x[1]} ${x[2]} ms`).join(', ') };
});

// ---------------------------------------------------------------- 6. technikák, felület
group = 'Technikák';
await check('ciklusos légzés: mély légzések, visszatartás koppintásig', async () => {
  await fresh({ mode: 'whm', whr: 1, shown: ['whm', 'box', 'calm'] });
  await page.click('#ringBtn'); await wait(3300);
  const a = await ev(() => ct.textContent);
  await ev(() => { t0 -= 87000; tick(); });                // előreugrás a visszatartásig
  await wait(3200);
  const b = await ev(() => ({ ph: ph.textContent, sub: sub.textContent, ct: ct.textContent }));
  await shot('ciklusos_visszatartas', `Ciklusos légzés: „${b.ph}”, ${b.ct} mp`);
  await page.click('#ringBtn'); await wait(500);
  const c = await ev(() => ({ ph: ph.textContent, ret: ret.slice() }));
  await ev(() => stop());
  return { ok: a === '29' && b.ph === 'Retention' && c.ph === 'Inhale' && c.ret.length === 1, info: `3 mp után ${a} légzés van hátra; visszatartás: „${b.ph}” ${b.ct} mp, „${b.sub}”; koppintás után „${c.ph}”, mért visszatartás: ${c.ret[0]} mp` };
});
await check('Kapalbhati: kifújások, rezgés', async () => {
  await fresh({ mode: 'kapal', shown: ['kapal', 'box', 'calm'] });
  const v0 = await devNow();
  await page.click('#ringBtn'); await wait(3200);
  const r = await ev(() => ({ ph: ph.textContent, ct: ct.textContent }));
  const vib = await vibSince(v0);
  await ev(() => stop());
  return { ok: r.ph === 'Pump' && +r.ct <= 28 && vib >= 3, info: `„${r.ph}”, ${r.ct} kifújás van hátra; rezgés: ${vib}× (minden kifújásnál)` };
});
await check('visszaszámlálás indulás előtt', async () => {
  await fresh({ mode: 'box', cd: 3 });
  await page.click('#ringBtn'); await wait(300);
  const a = await ev(() => [ph.textContent, ct.textContent]);
  await wait(3200);
  const b = await ev(() => ph.textContent);
  await ev(() => stop());
  return { ok: a[0] === 'Get ready' && b === 'Inhale', info: `${a.join(' ')} → ${b}` };
});
await check('saját ritmus a felületen, az Android vissza gombja', async () => {
  await fresh();
  await page.click('#setBtn'); await page.click('.navi[data-go="rhythms"]'); await page.click('#addOwn');
  await page.fill('.editor input', 'Esti'); await page.click('.rrow:has-text("Esti")');
  await shot('ritmusok', 'Ritmusok: új saját ritmus „Esti”');
  await key('KEYCODE_BACK'); await wait(700);
  const t1 = await ev(() => document.getElementById('sheetTitle').textContent);
  await key('KEYCODE_BACK'); await wait(700);
  const r = await ev(() => ({ hidden: document.getElementById('sheet').hidden, modes: [...document.querySelectorAll('#modes span')].map(s => s.textContent), url: location.href }));
  return { ok: t1 === 'Settings' && r.hidden && r.modes.includes('Esti') && r.url.startsWith(SITE), info: `1. vissza: „${t1}” oldal; 2. vissza: bezárt (${r.hidden}); főképernyő: ${r.modes.join(', ')}; az app nem lépett ki` };
});

// ---------------------------------------------------------------- alvás mód, sorozat, háttérhangok
group = 'Funkciók';
await check('alvás mód: a képernyő lassan elsötétül, a végén nincs csengő, sötét és teljes képernyős marad', async () => {
  await fresh({ mode: 'box', durType: 'br', breaths: 1, sleep: true, amb: 'eso', full: true });
  await ev(() => { window.dings = 0; const o = ding; ding = (...a) => { if (elapsed >= 16) window.dings++; return o(...a); }; });   // csak a záró csengő számít
  await page.click('#ringBtn'); await wait(8000);
  const mid = await ev(() => +getComputedStyle(document.getElementById('dim')).opacity);
  await wait(9500);
  const end = await ev(() => ({ run, finished, dings: window.dings, fs: !!document.fullscreenElement }));
  await wait(2500);
  const op = await ev(() => +getComputedStyle(document.getElementById('dim')).opacity);
  await shot('alvas_mod_vege', `Alvás mód vége: sötétítés ${op.toFixed(2)}`);
  return { ok: mid > .2 && mid < .8 && !end.run && end.finished && end.dings === 0 && end.fs && op > .9,
    info: `8 mp-nél a sötétítés: ${mid.toFixed(2)}; a végén: ${op.toFixed(2)}; csengő: ${end.dings}×; teljes képernyő marad: ${end.fs}` };
});
await check('sorozat: 1 perc sóhajtás, utána koherens légzés', async () => {
  await fresh({ mode: 'q1', shown: ['q1', 'box', 'calm'], seqs: [{ id: 'q1', n: 'Esti sor', s: [['sigh', 1], ['coh', 1]] }] });
  await page.click('#ringBtn'); await wait(1500);
  const sig = () => ev(() => ({ cur: cur.map(x => x[0] + x[1]).join(' '), ph: ph.textContent, el: elapsed, label: document.getElementById('modes').textContent }));
  const a = await sig();
  await ev(() => { t0 -= 55000; tick(); });                // előreugrás az első lépés végéhez
  await wait(12000);
  const b = await sig();
  await shot('sorozat', `Sorozat, ${b.el}. mp: ${b.cur}`);
  await ev(() => stop());
  return { ok: /in2/.test(a.cur) && b.cur === 'in5 out5', info: `eleje: ${a.cur} („${a.ph}”); ${b.el}. mp: ${b.cur} („${b.ph}”)` };
});
await check('háttérhangok: mind a 8 szól; a 6 természethang felvételről, letöltés után', async () => {
  await fresh({ mode: 'calm', dur: 5, tone: false, bell: false });
  await page.click('#ringBtn'); await wait(1000);
  const r = await ev(async () => {
    const out = [], an = ac.createAnalyser(), buf = new Float32Array(2048), sleep = ms => new Promise(x => setTimeout(x, ms));
    an.fftSize = 2048;
    for (const k of Object.keys(AMB).filter(k => k !== 'off')) {
      st.amb = k; const t = performance.now(); ambStart(.05); ambOut().connect(an);
      if (AMBREC[k]) for (let n = 0; n < 60 && !abuf[k]; n++) await sleep(250);   // a felvétel letöltése és dekódolása
      const ms = Math.round(performance.now() - t);
      await sleep(AMBREC[k] ? 2600 : 900);                                      // átúsztatás a felvételre
      an.getFloatTimeDomainData(buf); let e = 0; for (const x of buf) e += x * x;
      out.push([k, Math.sqrt(e / buf.length), AMBREC[k] ? (abuf[k] ? `felvétel ${(abuf[k].duration).toFixed(0)} mp, ${ms} ms alatt` : 'NINCS felvétel') : 'szintetizált']);
      ambStop(.05); await sleep(300);
    }
    ambOut().disconnect(an); st.amb = 'off'; return out;
  });
  await ev(() => stop());
  const bad = r.filter(x => !(x[1] > 1e-4) || /NINCS/.test(x[2]));
  return { ok: r.length >= 8 && !bad.length, info: r.map(x => `${x[0]} ${(20 * Math.log10(x[1] || 1e-9)).toFixed(0)} dB (${x[2]})`).join(', ') };
});

// ---------------------------------------------------------------- az 1.4 újdonságai a telefonon
group = 'Újdonságok';
await check('saját ritmus fél másodpercekkel: a váltás 4,5 mp-nél, valós időben', async () => {
  await fresh({ mode: 'own', shown: ['own', 'box', 'calm'], customs: [{ id: 'own', n: '', p: [4.5, 0, 5.5, 0] }] });
  await ev(() => { window.chg = []; new MutationObserver(() => window.chg.push([ph.textContent, Math.round(performance.now() - t0)])).observe(ph, { childList: true, characterData: true, subtree: true }); });
  await page.click('#ringBtn'); await wait(10600);
  const c = await ev(() => window.chg.filter(x => run && x[1] > 100).slice(0, 2));
  await ev(() => stop());
  return { ok: c.length === 2 && Math.abs(c[0][1] - 4500) < 120 && Math.abs(c[1][1] - 10000) < 120, info: c.map(x => `„${x[0]}” ${(x[1] / 1000).toFixed(2)} mp`).join(', ') };
});
await check('visszatartás-teszt: indítás, megállítás, eredmény és grafikon a naplóban', async () => {
  await fresh({ lang: 'hu', tests: [{ t: Date.now() - 864e5, k: 'bolt', s: 12 }] });
  await ev(() => { openSheet(); openPage('journal'); }); await wait(500);
  await page.click('#testBox .tgo[data-k="bolt"]'); await wait(700);
  await shot('teszt_kezdes', 'Visszatartás-teszt: utasítás a kör alatt');
  await page.click('#ringBtn'); await wait(6200);
  await shot('teszt_tartas', 'Visszatartás-teszt: az idő fut');
  await page.click('#ringBtn'); await wait(500);
  const r = await ev(() => ({ ph: ph.textContent, ct: ct.textContent, sub: sub.textContent, n: st.tests.length, s: st.tests[st.tests.length - 1].s }));
  await shot('teszt_eredmeny', `Eredmény: ${r.ct} mp, „${r.sub}”`);
  await page.click('#ringBtn'); await wait(400);
  await ev(() => { openSheet(); openPage('journal'); }); await wait(500);
  await page.locator('#testBox').scrollIntoViewIfNeeded(); await wait(300);
  const chart = await ev(() => !!document.querySelector('#testBox svg.tchart'));
  await shot('teszt_grafikon', 'Napló: visszatartás-teszt grafikonnal');
  await ev(() => closeSheet());
  return { ok: r.n === 2 && r.s >= 6 && r.s < 7.5 && chart, info: `„${r.ph}” ${r.ct} mp (${r.s}), „${r.sub}”; grafikon: ${chart}` };
});
await check('hangulat előtte és utána: a kérdés a kör fölött, az eredmény a naplóban', async () => {
  await fresh({ lang: 'hu', mode: 'calm', dur: 3, mood: true });
  await page.click('#ringBtn'); await wait(600);
  await shot('hangulat_elotte', 'Hangulat a gyakorlás előtt');
  await page.click('#moodFaces button[data-v="2"]'); await wait(6500);
  await page.click('#ringBtn'); await wait(700);              // leállítás 6 mp után
  const q1 = await ev(() => !document.getElementById('mood').hidden && document.getElementById('moodQ').textContent);
  await page.click('#moodFaces button[data-v="4"]'); await wait(300);
  const m = await ev(() => st.hist[st.hist.length - 1].m);
  return { ok: q1 === 'És most?' && m && m.join() === '2,4', info: `utána kérdez: „${q1}”; mentve: ${JSON.stringify(m)}` };
});
await check('programok: a mai nap indítása, a beállítások nem változnak', async () => {
  await fresh({ lang: 'hu', mode: 'box', dur: 10 });
  await ev(() => { openSheet(); openPage('programs'); }); await wait(400);
  await page.click('#progList .prog:nth-child(2) button[data-a="start"]'); await wait(300);
  await shot('programok', 'Programok: a 14 napos jobb alvás elindítva');
  await page.click('#progList button[data-a="go"]'); await wait(1500);
  const r = await ev(() => ({ run, rm: runMode, min: po && po.min, meta: meta.textContent, mode: st.mode, dur: st.dur }));
  await shot('program_nap', `Programnap: ${r.meta}`);
  await ev(() => stop());
  return { ok: r.run && r.rm === 'calm' && r.min === 4 && r.mode === 'box' && r.dur === 10, info: `fut: ${r.rm}, ${r.min} perc; „${r.meta}”; a beállítás marad: ${r.mode}, ${r.dur} perc` };
});
await check('részletes leírás: betöltődik a telefonon, a Kipróbálom elindítja', async () => {
  await fresh({ lang: 'hu' });
  await ev(() => { openSheet(); openPage('rhythms'); }); await wait(400);
  await page.click('[data-info="nadi"]');
  await page.waitForFunction(() => document.querySelectorAll('#infoTxt h4').length === 4, null, { timeout: 10000 });
  await shot('leiras', 'Részletes leírás: váltott orrlyukú légzés');
  const t = await ev(() => document.getElementById('infoTxt').innerText.length);
  await page.click('#infoTry'); await wait(1200);
  const r = await ev(() => [run, st.mode]);
  await ev(() => stop());
  return { ok: t > 300 && r[0] && r[1] === 'nadi', info: `${t} karakter; Kipróbálom → fut: ${r[0]}, ${r[1]}` };
});
await check('Tabata: félidő és „még 5 mp” a felvett hanggal, gyakorlatonkénti idő', async () => {
  await fresh({ lang: 'hu', mode: 'tabata', speak: true, vk: 'f', tabs: [{ id: 't1', n: 'Teszt', work: 20, rest: 10, rounds: 2, sets: 1, prep: 0, brk: 60, wu: 0, cd: 0, col: {}, snd: {},
    ex: 'Guggolás 12/4\nFekvőtámasz', half: true, warn: 5, bpm: 0 }], tabSel: 't1' });
  await page.waitForFunction(() => !!vbuf, null, { timeout: 20000 });
  await ev(() => { window.rec = []; const o = playRec; playRec = k => { window.rec.push([k.join('+'), Math.round(performance.now() - t0)]); return o(k); }; });
  await page.click('#ringBtn'); await wait(16500);
  const r = await ev(() => ({ rec: window.rec, plan: tabataPlan().map(p => p[0] + p[1]).join(' ') }));
  await ev(() => stop());
  const has = (k, t) => r.rec.some(x => x[0] === k && Math.abs(x[1] - t) < 400);
  return { ok: r.plan === 'work12 rest4 work20' && has('half', 6000) && has('w5', 7000) && has('half', 26000) === false, info: `terv: ${r.plan}; bemondások: ${r.rec.map(x => `${x[0]} @${(x[1] / 1000).toFixed(1)}`).join(', ')}` };
});

// ---------------------------------------------------------------- 7. Tabata
group = 'Tabata';
await check('saját szín, koppintás = szünet, ⏭, „következő” médiagomb, hosszú nyomás = leállítás', async () => {
  await fresh(tabState);
  await page.click('#ringBtn'); await wait(1200);
  const bg = await ev(() => getComputedStyle(document.body).backgroundColor);
  await shot('tabata_sajat_szin', 'Tabata saját (lila) munkaszínnel');
  await page.click('#ringBtn'); await wait(400);
  const p1 = await ev(() => paused);
  await page.click('#ringBtn'); await wait(400);
  await page.mouse.click(8, 8); await wait(300); await page.click('#skipBtn'); await wait(400);
  const k1 = await ev(() => document.documentElement.dataset.tb);
  await key('KEYCODE_MEDIA_NEXT'); await wait(800);
  const k2 = await ev(() => document.documentElement.dataset.tb);
  await touchHold('#ringBtn', 1200); await wait(500);
  const r = await ev(() => run);
  return { ok: bg === 'rgb(123, 79, 208)' && p1 && k1 === 'rest' && k2 === 'work' && !r, info: `háttér ${bg}; koppintás → szünet: ${p1}; ⏭ → ${k1}; médiagomb „következő” → ${k2}; hosszú nyomás → leállt: ${!r}` };
});
await check('fekvő nézet Tabatánál (a telefon elforgatva)', async () => {
  await fresh(tabState);
  await sh('settings put system user_rotation 1'); await wait(2500);
  await page.click('#ringBtn'); await wait(1500);
  const r = await ev(() => ({ w: innerWidth, h: innerHeight, o: screen.orientation.type, ct: Math.round(ct.getBoundingClientRect().height), ph: Math.round(ph.getBoundingClientRect().x), ctx: Math.round(ct.getBoundingClientRect().right) }));
  await shot('tabata_fekve', 'Tabata fekvő telefonon');
  await ev(() => stop());
  return { ok: r.w > r.h && r.ct > r.h * .5 && r.ph >= r.ctx, info: `${r.w}×${r.h}, ${r.o}; a szám ${r.ct} px magas, a felirat mellette` };
});
await check('légzés fekve tartott telefonon: álló helyzetbe zár (teljes képernyőn)', async () => {
  await fresh({ mode: 'box', full: true });
  await wait(1500);
  await page.click('#ringBtn'); await wait(2500);
  const r = await ev(() => ({ o: screen.orientation.type, fs: !!document.fullscreenElement, w: innerWidth, h: innerHeight }));
  await shot('legzes_fekvo_telefonon', 'Légzés fekve tartott telefonon: álló helyzetben marad');
  await ev(() => stop()); await wait(800);
  const after = await ev(() => screen.orientation.type);
  await sh('settings put system user_rotation 0'); await wait(1500);
  return { ok: r.o.startsWith('portrait'), warn: !r.fs, info: `gyakorlás közben: ${r.o} (${r.w}×${r.h}, teljes képernyő: ${r.fs}); leállítás után: ${after}` };
});

// ---------------------------------------------------------------- 8. saját zene mellett
group = 'Zene';
await check('saját zene mellett a másik lap zenéje szól tovább; nélküle megáll', async () => {
  const music = await ctx.newPage();
  await music.goto('about:blank');
  await music.evaluate(() => {
    const sr = 22050, n = sr * 60, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let k = 0; k < n; k++) v.setInt16(44 + k * 2, Math.sin(2 * Math.PI * 330 * k / sr) * 3000, true);
    window.mus = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); mus.loop = true;
    const btn = document.createElement('button'); btn.textContent = 'zene'; btn.style.cssText = 'font-size:40px;padding:40px'; btn.onclick = () => mus.play(); document.body.append(btn);
  });
  await music.click('button'); await wait(1500);
  const m0 = await music.evaluate(() => !mus.paused);
  await page.bringToFront(); await wait(2500);
  const m1 = await music.evaluate(() => !mus.paused);
  await fresh({ ...tabState, music: true });
  const t0 = await devNow();
  await page.click('#ringBtn'); await wait(7000);       // munka eleje, 3-2-1, pihenő eleje
  const m2 = await music.evaluate(() => !mus.paused);
  // a Chrome hangfókusz-kérései: req=3 = GAIN_TRANSIENT_MAY_DUCK (a másik app halkít), req=1 = GAIN (a másik app megáll)
  const reqs = (await sh('dumpsys audio | grep "requestAudioFocus() from" | grep com.android.chrome')).split('\n').filter(l => (l.match(/^\d\d-\d\d \d\d:\d\d:\d\d/) || [''])[0] >= t0);
  const duck = reqs.filter(l => / req=3 /.test(l)).length, gain = reqs.filter(l => / req=1 /.test(l)).length;
  await ev(() => stop()); await wait(1000);
  const m3 = await music.evaluate(() => !mus.paused);
  await fresh({ ...tabState, music: false });
  await page.click('#ringBtn'); await wait(3000);
  const m4 = await music.evaluate(() => !mus.paused);
  await ev(() => stop());
  await music.evaluate(() => mus.pause()); await music.close(); await page.bringToFront();
  return { ok: m0 && m1 && m2 && m3 && !m4 && duck > 0 && !gain, info: `zene szól: ${m0}; háttérlapon is: ${m1}; Tabata „saját zene mellett” közben a zene szól: ${m2} (hangfókusz-kérés: ${duck}× halkítás, ${gain}× kizárólagos); utána: ${m3}; Tabata enélkül → a zene ${m4 ? 'szól tovább' : 'megállt'}` };
});

// ---------------------------------------------------------------- 9. megosztás
group = 'Megosztás';
await check('az app megosztása: az Android megosztó lapja nyílik meg', async () => {
  await fresh();
  await page.click('#setBtn'); await page.click('#shareBtn'); await wait(2500);
  const xml = await uiText();
  await shot('megosztas', 'Az Android megosztó lapja');
  const ok = /package="com\.android\.intentresolver"|chooser/i.test(xml);
  await key('KEYCODE_BACK'); await wait(800);
  return { ok, info: ok ? 'megosztó lap megjelent' : 'nem látszik megosztó lap' };
});
await check('edzés megosztása linkkel, megnyitáskor mentés', async () => {
  await fresh(tabState);
  // a link a nyilvános oldalra mutat; itt ugyanazt a ?w= részt a tesztelt címen nyitjuk meg
  const link = await ev(() => wLink(Object.assign({}, tw(), { n: 'Közös', work: 45 })));
  await page.goto(SITE + link.slice(link.indexOf('?')));
  await page.waitForFunction(() => typeof st === 'object' && st.tabs.length === 2, null, { timeout: 8000 });
  const r = await ev(() => ({ n: tw().n, work: tw().work, search: location.search }));
  return { ok: r.n === 'Közös' && r.work === 45 && r.search === '' && link.startsWith('https://vmynick.github.io/relaxring/?w='), info: `link: ${link.slice(0, 60)}…; megnyitva mentve: „${r.n}”, munka ${r.work} mp` };
});

// ---------------------------------------------------------------- 10. mentés
group = 'Mentés';
await check('mentés fájlba (Letöltések) és visszatöltés', async () => {
  await fresh({ color: 'tenger', log: { '2026-01-01': 300 }, sessions: 2 });
  await sh('rm -f /sdcard/Download/relaxring-*.json');
  await page.click('#setBtn'); await page.click('.navi[data-go="backup"]'); await page.click('#expBtn'); await wait(2500);
  const again = await uiTap(/^Download( again)?$/i);    // a Chrome rákérdez, ha egy korábbi futásból már volt ilyen nevű fájl
  await wait(again ? 3000 : 1500);
  await shot('letoltes', 'Mentés: a fájl a Letöltésekbe került');
  // a Chrome a letöltés végén még átnevezheti a fájlt: addig próbáljuk, amíg egész JSON-t olvasunk
  let ls = [], restored = false, text = '', d = null;
  for (let k = 0; k < 10 && !d; k++) {
    ls = (await sh('ls /sdcard/Download/')).split('\n').map(f => f.trim().replace(/\\ /g, ' ')).filter(f => /^relaxring-.*\.json$/.test(f));
    text = ls.length ? await sh('cat /sdcard/Download/relaxring-*.json') : '';
    try { d = JSON.parse(text); } catch { await wait(1000); }
  }
  if (d) {
    d.st.color = 'ko';
    await fresh();
    await ev(json => { const f = new File([json], 'mentes.json', { type: 'application/json' }), dt = new DataTransfer(); dt.items.add(f);
      const i = document.getElementById('impFile'); i.files = dt.files; i.dispatchEvent(new Event('change')); }, JSON.stringify(d));
    await page.waitForFunction(() => /restored/.test(document.getElementById('ntext').textContent), null, { timeout: 8000 });
    restored = await ev(() => st.color === 'ko' && st.log['2026-01-01'] === 300);
  }
  return { ok: ls.length > 0 && restored, info: `fájl: ${ls.join(', ') || 'nincs'} (${text.length} bájt); visszatöltve: ${restored}` };
});

// ---------------------------------------------------------------- 11. offline
group = 'Offline';
await check('repülőgép üzemmódban is elindul, a felvett hang is szól', async () => {
  await fresh({ lang: 'hu', vk: 'f', speak: true });
  await page.waitForFunction(() => !!vbuf, null, { timeout: 20000 });
  await sh('cmd connectivity airplane-mode enable'); down = true; await wait(3000);
  let r;
  try {
    await page.reload();
    await page.waitForFunction(() => typeof st === 'object', null, { timeout: 15000 });
    await page.waitForFunction(() => !!vbuf, null, { timeout: 15000 }).catch(() => {});
    await page.click('#ringBtn'); await wait(1500);
    r = await ev(() => ({ ver: APP_VER, run, vbuf: !!vbuf, online: navigator.onLine }));
    await shot('offline', 'Repülőgép üzemmódban');
    await ev(() => stop());
  } finally { down = false; await sh('cmd connectivity airplane-mode disable'); await wait(3000); }
  return { ok: r.run && r.vbuf && !r.online, info: `offline: ${!r.online}; ${r.ver} elindult; felvett hang a gyorsítótárból: ${r.vbuf}` };
});

// ---------------------------------------------------------------- 12. telepítés
group = 'Telepítés';
let installed = false;
await check('telepítés appként: Chrome párbeszéd, ikon a kezdőképernyőn', async () => {
  await fresh({ noInstall: false });
  await page.waitForFunction(() => !!installEv, null, { timeout: 30000 });
  await page.click('#nact'); await wait(2500);
  await shot('telepites_parbeszed', 'Chrome telepítési párbeszéd');
  const t = await uiTap(/^(Install|Telepítés)$/i, 3);
  await wait(2500);
  const pin = await uiTap(/^(Add to home screen|Add automatically|Add|Hozzáadás.*)$/i, 8);   // Play Áruház nélkül: parancsikon, a kezdőképernyő megerősítteti
  await wait(4000);
  const webapk = (await sh('pm list packages | grep -i webapk')).trim().replace('package:', '');
  await key('KEYCODE_HOME'); await wait(2000);
  const icon = await uiFind(/^RelaxRing/);
  await shot('kezdokepernyo', 'Kezdőképernyő a telepítés után');
  installed = !!icon;
  return { ok: !!t && installed, info: `Chrome: „${t}”; kezdőképernyő: „${pin || '–'}”; WebAPK: ${webapk || 'nincs (Play Áruház nélkül nem készülhet)'}; ikon: ${icon ? `„${icon[0]}”` : 'nincs'}` };
});
await check('a telepített app: teljes képernyő, Kilépés gomb, álló helyzet', async () => {
  if (!installed) return { ok: false, info: 'nincs ikon, a telepített mód nem tesztelhető' };
  const icon = await uiFind(/^RelaxRing/);
  const pp = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
  await sh(`input tap ${icon[1]} ${icon[2]}`);
  let app = await pp;
  if (!app) app = ctx.pages().find(p => p !== page && p.url().startsWith(SITE));
  if (!app) return { ok: false, info: 'az ikonról indított app nem érhető el a Chrome-ból' };
  await app.waitForFunction(() => typeof st === 'object', null, { timeout: 15000 });
  await wait(1500);
  const r = await app.evaluate(() => ({ fs: matchMedia('(display-mode: fullscreen)').matches, sa: matchMedia('(display-mode: standalone)').matches, exit: !document.getElementById('exitBtn').hidden, w: innerWidth, h: innerHeight }));
  await shot('telepitett_app', 'A telepített app (teljes képernyő, jobbra lent a Kilépés)');
  await sh('settings put system user_rotation 1'); await wait(2500);
  await app.click('#ringBtn'); await wait(2500);
  const o = await app.evaluate(() => ({ o: screen.orientation.type, run }));
  await shot('telepitett_fekve', 'A telepített app fekvő telefonon, gyakorlás közben');
  await app.evaluate(() => stop());
  await sh('settings put system user_rotation 0'); await wait(2000);
  const act = async () => ((await sh('dumpsys activity activities')).match(/topResumedActivity=.*?\{[^}]*?\s(\S+\/\S+)/) || [])[1] || '?';
  const a0 = await act();
  await app.click('#exitBtn'); await wait(300); await app.click('#exitBtn'); await wait(3000);
  const a1 = await act();
  return { ok: (r.fs || r.sa) && r.exit && o.o.startsWith('portrait') && a1 !== a0, warn: !r.fs,
    info: `megjelenés: ${r.fs ? 'teljes képernyő' : r.sa ? 'önálló ablak' : 'böngésző'} (${r.w}×${r.h}); Kilépés gomb: ${r.exit}; fekvő telefonon gyakorlás közben: ${o.o}; előtérben: ${a0} → kilépés után: ${a1}` };
});

// ---------------------------------------------------------------- vége, jelentés
await sh('settings put system user_rotation 0; svc power stayon false; cmd uimode night no');
const when = new Date();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ info, version: VER, when: when.toISOString(), results, shots }, null, 1));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nOk = results.filter(r => r.ok && !r.warn).length, nWarn = results.filter(r => r.ok && r.warn).length, nBad = results.filter(r => !r.ok).length;
fs.writeFileSync(path.join(OUT, 'jelentes.html'), `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emulátoros teszt</title><style>
:root{--bg:#f4f6f5;--fg:#16302a;--muted:#5b6e68;--card:#fff;--line:#d9e2df;--ok:#1f8a4c;--warn:#b7791f;--bad:#c53030}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1715;--fg:#e4eeea;--muted:#9bb0a9;--card:#18231f;--line:#2a3833;--ok:#4cc27f;--warn:#e0a948;--bad:#f07171}}
:root[data-theme="dark"]{--bg:#0f1715;--fg:#e4eeea;--muted:#9bb0a9;--card:#18231f;--line:#2a3833;--ok:#4cc27f;--warn:#e0a948;--bad:#f07171}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{margin:0 0 4px;font-size:28px}.sub{color:var(--muted);margin:0 0 20px}.sum{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.sum div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 16px;font-weight:700}.sum b{font-size:24px;margin-right:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--line)}td,th{padding:8px 10px;border-top:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-top:0}.s{font-weight:800;white-space:nowrap}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
td.i{color:var(--muted);font-size:14px;overflow-wrap:anywhere}h2{margin:28px 0 12px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px}figure img{width:100%;border-radius:6px;display:block}figcaption{font-size:13px;color:var(--muted);margin-top:6px}
@media (max-width:640px){.g1{display:none}}</style></head><body><main>
<h1>RelaxRing+ ${esc(VER)} – emulátoros teszt</h1><p class="sub">${esc(info.model)} · Android ${esc(info.android)} · Chrome ${esc(info.chrome)} · ${esc(SITE)} · ${when.toLocaleString('hu-HU')}</p>
<div class="sum"><div class="ok"><b>${nOk}</b>rendben</div><div class="warn"><b>${nWarn}</b>figyelmeztetés</div><div class="bad"><b>${nBad}</b>hiba</div></div>
<table><tr><th class="g1">Terület</th><th>Ellenőrzés</th><th>Eredmény</th></tr>
${results.map(r => `<tr><td class="g1">${esc(r.group)}</td><td><b>${esc(r.name)}</b><br><span class="s ${r.ok ? (r.warn ? 'warn' : 'ok') : 'bad'}">${r.ok ? (r.warn ? 'FIGYELMEZTETÉS' : 'RENDBEN') : 'HIBA'}</span> <small>${(r.ms / 1000).toFixed(1)} mp</small></td><td class="i">${esc(r.info)}</td></tr>`).join('\n')}
</table><h2>Képernyőképek</h2><div class="g">${shots.map(([f, c]) => `<figure><a href="${f}"><img src="${f}" alt="" loading="lazy"></a><figcaption>${esc(c)}</figcaption></figure>`).join('')}</div>
</main></body></html>`);
console.log(`\n${nOk + nWarn}/${results.length} rendben (${nWarn} figyelmeztetéssel)` + (nBad ? `; hibás: ${results.filter(r => !r.ok).map(r => r.group + ' / ' + r.name).join('; ')}` : ''));
console.log('Jelentés:', path.join(OUT, 'jelentes.html'));
await ctx.close(); await dev.close();
if (server) { server.close(); try { adb('reverse', '--remove', `tcp:${PORT}`); } catch {} fs.rmSync(oldDir, { recursive: true, force: true }); }
