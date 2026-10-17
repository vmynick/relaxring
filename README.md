# RelaxRing – Légző körök

Légzőgyakorló web-app lélegző körökkel, halk hanggal és rezgéssel. Ritmusok: doboz (4·4·4·4), elalvó (4·7·8), nyugtató (4·6), koherens (5·5), lazító (4·2·6), lassuló (a kilégzés 4-ről 8 mp-re nyúlik) és saját, valamint Tabata edzés-időzítő (20/10 mp × 8 kör, állítható, 3-2-1 csipogással). A főképernyőn a Beállításokban kiválasztott 3 látszik.

További funkciók: napló (napos sorozat, heti percek), alvás mód (a képernyő lassan elsötétül, a végén nincs csengés), a telepített app teljes képernyős (nincs állapotsor és alsó gombsor; böngészőben gyakorlás közben vált teljes képernyőre), hangos vezetés (a telefon felolvasóhangjával), témánként háttérkép (a téma színeiből rajzolt táj, kikapcsolható), gyorsindítás az app ikonjáról (hosszan nyomva).

**Megnyitás:** https://vmynick.github.io/relaxring/

## Telepítés telefonra

- **Android, Chrome:** nyisd meg a címet, majd ⋮ menü → *Alkalmazás telepítése* (vagy a felugró „Telepítés” gomb).
- **iPhone, Safari:** Megosztás → *Főképernyőhöz adás*.

Telepítés után offline is elindul, és gyakorlás közben nem alszik el a képernyő. Ha új verzió jelenik meg, az app kiírja: „Új verzió érhető el” → *Frissítés*.

A beállítások (ritmus, idő, hangok, színtéma, nyelv) csak a telefonon tárolódnak, az app nem küld adatot sehova.

Nyelvek: magyar, English, Deutsch. Első indításkor a telefon nyelvét követi, a Beállításokban átállítható.

## Fejlesztés

Minden `main`-re küldött módosítás után a GitHub Actions közzéteszi az oldalt ([.github/workflows/pages.yml](.github/workflows/pages.yml)), és új verziószámot ír a `sw.js`-be.

Betű: Apple-eszközökön a rendszer SF Pro betűje, máshol az Inter (SIL Open Font License 1.1, [fonts](fonts)).
