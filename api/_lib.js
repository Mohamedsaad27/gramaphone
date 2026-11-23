// Shared helpers for the API routes (files starting with "_" are not exposed as routes on Vercel).
// Storage: Upstash Redis REST API — add it from Vercel → Storage → Upstash (Redis); it injects the env vars below.

const env = process.env;
const URL_ = env.MY_GRAMAPHONE_KV_REST_API_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const TOKEN = env.MY_GRAMAPHONE_KV_REST_API_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

function ensure() {
  if (!URL_ || !TOKEN) throw new Error("Redis is not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)");
}

async function redis(...cmd) {
  ensure();
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Redis error: " + (j.error || r.status));
  return j.result;
}

async function pipeline(cmds) {
  if (!cmds.length) return [];
  ensure();
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) throw new Error("Redis pipeline error: " + r.status);
  const bad = j.find(x => x && x.error);
  if (bad) throw new Error("Redis pipeline error: " + bad.error);
  return j.map(x => x.result);
}

function isAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  const h = req.headers["authorization"] || "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (given.length !== pass.length) return false;
  let diff = 0;
  for (let i = 0; i < pass.length; i++) diff |= given.charCodeAt(i) ^ pass.charCodeAt(i);
  return diff === 0;
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

module.exports = { redis, pipeline, isAdmin, send };
