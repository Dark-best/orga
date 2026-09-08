# 🧠 MindFlow

Application web de **cartes mentales / diagrammes de nœuds interactifs**, en **Single Page Application** vanilla JS (aucune étape de build), prête à déployer sur **GitHub Pages**, avec **Supabase** (PostgreSQL + Auth + RLS) et **inscription par invitation**.

---

## ✨ Fonctionnalités

- **Inscription restreinte par lien d'invitation à usage unique** (`/invite/x2jRRl9` ou `?invite=x2jRRl9`), validée **côté base de données** (impossible à contourner via l'API).
- **Auth email + mot de passe** (Supabase Auth) : inscription, connexion, déconnexion.
- **Multi-projets** : créer, renommer, supprimer, basculer sans rechargement.
- **Éditeur de canevas** : nœuds déplaçables (drag & drop), pan/zoom, liaisons en **courbes de Bézier SVG** parent → enfants, édition de texte en direct, ajout/suppression dynamique.
- **Autosave** dans Supabase (positions x/y, textes, relations, nom du projet) + **synchro temps réel** multi-onglets.

---

## 🏗️ Architecture du frontend

```
mind/
├── index.html          # Shell SPA + Tailwind (Play CDN) + charge config.js
├── 404.html            # Fallback GitHub Pages : /invite/TOKEN → #/invite/TOKEN
├── .nojekyll           # Désactive Jekyll sur GitHub Pages
├── config.js           # ⚙️ Clés Supabase + BASE_PATH (À ÉDITER)
├── js/
│   ├── app.js          # Bootstrap : déclaration des routes + garde d'auth
│   ├── router.js       # Routeur hash (#/route) compatible Pages
│   ├── supabase.js     # Client Supabase (import ESM via CDN)
│   ├── auth.js         # Vues + logique login / invite / logout
│   ├── dashboard.js    # Liste, création, renommage, suppression de projets
│   ├── editor.js       # Canevas : nœuds, drag&drop, Bézier SVG, autosave, realtime
│   └── ui.js           # Helpers (toasts, échappement HTML, debounce)
└── supabase/
    └── schema.sql      # Tables + fonctions + triggers + RLS
```

**Choix techniques**
- *Vanilla JS + modules ESM* : zéro build, se dépose tel quel sur GitHub Pages.
- *Routing par hash* : pas besoin de réécritures serveur ; `404.html` gère seulement les liens d'invitation « jolis ».
- *SVG + courbes de Bézier cubiques* pour des liaisons fluides, redessinées à chaque déplacement.
- *Coordonnées « monde »* : `viewport` transformé (`translate`/`scale`) → pan/zoom sans recalcul des nœuds.

---

## 🗄️ Structure des tables Supabase

| Table         | Rôle                                                              |
|---------------|------------------------------------------------------------------|
| `profiles`    | Miroir de `auth.users` (id, email).                              |
| `invitations` | Jetons d'inscription à usage unique (`token`, `used`, `used_by`).|
| `projects`    | Cartes mentales de l'utilisateur (`user_id`, `name`).            |
| `nodes`       | Nœuds : `project_id`, `parent_id`, `text`, `x`, `y`, `color`.    |

Sécurité : **RLS activée partout**. Chaque utilisateur n'accède qu'à ses projets/nœuds. La table `invitations` n'est **jamais** exposée directement — validation via la fonction `is_invite_valid()` et consommation via le trigger `handle_new_user()`.

Voir [`supabase/schema.sql`](supabase/schema.sql) pour le script complet.

---

## 🚀 Installation

### 1. Configurer Supabase
1. Créez un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor → New query** : collez tout `supabase/schema.sql`, exécutez.
3. **Authentication → Providers → Email** : activez Email. Pour un essai sans email, désactivez « Confirm email ».
4. *(Optionnel)* **Database → Replication** : ajoutez `nodes` à la publication `supabase_realtime` pour la synchro temps réel.
5. Générez une invitation :
   ```sql
   insert into public.invitations (token) values ('x2jRRl9');
   ```

### 2. Configurer l'application
Éditez [`config.js`](config.js) :
```js
window.MINDFLOW_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  BASE_PATH: "/mind", // nom du dépôt Pages, ou "" si domaine racine
};
```
> La clé `anon` est **publique par conception** — la sécurité repose sur la RLS.

### 3. Tester en local
Un simple serveur statique suffit (modules ES + CDN) :
```bash
npx serve .
```
Puis ouvrez `http://localhost:3000/#/invite/x2jRRl9`.

### 4. Déployer sur GitHub Pages
1. Poussez le dossier sur un dépôt GitHub.
2. **Settings → Pages → Source : Deploy from a branch → `main` / `root`**.
3. Dans **Supabase → Authentication → URL Configuration**, ajoutez votre URL Pages (`https://user.github.io/mind`) aux **Redirect URLs**.
4. Lien d'invitation partageable : `https://user.github.io/mind/invite/x2jRRl9`.

---

## 🛡️ Panneau administrateur

Un panneau `#/admin` réservé à **un utilisateur désigné** permet de :
- voir **tous les projets** (avec propriétaire + nb de cartes), les **ouvrir** ou les **supprimer** ;
- **créer / supprimer des invitations** et copier leur lien ;
- **gérer les utilisateurs** : promouvoir/retirer admin, supprimer un compte (cascade) ;
- consulter l'**usage de la base** (taille + jauge de quota, restant) et les compteurs globaux ;
- **supprimer des cartes** (nœuds) projet par projet.

### Activation
1. Exécutez [`supabase/admin.sql`](supabase/admin.sql) **après** `schema.sql`.
2. Dans ce fichier, l'email admin est déjà `fuchsromain10@gmail.com` — modifiez-le si besoin, puis
   ré-exécutez la ligne `update public.profiles set is_admin = true …`.
   > L'utilisateur doit s'être **inscrit au préalable** (le profil doit exister).
3. Ajustez `DB_QUOTA_MB` dans [`config.js`](config.js) selon votre offre Supabase.

### Sécurité (important)
Aucune clé `service_role` n'est utilisée côté client (elle serait publique sur Pages).
L'accès repose sur `profiles.is_admin` + des **fonctions `SECURITY DEFINER` gardées par `assert_admin()`** et des **policies RLS** dédiées. Un non-admin qui appelle une fonction `admin_*` reçoit `FORBIDDEN`.

---

## 🔒 Note sur l'inscription par invitation
L'application vérifie le jeton côté client (`is_invite_valid`) **pour l'UX**, mais l'application réelle de la règle se fait **dans la base** : le trigger `handle_new_user` lit `invite_token` dans les métadonnées d'inscription, refuse l'insertion si le jeton est absent/invalide/déjà utilisé, et le consomme atomiquement. Un appel API direct sans jeton valide échoue donc au niveau PostgreSQL.
