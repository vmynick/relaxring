# RelaxRing+ – Breathing Circles

[![Publish](https://github.com/vmynick/relaxring/actions/workflows/pages.yml/badge.svg)](https://github.com/vmynick/relaxring/actions/workflows/pages.yml)

A breathing-exercise app and interval timer for your phone. Breathing circles show when to inhale, hold and exhale. Soft sound, vibration and optional voice guidance let you follow along with your eyes closed. It installs as an app, works offline, is free, and does not send any data anywhere.

**▶ Open the app: https://vmynick.github.io/relaxring/**

![Main screen with a background scene, alternate nostril breathing in dark mode, a Tabata workout, the rhythm library and the journal with badges](docs/screenshots.png)

*Main screen · alternate nostril breathing (dark mode) · Tabata workout · rhythm library · journal with badges*

## Features

### Breathing techniques

15 built-in techniques in four groups. Each one has a short description in Settings → Rhythms.

| Group | Rhythm | Pattern (seconds) |
|---|---|---|
| Calm | Calm | 4 in · 6 out |
| | Sigh | 2 in + 1 top-up · 6 out (the physiological sigh) |
| | Coherent | 5 in · 5 out by default; pace adjustable from 10 to 4.3 breaths a minute |
| | Relax | 4 in · 2 hold · 6 out |
| | Equal | 4 in · 4 out |
| Sleep | Sleep | 4 in · 7 hold · 8 out (4-7-8) |
| | Unwind | 4 in · the exhale grows from 4 to 8 s over the session |
| | Lullaby | 4 in · 8 out |
| | Bee | 4 in · 8 humming exhale (bhramari) |
| Focus | Box | 4 in · 4 hold · 4 out · 4 hold |
| | Triangle | 4 in · 4 hold · 4 out |
| | Alternate | alternate nostril breathing; the line under the circle and the voice say which nostril |
| Energy | Wake up | 4 in · 2 out |
| | Kapalbhati | 30 quick exhales (the circle twitches with each), 15 s hold, rest |
| | Power | Wim Hof-style: 30 deep breaths, hold out as long as you can (tap when you need air), 15 s hold in; 1–6 rounds |

The app warns once before Kapalbhati and Power breathing: they are hyperventilation exercises, to be done only sitting or lying down.

- **Custom rhythms:** as many as you like, each with a name and its own inhale, holds and exhale.
- **Sequences:** chain rhythms into one session, for example 3 minutes Sigh → 5 minutes Coherent → 5 minutes Sleep.
- The main screen shows the 3 rhythms you pick. Tap the circle to start or stop.
- **Session length:** 1–30 minutes, a number of breaths (5–100) or endless. An optional countdown (3, 5 or 10 s) comes before the start.
- **Focus mode:** while you breathe, everything except the circles fades. Tap outside the circle to bring the controls back.
- **Sleep mode:** the screen slowly goes dark, there is no chime at the end and the nature sound fades out.
- **Screen off:** sessions keep running with the screen locked. The lock screen shows pause, resume and stop, and a headset button pauses too. An incoming call pauses the session. Some sound must be on for this to work.

### Sound and voice

- 4 breathing sounds (Soft, Ocean, Pad, Bowl), 5 chimes (Bell, Bowl, Wood, Drop, Piezo) and 8 background sounds (rain, stream, fire, wind, waves, birds, white and brown noise). The phone synthesizes all of these, so nothing has to be downloaded.
- **Voice guidance** in three kinds:
  - the phone's own text-to-speech voice. The app measures how late it starts and starts it that much early, so you hear it as the counter changes;
  - a recorded female or male voice for 18 languages. It sounds the same on every phone and plays exactly at the change. It downloads on first use and then works offline. Exercise names are still read by the phone voice.
- Separate volume for the voice guidance and for the background sound.
- Vibration on every phase change.

### Workouts (Tabata)

- **Saved workouts:** as many as you like, each with a name. Duplicate, rename or delete them; pick one on the main screen.
- **Presets:** Tabata 20/10 s × 8, HIIT 40/20 s × 8, EMOM 1 min × 10.
- **Adjustable:** work (5–90 s), rest (0–90 s), rounds (1–30), sets (1–5), get-ready time (0–30 s), rest between sets (10–180 s), warm-up and cool-down (0–15 min).
- **Readable from across the room:** the whole screen takes the phase color, with a huge countdown. Each phase (warm-up, get ready, work, rest, cool-down) has its own color, 9 to choose from, and its own signal: high beep, double low beep, bell, gong, whistle, buzzer or none.
- **Loud signal with its own volume:** 3-2-1 beeps before every change, and stronger vibration.
- **Exercise list:** the current exercise shows during work and the next one during rest. Voice guidance reads them out.
- **Safe controls:** tapping the number pauses the workout and holding it stops, so a sweaty touch cannot end it by mistake. ⏭ jumps to the next part, also from the lock screen.
- **Landscape:** turn the phone sideways and the countdown fills the screen next to the exercise name.
- **With your own music:** on Android the signals only lower the music playing on the phone instead of stopping it. In this mode the lock screen has no controls and the screen stays on.
- **Share a workout:** a link carries the whole workout. Whoever opens it can save it with one tap.

### Journal and backup

- Day streak, today's minutes and the number of sessions.
- **Daily goal:** 2–30 minutes, with a progress bar and the number of days this week you reached it.
- **Charts:** a 7-day bar chart with a line for the goal, and a monthly calendar for the past year.
- **Badges and statistics** (optional, off by default): levels by total minutes, 16 badges, the last 20 sessions with breath-hold times, and minutes by rhythm and by time of day for the last 30 days. Badges also count your earlier sessions.
- Save the journal, your rhythms, workouts and settings to a JSON file and restore them, for example on a new phone. Restoring merges the journal.

### Appearance and languages

- 6 color themes: Forest, Sea, Lavender, Sunset, Rose, Stone. Light or dark mode follows the phone setting.
- An optional background scene for each theme: a calm landscape drawn in the theme's colors.
- 20 languages: English, Hungarian, German, Spanish, French, Italian, Polish, Portuguese (Brazil), Dutch, Swedish, Danish, Norwegian, Finnish, Czech, Slovak, Romanian, Croatian, Ukrainian, Russian and Turkish. On first launch the app uses the phone's language.
- **Share the app** in Settings opens the phone's share sheet, or copies the link where there is none.

### Help

- **Help & about** in Settings has short instructions, the list of changes, the privacy note, the voice credits and the version.
- On first launch the app offers the help page, and after an update it shows once what is new.

## Install

- **Android, Chrome:** open the link, then ⋮ menu → *Install app*, or tap the "Install" button the app shows.
- **iPhone, iPad, Safari:** Share → *Add to Home Screen*.
- **Desktop, Chrome or Edge:** use the install icon at the end of the address bar.

The installed app:
- starts without an internet connection;
- runs full screen on Android, where you swipe from the edge to show the status and navigation bars;
- keeps the screen awake during a session;
- offers quick starts when you long-press its icon: Sleep 4-7-8, Box, Calm, Coherent.

When a new version is published, the app shows "A new version is available" → *Update*.

## Controls

| Action | How |
|---|---|
| Start or stop | tap the circle |
| Power breathing: end the hold | tap the circle when you need air |
| Tabata: pause or stop | tap the number to pause, hold it to stop |
| Tabata: next part | ⏭ button, or next on the lock screen or headset |
| Pause or resume | lock screen controls or headset button; while paused, tap the circle to continue |
| Switch rhythm | buttons at the top |
| Settings | bottom-left button |
| Exit (installed app) | bottom-right **X**, tap twice |
| Controls during a session | tap anywhere outside the circle |
| Back in Settings | **‹** button or the phone's back gesture |

## Privacy

- There is no account, no sign-up, no analytics and no cookies.
- Settings and the journal stay in the browser's local storage on your phone.
- GitHub Pages serves the app files. Beyond that the app makes no requests, and the font and voices are bundled.
- Clearing the browser data deletes the local storage, so save a backup from time to time (Settings → Backup).

## Known limitations

- **iPhone:**
  - Safari does not support vibration.
  - Full screen, the back-gesture handling and lowering your own music during Tabata only work on Android.
- **Voice guidance with the phone voice** depends on the text-to-speech voices installed on the phone. Croatian and Turkish have no recorded voice, and some languages have only a female or only a male one.
- **Volume:** the phone's media volume also limits the sounds and signals.
- **Screen off:** this needs some sound on (breathing sound, chime or background sound). If every sound is off, the browser may slow down or pause the timer while the screen is locked. Some phones' battery savers can also stop the app in the background.
- **Landscape:** breathing stays in portrait where the browser allows locking it, which is usually only in full screen. Elsewhere the breathing screen has a landscape layout too.

## Development

The app is a single HTML file with HTML, CSS and JavaScript. It uses no framework and has no build step. Sounds are synthesized with the Web Audio API, and the background scenes are drawn as SVG. The recorded voices are pre-generated MP3 files.

| File | Purpose |
|---|---|
| [index.html](index.html) | the whole app: UI, timing, sounds, translations |
| [sw.js](sw.js) | service worker: offline cache and update notice |
| [manifest.json](manifest.json) | install data, icons, shortcuts |
| [voice/](voice) | recorded voices: one MP3 per language and gender, `voices.json` with the word positions, [CREDITS.txt](voice/CREDITS.txt) |
| [fonts.css](fonts.css), [fonts/](fonts) | the Inter font |
| `*.png` | icons |
| [setup.html](setup.html) | only for the earlier self-hosted home-server version |
| [docs/](docs) | README images, not published to the site |
| [tests/](tests), [playwright.config.mjs](playwright.config.mjs), [package.json](package.json) | browser tests; only needed for development |
| [.github/workflows/pages.yml](.github/workflows/pages.yml) | tests and publishing |

**Run locally:** start any static web server in this folder, for example `python -m http.server 8000`, and open http://localhost:8000. The service worker also works on localhost.

**Tests:** run `npm install` once, then `npm test`. Playwright runs the tests in headless Chromium against a small built-in web server. They cover:
- loading in every language, and that every language has the same texts;
- breathing sessions, the journal, pause and resume, the lock-screen data and catching up after throttling;
- the rhythm library, power breathing, Kapalbhati, alternate nostril, custom rhythms, sequences, breath counts, endless sessions, the countdown and the coherent pace;
- voice guidance timing and the recorded voices;
- badges and statistics;
- Tabata: presets, pause, skip, long-press stop, saved workouts, warm-up and cool-down, colors, shared links and the own-music mode;
- the landscape layout, settings navigation, backup and restore, sharing, shortcuts, offline start and the "what's new" notice.

**Publishing:** every push to `main` runs the tests first. The site is published only if they all pass, about 2–3 minutes in total. The workflow also:
- writes a new version into `sw.js`, which is how installed apps notice an update;
- sets the app id in the manifest to the `/relaxring/` path.

**Releasing:** add an entry at the top of the `NEWS` list in `index.html`. Its version becomes the app version, and installed apps show the "what's new" notice once.

**Extending:**
- **New language:** add a block to the `T` dictionary in `index.html` with the same keys as the existing ones. A test checks that no key is missing.
- **New rhythm:** add it to the `R` table and the `BIDS` list, and add an `r_<id>` name and a `d_<id>` description in every language.
- **Recorded voices:** the MP3 files were made with [Piper](https://github.com/OHF-Voice/piper1-gpl). Each word was generated four times and the shortest take kept, because the models sometimes run on.

## License

The code is under the [MIT License](LICENSE).

The font is [Inter](https://rsms.me/inter/), under the SIL Open Font License 1.1 ([fonts/OFL-Inter.txt](fonts/OFL-Inter.txt)). On Apple devices the system font (SF Pro) is used instead.

The recorded voices were generated with Piper voice models; their training data licenses (CC0, CC BY, Apache 2.0 and others) are listed in [voice/CREDITS.txt](voice/CREDITS.txt).
