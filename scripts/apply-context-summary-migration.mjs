import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = {
  ...loadEnv(path.join(root, ".env")),
  ...loadEnv(path.join(root, "web", ".env.local")),
};

const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(root, "supabase", "migrations", "004_context_summary.sql"),
  "utf8"
);

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "count=exact",
};

async function columnsExist() {
  const res = await fetch(
    `${url}/rest/v1/chats?select=id,context_summary,compacted_through_at&limit=1`,
    { headers }
  );
  if (res.ok) return true;
  const body = await res.text();
  const lower = body.toLowerCase();
  if (
    lower.includes("context_summary") ||
    lower.includes("compacted_through_at") ||
    lower.includes("does not exist")
  ) {
    return false;
  }
  console.warn("Column probe unexpected response:", res.status, body);
  return false;
}

async function runViaRpc() {
  for (const fn of ["exec_sql", "execute_sql", "run_sql"]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.text();
    if (res.ok) return { ok: true, via: fn };
    if (!body.toLowerCase().includes("could not find")) {
      return { ok: false, via: fn, error: body };
    }
  }
  return { ok: false, via: null, error: "No exec_sql RPC available" };
}

async function runViaPgMeta() {
  for (const endpoint of [`${url}/pg/query`]) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: sql }),
      });
      if (res.ok) return { ok: true, via: endpoint };
    } catch {
      // ignore
    }
  }
  return { ok: false, via: null, error: "pg/query unavailable" };
}

async function runViaManagementApi() {
  const token = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_MANAGEMENT_TOKEN;
  const ref =
    env.SUPABASE_PROJECT_REF ||
    (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1];
  if (!token || !ref) {
    return {
      ok: false,
      error: "Missing SUPABASE_ACCESS_TOKEN or project ref",
    };
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await res.text();
  if (!res.ok) return { ok: false, error: `${res.status} ${body}` };
  return { ok: true, via: "management-api" };
}

async function main() {
  if (await columnsExist()) {
    console.log("Migration already applied: context_summary columns exist.");
    return;
  }

  console.log("Columns missing — applying 004_context_summary.sql ...");

  let result = await runViaRpc();
  if (!result.ok) result = await runViaPgMeta();
  if (!result.ok) result = await runViaManagementApi();

  if (!result.ok) {
    console.error(
      [
        "Could not run DDL automatically with available credentials.",
        result.error || "",
        "",
        "SQL to run:",
        sql.trim(),
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(`Applied via ${result.via}`);
  if (!(await columnsExist())) {
    console.error("Migration reported success but columns still missing.");
    process.exit(1);
  }
  console.log("Verified: context_summary + compacted_through_at are present.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
