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

test('három nyelven hiba nélkül betölt', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  for (const [lang, title, start] of [['hu', 'Légző körök', 'Indítás'], ['en', 'Breathing Circles', 'Start'], ['de', 'Atemkreise', 'Start']]) {
    await page.evaluate(l => { const s = JSON.parse(localStorage.getItem('legzo')); s.lang = l; localStorage.setItem('legzo', JSON.stringify(s)); }, lang);
    await page.reload();
    await expect(page).toHaveTitle(title);
    await expect(page.locator('#ph')).toHaveText(start);
    await expect(page.locator('#modes button')).toHaveCount(3);
  }
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
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe('RelaxRing – Belégzés');
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  // a háttérben futáshoz kell egy önállóan szóló, 5 mp-nél hosszabb, mérhető szintű <audio> (nem a Web Audióba kötve)
  const keepAlive = await page.evaluate(async () => {
    const buf = await (await fetch(media.src)).arrayBuffer(), v = new DataView(buf);
    let peak = 0; for (let k = 44; k < buf.byteLength; k += 2) peak = Math.max(peak, Math.abs(v.getInt16(k, true)));
    return { playing: !media.paused, loop: media.loop, secs: (buf.byteLength - 44) / 2 / v.getUint32(24, true), peak };
  });
  expect(keepAlive).toEqual({ playing: true, loop: true, secs: 10, peak: 66 });
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
  await page.evaluate(() => { Object.assign(st.tab, { work: 5, rest: 5, rounds: 2, sets: 1, prep: 0 }); save(); });
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

test('Beállítások: almenü, vissza és bezárás', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openSettings(page, 'sound');
  await expect(page.locator('#sheetTitle')).toHaveText('Hang');
  await page.keyboard.press('Escape');               // mint a telefon vissza mozdulata
  await expect(page.locator('#sheetTitle')).toHaveText('Beállítások');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
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
  expect(m.shortcuts.map(s => s.short_name)).toEqual(['Sleep 4-7-8', 'Box', 'Calm', 'Coherent']);
});
