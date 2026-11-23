// POST /api/order — called by the landing page form. Saves one order.
const { pipeline, send } = require("./_lib");

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const toLatin = s => s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { ok: false, error: "method" }); }

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return send(res, 400, { ok: false, error: "body" });

  // Honeypot: real visitors never fill this hidden field.
  if (b.website) return send(res, 200, { ok: true });

  const order = {
    name: clean(b.name, 120),
    phone: toLatin(clean(b.phone, 30)),
    gov: clean(b.gov, 60),
    city: clean(b.city, 120),
    address: clean(b.address, 600),
    pack: clean(b.pack, 40),
    packTitle: clean(b.packTitle, 80),
    qty: Math.max(1, Math.min(99, parseInt(b.qty, 10) || 1)),
    total: Math.max(0, Math.min(1e7, Number(b.total) || 0))
  };

  const errors = [];
  if (order.name.length < 2) errors.push("name");
  if (!/^(?:20)?01[0125]\d{8}$/.test(order.phone)) errors.push("phone");
  if (order.gov.length < 2) errors.push("gov");
  if (order.city.length < 2) errors.push("city");
  if (order.address.length < 2) errors.push("address");
  if (errors.length) return send(res, 400, { ok: false, error: "invalid", fields: errors });

  const now = Date.now();
  const id = now.toString(36) + Math.random().toString(36).slice(2, 6);
  Object.assign(order, {
    id,
    createdAt: new Date(now).toISOString(),
    status: "new",
    ua: clean(req.headers["user-agent"], 200),
    ref: clean(b.ref, 300)
  });

  try {
    // Simple per-phone throttle: max 5 orders per phone per hour.
    const rl = "rl:" + order.phone;
    const [, count] = await pipeline([["SET", rl, "0", "EX", "3600", "NX"], ["INCR", rl]]);
    if (count > 5) return send(res, 429, { ok: false, error: "rate" });

    await pipeline([
      ["SET", "order:" + id, JSON.stringify(order)],
      ["ZADD", "orders", String(now), id]
    ]);
    return send(res, 200, { ok: true, id });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: "server" });
  }
};
