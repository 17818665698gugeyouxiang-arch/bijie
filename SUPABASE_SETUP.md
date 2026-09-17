# Supabase and GitHub Pages setup

1. In Supabase **Authentication → Providers → Email**, keep Email enabled and turn off email confirmation. In **Password security**, set the minimum password length to `8`. The game also enforces digits only and accepts passwords of 8 digits or more.
2. Open **SQL Editor**, run `supabase/migrations/001_players_and_progress.sql` once.
3. Deploy the two Edge Functions from the project root:
   ```powershell
   supabase login
   supabase link --project-ref wevmotwnnzknfclloeyh
   supabase functions deploy auth-signup --no-verify-jwt
   supabase functions deploy auth-login --no-verify-jwt
   ```
4. In Supabase **Edge Functions → Secrets**, set `ALLOWED_ORIGINS` to:
   ```
   https://17818665698gugeyouxiang-arch.github.io,http://localhost:5173
   ```
   Do not create or expose a `SUPABASE_SERVICE_ROLE_KEY` browser setting. The functions use the server-only secret supplied by Supabase.
5. Push this repository to GitHub. In GitHub **Settings → Pages**, choose **GitHub Actions** as the source. The included workflow then deploys `dist` to `https://17818665698gugeyouxiang-arch.github.io/bijie/`.

## What the cloud save contains

The current game saves every pig name and hit count, the selected pig, total hits, day/night setting, and empty slots for coins, level, XP, upgrades, unlocked content, achievements, inventory, purchased items, settings, and statistics. Supabase is authoritative after login. Browser storage is an offline cache only; signing in reloads the cloud version. A newly created account imports the current local game once, then future changes sync to Supabase automatically.

## Security checks

Only `sb_publishable_...` / anonymous keys belong in `dist/supabase-config.js`. Never commit a `service_role`, `sb_secret_...`, database password, or access token. Password hashes are managed by Supabase Auth in its protected `auth.users` schema; they are intentionally not copied into the public `players` table.

Create account A, hit once, then sign out. Create account B and confirm B begins with its own save. In the browser developer console while logged in as B, attempting `supabase.from('game_progress').select().eq('player_id','A_UUID')` must return no A row because the RLS policy requires `player_id = auth.uid()`.
