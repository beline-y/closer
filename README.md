# Closer 💛

Test branche Louis

Closer connects hospitalized children and isolated patients with their family, friends, care team and inspiring volunteers, to make hospital stays less lonely.
Patients share their mood and send one-tap nudges, family members answer with comfort cards and shared questions, and the care team follows wellbeing over time.
**This is a demo: all data is fictional.** Product spec: [docs/SPEC.md](docs/SPEC.md).

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Auth, Postgres + RLS, Storage, Realtime) · Vercel

---

## Prerequisites

- **Node.js LTS** (v24 recommended, v20.9 minimum): `node -v`
- **Git**: `git --version`
- **A GitHub account** with access to this repo
- No Docker and no local database. We all share one **cloud Supabase dev project**.

No space on your machine? Use **GitHub Codespaces** (see below).

## Setup (about 5 minutes)

```bash
git clone https://github.com/beline-y/closer.git
cd closer
npm install
cp .env.example .env.local
```

Open `.env.local` and fill in the two dev Supabase values the team lead sent you privately:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

For the demo role picker, also fill in the demo passwords (they're in the table below):

```dotenv
DEMO_MODE=true
DEMO_PASSWORD=...      # the adults' password
DEMO_PATIENT_PIN=...   # Leo's PIN
```

Leave the other values empty unless a feature needs them.

Optional quick UI check:

```bash
npm run dev     # http://localhost:3000
```

The landing page footer shows **🟢 Supabase connected** when your keys are right.

## How we test: Vercel previews

We test features on **Vercel preview deployments**, not on localhost.

1. Push your branch: `git push -u origin feature/my-thing`
2. Open a pull request. The Vercel bot comments with a **preview URL**, a live copy of the app built from your branch.
3. Test there, and share the link with your reviewer.
4. Merge into `main`. Vercel then redeploys the main site.

Previews and `main` both use the shared **dev** Supabase project for now. Production will get its own project later.

## Demo accounts (fictional)

With `DEMO_MODE=true`, the landing page shows **Choose a demo role**: one tap signs you in as Leo, Emma, Sarah or Maya. The banner's **Switch role** button signs you out and brings you back to the picker.

| Who | Role | Email | Password |
|---|---|---|---|
| Leo, 9 | Patient | `leo.patient@example.com` | PIN `135790` (patient code `LEO123`) |
| Emma | Family (mom, guardian of Leo) | `emma@example.com` | `CloserDemo2026!` |
| James | Family (dad) | `james@example.com` | `CloserDemo2026!` |
| Noah | Friend (Leo's best friend from school) | `noah@example.com` | `CloserDemo2026!` |
| Sarah | Care team (pediatric nurse) | `sarah.nurse@example.com` | `CloserDemo2026!` |
| Maya | Volunteer (marine biologist) | `maya.volunteer@example.com` | `CloserDemo2026!` |
| Daniel | Volunteer (airline pilot) | `daniel.volunteer@example.com` | `CloserDemo2026!` |

Volunteers are never linked to a patient and can't read any patient data (see the SPEC, design principle 5).

These passwords are public on purpose: they only unlock fictional demo data in the dev project. Never reuse them for anything real.

## Database changes (migrations)

Every schema change is a SQL file in `supabase/migrations/`. **We share one dev database, so only one person pushes migrations at a time.** Announce it in the team chat first.

One-time setup on your machine:

```bash
npx supabase login                                 # opens the browser
npx supabase link --project-ref <dev-project-ref>  # asks for the dev DB password
```

Each new migration:

```bash
npm run db:new -- add_mood_checkins   # creates supabase/migrations/<timestamp>_add_mood_checkins.sql
# write your SQL, including RLS for every new table, and pgTAP tests in supabase/tests/
npx supabase db push --dry-run        # shows what would run, changes nothing
npm run db:push                       # applies it to the shared dev project
npm run db:types                      # regenerates TypeScript types from the database
npm run db:test                       # RLS tests
```

Then commit the migration file and the regenerated types in your PR.

Seed data (`supabase/seed.sql`, fictional only) is applied with `npm run db:seed` (pending migrations, then the whole seed file). It's safe to re-run: it resets the demo cast and their data.

Rules:

- Never edit a migration that has already been pushed. Write a new one instead.
- Never change the dev database by hand in the Supabase dashboard. The migrations folder is the source of truth.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (optional) |
| `npm run check` | Lint + typecheck. Run it before every commit. |
| `npm run build` | Production build (CI also runs this) |
| `npm run db:push` | Apply new migrations to the dev project |
| `npm run db:seed` | Apply migrations + seed data |
| `npm run db:test` | Run the pgTAP RLS tests in `supabase/tests/` on the dev project (rolled back, writes nothing) |
| `npm run db:types` | Regenerate `database.types.ts` |

## Project structure

```text
src/app/
  page.tsx                 landing page
  (patient)/patient/       patient dashboard
  (family)/family/         family & friends dashboard
  (care)/care/             care team dashboard
  (volunteer)/volunteer/   volunteer dashboard
src/components/            shared components (ui/ = shadcn)
src/lib/supabase/          Supabase clients (browser + server)
supabase/migrations/       SQL migrations (schema + RLS)
supabase/seed.sql          fictional demo data
docs/SPEC.md               product spec
```

## GitHub Codespaces (no local install)

1. On the repo page: **Code → Codespaces → Create codespace on main**.
2. Add the two Supabase values as **Codespaces secrets**: github.com → Settings → Codespaces → Secrets. Use the same names as in `.env.example`, and give the secrets access to this repo. They become environment variables, so no `.env.local` is needed. Or create `.env.local` inside the codespace.
3. Dependencies install automatically. Run `npm run dev` and open the forwarded port 3000.

## Security rules

- Never commit `.env.local` or any key. Only `.env.example` (placeholders) is tracked.
- `SUPABASE_SECRET_KEY` bypasses RLS. Only server code may read it, and it must **never** get a `NEXT_PUBLIC_` prefix.
- Every table has Row Level Security enabled with explicit policies.
- Never use real patient data, anywhere.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the team workflow and [GIT_GUIDE.md](GIT_GUIDE.md) for a Git cheat sheet.
