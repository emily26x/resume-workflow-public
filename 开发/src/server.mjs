import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEMPLATE, exportFiles, loadSource, readPreferences, savePreferences, TYPOGRAPHY } from "./delivery.mjs";
import { renderResume, TEMPLATE_IDS, TEMPLATE_NAMES } from "./resume.mjs";

const EDITOR = resolve(dirname(fileURLToPath(import.meta.url)), "../editor");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".pdf": "application/pdf", ".json": "application/json; charset=utf-8" };

function send(response, status, body, type = ".json") {
  response.writeHead(status, {
    "content-type": MIME[type] || "application/octet-stream",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
  });
  response.end(type === ".json" ? JSON.stringify(body) : body);
}

function sameToken(incoming, expected) {
  const candidate = Buffer.from(String(Array.isArray(incoming) ? incoming[0] : incoming || ""));
  const actual = Buffer.from(expected);
  return candidate.length === actual.length && timingSafeEqual(candidate, actual);
}

async function jsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4_000_000) throw new Error("请求内容超过 4 MB");
  }
  return body ? JSON.parse(body) : {};
}

export async function startServer({ inputPath, port = 4277 }) {
  const session = loadSource(inputPath);
  const sessionToken = randomBytes(24).toString("base64url");
  let actualPort = port;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);
      const allowedOrigins = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
      if (!allowedOrigins.has(`http://${request.headers.host}`)) return send(response, 403, { error: "拒绝未知 Host" });
      if (request.headers.origin && !allowedOrigins.has(request.headers.origin)) return send(response, 403, { error: "拒绝跨站请求" });
      const protectedPath = url.pathname.startsWith("/api/") || url.pathname.startsWith("/output/");
      const incomingToken = request.headers["x-resume-session"] || url.searchParams.get("token");
      if (protectedPath && !sameToken(incomingToken, sessionToken)) return send(response, 403, { error: "会话令牌无效，请使用本次启动输出的地址" });
      if (request.method === "GET" && url.pathname === "/api/state") {
        send(response, 200, { sourceHash: session.sourceHash, hasPhoto: Boolean(session.model.meta.photo), preferences: readPreferences(), templates: TEMPLATE_IDS.map((id) => ({ id, name: TEMPLATE_NAMES[id], typography: TYPOGRAPHY[id] })) });
      } else if (request.method === "GET" && url.pathname === "/api/preview") {
        const template = TEMPLATE_IDS.includes(url.searchParams.get("template")) ? url.searchParams.get("template") : DEFAULT_TEMPLATE;
        send(response, 200, renderResume(session.model, template), ".html");
      } else if (request.method === "POST" && url.pathname === "/api/preferences") {
        send(response, 200, savePreferences(await jsonBody(request)));
      } else if (request.method === "POST" && url.pathname === "/api/export") {
        const result = await exportFiles(session, await jsonBody(request));
        const token = encodeURIComponent(sessionToken);
        send(response, 200, { ...result, files: { pdf: `/output/resume.pdf?token=${token}`, png: `/output/resume.png?token=${token}` } });
      } else if (request.method === "GET" && url.pathname.startsWith("/output/")) {
        const name = url.pathname.slice(8);
        if (!new Set(["resume.pdf", "resume.png"]).has(name)) throw new Error("非法输出路径");
        const path = resolve(dirname(session.sourcePath), name);
        if (!existsSync(path)) return send(response, 404, "Not found", ".html");
        send(response, 200, readFileSync(path), extname(path));
      } else if (request.method === "GET") {
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const path = resolve(EDITOR, relative);
        if (!path.startsWith(`${EDITOR}/`) || !existsSync(path)) return send(response, 404, "Not found", ".html");
        send(response, 200, readFileSync(path), extname(path));
      } else send(response, 405, { error: "Method not allowed" });
    } catch (error) {
      send(response, 400, { error: error.message });
    }
  });
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  actualPort = server.address().port;
  const editorUrl = `http://127.0.0.1:${actualPort}/?token=${encodeURIComponent(sessionToken)}`;
  process.stdout.write(`简历编辑器已启动：${editorUrl}\n源文件：${session.sourcePath}\n`);
  return { server, session, sessionToken, editorUrl };
}
