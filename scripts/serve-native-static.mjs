import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repo, "out");
const port = Number(process.env.PORT || 3310);

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(root)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  if (existsSync(target) && statSync(target).isDirectory()) {
    const index = path.join(target, "index.html");
    return existsSync(index) ? index : null;
  }
  if (existsSync(`${target}.html`)) return `${target}.html`;
  return null;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const file = resolveFile(url.pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": contentType(file) });
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`native static server ${root} -> http://127.0.0.1:${port}`);
});