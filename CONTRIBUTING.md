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

## Database migrations (shared dev database)

We all use **one** Supabase dev project, so:

1. **Only one person pushes migrations at a time.** Post in the team chat first: "🗄️ Pushing migration `add_mood_checkins` now", then "✅ done".
2. Create a migration with `npm run db:new -- <name>`. Never edit one that has already been pushed.
3. **Every new table needs `enable row level security` plus explicit policies** in the same migration.
4. Run `npx supabase db push --dry-run`, then `npm run db:push`, then `npm run db:types`.
5. Commit the migration and the regenerated types in the same PR.
6. If two PRs both add migrations, the second one to merge must re-check that its timestamp still comes after the first. Run `npm run db:new` again if needed and move your SQL into the new file.

## Reviews

As a reviewer, open the preview URL and try the testing steps. Check for:
- RLS on new tables
- no secrets
- big tap targets and readable text on patient screens
- warm, non-clinical wording on the patient side
