# Métro

Compteur de trajets de métro — interface française, style clair iOS, prix éditable, paliers, sync Supabase optionnelle.

**Live :** https://leoacqueberge.github.io/metro-renta/

## Lancer en local

```bash
npx --yes serve -l 5173
```

## Fonctionnalités

- Prix du ticket configurable (défaut 2,05 €)
- Paliers tous les N € (défaut 70 €)
- Persistance `localStorage` + sync Supabase si `config.js` est renseigné
- Optimisé Safari iOS (safe areas, PWA meta)

## Supabase

1. Créer / restaurer un projet (limite free : pausez un autre projet si besoin).
2. Exécuter [`supabase/schema.sql`](./supabase/schema.sql) dans le SQL Editor.
3. Copier `config.example.js` → `config.js` et coller URL + clé anon.
4. Redéployer / pousser sur `main` pour GitHub Pages.

Sans clés, l’app reste 100 % utilisable en local sur l’appareil.
