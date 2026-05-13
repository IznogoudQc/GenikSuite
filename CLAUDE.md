# GenikSuite — Contexte pour Claude Code

App **desktop Electron** qui fusionne et remplace les deux apps Python précédentes :
- **GenikAccess** : ouvre rapidement les dossiers projet (`P:\17000-17499\17528\...`)
- **ChronoTrack / GenikTime** : feuille de temps avec popup à intervalle fixe (30 min)

## Stack

Identique à `kinesio-tool` :
- **Electron** + **electron-vite** (dev + build)
- **React 19** + **TypeScript** (renderer)
- **Tailwind CSS 4** (via `@tailwindcss/postcss`)
- **Drizzle ORM** + **better-sqlite3** (DB locale)
- **electron-builder** (NSIS Windows installer)
- **electron-updater** (auto-update depuis releases GitHub)

## Architecture

```
electron/         # Process main + preload (Node.js, accès filesystem)
  main.ts         # Entry point, crée la BrowserWindow, registre les IPC
  preload.ts      # Bridge sécurisé : expose window.genik.invoke()
  ipc/
    access.ts     # Handlers : résolution projet, ouverture dossier
    timesheet.ts  # Handlers : CRUD time_entries, agrégations
    config.ts     # Handlers : préférences user (rootProjects, intervalMin, ...)

src/              # Renderer (React, sandboxed)
  main.tsx        # ReactDOM root
  App.tsx         # Layout + navigation 3 onglets
  styles.css      # Tailwind v4 + theme tokens
  shared/types.ts # DTOs et constantes IPC (importé par main ET renderer)
  lib/
    ipc.ts        # Wrapper typé autour de window.genik.invoke
    time.ts       # Utilitaires Date (mondayOf, floorToInterval, ...)
  pages/
    AccessPage.tsx     # Ex-GenikAccess
    TimesheetPage.tsx  # Ex-GenikTime, avec compteur de blocs
    SettingsPage.tsx   # Config + gestion sous-dossiers
  components/
    BlockCounter.tsx   # Visualisation blocs 30min par projet
    PopupTimer.tsx     # Modale auto à intervalle aligné

db/
  schema.ts       # Drizzle : projects, subfolders, time_entries, config
  client.ts       # getDb(path) singleton + bootstrap CREATE TABLE
  migrations/     # Généré par drizzle-kit (à venir)

scripts/
  import-legacy.ts  # Migration depuis projets.json + feuilles_de_temps.csv
```

## Conventions

- **Tout est TypeScript strict.** Pas de `any` sauf justification.
- **Communication renderer→main** uniquement via `invoke(IPC.XXX, payload)`. Les canaux IPC sont centralisés dans `src/shared/types.ts` (constante `IPC`) et whitelistés dans `preload.ts`.
- **DTOs** : les objets traversant l'IPC ont leurs types dans `src/shared/types.ts` (suffix `DTO`). Le renderer ne connaît pas Drizzle.
- **Pas de logique métier dans React.** Toute requête DB ou accès filesystem passe par un handler IPC.
- **Logs** : `console.error` côté main, jamais de log de données sensibles (les chemins P:\ sont acceptables).

## Commandes utiles

```bash
npm install               # Installe les deps
npm run dev               # Lance Electron + Vite en hot-reload
npm run typecheck         # Vérifie TS (web + node)
npm run lint              # ESLint
npm run db:generate       # Drizzle Kit : génère SQL migrations depuis schema.ts
npm run db:import-legacy  # Importe les anciennes données JSON/CSV dans SQLite
npm run dist              # Build l'installeur NSIS dans dist/
npm run release           # bump version + push tag → GitHub Action build et publie
```

## Données

- **DB SQLite** : stockée dans `app.getPath('userData')/geniksuite.db`. Jamais commitée.
- **Préférences** : table `config` (key/value). Défauts : `rootProjects=P:\\`, `intervalMinutes=30`, `startHour=8`.

## Logique projet (importante)

Un projet est numéroté (ex: `17528`). Il vit dans une tranche de 500 :
- `17000` → `P:\17000-17499\17000\`
- `17528` → `P:\17500-17999\17528\`

La fonction `resolveProjectPath(root, number)` dans `electron/ipc/access.ts` calcule ce chemin. Elle **vérifie l'existence** et retourne `null` si absent — **elle ne crée jamais de dossier**.

## Logique feuille de temps (importante)

- Le **bloc** est l'unité atomique : durée `intervalMin` (typiquement 30).
- Les popups sont **alignés sur l'heure ronde** : si l'intervalle est 30 et qu'il est 09:17, le prochain popup est à 09:30, pas à 09:47.
- La requête "combien de blocs sur le projet X cette semaine" est un simple `COUNT(*) GROUP BY project_number` dans `IPC.TimeSummaryByProject`.

## Workflow release

Identique à `kinesio-tool` :
1. `npm version patch` (bump 0.1.0 → 0.1.1, crée tag v0.1.1)
2. `git push --follow-tags`
3. La GitHub Action `.github/workflows/release.yml` build l'installeur Windows et le publie sur GitHub Releases
4. L'app installée détecte la nouvelle version au prochain lancement via `electron-updater`

## TODO court terme

- [ ] Créer l'icône `build/icon.ico`
- [ ] Générer les migrations Drizzle initiales (`npm run db:generate`)
- [ ] Tester l'import des anciennes données (`npm run db:import-legacy`)
- [ ] Créer le repo GitHub `GenikSuite` et ajuster `electron-builder.yml` (owner/repo)
- [ ] Premier `npm version patch` + push pour valider la CI
