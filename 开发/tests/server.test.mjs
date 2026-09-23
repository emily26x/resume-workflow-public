import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";
import { startServer } from "../src/server.mjs";

function requestStatus({ port, headers }) {
  return new Promise((resolveStatus, reject) => {
    const outgoing = request({ hostname: "127.0.0.1", port, path: "/api/state", headers }, (response) => {
      response.resume();
      response.on("end", () => resolveStatus(response.statusCode));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("serves state and all three previews", async (context) => {
  process.env.RESUME_WORKFLOW_CONFIG_DIR = mkdtempSync(join(tmpdir(), "resume-server-test-"));
  const { server, sessionToken } = await startServer({ inputPath: resolve(import.meta.dirname, "../../示例资料/排版案例/resume-medium.md"), port: 0 });
  context.after(() => new Promise((done) => server.close(done)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "x-resume-session": sessionToken };
  const unauthorized = await fetch(`${base}/api/state`);
  assert.equal(unauthorized.status, 403);
  const hostileOrigin = await fetch(`${base}/api/state`, { headers: { ...headers, origin: "https://attacker.example" } });
  assert.equal(hostileOrigin.status, 403);
  const hostileHostStatus = await requestStatus({ port: address.port, headers: { ...headers, host: "attacker.example" } });
  assert.equal(hostileHostStatus, 403);
  const stateResponse = await fetch(`${base}/api/state`, { headers });
  assert.equal(stateResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(stateResponse.headers.get("referrer-policy"), "no-referrer");
  assert.match(stateResponse.headers.get("content-security-policy"), /default-src 'self'/);
  const state = await stateResponse.json();
  assert.deepEqual(state.templates.map((item) => item.id), ["classic", "dual", "blue"]);
  assert.equal(state.hasPhoto, true);
  assert.equal(Object.hasOwn(state, "sourcePath"), false);
  assert.match(state.sourceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(state.preferences, { configured: false, defaultTemplate: "classic", includePhoto: false, showCity: false, linkStyle: "label" });
  for (const template of state.templates) {
    const html = await fetch(`${base}/api/preview?template=${template.id}`, { headers }).then((response) => response.text());
    assert.match(html, new RegExp(`template-${template.id}`));
    assert.match(html, /林知夏/);
  }
  const saved = await fetch(`${base}/api/preferences`, { method: "POST", headers: { ...headers, "content-type": "application/json", origin: base }, body: JSON.stringify({ defaultTemplate: "dual", includePhoto: true, showCity: false, linkStyle: "url" }) }).then((response) => response.json());
  assert.deepEqual(saved, { configured: true, defaultTemplate: "dual", includePhoto: true, showCity: false, linkStyle: "url" });
});

test("reports when the source has no photo", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "resume-without-photo-"));
  const inputPath = join(directory, "resume.md");
  const source = readFileSync(resolve(import.meta.dirname, "../../示例资料/排版案例/resume-medium.md"), "utf8").replace(/^photo:.*\n/m, "");
  writeFileSync(inputPath, source, "utf8");
  const { server, sessionToken } = await startServer({ inputPath, port: 0 });
  context.after(() => new Promise((done) => server.close(done)));
  const state = await fetch(`http://127.0.0.1:${server.address().port}/api/state`, { headers: { "x-resume-session": sessionToken } }).then((response) => response.json());
  assert.equal(state.hasPhoto, false);
});
