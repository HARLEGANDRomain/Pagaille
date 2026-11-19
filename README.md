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

## Dossier `dev/`
Scripts de test (mock Supabase, e2e Chrome headless). Non nécessaires à la production. `MOCK=1 npx vite build --outDir dist-mock` construit la version mock.
