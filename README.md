# Pagaille

Bibliothèque personnelle gamifiée + cercle d'amis. PWA (React + Vite + TypeScript + Tailwind) branchée sur Supabase.

## Lancer en local
```
npm install
cp .env.example .env   # déjà rempli avec l'URL et la clé publique du projet Supabase
npm run dev            # http://localhost:5173
npm test               # tests de la logique (vitest)
npm run build          # production -> dist/
```

## Connexion (code à 6 chiffres)
L'app utilise un code reçu par e-mail (OTP), pas un lien magique : aucune URL de redirection n'est nécessaire.
Dans Supabase → Authentication → Emails → Templates, les modèles « Magic Link » et « Confirm signup » doivent contenir `{{ .Token }}` (le code), par exemple :
```
<h2>Ton code Pagaille</h2><p>{{ .Token }}</p>
```
L'envoi d'e-mails intégré est limité en nombre : pour un usage régulier, configure un SMTP personnalisé (Authentication → SMTP Settings).

## Hébergement (nécessaire pour installer l'app sur téléphone)
Mettre le contenu de `dist/` sur GitHub Pages, Netlify ou Vercel (le build utilise `base: './'` et un routage par hash). Une fois l'URL connue, renseigne-la dans Authentication → URL Configuration (Site URL).

## Installer sur Android
Ouvrir l'URL dans Chrome → menu ⋮ → « Installer l'application ».

## Recherche de livres (fonction serveur `books`)
La recherche passe par une fonction Supabase (`supabase/functions/books`) qui interroge Google Books **avec la clé du projet** et le catalogue de la BnF, et garde les réponses en cache (table `book_cache`).
Sans clé, Google refuse presque toutes les requêtes (quota anonyme partagé par tout le monde) : la recherche ne s'appuie alors que sur la BnF et Open Library.
La clé se range dans Supabase → Edge Functions → Secrets, sous le nom `GOOGLE_BOOKS_KEY`. Elle n'apparaît jamais dans l'appli.

## Garder la base éveillée
L'offre gratuite de Supabase met le projet en pause après 7 jours sans activité. Le workflow `.github/workflows/keepalive.yml` appelle la fonction `ping()` tous les 3 jours.
GitHub suspend les tâches planifiées d'un dépôt sans aucun commit pendant 60 jours : relance-la depuis l'onglet Actions si ça arrive.

## Dossier `dev/`
Scripts de test (mock Supabase, e2e Chrome headless). Non nécessaires à la production. `MOCK=1 npx vite build --outDir dist-mock` construit la version mock ; `dev/e2e.mjs` et `dev/e2e2.mjs` (v2 : grand écran, étagères, recherche, couvertures, boutique, discussion) la testent dans Chrome headless.
