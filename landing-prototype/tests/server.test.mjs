import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve, relative, isAbsolute} from "node:path";
import {once} from "node:events";
import {DatabaseSync} from "node:sqlite";
import {createLandingServer} from "../server.mjs";
import {hashPassword} from "../auth.mjs";

const auth = {login:"test-owner", passwordHash:await hashPassword("local-test-password")};

async function fixture(t, {legacy = false, serverOptions = {}} = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "fkuss-landing-test-"));
  const databasePath = resolve(directory, "leads.db");
  if (legacy) {
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, phone TEXT NOT NULL, restaurant TEXT NOT NULL, menu TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', comment TEXT NOT NULL DEFAULT '');");
    database.prepare("INSERT INTO leads (created_at, phone, restaurant, menu, status, comment) VALUES (?, ?, ?, ?, ?, ?)").run("2026-09-29T09:00:00.000Z", "+79991234567", "Существующая заявка", "", "working", "Сохранённый комментарий");
    database.close();
  }
  let time = Date.parse("2026-09-29T10:00:00.000Z");
  let server, base;
  const start = async () => {
    server = await createLandingServer({auth, databasePath, now:() => time, ...serverOptions});
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = "http://127.0.0.1:" + server.address().port;
  };
  const stop = () => new Promise((resolveStop, reject) => server.close(error => error ? reject(error) : resolveStop()));
  await start();
  t.after(async () => {
    if (server.listening) await stop();
    const difference = relative(resolve(tmpdir()), resolve(directory));
    assert.ok(difference && !difference.startsWith("..") && !isAbsolute(difference));
    await rm(directory, {recursive:true, force:true});
  });
  const request = (path, options = {}) => fetch(base + path, {redirect:"manual", ...options});
  const post = (path, body, headers = {}) => request(path, {method:"POST", headers:{"Content-Type":"application/json", ...headers}, body:JSON.stringify(body)});
  const patch = (id, body, cookie, headers = {}) => request("/api/admin/leads/" + id, {method:"PATCH", headers:{"Content-Type":"application/json", ...(cookie ? {Cookie:cookie} : {}), ...headers}, body:JSON.stringify(body)});
  const login = async () => {
    const response = await post("/api/admin/login", {login:auth.login, password:"local-test-password"});
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const leads = async cookie => (await (await request("/api/admin/leads", {headers:{Cookie:cookie}})).json()).leads;
  return {request, post, patch, login, leads, advance:milliseconds => {time += milliseconds;}, restart:async () => {await stop(); await start();}, databasePath};
}

test("anonymous users cannot read the list or bypass login through an HTML route", async t => {
  const app = await fixture(t);
  assert.equal((await app.request("/api/admin/leads")).status, 401);
  for (const route of ["/admin", "/admin/", "/admin.html"]) {
    const response = await app.request(route);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/admin/login");
  }
  assert.equal((await app.request("/admin/login")).status, 200);
});

test("login rejects wrong credentials, issues a private cookie, and logout revokes it", async t => {
  const app = await fixture(t);
  assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"wrong"})).status, 401);
  const response = await app.post("/api/admin/login", {login:auth.login, password:"local-test-password"});
  assert.equal(response.status, 200);
  const header = response.headers.get("set-cookie");
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  const cookie = header.split(";")[0];
  assert.equal((await app.request("/admin", {headers:{Cookie:cookie}})).status, 200);
  assert.equal((await app.request("/admin/login", {headers:{Cookie:cookie}})).headers.get("location"), "/admin");
  assert.equal((await app.post("/api/admin/logout", {}, {Cookie:cookie})).status, 200);
  assert.equal((await app.request("/api/admin/leads", {headers:{Cookie:cookie}})).status, 401);
});

test("phones are normalized, optional fields stay optional, newest comes first even in the same millisecond", async t => {
  const app = await fixture(t);
  assert.equal((await app.post("/api/leads", {phone:"8 (999) 123-45-67"})).status, 201);
  assert.equal((await app.post("/api/leads", {phone:"+7 999 222 33 44", restaurant:"Кафе", menu:"https://example.com/menu"})).status, 201);
  const leads = await app.leads(await app.login());
  assert.deepEqual(leads.map(lead => lead.phone), ["+79992223344", "+79991234567"]);
  assert.equal(leads[1].restaurant, "");
  assert.equal(leads[1].menu, "");
  assert.equal(leads[0].status, "new");
  assert.equal(leads[0].comment, "");
  assert.equal(leads[0].createdAt, leads[1].createdAt);
  assert.ok(leads[0].id > leads[1].id);
});

test("leads and sessions survive restart; only token hashes are stored", async t => {
  const app = await fixture(t);
  const cookie = await app.login();
  await app.post("/api/leads", {phone:"+79991234567", restaurant:"После перезапуска"});
  await app.restart();
  assert.equal((await app.leads(cookie))[0].restaurant, "После перезапуска");
  const db = new DatabaseSync(app.databasePath);
  const session = db.prepare("SELECT token_hash FROM sessions").get();
  assert.equal(session.token_hash.length, 64);
  assert.notEqual(session.token_hash, cookie.split("=")[1]);
  db.close();
});

test("server validation refuses bad phones, URLs and oversized restaurant names", async t => {
  const app = await fixture(t);
  for (const body of [{phone:"123"}, {phone:"+79991234567", menu:"javascript:alert(1)"}, {phone:"+79991234567", menu:"https://user:password@example.com"}, {phone:"+79991234567", restaurant:"x".repeat(121)}, {phone:"+79991234567", menu:[]}, {phone:"+79991234567", restaurant:null}]) {
    assert.equal((await app.post("/api/leads", body)).status, 422);
  }
  assert.deepEqual(await app.leads(await app.login()), []);
});

test("parallel submissions are all saved in reverse insertion order", async t => {
  const app = await fixture(t);
  const responses = await Promise.all(Array.from({length:8}, (_, index) => app.post("/api/leads", {phone:"+79991234567", restaurant:"Кафе " + index})));
  assert.ok(responses.every(response => response.status === 201));
  const leads = await app.leads(await app.login());
  assert.equal(leads.length, 8);
  assert.equal(new Set(leads.map(lead => lead.id)).size, 8);
  assert.ok(leads.every((lead, index) => !index || lead.id < leads[index - 1].id));
});

test("cross-site login, submission, updates and logout are rejected", async t => {
  const app = await fixture(t);
  for (const route of ["/api/leads", "/api/admin/login", "/api/admin/logout"]) {
    assert.equal((await app.post(route, {phone:"+79991234567"}, {Origin:"https://other.example"})).status, 403);
  }
  assert.equal((await app.patch(1, {status:"working", comment:"x"}, undefined, {Origin:"https://other.example"})).status, 403);
});

test("source files, secrets and database files are never served as static content", async t => {
  const app = await fixture(t);
  for (const path of ["/server.mjs", "/auth.mjs", "/setup-admin.mjs", "/secrets/landing/admin.json", "/leads.db", "/tests/server.test.mjs", "/assets/..%2f..%2fsecrets/landing/admin.json"]) {
    const response = await app.request(path);
    assert.ok(response.status === 403 || response.status === 404);
  }
  assert.equal((await app.request("/content/landing.json")).status, 200);
  assert.equal((await app.request("/assets/favicon.svg")).status, 200);
});

test("expired sessions stop granting access", async t => {
  const app = await fixture(t);
  const cookie = await app.login();
  app.advance(8 * 60 * 60 * 1000 + 1);
  assert.equal((await app.request("/api/admin/leads", {headers:{Cookie:cookie}})).status, 401);
});

test("login attempts are limited and become available after timeout", async t => {
  const app = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"wrong"})).status, 401);
  assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"wrong"})).status, 429);
  app.advance(10 * 60 * 1000 + 1);
  await app.login();
});

test("honeypot submissions do not enter the list", async t => {
  const app = await fixture(t);
  assert.equal((await app.post("/api/leads", {phone:"+79991234567", website:"spam"})).status, 202);
  assert.deepEqual(await app.leads(await app.login()), []);
});

test("invalid JSON and large requests return errors without saving a lead", async t => {
  const app = await fixture(t);
  assert.equal((await app.request("/api/leads", {method:"POST", headers:{"Content-Type":"application/json"}, body:"not json"})).status, 400);
  assert.equal((await app.post("/api/leads", {phone:"+79991234567", restaurant:"x".repeat(9000)})).status, 413);
  assert.equal((await app.request("/api/leads", {method:"POST", body:"phone=123"})).status, 415);
  assert.deepEqual(await app.leads(await app.login()), []);
});

test("status and comments need authorization, accept all four stages and survive restart", async t => {
  const app = await fixture(t);
  await app.post("/api/leads", {phone:"+79991234567"});
  assert.equal((await app.patch(1, {status:"contacted", comment:"Позвонили"})).status, 401);
  const cookie = await app.login();
  for (const status of ["new", "contacted", "working", "completed"]) {
    assert.equal((await app.patch(1, {status, comment:"  Комментарий " + status + "  "}, cookie)).status, 200);
    assert.equal((await app.leads(cookie))[0].status, status);
  }
  await app.restart();
  const lead = (await app.leads(cookie))[0];
  assert.equal(lead.status, "completed");
  assert.equal(lead.comment, "Комментарий completed");
});

test("bad status, long comment and missing lead are rejected without changing existing data", async t => {
  const app = await fixture(t);
  await app.post("/api/leads", {phone:"+79991234567"});
  const cookie = await app.login();
  assert.equal((await app.patch(1, {status:"deleted", comment:""}, cookie)).status, 422);
  assert.equal((await app.patch(1, {status:"new", comment:"x".repeat(5001)}, cookie)).status, 422);
  assert.equal((await app.patch(1, {status:"new", comment:null}, cookie)).status, 422);
  assert.equal((await app.patch(9999, {status:"new", comment:""}, cookie)).status, 404);
  assert.equal((await app.leads(cookie))[0].status, "new");
  assert.equal((await app.patch(1, {status:"working", comment:"я".repeat(5000)}, cookie)).status, 200);
  assert.equal((await app.leads(cookie))[0].comment.length, 5000);
});

test("contact name is validated, trimmed, saved and preserved after restart", async t => {
  const app = await fixture(t);
  for (const contactName of [null, [], "я".repeat(121), "Имя\nФамилия"]) {
    assert.equal((await app.post("/api/leads", {phone:"+79991234567", contactName})).status, 422);
  }
  assert.equal((await app.post("/api/leads", {phone:"+79991234567", contactName:"  Илья  ", restaurant:"Ресторан"})).status, 201);
  const cookie = await app.login();
  assert.equal((await app.leads(cookie))[0].contactName, "Илья");
  await app.restart();
  assert.equal((await app.leads(cookie))[0].contactName, "Илья");
});

test("old database gains a contact name field while preserving existing leads and comments", async t => {
  const app = await fixture(t, {legacy:true});
  const cookie = await app.login();
  const oldLead = (await app.leads(cookie))[0];
  assert.equal(oldLead.contactName, "");
  assert.equal(oldLead.status, "working");
  assert.equal(oldLead.comment, "Сохранённый комментарий");
  assert.equal(oldLead.restaurant, "Существующая заявка");
  assert.equal((await app.post("/api/leads", {phone:"+79990000002", contactName:"Анна"})).status, 201);
  const leads = await app.leads(cookie);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].contactName, "Анна");
});

test("production serves complete HTML and metadata before JavaScript runs", async t => {
  const app = await fixture(t, {serverOptions:{production:true, origin:"https://fkuss.ru"}});
  const response = await app.request("/");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), null);
  assert.match(html, /<h1[^>]*>[\s\S]*?Гости ваши/);
  assert.match(html, /Меню из Яндекс Еды/);
  assert.match(html, /Data Insight/);
  assert.match(html, /name="description" content="Создадим сайт ресторана/);
  assert.match(html, /rel="canonical" href="https:\/\/fkuss\.ru\/"/);
  assert.match(html, /property="og:image" content="https:\/\/fkuss\.ru\/assets\//);
  assert.doesNotMatch(html, /noindex/);
  assert.doesNotMatch(html, /подпис/i);
});

test("production keeps admin and APIs private, disables the preview and exposes a single-page sitemap", async t => {
  const app = await fixture(t, {serverOptions:{production:true, origin:"https://fkuss.ru"}});
  assert.match((await app.request("/admin/login")).headers.get("x-robots-tag"), /noindex/);
  assert.match((await app.request("/api/admin/leads")).headers.get("x-robots-tag"), /noindex/);
  assert.equal((await app.request("/preview.html")).status, 404);
  assert.equal((await app.request("/preview.js")).status, 404);
  assert.match(await (await app.request("/robots.txt")).text(), /Disallow: \/admin/);
  assert.match(await (await app.request("/sitemap.xml")).text(), /<loc>https:\/\/fkuss\.ru\/<\/loc>/);
  assert.deepEqual(await (await app.request("/healthz")).json(), {ok:true});
});

test("HTTPS origin issues Secure cookies and rejects writes from other origins", async t => {
  const app = await fixture(t, {serverOptions:{production:true, origin:"https://fkuss.ru"}});
  const response = await app.post("/api/admin/login", {login:auth.login, password:"local-test-password"}, {Origin:"https://fkuss.ru"});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  assert.equal((await app.post("/api/leads", {phone:"+79991234567"}, {Origin:"https://fkuss.ru"})).status, 201);
  assert.equal((await app.post("/api/leads", {phone:"+79991234567"}, {Origin:"http://fkuss.ru"})).status, 403);
});

test("trusted proxy limits visitors separately while untrusted forwarded IPs cannot bypass limits", async t => {
  const app = await fixture(t, {serverOptions:{trustedProxyIPs:["127.0.0.1"]}});
  for (let i = 0; i < 5; i++) assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"wrong"}, {"X-Forwarded-For":"198.51.100.20"})).status, 401);
  assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"wrong"}, {"X-Forwarded-For":"198.51.100.20"})).status, 429);
  assert.equal((await app.post("/api/admin/login", {login:auth.login, password:"local-test-password"}, {"X-Forwarded-For":"198.51.100.21"})).status, 200);
  const direct = await fixture(t, {serverOptions:{trustedProxyIPs:["192.0.2.10"]}});
  for (let i = 0; i < 5; i++) assert.equal((await direct.post("/api/admin/login", {login:auth.login, password:"wrong"}, {"X-Forwarded-For":"198.51.100." + (i + 1)})).status, 401);
  assert.equal((await direct.post("/api/admin/login", {login:auth.login, password:"wrong"}, {"X-Forwarded-For":"198.51.100.99"})).status, 429);
});

test("public assets support conditional caching while lead responses never get cached", async t => {
  const app = await fixture(t, {serverOptions:{production:true, origin:"https://fkuss.ru"}});
  const image = await app.request("/assets/buxara-site.png");
  assert.match(image.headers.get("cache-control"), /public/);
  assert.ok(image.headers.get("etag"));
  assert.equal((await app.request("/assets/buxara-site.png", {headers:{"If-None-Match":image.headers.get("etag")}})).status, 304);
  assert.equal((await app.post("/api/leads", {phone:"+79991234567"})).headers.get("cache-control"), "no-store");
  assert.equal((await app.request("/api/admin/leads")).headers.get("cache-control"), "no-store");
});

test("storage failures never acknowledge a saved lead", async t => {
  const app = await fixture(t);
  const db = new DatabaseSync(app.databasePath);
  db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;");
  const response = await app.post("/api/leads", {phone:"+79991234567"});
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /simulated storage failure/);
  assert.deepEqual(await app.leads(await app.login()), []);
  db.close();
});

test("letters in phone numbers are rejected instead of silently stripped", async t => {
  const app = await fixture(t);
  assert.equal((await app.post("/api/leads", {phone:"abc+79991234567"})).status, 422);
});

test("review deployment stays unindexed, labels test submissions and keeps a separate lead store", async t => {
  const live = await fixture(t, {serverOptions:{production:true, origin:"https://fkuss.ru"}});
  const review = await fixture(t, {serverOptions:{production:true, preview:true, origin:"https://design.fkuss.ru"}});
  const response = await review.request("/");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /Новая версия/);
  assert.match(html, /Предпросмотр/);
  assert.match(html, /Тестовая заявка сохранена/);
  assert.match(html, /rel="canonical" href="https:\/\/design\.fkuss\.ru\/"/);
  assert.equal(await (await review.request("/robots.txt")).text(), "User-agent: *\nDisallow: /\n");
  assert.equal((await review.request("/sitemap.xml")).status, 404);
  assert.equal((await review.request("/preview.html")).status, 404);
  assert.equal((await review.request("/assets/manrope-cyrillic.woff2")).headers.get("content-type"), "font/woff2");
  assert.equal((await review.post("/api/leads", {phone:"+79990000001", contactName:"Проверка макета"}, {Origin:"https://design.fkuss.ru"})).status, 201);
  assert.equal((await review.leads(await review.login())).length, 1);
  assert.equal((await live.leads(await live.login())).length, 0);
});
