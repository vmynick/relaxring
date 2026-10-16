# RelaxRing – Légző körök

Légzőgyakorló web-app: doboz (4·4·4·4), elalvó (4·7·8) és nyugtató (4·6) ritmus, lélegző körökkel, halk hanggal és rezgéssel.

**Megnyitás:** https://vmynick.github.io/relaxring/

## Telepítés telefonra

- **Android, Chrome:** nyisd meg a címet, majd ⋮ menü → *Alkalmazás telepítése* (vagy a felugró „Telepítés” gomb).
- **iPhone, Safari:** Megosztás → *Főképernyőhöz adás*.

Telepítés után offline is elindul, és gyakorlás közben nem alszik el a képernyő. Ha új verzió jelenik meg, az app kiírja: „Új verzió érhető el” → *Frissítés*.

A beállítások (ritmus, idő, hangerő) csak a telefonon tárolódnak, az app nem küld adatot sehova.

## Fejlesztés

Minden `main`-re küldött módosítás után a GitHub Actions közzéteszi az oldalt ([.github/workflows/pages.yml](.github/workflows/pages.yml)), és új verziószámot ír a `sw.js`-be.

Betű: Apple-eszközökön a rendszer SF Pro betűje, máshol az Inter (SIL Open Font License 1.1, [fonts](fonts)).
