// /api/orders — admin only (header: Authorization: Bearer <ADMIN_PASSWORD>)
//   GET                      → list all orders, newest first
//   PATCH  {id, status}      → change an order's status
//   DELETE ?id=...           → delete an order
const { redis, pipeline, isAdmin, send } = require("./_lib");

const STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];

module.exports = async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return send(res, 500, { ok: false, error: "no-admin-password" });
  if (!isAdmin(req)) return send(res, 401, { ok: false, error: "unauthorized" });

  try {
    if (req.method === "GET") {
      const ids = await redis("ZREVRANGE", "orders", "0", "-1");
      const raw = await pipeline(ids.map(id => ["GET", "order:" + id]));
      const orders = raw.filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      return send(res, 200, { ok: true, orders });
    }

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};

    if (req.method === "PATCH") {
      const id = String(b.id || "");
      if (!STATUSES.includes(b.status)) return send(res, 400, { ok: false, error: "status" });
      const s = await redis("GET", "order:" + id);
      if (!s) return send(res, 404, { ok: false, error: "not-found" });
      const o = JSON.parse(s);
      o.status = b.status;
      o.updatedAt = new Date().toISOString();
      if (typeof b.note === "string") o.note = b.note.slice(0, 500);
      await redis("SET", "order:" + id, JSON.stringify(o));
      return send(res, 200, { ok: true, order: o });
    }

    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || b.id || "");
      if (!id) return send(res, 400, { ok: false, error: "id" });
      await pipeline([["DEL", "order:" + id], ["ZREM", "orders", id]]);
      return send(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return send(res, 405, { ok: false, error: "method" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: "server" });
  }
};
