/*
  Two ways to put the built site on a local port:

    serveDirectory  a static file server in this process, no dependency,
                    for Eleventy/Astro/plain-HTML output directories.
    startCommand    any shell command (`vite preview`, `python3 -m
                    http.server`, a framework's start script), polled until
                    the base URL answers, killed with its process group.
*/
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/**
 * Serve a directory. `spa: true` answers unknown paths with index.html.
 * Resolves with the URL actually bound (port 0 picks a free one) and a stop().
 * @param {{ dir: string, port: number, host?: string, spa?: boolean }} opts
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export function serveDirectory({ dir, port, host = "127.0.0.1", spa = false }) {
  const root = resolve(dir);
  if (!isDir(root)) {
    throw new Error(`serve.dir not found: ${root}. Build the site first.`);
  }
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (isDir(file)) file = join(file, "index.html");
    if (!isFile(file) && !extname(file) && isFile(`${file}.html`)) file = `${file}.html`;
    if (!isFile(file) && spa) file = join(root, "index.html");
    if (!isFile(file)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": statSync(file).size,
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      const address = /** @type {import("node:net").AddressInfo} */ (server.address());
      done({
        url: `http://${host}:${address.port}`,
        stop: () =>
          new Promise((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
      });
    });
  });
}

/**
 * Run a shell command that serves the site, wait until `readyURL` answers,
 * and hand back a stop() that kills the command's whole process group.
 * @param {{ command: string, cwd?: string, readyTimeout?: number }} opts
 * @param {string} readyURL
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
export async function startCommand({ command, cwd = process.cwd(), readyTimeout = 15_000 }, readyURL) {
  const win = process.platform === "win32";
  const child = spawn(command, {
    shell: true,
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !win, // own process group, so stop() takes its children too
  });
  const output = [];
  child.stdout.on("data", (c) => output.push(c));
  child.stderr.on("data", (c) => output.push(c));
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const stop = () => {
    if (exited || child.pid == null) return;
    try {
      if (win) child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.once("exit", stop);

  const deadline = Date.now() + readyTimeout;
  while (Date.now() < deadline && !exited) {
    try {
      const res = await fetch(readyURL, {
        signal: AbortSignal.timeout(2000),
        redirect: "manual",
      });
      if (res.status < 500) return { url: readyURL, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  const why = exited
    ? "serve.command exited before answering"
    : `nothing answered at ${readyURL} within ${readyTimeout / 1000}s of starting`;
  throw new Error(`${why}: ${command}\n${Buffer.concat(output).toString()}`);
}

/**
 * Start whichever server the config asks for.
 * @param {{ dir?: string, command?: string, port?: number, spa?: boolean, cwd?: string, readyTimeout?: number }} serve
 * @param {string} baseURL
 */
export async function startServer(serve, baseURL) {
  if (serve.dir) {
    return serveDirectory({ dir: serve.dir, port: serve.port ?? 0, spa: serve.spa });
  }
  return startCommand(serve, `${baseURL}/`);
}
