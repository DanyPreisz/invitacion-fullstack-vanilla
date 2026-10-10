import { URL } from "node:url";
import { connect, events, isReady, mapEvent, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const RSVP = new Set(["pendiente", "si", "no", "tal vez"]);
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function dayKey(date = new Date()) { return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/events") {
    const rows = await events().find({ userId }).sort({ day: 1 }).limit(40).toArray();
    return sendJson(res, 200, { events: rows.map(mapEvent), yes: rows.filter((row) => row.rsvp === "si").length });
  }
  if (method === "POST" && pathname === "/api/events") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "El titulo es obligatorio" });
    const result = await events().insertOne({ userId, title: title.slice(0, 60), place: String(body.place || "").slice(0, 80), day: /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayKey(), rsvp: "pendiente", createdAt: new Date() });
    return sendJson(res, 201, { event: mapEvent(await events().findOne({ _id: result.insertedId })) });
  }
  const rsvp = pathname.match(/^\/api\/events\/([a-fA-F0-9]{24})\/rsvp$/);
  if (rsvp && method === "POST") {
    const body = await readJson(req);
    const next = RSVP.has(body.rsvp) ? body.rsvp : "pendiente";
    const result = await events().updateOne({ _id: toId(rsvp[1]), userId }, { $set: { rsvp: next } });
    if (!result.matchedCount) return sendJson(res, 404, { error: "Evento no encontrado" });
    return sendJson(res, 200, { event: mapEvent(await events().findOne({ _id: toId(rsvp[1]) })) });
  }
  const match = pathname.match(/^\/api\/events\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await events().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Evento no encontrado" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Invitacion en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
