import {createServer} from "node:http";
import {mkdir, readFile, realpath, stat} from "node:fs/promises";
import {dirname, resolve, relative, extname, isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash, randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {validPasswordHash, verifyPassword} from "./auth.mjs";
import {isIP} from "node:net";
import {renderLanding, escapeHtml} from "./render.mjs";

const defaultRoot = dirname(fileURLToPath(import.meta.url));
const sessionLifetime = 8 * 60 * 60 * 1000;
const cookieName = "fkuss_landing_admin";
const statuses = new Set(["new", "contacted", "working", "completed"]);
const types = {".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".webp":"image/webp", ".svg":"image/svg+xml", ".woff2":"font/woff2"};
const publicFiles = new Set(["/index.html", "/styles.css", "/app.js", "/preview.html", "/preview.css", "/preview.js", "/admin.css", "/admin.js", "/content/landing.json"]);
const assetTypes = new Set([".png", ".webp", ".svg", ".woff2"]);

class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
function json(response, status, data) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8"});
  response.end(JSON.stringify(data));
}
function redirect(response, path) { response.writeHead(303, {"Location":path}).end(); }
function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
function readToken(request) {
  const value = (request.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="));
  const token = value?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || "") ? token : null;
}
function inside(root, target) {
  const difference = relative(root, target);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}
async function readJson(request, maximum = 8192) {
  if ((request.headers["content-type"] || "").split(";")[0].trim() !== "application/json") {
    request.resume();
    throw new HttpError(415, "Ожидается JSON.");
  }
  return new Promise((resolveBody, reject) => {
    let size = 0, chunks = [], failed = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > maximum) {
        if (!failed) reject(new HttpError(413, "Слишком большой запрос."));
        failed = true; chunks = [];
      } else if (!failed) chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      if (failed) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON");
        resolveBody(body);
      } catch { reject(new HttpError(400, "Не удалось прочитать данные.")); }
    });
  });
}
function validateLead(body) {
  const fields = {};
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  const digits = rawPhone.replace(/\D/g, "");
  if (rawPhone.length > 40 || !/^[+()\d\s.-]+$/.test(rawPhone) || !/^[78]\d{10}$/.test(digits)) fields.phone = true;
  const contactName = body.contactName === undefined ? "" : typeof body.contactName === "string" ? body.contactName.trim() : null;
  if (contactName === null || contactName.length > 120 || /[\u0000-\u001f]/.test(contactName)) fields.contactName = true;
  const restaurant = body.restaurant === undefined ? "" : typeof body.restaurant === "string" ? body.restaurant.trim() : null;
  if (restaurant === null || restaurant.length > 120 || /[\u0000-\u001f]/.test(restaurant)) fields.restaurant = true;
  const menu = body.menu === undefined ? "" : typeof body.menu === "string" ? body.menu.trim() : null;
  if (menu === null || menu.length > 2048) fields.menu = true;
  else if (menu) {
    try {
      const url = new URL(menu);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fields.menu = true;
    } catch { fields.menu = true; }
  }
  if (Object.keys(fields).length) throw new HttpError(422, "Проверьте поля заявки.", fields);
  return {phone:"+7" + digits.slice(1), contactName, restaurant, menu};
}

export async function createLandingServer(options = {}) {
  const root = await realpath(options.root || defaultRoot);
  const configFile = options.configFile || resolve(defaultRoot, "../secrets/landing/admin.json");
  const auth = options.auth || JSON.parse(await readFile(configFile, "utf8"));
  if (typeof auth.login !== "string" || !auth.login || !validPasswordHash(auth.passwordHash)) throw new Error("Invalid private admin configuration");
  const databasePath = options.databasePath || resolve(defaultRoot, "../secrets/landing/leads.db");
  if (inside(root, resolve(databasePath))) throw new Error("Database must be outside the public directory");
  await mkdir(dirname(databasePath), {recursive:true, mode:0o700});
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  db.exec("CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, phone TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', restaurant TEXT NOT NULL, menu TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', comment TEXT NOT NULL DEFAULT ''); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);");
  if (!db.prepare("PRAGMA table_info(leads)").all().some(column => column.name === "contact_name")) {
    db.exec("ALTER TABLE leads ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';");
  }
  const insertLead = db.prepare("INSERT INTO leads (created_at, phone, contact_name, restaurant, menu) VALUES (?, ?, ?, ?, ?)");
  const allLeads = db.prepare("SELECT id, created_at AS createdAt, phone, contact_name AS contactName, restaurant, menu, status, comment FROM leads ORDER BY id DESC");
  const updateLead = db.prepare("UPDATE leads SET status = ?, comment = ? WHERE id = ?");
  const findSession = db.prepare("SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?");
  const insertSession = db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)");
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const pruneSessions = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  const now = options.now || Date.now;
  const limits = new Map();
  const production = options.production === true;
  const preview = options.preview === true;
  if (production && (!options.origin || new URL(options.origin).protocol !== "https:")) throw new Error("Production requires an HTTPS origin");
  const normalizeIP = value => value?.startsWith("::ffff:") ? value.slice(7) : value;
  const trustedProxyIPs = new Set((options.trustedProxyIPs || []).map(value => {
    if (!isIP(value)) throw new Error("Invalid trusted proxy IP");
    return normalizeIP(value);
  }));
  const staticCache = new Map();
  const renderIndex = async () => {
    const [template, rawContent] = await Promise.all([readFile(resolve(root, "index.html"), "utf8"), readFile(resolve(root, "content/landing.json"), "utf8")]);
    return Buffer.from(renderLanding(template, JSON.parse(rawContent), {origin:options.origin, production, preview}));
  };
  const productionIndex = production ? await renderIndex() : null;

  function clientIP(request) {
    const peer = normalizeIP(request.socket.remoteAddress);
    const forwarded = request.headers["x-forwarded-for"];
    if (trustedProxyIPs.has(peer) && typeof forwarded === "string" && isIP(forwarded.trim())) return normalizeIP(forwarded.trim());
    return peer;
  }

  function gate(request, kind, maximum) {
    const time = now();
    for (const [key, entry] of limits) if (entry.until <= time) limits.delete(key);
    const key = kind + ":" + clientIP(request);
    const entry = limits.get(key) || {count:0, until:time + 10 * 60 * 1000};
    limits.set(key, entry); entry.count++;
    if (entry.count > maximum) throw new HttpError(429, "Слишком много попыток. Попробуйте через несколько минут.");
  }
  function authenticated(request) {
    const token = readToken(request);
    return token && findSession.get(tokenHash(token), now());
  }
  function checkOrigin(request) {
    const expected = options.origin || "http://" + request.headers.host;
    if (request.headers["sec-fetch-site"] === "cross-site" || (request.headers.origin && request.headers.origin !== expected)) throw new HttpError(403, "Запрос с другого сайта отклонён.");
  }
  function cookie(token, request, clear = false) {
    const secure = options.origin?.startsWith("https:") || request.socket.encrypted;
    return cookieName + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (clear ? 0 : sessionLifetime / 1000) + (secure ? "; Secure" : "");
  }
  async function serve(request, response, pathname) {
    const target = resolve(root, "." + pathname);
    if (!inside(root, target)) throw new HttpError(403, "Доступ закрыт.");
    let resolved, fileStat;
    try {
      resolved = await realpath(target);
      if (!inside(root, resolved)) throw new HttpError(403, "Доступ закрыт.");
      fileStat = await stat(resolved);
      if (!fileStat.isFile()) throw new HttpError(404, "Страница не найдена.");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(404, "Страница не найдена.");
    }
    let data;
    const cacheable = production && !["/admin.html", "/login.html"].includes(pathname);
    const cached = cacheable && staticCache.get(resolved);
    if (cached && cached.mtime === fileStat.mtimeMs) data = cached.data;
    else {
      data = pathname === "/index.html" ? (productionIndex || await renderIndex()) : await readFile(resolved);
      if (cacheable) staticCache.set(resolved, {mtime:fileStat.mtimeMs, data});
    }
    if (cacheable) {
      const etag = '"' + createHash("sha256").update(data).digest("hex").slice(0, 24) + '"';
      response.setHeader("Cache-Control", pathname.startsWith("/assets/") ? "public, max-age=86400" : "no-cache");
      response.setHeader("ETag", etag);
      if ((request.headers["if-none-match"] || "").split(",").map(value => value.trim()).includes(etag)) return response.writeHead(304).end();
    }
    response.writeHead(200, {"Content-Type":types[extname(resolved)] || "application/octet-stream"});
    response.end(request.method === "HEAD" ? undefined : data);
  }

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
    try {
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
      catch { throw new HttpError(400, "Неверный адрес."); }
      if (!production || preview || pathname.startsWith("/admin") || pathname.startsWith("/api/") || pathname.startsWith("/preview") || pathname === "/login.html") response.setHeader("X-Robots-Tag", "noindex, nofollow");
      const get = request.method === "GET" || request.method === "HEAD";
      if (["POST", "PATCH"].includes(request.method)) checkOrigin(request);
      if (get && pathname === "/healthz") {
        db.prepare("SELECT 1").get();
        return json(response, 200, {ok:true});
      }
      if (get && production && ["/robots.txt", "/sitemap.xml"].includes(pathname)) {
        if (preview) {
          if (pathname === "/sitemap.xml") throw new HttpError(404, "Страница не найдена.");
          response.writeHead(200, {"Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-cache"});
          return response.end(request.method === "HEAD" ? undefined : "User-agent: *\nDisallow: /\n");
        }
        const canonical = new URL("/", options.origin).href;
        const robots = "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /preview\nSitemap: " + new URL("/sitemap.xml", canonical).href + "\n";
        const sitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + escapeHtml(canonical) + '</loc></url></urlset>';
        response.writeHead(200, {"Content-Type":pathname === "/robots.txt" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8", "Cache-Control":"no-cache"});
        return response.end(request.method === "HEAD" ? undefined : pathname === "/robots.txt" ? robots : sitemap);
      }
      if (production && pathname.startsWith("/preview")) throw new HttpError(404, "Страница не найдена.");

      if (pathname === "/api/leads" && request.method === "POST") {
        gate(request, "leads", 15);
        const body = await readJson(request);
        if (typeof body.website === "string" && body.website.trim()) return json(response, 202, {ok:true});
        const lead = validateLead(body);
        insertLead.run(new Date(now()).toISOString(), lead.phone, lead.contactName, lead.restaurant, lead.menu);
        return json(response, 201, {ok:true});
      }
      if (pathname === "/api/admin/login" && request.method === "POST") {
        gate(request, "login", 5);
        const body = await readJson(request);
        if (typeof body.login !== "string" || typeof body.password !== "string" || body.login.length > 64 || body.password.length > 256) throw new HttpError(401, "Неверный логин или пароль.");
        const passwordCorrect = await verifyPassword(body.password, auth.passwordHash);
        if (body.login.trim() !== auth.login || !passwordCorrect) throw new HttpError(401, "Неверный логин или пароль.");
        pruneSessions.run(now());
        const previous = readToken(request);
        if (previous) deleteSession.run(tokenHash(previous));
        const token = randomBytes(32).toString("hex");
        insertSession.run(tokenHash(token), now() + sessionLifetime);
        response.setHeader("Set-Cookie", cookie(token, request));
        return json(response, 200, {ok:true});
      }
      if (pathname === "/api/admin/logout" && request.method === "POST") {
        const token = readToken(request);
        if (token) deleteSession.run(tokenHash(token));
        response.setHeader("Set-Cookie", cookie("", request, true));
        return json(response, 200, {ok:true});
      }
      if (pathname === "/api/admin/leads" && request.method === "GET") {
        if (!authenticated(request)) throw new HttpError(401, "Войдите, чтобы посмотреть заявки.");
        return json(response, 200, {leads:allLeads.all()});
      }
      const leadRoute = /^\/api\/admin\/leads\/([1-9]\d*)$/.exec(pathname);
      if (leadRoute && request.method === "PATCH") {
        if (!authenticated(request)) throw new HttpError(401, "Войдите, чтобы изменить заявку.");
        const id = Number(leadRoute[1]);
        if (!Number.isSafeInteger(id)) throw new HttpError(404, "Заявка не найдена.");
        const body = await readJson(request, 32768);
        if (!statuses.has(body.status) || typeof body.comment !== "string" || body.comment.length > 5000) throw new HttpError(422, "Выберите статус и оставьте комментарий длиной до 5 000 символов.");
        const result = updateLead.run(body.status, body.comment.trim(), id);
        if (!result.changes) throw new HttpError(404, "Заявка не найдена.");
        return json(response, 200, {ok:true});
      }
      if (!get) {
        response.setHeader("Allow", pathname.startsWith("/api/") ? "GET, POST, PATCH" : "GET, HEAD");
        throw new HttpError(405, "Этот способ запроса не поддерживается.");
      }
      if (["/admin", "/admin/", "/admin.html"].includes(pathname)) {
        if (!authenticated(request)) return redirect(response, "/admin/login");
        return await serve(request, response, "/admin.html");
      }
      if (["/admin/login", "/admin/login/", "/login.html"].includes(pathname)) {
        if (authenticated(request)) return redirect(response, "/admin");
        return await serve(request, response, "/login.html");
      }
      if (pathname === "/") pathname = "/index.html";
      if (publicFiles.has(pathname) || (pathname.startsWith("/assets/") && assetTypes.has(extname(pathname)))) return await serve(request, response, pathname);
      throw new HttpError(404, "Страница не найдена.");
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      json(response, status, {error:status === 500 ? "Не удалось сохранить или загрузить данные. Попробуйте ещё раз." : error.message, ...(error.fields ? {fields:error.fields} : {})});
    }
  });
  server.requestTimeout = 15000;
  server.on("close", () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await createLandingServer({
      origin:process.env.FKUSS_LANDING_ORIGIN || undefined,
      production:process.env.NODE_ENV === "production",
      preview:process.env.FKUSS_LANDING_PREVIEW === "1",
      configFile:process.env.FKUSS_LANDING_ADMIN_FILE || undefined,
      databasePath:process.env.FKUSS_LANDING_DATABASE || undefined,
      trustedProxyIPs:(process.env.FKUSS_LANDING_TRUSTED_PROXY_IPS || "").split(",").map(value => value.trim()).filter(Boolean)
    });
    const port = Number(process.env.FKUSS_LANDING_PORT || process.env.FKUSS_PROTOTYPE_PORT || 4185);
    const host = process.env.FKUSS_LANDING_HOST || "127.0.0.1";
    if (!isIP(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid listen address");
    server.listen(port, host, () => {
      console.log("fkuss.ru landing ready on port " + port);
      console.log("Landing admin: http://127.0.0.1:" + port + "/admin");
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
  } catch {
    console.error("Не удалось запустить лендинг. Проверьте secrets/landing/admin.json и доступ к базе заявок. Для первого запуска: node landing-prototype/setup-admin.mjs.");
    process.exitCode = 1;
  }
}
