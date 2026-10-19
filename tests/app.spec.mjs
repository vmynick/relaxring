// RelaxRing böngészős tesztek. Minden teszt tiszta böngészőprofillal indul; az app állapota a localStorage
// 'legzo' kulcsában van, ezt a seed() tölti fel az első betöltés előtt. Az idő a Playwright órájával léptethető.
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'JavaScript-hiba az oldalon').toEqual([]));

const seed = (page, state = {}) => page.addInitScript(s => {
  if (!localStorage.getItem('legzo')) localStorage.setItem('legzo', JSON.stringify(s));
}, { lang: 'hu', hint2: 3, newsSeen: 'teszt', ...state });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('legzo')));
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const openSettings = async (page, sub) => {
  await page.locator('#setBtn').click();
  if (sub) await page.locator(`.navi[data-go="${sub}"]`).click();
};

test('minden nyelven hiba nélkül betölt', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const langs = await page.evaluate(() => Object.entries(T).map(([l, x]) => [l, x.title, x.start]));
  expect(langs.length).toBe(20);
  for (const [lang, title, start] of langs) {
    await page.evaluate(l => { const s = JSON.parse(localStorage.getItem('legzo')); s.lang = l; localStorage.setItem('legzo', JSON.stringify(s)); }, lang);
    await page.reload();
    await expect(page).toHaveTitle(title);
    await expect(page.locator('#ph')).toHaveText(start);
    await expect(page.locator('#modes button')).toHaveCount(3);
  }
});

test('minden nyelvben ugyanazok a szövegek vannak meg', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const diff = await page.evaluate(() => {
    const ref = T.en, out = {};
    for (const l in T) {
      const miss = Object.keys(ref).filter(k => !(k in T[l]) || typeof T[l][k] !== typeof ref[k]);
      const extra = Object.keys(T[l]).filter(k => !(k in ref));
      if (T[l].help.length !== ref.help.length) miss.push('help.length');
      if (miss.length || extra.length) out[l] = { miss, extra };
    }
    return out;
  });
  expect(diff).toEqual({});
  // a nyelvválasztóban a nyelvek saját nevükön
  expect(await page.evaluate(() => Object.values(T).map(x => x.name))).toEqual(['Magyar', 'English', 'Deutsch', 'Español', 'Français', 'Italiano', 'Polski',
    'Português', 'Nederlands', 'Svenska', 'Dansk', 'Norsk', 'Suomi', 'Čeština', 'Slovenčina', 'Română', 'Hrvatski', 'Українська', 'Русский', 'Türkçe']);
  // egy nyelvi blokkban egy kulcs csak egyszer szerepelhet (a későbbi csendben felülírná az elsőt)
  const src = await (await page.request.get('/index.html')).text();
  const dict = src.slice(src.indexOf('const T={'), src.indexOf('\n};', src.indexOf('const T={')));
  for (const block of dict.split(/\n {2}(?=[a-z]{2}:\{name:)/).slice(1)) {
    const keys = [...block.matchAll(/(?<=[{,]\s*)([A-Za-z_][\w]*):(?=['`(\[a-z])/g)].map(m => m[1]);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup, block.slice(0, 2)).toEqual([]);
  }
  // ebben a sorrendben jelennek meg a nyelvválasztóban
  expect(await page.evaluate(() => Object.keys(T))).toEqual(['hu', 'en', 'de', 'es', 'fr', 'it', 'pl', 'pt', 'nl', 'sv', 'da', 'nb', 'fi', 'cs', 'sk', 'ro', 'hr', 'uk', 'ru', 'tr']);
});

test('első indításkor a telefon nyelvét választja', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#ph')).toHaveText('Démarrer');
  await ctx.close();
});

test('légzés: szakaszok, befejezés és naplózás', async ({ page }) => {
  await page.clock.install();
  await seed(page, { dur: 1, mode: 'box' });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  await page.clock.runFor(4_100);
  await expect(page.locator('#ph')).toHaveText('Tartás');
  await page.clock.runFor(62_000);
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  const s = await stored(page);
  expect(s.sessions).toBe(1);
  expect(s.log[dayKey(new Date(await page.evaluate(() => Date.now())))]).toBeGreaterThanOrEqual(60);
});

test('szünet és folytatás, a lezárási vezérlő adatai', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'calm' });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await page.clock.runFor(1_100);
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe('RelaxRing+ – Nyugtató');
  // a felirat a szakaszváltáskor nem frissül (egyes telefonokon minden frissítés értesítési hangot ad)
  await page.evaluate(() => { window.metaAtStart = navigator.mediaSession.metadata; });
  await page.clock.runFor(4_000);                    // belégzés → kilégzés
  expect(await page.evaluate(() => ph.textContent)).toBe('Kilégzés');
  expect(await page.evaluate(() => navigator.mediaSession.metadata === window.metaAtStart)).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  // a háttérben futáshoz kell egy önállóan szóló, 5 mp-nél hosszabb, mérhető szintű <audio> (nem a Web Audióba kötve)
  const keepAlive = await page.evaluate(async () => {
    const buf = await (await fetch(media.src)).arrayBuffer(), v = new DataView(buf);
    let peak = 0; for (let k = 44; k < buf.byteLength; k += 2) peak = Math.max(peak, Math.abs(v.getInt16(k, true)));
    return { playing: !media.paused, loop: media.loop, secs: (buf.byteLength - 44) / 2 / v.getUint32(24, true), peak };
  });
  expect(keepAlive).toEqual({ playing: true, loop: true, secs: 60, peak: 66 });
  await page.evaluate(() => pause());                // mint a lezárási képernyő Szünet gombja
  await expect(page.locator('#ph')).toHaveText('Szünet');
  const before = await page.evaluate(() => elapsed);
  await page.clock.runFor(10_000);
  expect(await page.evaluate(() => elapsed)).toBe(before);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  await page.locator('#ringBtn').click();            // koppintás a körre: folytatás
  await page.clock.runFor(3_500);
  expect(await page.evaluate(() => elapsed)).toBeGreaterThanOrEqual(before + 3);
  await page.locator('#ringBtn').click();            // újabb koppintás: leállítás
  expect(await page.evaluate(() => run)).toBe(false);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('none');
});

// Felolvasó helyett egy próbababa: feljegyzi, mit és mikor mondana, és 300 ms múlva jelzi, hogy megszólalt
const fakeVoice = page => page.addInitScript(() => {
  window.said = [];
  const synth = { speaking: false, pending: false, cancel() {}, addEventListener() {},
    getVoices: () => ['hu-HU', 'en-US', 'de-DE', 'es-US', 'fr-FR', 'it-IT', 'pl-PL'].map(lang => ({ lang, name: lang })),
    speak(u) { window.said.push([u.text, u.lang, Math.round(performance.now())]); setTimeout(() => u.onstart && u.onstart(), 300); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
});

test('hangos vezetés: a következő szakasz neve a felolvasó késésével előbb indul', async ({ page }) => {
  await page.clock.install();
  await fakeVoice(page);
  await seed(page, { mode: 'box', speak: true, ttsLag: 300 });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await page.clock.runFor(300);                      // az első szóra vár: a kör akkor indul, amikor a hang megszólal
  const start = await page.evaluate(() => t0);
  await page.clock.runFor(3_800);
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  let said = await page.evaluate(() => window.said);
  expect(said.map(s => s[0])).toEqual(['Belégzés', 'Tartás']);   // a Tartás már elindult, a felirat még nem váltott
  expect(said[1][2] - start).toBeGreaterThanOrEqual(3_690);
  expect(said[1][2] - start).toBeLessThanOrEqual(3_710);
  await page.clock.runFor(300);
  await expect(page.locator('#ph')).toHaveText('Tartás');
  await page.clock.runFor(1_000);
  said = await page.evaluate(() => window.said);
  expect(said.map(s => s[0])).toEqual(['Belégzés', 'Tartás']);   // a váltáskor nem mondja újra
  expect(await page.evaluate(() => st.ttsLag)).toBe(300);         // a mért késés
});

test('hangos vezetés: a kör az első szó megszólalásakor indul, legfeljebb 2 mp várakozással', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T12:00:00') });
  await fakeVoice(page);
  await seed(page, { mode: 'box', speak: true, ttsLag: 300 });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-15T12:00:30'));   // az óra áll: csak runFor léptet (terhelés alatt se késsen)
  await page.evaluate(() => ringBtn.addEventListener('click', () => { window.tc = performance.now(); }, true));   // a koppintás pillanata
  await page.locator('#ringBtn').click();
  await page.clock.runFor(200);
  expect(await page.evaluate(() => ({ run, elapsed, ph: ph.textContent, hold: !!holdFn }))).toEqual({ run: true, elapsed: 0, ph: 'Belégzés', hold: true });
  await page.clock.runFor(150);                      // a próbababa 300 ms-nál szólal meg
  expect(await page.evaluate(() => holdFn)).toBe(null);
  expect(await page.evaluate(() => t0 - tc)).toBeGreaterThanOrEqual(295);
  expect(await page.evaluate(() => t0 - tc)).toBeLessThanOrEqual(310);
  expect(await page.evaluate(() => st.ttsLag)).toBe(300);         // a hideg indulás nem számít bele
  await page.evaluate(() => { stop(); speechSynthesis.speak = u => window.said.push([u.text]); });   // a hang nem szólal meg
  await page.locator('#ringBtn').click();
  await page.clock.runFor(2_100);
  expect(await page.evaluate(() => t0 - tc)).toBeGreaterThanOrEqual(1_995);
  expect(await page.evaluate(() => t0 - tc)).toBeLessThanOrEqual(2_010);
  await page.clock.runFor(4_000);
  await expect(page.locator('#ph')).toHaveText('Tartás');
});

test('szünet után is pontosan a másodpercre vált, és újra bemondja a szakaszt', async ({ page }) => {
  await page.clock.install();
  await fakeVoice(page);
  await seed(page, { mode: 'box', speak: true, ttsLag: 300 });
  await page.goto('/');
  await page.evaluate(() => {                        // minden váltásnál: hány ms-mal az egész másodperc után történt
    window.late = [];
    new MutationObserver(() => { if (run && !paused) window.late.push([ph.textContent, Math.round(performance.now() - t0 - elapsed * 1000)]); })
      .observe(ph, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('#ringBtn').click();
  await page.clock.runFor(4_100);                    // 300 ms az első szóig, utána 3,8 mp: a Tartás már elhangzott
  await page.evaluate(() => pause());
  await page.clock.runFor(5_130);                    // nem kerek szünet: a 250 ms-os ütem elcsúszik hozzá képest
  await page.locator('#ringBtn').click();
  await page.clock.runFor(1_000);
  const said = await page.evaluate(() => window.said.map(s => s[0]));
  expect(said).toEqual(['Belégzés', 'Tartás', 'Tartás']);   // a szünet törölte, a folytatás után újra elhangzik
  const late = await page.evaluate(() => window.late);
  const hold = late.filter(([t]) => t === 'Tartás').pop();
  expect(hold[1]).toBeLessThan(10);
});

test('ritmuskönyvtár: csoportok, leírások, legalább 15 beépített technika', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'rhythms');
  for (const g of ['Nyugalom', 'Alvás', 'Fókusz', 'Energia', 'Saját ritmusok', 'Sorozatok']) await expect(page.locator('#rhOpts h3', { hasText: g })).toBeVisible();
  expect(await page.evaluate(() => BIDS.length)).toBeGreaterThanOrEqual(15);
  await expect(page.locator('.rrow[data-id="nadi"] small')).toContainText('orrlyuk');
});

test('ciklusos légzés: 30 mély légzés, visszatartás koppintásig, a napló megőrzi', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'whm', shown: ['whm', 'box', 'calm'], whr: 1, hvOk: true });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ph')).toHaveText('Lélegezz');
  await expect(page.locator('#ct')).toHaveText('30');
  await page.clock.runFor(3_100);
  await expect(page.locator('#ct')).toHaveText('29');
  await page.clock.runFor(87_000);
  await expect(page.locator('#ph')).toHaveText('Tartsd kint');
  await expect(page.locator('#sub')).toHaveText('koppints, ha levegő kell');
  await page.clock.runFor(42_000);
  await expect(page.locator('#ct')).toHaveText('42');
  await page.locator('#ringBtn').click();            // levegő kell: vége a visszatartásnak
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  await page.clock.runFor(20_000);
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  const h = (await stored(page)).hist.pop();
  expect(h.r).toBe('whm');
  expect(h.ret).toEqual([42]);
});

test('hiperventilációs gyakorlat előtt egyszer figyelmeztet', async ({ page }) => {
  await seed(page, { mode: 'kapal', shown: ['kapal', 'box', 'calm'] });
  await page.goto('/');
  page.once('dialog', d => d.dismiss());
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => run)).toBe(false);
  page.once('dialog', d => d.accept());
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => run)).toBe(true);
  expect((await stored(page)).hvOk).toBe(true);
});

test('Kapalbhati: másodpercenként egy kifújás, a kör megrándul', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'kapal', shown: ['kapal', 'box', 'calm'], hvOk: true });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ph')).toHaveText('Kifújás');
  await expect(page.locator('#ct')).toHaveText('30');
  await page.clock.runFor(1_100);
  await expect(page.locator('#ct')).toHaveText('29');
  await expect(page.locator('#r1')).toHaveClass(/pulse/);
});

test('váltott orrlyuk: a kör alatt és a bemondásban is az oldal', async ({ page }) => {
  await page.clock.install();
  await fakeVoice(page);
  await seed(page, { mode: 'nadi', shown: ['nadi', 'box', 'calm'], speak: true });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#sub')).toHaveText('bal orrlyukon');
  await expect(page.locator('#sub')).toBeVisible();
  await page.clock.runFor(4_400);                    // 300 ms: a kör az első szóval indul
  await expect(page.locator('#sub')).toHaveText('jobb orrlyukon');
  const said = await page.evaluate(() => window.said.map(s => s[0]));
  expect(said.slice(0, 2)).toEqual(['Belégzés, bal orrlyukon', 'Kilégzés, jobb orrlyukon']);
});

test('saját ritmusok: új, átnevezés, a főképernyőre', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'rhythms');
  await page.locator('#addOwn').click();
  const ed = page.locator('.editor');
  await ed.locator('input').fill('Esti');
  await ed.locator('.stepper').first().locator('button[data-d="1"]').click();   // belégzés 4 → 4,5 (fél másodperces lépés)
  await expect(ed.locator('.stepper').first().locator('output')).toHaveText('4,5');
  await page.locator('.rrow', { hasText: 'Esti' }).click();
  const s = await stored(page);
  expect(s.customs.map(c => c.n)).toEqual(['', 'Esti']);
  expect(s.customs[1].p).toEqual([4.5, 0, 6, 0]);
  await expect(page.locator('#modes button', { hasText: 'Esti' })).toHaveCount(1);
  await expect(page.locator('#modes button', { hasText: 'Esti' }).locator('small')).toHaveText('4,5·6');
});

test('saját ritmus fél másodpercekkel: a váltás pontosan 4,5 mp-nél, a szám felfelé kerekít', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'own', shown: ['own', 'box', 'calm'], customs: [{ id: 'own', n: '', p: [4.5, 0, 5.5, 0] }] });
  await page.goto('/');
  await expect(page.locator('#modes button[data-m="own"] small')).toHaveText('4,5·5,5');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ct')).toHaveText('5');
  await page.clock.runFor(4_300);
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  await page.clock.runFor(400);
  await expect(page.locator('#ph')).toHaveText('Kilégzés');
  await expect(page.locator('#ct')).toHaveText('6');
  await page.clock.runFor(5_500);
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  expect(await page.evaluate(() => elapsed)).toBe(10);
});

test('sorozat: lépésenként vált ritmust, a hossza a lépések összege', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'q1', shown: ['q1', 'box', 'calm'], seqs: [{ id: 'q1', n: 'Teszt', s: [['equal', 1], ['calm', 1]] }] });
  await page.goto('/');
  await expect(page.locator('#modes button[data-m="q1"] small')).toHaveText('2′');
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => cur.map(x => x[1]).join())).toBe('4,4');
  await page.clock.runFor(65_000);                   // az első perc utáni első körtől a második lépés
  expect(await page.evaluate(() => cur.map(x => x[1]).join())).toBe('4,6');
  await expect(page.locator('#meta')).toContainText('2/2');
  await page.clock.runFor(60_000);
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  expect((await stored(page)).hist.pop()).toMatchObject({ r: 'q1', n: 'Teszt' });
});

test('gyakorlás hossza: légzésszám és visszaszámlálás', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'box', durType: 'br', breaths: 2, cd: 3 });
  await page.goto('/');
  await expect(page.locator('#meta')).toContainText('2 légzés');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ph')).toHaveText('Készülj');
  await expect(page.locator('#ct')).toHaveText('3');
  await page.clock.runFor(3_100);
  await expect(page.locator('#ph')).toHaveText('Belégzés');
  await expect(page.locator('#meta')).toContainText('1/2 légzés');
  await page.clock.runFor(32_000);                   // 2 × 16 mp
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  expect((await stored(page)).hist.pop().s).toBe(32);   // a visszaszámlálás nem számít bele
});

test('végtelen gyakorlás: nem áll le magától', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'calm', durType: 'inf', dur: 1 });   // a perc-beállítás ilyenkor nem számít
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await page.clock.runFor(130_000);
  expect(await page.evaluate(() => run)).toBe(true);
});

test('koherens tempó: a beállított légzésszám percenként', async ({ page }) => {
  await seed(page, { mode: 'coh', shown: ['coh', 'box', 'calm'], pace: 0 });
  await page.goto('/');
  await expect(page.locator('#modes button[data-m="coh"] small')).toHaveText('3·3');
  await openSettings(page, 'rhythms');
  await expect(page.locator('#pacev')).toHaveText('10 légzés/perc (3·3)');
});

test('régi mentés: az egyetlen saját ritmus átkerül a listába', async ({ page }) => {
  await seed(page, { own: [5, 1, 7, 2], shown: ['own', 'box', 'calm'] });
  await page.goto('/');
  const s = await page.evaluate(() => ({ own: st.own, customs: st.customs }));
  expect(s.own).toBeUndefined();
  expect(s.customs[0]).toMatchObject({ id: 'own', p: [5, 1, 7, 2] });
  await expect(page.locator('#modes button[data-m="own"] small')).toHaveText('5·1·7·2');
});

test('kitüntetések és statisztika: kikapcsolható, a régi naplóból is számol', async ({ page }) => {
  const d = k => { const x = new Date(); x.setDate(x.getDate() - k); return dayKey(x); };
  await seed(page, { sessions: 9, log: { [d(1)]: 600, [d(2)]: 600, [d(3)]: 600 } });
  await page.goto('/');
  await openSettings(page, 'journal');
  await expect(page.locator('#statsBox .badge')).toHaveCount(0);   // alapból ki van kapcsolva
  await page.locator('#statsSw').click();
  await expect(page.locator('#statsBox .badge')).toHaveCount(16);
  for (const b of ['Első lépés', '3 nap sorban']) await expect(page.locator('#statsBox .badge.on', { hasText: b })).toHaveCount(1);
  await expect(page.locator('#statsBox .badge.on', { hasText: '7 nap sorban' })).toHaveCount(0);
  await expect(page.locator('#statsBox')).toContainText('2. szint');   // 30 perc
  expect((await stored(page)).stats).toBe(true);
});

test('új kitüntetésnél a gyakorlás után szól, és a gyakorlás bekerül a listába', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T12:00:00') });   // délben: hajnalban a „Korán kelő” is járna
  await seed(page, { mode: 'box', dur: 1, stats: true });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await page.clock.runFor(65_000);
  await expect(page.locator('#ntext')).toHaveText('Új kitüntetés: Első lépés');
  await openSettings(page, 'journal');
  await expect(page.locator('#statsBox .hrow').first()).toContainText('Doboz');
  await expect(page.locator('#statsBox .bar').first()).toContainText('Doboz');
});

test('felvett hang: betöltődik, a váltáskor szól, a telefon felolvasója nem kell hozzá', async ({ page }) => {
  await page.clock.install();
  await fakeVoice(page);
  await seed(page, { mode: 'nadi', shown: ['nadi', 'box', 'calm'], speak: true, vk: 'f' });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!vbuf)).toBe(true);
  await page.evaluate(() => { window.rec = []; const o = playRec; playRec = k => { window.rec.push(k.join('+')); return o(k); }; });
  await page.locator('#ringBtn').click();
  await page.clock.runFor(4_100);
  expect(await page.evaluate(() => window.rec)).toEqual(['in+viaL', 'out+viaR']);
  expect(await page.evaluate(() => window.said.length)).toBe(0);
});

test('a vezetés hangja: ahol nincs felvett hang, ott nem választható', async ({ page }) => {
  await seed(page, { lang: 'tr' });
  await page.goto('/');
  await openSettings(page, 'sound');
  await expect(page.locator('#vkOpts button[data-k="f"]')).toBeDisabled();
  await expect(page.locator('#vkOpts button[data-k="tts"]')).toBeEnabled();
  const vox = await page.evaluate(() => VOX);
  expect(Object.keys(vox).length).toBe(18);
  expect(vox.hu.f.clips.in[1]).toBeGreaterThan(.3);
});

test('háttérben lemaradt másodpercek pótlása', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'box' });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  const r = await page.evaluate(() => { t0 -= 10_000; tick(); return { elapsed, ph: ph.textContent }; });
  expect(r.elapsed).toBe(10);
  expect(r.ph).toBe('Kilégzés');                     // 4 be + 4 tartás után a 10. másodperc kilégzés
});

test('a főképernyőn legfeljebb 3 ritmus látszik', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'rhythms');
  await page.locator('#rhOpts button[data-id="coh"]').click();
  await expect(page.locator('#modes button')).toHaveCount(3);
  expect((await stored(page)).shown).toEqual(['478', 'calm', 'coh']);
});

test('Tabata: EMOM-terv, edzés, külön számolás', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'] });
  await page.goto('/');
  await page.locator('#tbPre button[data-p="EMOM"]').click();
  expect(await page.evaluate(() => tabataPlan().some(p => p[0] === 'rest'))).toBe(false);
  await page.evaluate(() => { Object.assign(tw(), { work: 5, rest: 5, rounds: 2, sets: 1, prep: 0 }); save(); });
  await page.locator('#ringBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'work');
  await page.clock.runFor(5_100);
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'rest');
  await page.clock.runFor(6_000);
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  const s = await stored(page);
  expect(s.tabN).toBe(1);
  expect(s.sessions || 0).toBe(0);
});

test('Tabata: koppintás szünet, ⏭ ugrás, hosszú nyomás leállít', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], tab: { work: 20, rest: 10, rounds: 2, sets: 1, prep: 0 } });
  await page.goto('/');
  const ring = page.locator('#ringBtn');
  await expect(page.locator('#skipBtn')).toBeHidden();
  await ring.click();
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'work');
  await expect(page.locator('#skipBtn')).toBeVisible();
  await page.clock.runFor(3_100);
  await ring.click();                                // koppintás: szünet, nem leállítás
  expect(await page.evaluate(() => ({ run, paused }))).toEqual({ run: true, paused: true });
  await expect(page.locator('#ph')).toHaveText('Szünet');
  await expect(page.locator('#sub')).toHaveText('koppints a folytatáshoz · hosszan nyomva leáll');
  await page.clock.runFor(5_000);
  expect(await page.evaluate(() => elapsed)).toBe(3);
  await ring.click();                                // újabb koppintás: folytatás
  expect(await page.evaluate(() => paused)).toBe(false);
  await page.mouse.click(5, 5);                      // a körön kívül: előjön az alsó sor
  await page.locator('#skipBtn').click();            // ⏭ a pihenőre
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'rest');
  expect(await page.evaluate(() => ({ elapsed, left }))).toEqual({ elapsed: 20, left: 10 });
  await page.clock.runFor(1_250);                    // az időzítő 250 ms-onként néz rá
  expect(await page.evaluate(() => left)).toBe(9);
  const box = await ring.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(300);
  expect(await page.evaluate(() => run)).toBe(true); // rövid nyomás még nem állít le
  await page.clock.runFor(600);
  expect(await page.evaluate(() => run)).toBe(false);
  await page.mouse.up();                             // a felengedés utáni koppintás nem indít újra
  expect(await page.evaluate(() => run)).toBe(false);
  await expect(page.locator('#skipBtn')).toBeHidden();
  expect((await stored(page)).tabN || 0).toBe(0);    // félbehagyott edzés nem számít
});

test('Tabata: mentett edzések, bemelegítés, levezetés, saját szín', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], tab: { work: 20, rest: 10, rounds: 1, sets: 1, prep: 0 } });
  await page.goto('/');
  await openSettings(page, 'tabata');
  await expect(page.locator('#tbList .rrow')).toHaveCount(1);       // a régi beállításból lett az első edzés
  await page.locator('#addW').click();
  await page.locator('#tbList .editor input').fill('Reggeli');
  await expect(page.locator('#tbList .rrow')).toHaveCount(2);
  await page.locator('#tsteps .stepper', { hasText: 'Bemelegítés' }).locator('button[data-d="1"]').click();   // 30 mp
  await page.locator('#tsteps .stepper', { hasText: 'Levezetés' }).locator('button[data-d="1"]').click();
  await page.locator('.tlook', { hasText: 'Munka' }).locator('.sw button[data-c="#7B4FD0"]').click();
  const plan = await page.evaluate(() => tabataPlan().map(p => p[0]));
  expect(plan.slice(0, 3)).toEqual(['warm', 'prep', 'work']);
  expect(plan.at(-1)).toBe('cool');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#tbSel')).toBeVisible();                 // több edzésnél választó a főképernyőn
  await expect(page.locator('#modes button[data-m="tabata"] span')).toHaveText('Reggeli');
  await page.locator('#ringBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'warm');
  await page.clock.runFor(40_100);                                    // 30 bemelegítés + 10 felkészülés
  await expect(page.locator('html')).toHaveAttribute('data-tb', 'work');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--tbc'))).toBe('#7B4FD0');
});

test('Tabata: hosszú szakasz perc:mp alakban, kisebb betűvel', async ({ page }) => {
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], tab: { work: 20, rest: 10, rounds: 1, sets: 1, prep: 0, wu: 300 } });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#ct')).toHaveText('5:00');
  await expect(page.locator('#ct')).toHaveClass(/long/);
});

test('Tabata: megosztott edzés linkje, mentés megnyitáskor', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const url = await page.evaluate(() => wLink(Object.assign({}, tw(), { n: 'Közös', work: 45, rest: 15, ex: 'Guggolás\nHasprés' })));
  expect(url).toMatch(/^https:\/\/vmynick\.github\.io\/relaxring\/\?w=[\w-]+$/);
  page.once('dialog', d => d.accept());
  await page.goto('/' + url.slice(url.indexOf('?')));
  await expect.poll(() => page.evaluate(() => st.tabs.length)).toBe(2);
  expect(await page.evaluate(() => ({ n: tw().n, work: tw().work, ex: tw().ex, mode: st.mode }))).toEqual({ n: 'Közös', work: 45, ex: 'Guggolás\nHasprés', mode: 'tabata' });
  expect(new URL(page.url()).search).toBe('');
});

test('Tabata saját zene mellett: nem indul a hosszú hang, a jelzések klipekből', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], music: true, tab: { work: 5, rest: 5, rounds: 1, sets: 1, prep: 0 } });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => !media || media.paused)).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.keys(clipUrl).length)).toBeGreaterThan(2);
  expect(await page.evaluate(() => !ac || ac.state !== 'running')).toBe(true);
});

test('Tabata: az utolsó szakasz átugrása befejezi az edzést', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], tab: { work: 20, rest: 10, rounds: 1, sets: 1, prep: 0 } });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await page.evaluate(() => skip());
  await expect(page.locator('#ph')).toHaveText('Szép volt');
  expect((await stored(page)).tabN).toBe(1);
});

test('fekvő nézet: kétoszlopos főképernyő, Tabatánál óriási szám', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await seed(page, { mode: 'tabata', shown: ['box', '478', 'tabata'], tab: { work: 20, rest: 10, rounds: 8, sets: 1, prep: 0 } });
  await page.goto('/');
  await expect(page.locator('#notice')).toBeVisible();   // a „mi újság” sáv mellett is minden kifér
  const inView = sel => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  for (const sel of ['#setBtn', '#tbPre', '#tsteps2', '#tvol2', '#modes'])
    expect(await inView(sel), sel).toBe(true);
  const stage = await page.locator('.stage').boundingBox(), modes = await page.locator('#modes').boundingBox();
  expect(modes.x).toBeGreaterThan(stage.x + stage.width - 1);   // a körök balra, a vezérlők jobbra
  await page.locator('#ringBtn').click();
  await expect(page.locator('#modes')).toBeHidden();
  const ct = await page.locator('#ct').boundingBox(), ph = await page.locator('#ph').boundingBox();
  expect(ct.height).toBeGreaterThan(200);
  expect(ph.x).toBeGreaterThan(ct.x + ct.width - 1);            // a szakasz neve a szám mellett
  expect(await inView('#skipBtn')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
});

test('az app megosztása a Beállításokból', async ({ page }) => {
  await page.addInitScript(() => { navigator.share = async d => { window.shared = d; }; });
  await seed(page);
  await page.goto('/');
  await openSettings(page);
  await page.locator('#shareBtn').click();
  const d = await page.evaluate(() => window.shared);
  expect(d.url).toBe('https://vmynick.github.io/relaxring/');
  expect(d.text).toContain('Tabata');
});

test('megosztás megosztó lap nélkül: a link a vágólapra kerül', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'share', { value: undefined }); });
  await seed(page);
  await page.goto('/');
  await openSettings(page);
  await page.locator('#shareBtn').click();
  await expect(page.locator('#shareNote')).toHaveText('Link másolva');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://vmynick.github.io/relaxring/');
});

test('Beállítások: almenü, vissza és bezárás', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'sound');
  await expect(page.locator('#sheetTitle')).toHaveText('Hang');
  await expect(page.locator('#vibSw')).toBeVisible();   // a rezgés a Hang oldalon van
  await page.keyboard.press('Escape');               // mint a telefon vissza mozdulata
  await expect(page.locator('#sheetTitle')).toHaveText('Beállítások');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await openSettings(page, 'rhythms');                 // a Kész gomb: aloldalról a főmenübe, a főmenüből bezár
  await page.locator('#doneBtn').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Beállítások');
  await page.locator('#doneBtn').click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('forrásjegyzékek az appon belül nyílnak, a vissza a Súgóba visz', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'about');
  await page.locator('[data-cred="amb/CREDITS.txt"]').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Természethangok');
  await expect(page.locator('#credTxt')).toContainText('freesound.org/people/richwise/sounds/466241');
  expect(page.url()).not.toContain('CREDITS');
  await page.locator('#backBtn').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Súgó és névjegy');
  await page.locator('[data-cred="voice/CREDITS.txt"]').click();
  await expect(page.locator('#credTxt')).toContainText('Piper');
  await page.keyboard.press('Escape');               // a telefon vissza mozdulata is a Súgóba lép
  await expect(page.locator('#sheetTitle')).toHaveText('Súgó és névjegy');
});

test('mentés fájlba és visszatöltés', async ({ page }, info) => {
  await seed(page, { color: 'tenger', log: { '2026-01-01': 300 }, sessions: 2 });
  await page.goto('/');
  await openSettings(page, 'backup');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#expBtn').click()]);
  const file = info.outputPath('mentes.json');
  await download.saveAs(file);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('legzo'));
    Object.assign(s, { color: 'ko', log: { '2026-01-02': 120 } });
    localStorage.setItem('legzo', JSON.stringify(s));
  });
  await page.reload();
  page.on('dialog', d => d.accept());
  await openSettings(page, 'backup');
  await page.locator('#impFile').setInputFiles(file);
  await expect(page.locator('#ntext')).toHaveText('Mentés visszatöltve.');
  const s = await stored(page);
  expect(s.color).toBe('tenger');
  expect(s.log).toEqual({ '2026-01-01': 300, '2026-01-02': 120 });   // a napló összefésülődik
});

test('gyorsindítás az ikonról (?r=478)', async ({ page }) => {
  await seed(page);
  await page.goto('/?r=478');
  await expect.poll(() => page.evaluate(() => run)).toBe(true);
  expect(await page.evaluate(() => st.mode)).toBe('478');
  expect(new URL(page.url()).search).toBe('');
});

test('internet nélkül is elindul', async ({ page, context }) => {
  await seed(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#ph')).toHaveText('Indítás');
});

test('napló: napi cél és havi naptár', async ({ page }) => {
  const today = new Date();
  await seed(page, { goal: 5, log: { [dayKey(today)]: 600 } });
  await page.goto('/');
  await openSettings(page);
  await expect(page.locator('#goalMain')).toContainText('Ma 10 / 5 perc');
  await page.locator('.navi[data-go="journal"]').click();
  await expect(page.locator('#cal div')).toHaveCount(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
  await expect(page.locator('#cal .full')).toHaveCount(1);
  await page.locator('#goalOpts button[data-g="15"]').click();
  await expect(page.locator('#cal .full')).toHaveCount(0);
  await expect(page.locator('#cal .part')).toHaveCount(1);
});

test('frissítés után szól az újdonságokról, és megnyitja a súgót', async ({ page }) => {
  await seed(page, { newsSeen: '0.9' });
  await page.goto('/');
  await expect(page.locator('#ntext')).toHaveText('Frissült az app. Nézd meg, mi újság!');
  await page.locator('#nact').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Súgó és névjegy');
  await expect(page.locator('#helpList li').first()).toBeVisible();
  await expect(page.locator('#newsList .news').first()).toBeVisible();
  await expect(page.locator('#verTxt')).toContainText('Verzió');
  await page.reload();                               // csak egyszer szól
  await expect(page.locator('#notice')).toBeHidden();
});

test('első indításkor a súgót ajánlja', async ({ page }) => {
  await page.goto('/');                              // nincs mentett állapot
  await expect(page.locator('#ntext')).toHaveText('Üdv! Nézd meg röviden, hogyan működik.');
});

test('a Kilépés gomb böngészőben rejtve marad', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(page.locator('#setBtn')).toBeVisible();
  await expect(page.locator('#exitBtn')).toBeHidden();
});

test('manifest: angol gyorsindítók', async ({ request }) => {
  const m = await (await request.get('/manifest.json')).json();
  expect(m.lang).toBe('en');
  expect(m.shortcuts.map(s => s.short_name)).toEqual(['Sleep 4-7-8', 'Box', 'Calm', 'Tabata']);
  expect(m.shortcuts[3].url).toBe('./?r=tabata');
  expect(m.orientation).toBeUndefined();             // a Tabata fekve is megy; a légzést az app zárja állóra, ahol lehet
});

test('Tabata: gyakorlatonként saját munka- és pihenőidő a sor végén („Guggolás 30/5”)', async ({ page }) => {
  await seed(page, { mode: 'tabata', tabs: [{ id: 't1', n: '', work: 20, rest: 10, rounds: 3, sets: 1, prep: 0, brk: 60, wu: 0, cd: 0, col: {}, snd: {},
    ex: 'Guggolás 30/5\nFekvőtámasz\nKitörés 15' }], tabSel: 't1' });
  await page.goto('/');
  const plan = await page.evaluate(() => tabataPlan().map(p => [p[0], p[1], p[4]]));
  expect(plan).toEqual([['work', 30, 'Guggolás'], ['rest', 5, 'Fekvőtámasz'], ['work', 20, 'Fekvőtámasz'], ['rest', 10, 'Kitörés'], ['work', 15, 'Kitörés']]);
  expect(await page.evaluate(() => exParse('Plank 2 perc'))).toEqual({ n: 'Plank 2 perc', w: null, r: null });   // a szám csak a sor végén számít
});

test('Tabata: félidő, figyelmeztetés a vége előtt, bemondással; metronóm munka közben', async ({ page }) => {
  await page.clock.install();
  await fakeVoice(page);
  await seed(page, { mode: 'tabata', speak: true, tabs: [{ id: 't1', n: '', work: 20, rest: 10, rounds: 2, sets: 1, prep: 0, brk: 60, wu: 0, cd: 0, col: {}, snd: {},
    ex: '', half: true, warn: 5, bpm: 60 }], tabSel: 't1' });
  await page.goto('/');
  await page.evaluate(() => { window.sigs = []; const o = sig; sig = id => { window.sigs.push([id, elapsed]); return o(id); }; });
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => metro.length)).toBe(19);          // 20 mp munka, 60/perc: 1…19. mp
  await page.clock.runFor(20_300);
  const sigs = await page.evaluate(() => window.sigs);
  expect(sigs).toContainEqual(['chirp', 10]);
  expect(sigs).toContainEqual(['triple', 15]);
  expect(sigs.filter(x => x[0] === 'tick').map(x => x[1])).toEqual([17, 18, 19]);
  const said = await page.evaluate(() => window.said.map(x => x[0]));
  expect(said).toContain('Félidő');
  expect(said).toContain('Még 5 másodperc');
  await page.evaluate(() => pause());
  expect(await page.evaluate(() => metro.length)).toBe(0);
  // a megosztott edzés megőrzi az új beállításokat
  const w = await page.evaluate(() => wClean(JSON.parse(JSON.stringify(tw()))));
  expect([w.half, w.warn, w.bpm]).toEqual([true, 5, 60]);
});

test('Tabata: saját jelzőhang fájlból, új beépített hangok', async ({ page }) => {
  await seed(page, { mode: 'tabata' });
  await page.goto('/');
  await openSettings(page, 'tabata');
  await expect(page.locator('#ownSndName')).toContainText('Nincs kiválasztva');
  await page.evaluate(async () => {           // rövid WAV a „telefonról”
    const sr = 22050, d = new Float32Array(sr / 4).map((_, k) => Math.sin(k / 5) * .5);
    const f = new File([wavBlob(d, sr)], 'csengo.wav', { type: 'audio/wav' }), dt = new DataTransfer(); dt.items.add(f);
    const i = document.getElementById('ownSndFile'); i.files = dt.files; i.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#ownSndName')).toHaveText('csengo.wav');
  expect(await page.evaluate(() => sigList())).toContain('own');
  await expect(page.locator('#tbLook select[data-k="work"] option[value="own"]')).toHaveText('Saját hang');
  await expect(page.locator('#tbLook select[data-k="half"] option[value="boxing"]')).toHaveText('Bokszcsengő');
  await page.locator('#tbLook select[data-k="work"]').selectOption('own');
  expect((await stored(page)).tabs[0].snd.work).toBe('own');
  await page.locator('#ownSndDel').click();
  expect(await page.evaluate(() => [!!ownBuf, localStorage.getItem('legzo-snd'), sigList().includes('own')])).toEqual([false, null, false]);
  expect((await stored(page)).tabs[0].snd.work).toBeUndefined();
});

test('visszatartás-teszt: BOLT a főképernyőn, eredmény a naplóban grafikonnal', async ({ page }) => {
  await page.clock.install();
  await seed(page, { tests: [{ t: Date.now() - 864e5, k: 'bolt', s: 20 }] });
  await page.goto('/');
  await openSettings(page, 'journal');
  await expect(page.locator('#testBox')).toContainText('Utolsó: 20 mp');
  await page.locator('#testBox .tgo[data-k="bolt"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#sub')).toContainText('fogd be az orrod');
  await page.locator('#ringBtn').click();            // indul
  await page.clock.runFor(24_300);
  await expect(page.locator('#ct')).toHaveText('24');
  await page.locator('#ringBtn').click();            // az első légszomjnál megáll
  await expect(page.locator('#ph')).toHaveText('Eredmény');
  await expect(page.locator('#sub')).toContainText('közepes (20–30 mp)');
  await expect(page.locator('#sub')).toContainText('+4');
  const s = await stored(page);
  expect(s.tests.map(x => x.k)).toEqual(['bolt', 'bolt']);
  expect(Math.round(s.tests[1].s)).toBe(24);
  await page.locator('#ringBtn').click();            // vissza a főképernyőre
  expect(await page.evaluate(() => [test, ph.textContent === L.start])).toEqual([null, true]);
  await openSettings(page, 'journal');
  await expect(page.locator('#testBox svg.tchart')).toHaveCount(1);
});

test('hangulat előtte és utána: kérdez a gyakorlás előtt és után, a napló átlagot mutat', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'box', dur: 1, mood: true });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  await expect(page.locator('#moodQ')).toHaveText('Hogy érzed magad most?');
  expect(await page.evaluate(() => run)).toBe(false);
  await page.locator('#moodFaces button[data-v="2"]').click();
  await expect(page.locator('#mood')).toBeHidden();
  expect(await page.evaluate(() => run)).toBe(true);
  await page.clock.runFor(65_000);
  await expect(page.locator('#moodQ')).toHaveText('És most?');
  await page.locator('#moodFaces button[data-v="4"]').click();
  const s = await stored(page);
  expect(s.hist[s.hist.length - 1].m).toEqual([2, 4]);
  await openSettings(page, 'journal');
  await expect(page.locator('#moodBox')).toContainText('2 → 4');
});

test('programok: a mai nap a programból fut, a beállítások maradnak, utána a következő nap jön', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'box', dur: 10 });
  await page.goto('/');
  await openSettings(page, 'programs');
  await page.locator('#progList .prog').first().locator('button[data-a="start"]').click();
  const next = d => page.evaluate(([d, r, m]) => L.progNext(d, rname(r), L.min(m)), d);
  await expect(page.locator('#progList')).toContainText(await next([1, 'calm', 3]));
  await page.locator('#progList button[data-a="go"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  expect(await page.evaluate(() => [run, runMode, po && po.min])).toEqual([true, 'calm', 3]);
  await expect(page.locator('#meta')).toContainText('1. nap');
  await page.clock.runFor(181_000);
  expect(await page.evaluate(() => run)).toBe(false);
  const s = await stored(page);
  expect([s.prog.day, s.mode, s.dur]).toEqual([1, 'box', 10]);
  await openSettings(page, 'programs');
  await expect(page.locator('#progList')).toContainText('Mára kész');
  await expect(page.locator('#progList')).toContainText(await next([2, 'equal', 4]));
});

test('részletes leírás: a ritmus mellől nyílik, minden nyelven teljes, a vissza a Ritmusokhoz visz', async ({ page, request }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'rhythms');
  await page.locator('[data-info="sigh"]').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Sóhajtás');
  await expect(page.locator('#infoTxt h4')).toHaveText(['Mire jó', 'Hogyan', 'Mire figyelj', 'Eredet és forrás']);
  await expect(page.locator('#infoTxt')).toContainText('Cell Reports Medicine');
  await page.locator('#backBtn').click();
  await expect(page.locator('#sheetTitle')).toHaveText('Ritmusok');
  await page.locator('[data-info="box"]').click();
  await page.locator('#infoTry').click();
  await expect(page.locator('#sheet')).toBeHidden();
  expect(await page.evaluate(() => [run, st.mode, st.shown.includes('box')])).toEqual([true, 'box', true]);
  const ids = await page.evaluate(() => BIDS);
  for (const l of await page.evaluate(() => Object.keys(T))) {
    const j = await (await request.get(`/info/${l}.json`)).json();
    for (const id of ids) for (const k of ['what', 'how', 'care', 'src']) expect(j[id] && j[id][k], `${l}/${id}/${k}`).toBeTruthy();
  }
});

test('felvett természethang: első használatkor letöltődik, a szintetizáltból átúsztat rá', async ({ page }) => {
  await page.clock.install();
  await seed(page, { mode: 'calm', dur: 5, amb: 'eso' });
  await page.goto('/');
  await page.locator('#ringBtn').click();
  expect(await page.evaluate(() => [!!amb, !!abuf.eso])).toEqual([true, false]);   // először a szintetizált szól
  await page.clock.runFor(100);
  await expect.poll(() => page.evaluate(() => !!abuf.eso), { timeout: 10000 }).toBe(true);
  const r = await page.evaluate(() => ({ dur: Math.round(abuf.eso.duration), gen: amb.gen }));
  expect(r.dur).toBe(50);
  await page.evaluate(() => { st.amb = 'patak'; ambStart(.1); });
  await expect.poll(() => page.evaluate(() => !!abuf.patak), { timeout: 10000 }).toBe(true);
  expect(await page.evaluate(() => Object.keys(abuf))).toEqual(['patak']);   // egyszerre csak egy marad a memóriában
});
