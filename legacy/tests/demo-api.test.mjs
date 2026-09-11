import assert from "node:assert/strict";
import test from "node:test";
import { installDemoApi } from "../demo/demo-api.ts";

test("keeps public demo data in the browser session without a backend", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map();
  let externalRequests = 0;
  let reloads = 0;

  globalThis.window = {
    fetch: async () => {
      externalRequests += 1;
      return new Response(null, { status: 204 });
    },
    location: {
      href: "https://ninex9x.github.io/cura-family/",
      origin: "https://ninex9x.github.io",
      reload: () => {
        reloads += 1;
      },
    },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };

  try {
    installDemoApi();

    const initialResponse = await window.fetch("/api/state");
    assert.deepEqual(await initialResponse.json(), { revision: 0, demoMode: true });
    assert.equal(externalRequests, 0);

    const savedState = { members: [{ id: "ficticio" }] };
    const saveResponse = await window.fetch("/api/state", {
      method: "PUT",
      body: JSON.stringify({ state: savedState, expectedRevision: 0 }),
    });
    assert.equal(saveResponse.status, 200);
    assert.deepEqual(await saveResponse.json(), { revision: 1, demoMode: true });

    const storedResponse = await window.fetch("/api/state");
    assert.deepEqual(await storedResponse.json(), { state: savedState, revision: 1, demoMode: true });
    assert.match(storage.get("cura-family-public-demo-v1"), /ficticio/);

    const conflictResponse = await window.fetch("/api/state", {
      method: "PUT",
      body: JSON.stringify({ state: {}, expectedRevision: 0 }),
    });
    assert.equal(conflictResponse.status, 409);

    await window.fetch("https://example.com/resource");
    assert.equal(externalRequests, 1);

    window.CuraFamiliaResetDemo();
    assert.equal(storage.size, 0);
    assert.equal(reloads, 1);
  } finally {
    globalThis.window = previousWindow;
  }
});
