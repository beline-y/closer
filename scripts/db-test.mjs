// Runs the pgTAP files in supabase/tests/ against the linked dev project, without Docker.
// Each file runs inside begin ... rollback, so nothing is written.
// (With Docker, `supabase test db` runs the same files unchanged.)
//
// `supabase db query` only returns the last result set, so each assertion's TAP line
// is captured into a temp table and read back just before the rollback.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = "supabase/tests";
const files = readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort();
const ASSERTION = /^select (plan|ok|is|isnt|throws_ok|lives_ok|results_eq|set_eq|bag_eq|is_empty|cmp_ok|finish)\(/gm;
let failed = 0;

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  const begin = sql.indexOf("begin;");
  const rollback = sql.lastIndexOf("rollback;");
  if (begin === -1 || rollback === -1) throw new Error(`${file} must run inside begin; ... rollback;`);

  const capture =
    "\ncreate temp table _tap (id serial, line text);\n" +
    "grant insert on _tap to authenticated, anon, service_role;\ngrant usage on sequence _tap_id_seq to authenticated, anon, service_role;\n";
  const body = sql
    .slice(begin + "begin;".length, rollback)
    .replace("select * from finish();", "select finish();")
    .replace(ASSERTION, "insert into _tap (line) select $1(");
  const query = `begin;${capture}${body}reset role;\nselect line from _tap order by id;\nrollback;\n`;

  const tmp = mkdtempSync(join(tmpdir(), "closer-db-test-"));
  const queryFile = join(tmp, file);
  writeFileSync(queryFile, query);
  let out;
  try {
    out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", queryFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const { rows } = JSON.parse(out.slice(out.indexOf("{")));
  const tap = rows.map((r) => r.line).join("\n");

  console.log(`\n# ${file}\n${tap}`);
  const planned = Number(/^1\.\.(\d+)/m.exec(tap)?.[1] ?? 0);
  const passed = (tap.match(/^ok \d+/gm) ?? []).length;
  const notOk = (tap.match(/^not ok \d+/gm) ?? []).length;
  if (notOk || passed !== planned) failed += notOk || 1;
}

console.log(failed ? `\n${failed} failure(s)` : "\nAll RLS tests passed");
process.exit(failed ? 1 : 0);
