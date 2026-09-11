import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const demoRoot = new URL("../demo-dist/", import.meta.url);

test("builds an isolated static GitHub Pages demo", async () => {
  const html = await readFile(new URL("index.html", demoRoot), "utf8");
  const assets = await readdir(new URL("assets/", demoRoot));
  const scriptName = assets.find((name) => /^index-.*\.js$/.test(name));

  assert.match(html, /help-family — Demonstração/);
  assert.match(html, /\/cura-family\/assets\//);
  assert.ok(scriptName, "o bundle JavaScript da demonstração deve existir");

  const bundle = await readFile(new URL(`assets/${scriptName}`, demoRoot), "utf8");
  assert.match(bundle, /cura-family-public-demo-v1/);
  assert.match(bundle, /Modo demonstração/);
  assert.match(bundle, /sessionStorage/);
  assert.doesNotMatch(bundle, /LOCAL_DATA_ENCRYPTION_KEY|project_id/);
});
