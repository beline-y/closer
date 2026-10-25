# Contributing to Closer

## The loop

1. **Pick an issue** on GitHub and assign yourself.
2. **Start from an up-to-date main:**
   ```bash
   git switch main
   git pull
   git switch -c feature/mood-checkin
   ```
3. **Commit small and often**, using Conventional Commits (see below).
4. **Push and open a pull request:**
   ```bash
   git push -u origin feature/mood-checkin
   gh pr create --fill   # or open the PR on github.com
   ```
5. **Test on the Vercel preview URL** posted on your PR, and add testing steps to the PR description.
6. **One reviewer approves**, then the author merges (Squash and merge).
7. Delete the branch, go back to `main`, `git pull`, and start the next one.

## Rules

- **Never commit to `main` directly.** Everything goes through a pull request.
- **Never force push** to a shared branch, and never rewrite `main`'s history.
- **Pull `main` before starting new work**, and update your branch from `main` if it's getting old (see GIT_GUIDE.md).
- **Run `npm run check`** (lint + types) before pushing. CI runs it on every PR.
- **No secrets** in commits: no `.env*` files except `.env.example`, no keys in code.
- **Keep the repo light:** no build output, no large files. Compress images (WebP, ideally under 200 KB) and prefer SVG icons.
- **Fictional data only.**

## Branch names

| Prefix | Use for | Example |
|---|---|---|
| `feature/` | new functionality | `feature/nudges` |
| `fix/` | bug fixes | `fix/cooldown-timer` |
| `chore/` | tooling, deps, config | `chore/update-supabase-cli` |
| `docs/` | documentation only | `docs/readme-codespaces` |

## Commit messages (Conventional Commits)

```
<type>(<optional scope>): <what changed, in the imperative>
```

| Type | When |
|---|---|
| `feat` | a new feature |
| `fix` | a bug fix |
| `chore` | tooling, config, dependencies |
| `docs` | documentation |
| `refactor` | code change with no behavior change |
| `style` | formatting, CSS-only tweaks |
| `test` | tests |

Examples:
- `feat(nudges): add I miss you button with cooldown`
- `fix(auth): redirect patients to /patient after PIN login`
- `docs: explain migration workflow`

## Database migrations

We all use **one** Supabase dev project, and production deploys from `main`. A migration
pushed to that database changes it for everyone, right away.

1. **Always `git pull origin main` before creating or pushing a migration.** `npx supabase migration list` must show the same versions under Local and Remote.
2. **A migration pushed to the shared database must reach `main` quickly**, in a small PR with only the migration file and the regenerated `src/lib/supabase/database.types.ts`. The feature code can follow in its own PR.
3. **Announce every `db:push` in the team chat with the file name**: "🗄️ Pushing `20261024205123_nudges.sql`", then "✅ done". One person at a time.
4. **Never use `supabase migration repair` without telling the team first.** It rewrites the shared migration history.
5. **If `db push` refuses because of an unknown remote migration**, a teammate pushed one you don't have: get their file **through `main`** (ask them to merge their migration PR, then pull). Never delete, rewrite or hand-copy their file.
6. Create a migration with `npm run db:new -- <name>`. Never edit one that has already been pushed: write a new one.
7. **Every new table needs `enable row level security` plus explicit policies** in the same migration, and pgTAP tests in `supabase/tests/` (`npm run db:test`).
8. Run `npx supabase db push --dry-run`, then `npm run db:push`, then `npm run db:types`.
9. Never drop or rename a column that `main` still uses: production would break. Add the new shape first, ship the code, then remove the old one in a later migration.

## Reviews

As a reviewer, open the preview URL and try the testing steps. Check for:
- RLS on new tables
- no secrets
- big tap targets and readable text on patient screens
- warm, non-clinical wording on the patient side
