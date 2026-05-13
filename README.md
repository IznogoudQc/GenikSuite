# GenikSuite

Application desktop locale fusionnant **GenikAccess** (ouverture rapide des dossiers projet) et **ChronoTrack/GenikTime** (feuille de temps par blocs de 30 min).

**100 % local** — toutes les données restent sur le PC (SQLite dans `%APPDATA%/GenikSuite/geniksuite.db`).

## Stack

Electron + React 19 + TypeScript + Vite + Tailwind 4 + Drizzle ORM + SQLite

## Démarrage (dev)

```bash
npm install
npm run dev
```

## Première installation des données

Si tu veux récupérer les projets et entrées de temps des anciennes apps :

```bash
npm run db:import-legacy
```

Le script lit `../GenikAccess/projets.json` et `../GenikAccess/feuilles_de_temps.csv` et peuple la base SQLite.

## Workflow release

1. `npm version patch` # 0.1.0 → 0.1.1
2. `git push --follow-tags` # déclenche GitHub Actions
3. Vérifier la release sur GitHub
4. L'app installée détectera la nouvelle version au prochain lancement.

## Documentation

Voir [`CLAUDE.md`](./CLAUDE.md) pour l'architecture détaillée et les conventions.
