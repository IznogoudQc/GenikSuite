# Bug — Vol de focus par `window.confirm()` sur Windows

**Date** : 2026-05-13
**Versions impactées** : v0.1.0 → v0.1.13
**Corrigé en** : v0.1.14
**Plateforme** : Windows (Electron 33)

## Symptôme

Après avoir cliqué sur **OK** ou **Annuler** dans une boîte de dialogue de confirmation
(ex: "Retirer 16458 de la liste ?"), l'utilisateur ne peut plus taper dans les champs
input de l'application. Le curseur ne clignote pas, les frappes clavier sont ignorées.

**Workaround utilisateur** : cliquer hors de la fenêtre Electron (sur le bureau ou une
autre app) puis re-cliquer sur la fenêtre GenikSuite → les inputs redeviennent
fonctionnels.

## Diagnostic — pistes explorées (et qui n'ont PAS marché)

Avant de trouver la vraie cause, plusieurs hypothèses ont été testées sans succès :

1. **Focus initial de la fenêtre** : `mainWindow.focus()` après `show()` dans
   `ready-to-show`. → Inutile car le bug arrive APRÈS le démarrage, pas au boot.

2. **`setAlwaysOnTop(true)` bref au démarrage** : workaround Windows classique pour
   forcer le focus. → Inutile pour la même raison.

3. **`webContents.focus()` sur `focus` event de la BrowserWindow** : censé restaurer
   la saisie clavier au regain de focus. → N'agit pas si le focus système n'est pas
   revenu à la fenêtre.

4. **DevTools en mode `detach`** : `openDevTools({ mode: 'detach' })` pour qu'ils
   n'aspirent pas le focus en dev. → A peut-être amélioré le cas dev, mais ne
   corrige pas le cas prod.

5. **Wrapper `safeConfirm` côté renderer qui appelle `window.confirm()` puis force
   `mainWindow.focus()` via IPC** : essayait de restaurer le focus juste après la
   dialog native. → Le focus IPC arrive trop tard ; le state intermédiaire reste
   cassé.

6. **Click handler global qui force `target.focus()` sur tout input cliqué**
   (`setTimeout(() => target.focus(), 0)`). → N'a aucun effet quand le focus
   système Windows n'est pas dans la fenêtre Electron : appeler `.focus()` sur un
   `HTMLInputElement` ne récupère pas le focus système.

## Cause racine

`window.confirm()` (la boîte de dialogue native Windows) **vole le focus système**
de la BrowserWindow Electron. Quand la dialog se ferme, Windows ne restitue **pas**
le focus à la fenêtre Electron : il reste à l'OS lui-même (ou au shell).

Conséquence : le webContents Chromium considère la fenêtre comme inactive et
ignore tous les keypress. Aucun appel JS ne peut compenser ça car le problème
est au niveau du gestionnaire de fenêtres Windows, pas au niveau du DOM.

C'est un comportement reproductible avec n'importe quelle app Electron qui utilise
les dialogs natives synchrones (`confirm`, `alert`, `prompt`) sur Windows.

## Solution adoptée

**Supprimer complètement l'usage des dialogs natives** et les remplacer par une
modale React rendue dans le DOM de l'app.

### Implémentation

1. **`src/lib/dialogs.ts`** — fournit `safeConfirm(message): Promise<boolean>`.
   En interne, délègue à un handler React enregistré (`registerConfirmHandler`).

2. **`src/components/ConfirmHost.tsx`** — composant monté une seule fois au niveau
   `App.tsx`. À son `useEffect`, il s'enregistre comme handler. Quand on appelle
   `safeConfirm`, il affiche une modale React (backdrop semi-transparent + carte
   blanche avec boutons Annuler / Confirmer) et résout la Promise selon le clic.

3. **Pages** (`AccessPage`, `TimesheetPage`, `SettingsPage`) — utilisent
   `await safeConfirm(...)` au lieu de `confirm(...)`.

### Pourquoi ça marche

La modale React est juste du DOM dans le webContents. Pas de dialog OS impliquée,
donc rien ne peut voler le focus système. Le focus reste dans la fenêtre Electron
en permanence.

## Règle à retenir

> **Ne jamais utiliser `window.confirm`, `window.alert`, `window.prompt` dans une
> app Electron sur Windows.** Toujours passer par une modale React custom.

Cette règle s'étend aussi à `dialog.showMessageBoxSync()` côté main process si
appelé en réponse à une action utilisateur dans le webContents : le comportement
est identique.

## Fichiers concernés par le correctif final

- `src/lib/dialogs.ts` (nouveau)
- `src/components/ConfirmHost.tsx` (nouveau)
- `src/App.tsx` (ajout `<ConfirmHost />`)
- `src/pages/AccessPage.tsx` (remplace `confirm` par `await safeConfirm`)
- `src/pages/TimesheetPage.tsx` (idem, 2 endroits)
- `src/pages/SettingsPage.tsx` (idem)

## Tests de non-régression

À refaire à chaque ajout d'une nouvelle action de confirmation :

1. Ouvrir l'app installée (pas en dev).
2. Onglet Accès → sélectionner un projet → cliquer Retirer → confirmer.
3. Immédiatement essayer de taper dans le champ "Nouveau projet".
4. ✅ Le curseur doit clignoter et accepter la saisie sans cliquer ailleurs.

Si KO, vérifier que la nouvelle action utilise bien `safeConfirm` et pas `confirm`.
