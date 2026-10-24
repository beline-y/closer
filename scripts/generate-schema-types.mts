// Mirror the pending migration without accessing the team's shared database.
// After the coordinated push, npm run db:types remains the canonical generator.
import { readFile, writeFile } from "node:fs/promises";
import { testDatabase } from "../tests/database";

const db = await testDatabase();
const enums = (await db.query<{ name: string; labels: string[] }>(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  where t.typnamespace = 'public'::regnamespace group by t.typname order by t.typname
`)).rows;
const enumNames = new Set(enums.map((e) => e.name));
const tables = await db.query<{ table_name: string }>(
  "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
);
let tableTypes = "";
for (const { table_name } of tables.rows) {
  const result = await db.query<{ column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }>(
    "select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", [table_name],
  );
  const fields = result.rows.map((c) => ({
    name: c.column_name, nullable: c.is_nullable === "YES", optional: c.is_nullable === "YES" || c.column_default !== null,
    type: c.data_type === "USER-DEFINED" ? `Database["public"]["Enums"]["${c.udt_name}"]`
      : c.data_type === "ARRAY" ? (enumNames.has(c.udt_name.slice(1)) ? `Database["public"]["Enums"]["${c.udt_name.slice(1)}"][]` : "string[]") : c.data_type === "jsonb" ? "Json"
      : c.data_type === "boolean" ? "boolean" : ["smallint", "integer", "bigint"].includes(c.data_type) ? "number" : "string",
  }));
  const uniqueColumns = new Set((await db.query<{ column_name: string }>(`
    select min(kcu.column_name) as column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
    where tc.table_schema = 'public' and tc.table_name = $1 and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
    group by tc.constraint_name having count(*) = 1`, [table_name])).rows.map((r) => r.column_name));
  tableTypes += `      ${table_name}: {\n`;
  for (const kind of ["Row", "Insert", "Update"]) {
    tableTypes += `        ${kind}: {\n${fields.map((f) => `          ${f.name}${kind === "Update" || (kind === "Insert" && f.optional) ? "?" : ""}: ${f.type}${f.nullable ? " | null" : ""}`).join("\n")}\n        }\n`;
  }
  const foreignKeys = await db.query<{ name: string; column: string; target: string; target_column: string }>(`
    select tc.constraint_name as name, kcu.column_name as column, ccu.table_name as target, ccu.column_name as target_column
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name and tc.constraint_schema = ccu.constraint_schema
    where tc.table_schema = 'public' and tc.table_name = $1 and tc.constraint_type = 'FOREIGN KEY' and ccu.table_schema = 'public'`, [table_name]);
  tableTypes += `        Relationships: [\n${foreignKeys.rows.map((f) => `          { foreignKeyName: "${f.name}"; columns: ["${f.column}"]; isOneToOne: ${uniqueColumns.has(f.column)}; referencedRelation: "${f.target}"; referencedColumns: ["${f.target_column}"] }`).join(",\n")}\n        ]\n      }\n`;
}
const path = "src/lib/supabase/database.types.ts";
let source = await readFile(path, "utf8");
source = source.replace(/    Tables: \{[\s\S]*?    Views: \{/, `    Tables: {\n${tableTypes}    }\n    Views: {`);
const types = new Map((await db.query<{ oid: number; typname: string; typelem: number }>(
  "select oid, typname, typelem from pg_type",
)).rows.map((t) => [t.oid, t]));
function typeFor(oid: number): string {
  const type = types.get(oid);
  if (!type) throw new Error(`Unknown Postgres type ${oid}`);
  if (type.typelem) return `${typeFor(type.typelem)}[]`;
  if (enumNames.has(type.typname)) return `Database["public"]["Enums"]["${type.typname}"]`;
  if (tables.rows.some((t) => t.table_name === type.typname)) return `Database["public"]["Tables"]["${type.typname}"]["Row"]`;
  if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(type.typname)) return "number";
  if (["json", "jsonb", "record"].includes(type.typname)) return "Json";
  return type.typname === "bool" ? "boolean" : type.typname === "void" ? "undefined" : "string";
}
const functions = (await db.query<{
  proname: string; proargnames: string[] | null; argtypes: number[];
  proallargtypes: number[] | null; proargmodes: string[] | null;
  pronargdefaults: number; prorettype: number; proretset: boolean;
}>(`select proname, proargnames, proargtypes::oid[] as argtypes, proallargtypes, proargmodes,
  pronargdefaults, prorettype, proretset from pg_proc
  where pronamespace = 'public'::regnamespace and prokind = 'f'
  and prorettype <> 'trigger'::regtype order by proname`)).rows;
const functionTypes = functions.map((f) => {
  const args = f.argtypes.map((oid, i) => `${f.proargnames?.[i] ?? `arg${i + 1}`}${i >= f.argtypes.length - f.pronargdefaults ? "?" : ""}: ${typeFor(oid)}`);
  const outputs = f.proallargtypes?.flatMap((oid, i) => ["o", "t"].includes(f.proargmodes?.[i] ?? "")
    ? [`${f.proargnames?.[i]}: ${typeFor(oid)}`] : []) ?? [];
  const returns = outputs.length ? `{ ${outputs.join("; ")} }` : typeFor(f.prorettype);
  return `      ${f.proname}: { Args: ${args.length ? `{ ${args.join("; ")} }` : "Record<PropertyKey, never>"}; Returns: ${returns}${f.proretset ? "[]" : ""} }`;
}).join("\n");
source = source.replace(/    Functions: \{[\s\S]*?    Enums: \{/, `    Functions: {\n${functionTypes}\n    }\n    Enums: {`);
source = source.replace(/    Enums: \{[\s\S]*?    CompositeTypes: \{/, `    Enums: {\n${enums.map((e) => `      ${e.name}: ${e.labels.map((l) => JSON.stringify(l)).join(" | ")}`).join("\n")}\n    }\n    CompositeTypes: {`);
source = source.replace(/export const Constants = [\s\S]*$/, `export const Constants = ${JSON.stringify({ public: { Enums: Object.fromEntries(enums.map((e) => [e.name, e.labels])) } }, null, 2)} as const\n`);
await writeFile(path, source);
await db.close();
