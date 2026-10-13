# Métro renta

Compteur de trajets de métro (2,05 € / trajet) — interface française, optimisée Safari iOS.

## Lancer en local

Depuis ce dossier :

```bash
npx --yes serve -l 5173
```

Puis ouvrir [http://localhost:5173](http://localhost:5173).

Alternative sans npx :

```bash
python3 -m http.server 5173
```

## iPhone Safari

1. Ouvrir l’URL (local via le même Wi‑Fi, ou hébergement).
2. Partager → **Sur l’écran d’accueil** pour un usage type app.
3. Les trajets sont mémorisés dans `localStorage` (survivent aux rechargements).
