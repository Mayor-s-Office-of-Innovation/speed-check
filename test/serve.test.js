import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { serveDirectory, startCommand, startServer } from "../src/serve.js";
import { tmp } from "./helpers.js";

function site() {
  const dir = tmp("speed-check-site-");
  writeFileSync(join(dir, "index.html"), "<h1>home</h1>");
  writeFileSync(join(dir, "about.html"), "<h1>about</h1>");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "index.html"), "<h1>docs</h1>");
  writeFileSync(join(dir, "app.css"), "body{}");
  return dir;
}

test("serveDirectory serves files, directories, pretty URLs, and refuses traversal", async () => {
  const { url, stop } = await serveDirectory({ dir: site(), port: 0 });
  try {
    const get = (p) => fetch(url + p);
    assert.equal(await (await get("/")).text(), "<h1>home</h1>");
    assert.equal(await (await get("/about")).text(), "<h1>about</h1>");
    assert.equal(await (await get("/docs/")).text(), "<h1>docs</h1>");
    const css = await get("/app.css");
    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.equal(css.headers.get("content-length"), "6");
    assert.equal((await get("/missing")).status, 404);
    // The URL parser collapses dot segments before the root check, so traversal
    // becomes a missing file inside the root; either way nothing escapes.
    for (const p of ["/%2e%2e/%2e%2e/etc/passwd", "/../../etc/passwd", "/docs/%2e%2e/%2e%2e/about.html"]) {
      const res = await get(p);
      assert.ok(res.status === 404 || res.status === 200, `${p}: ${res.status}`);
      assert.doesNotMatch(await res.text(), /root:/);
    }
  } finally {
    await stop();
  }
});

test("serveDirectory spa mode falls back to index.html", async () => {
  const { url, stop } = await serveDirectory({ dir: site(), port: 0, spa: true });
  try {
    assert.equal(await (await fetch(`${url}/app/route`)).text(), "<h1>home</h1>");
  } finally {
    await stop();
  }
});

test("serveDirectory rejects a missing directory", () => {
  assert.throws(() => serveDirectory({ dir: "/no/such/dir", port: 0 }), /Build the site first/);
});

test("startCommand waits for the server and stops it; a command that dies fails fast", async () => {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const command = `${JSON.stringify(process.execPath)} -e "require('node:http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1')"`;
  const server = await startCommand({ command, readyTimeout: 10_000 }, `http://127.0.0.1:${port}/`);
  assert.equal(await (await fetch(server.url)).text(), "ok");
  server.stop();
  const t0 = Date.now();
  await assert.rejects(startCommand({ command: "exit 7", readyTimeout: 10_000 }, "http://127.0.0.1:1/"), /exited before answering/);
  assert.ok(Date.now() - t0 < 5000, "should not wait for the timeout");
});

test("startServer dispatches on dir or command", async () => {
  const s = await startServer({ dir: site(), port: 0 }, "http://127.0.0.1:0");
  assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  await s.stop();
});
