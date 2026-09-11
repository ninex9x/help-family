const DEMO_STORAGE_KEY = "cura-family-public-demo-v1";

type DemoSnapshot = {
  revision: number;
  state?: unknown;
};

function readSnapshot(): DemoSnapshot {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEMO_STORAGE_KEY) ?? "null") as Partial<DemoSnapshot> | null;
    if (parsed && Number.isSafeInteger(parsed.revision) && Number(parsed.revision) >= 0) {
      return { revision: Number(parsed.revision), state: parsed.state };
    }
  } catch {
    // Navegadores que bloqueiam sessionStorage continuam funcionando em memória.
  }
  return { revision: 0 };
}

function writeSnapshot(snapshot: DemoSnapshot) {
  try {
    window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A cópia em memória ainda permite explorar a demonstração nesta página.
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function readRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === "string") return JSON.parse(init.body || "{}");
  if (input instanceof Request) return JSON.parse(await input.clone().text() || "{}");
  return {};
}

export function installDemoApi() {
  const originalFetch = window.fetch.bind(window);
  let snapshot = readSnapshot();

  window.CuraFamiliaDemo = true;
  window.CuraFamiliaResetDemo = () => {
    try {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // O recarregamento abaixo também redefine o estado mantido em memória.
    }
    window.location.reload();
  };

  window.fetch = async (input, init = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/state") {
      return originalFetch(input, init);
    }

    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "GET") {
      return jsonResponse({ state: snapshot.state, revision: snapshot.revision, demoMode: true });
    }

    if (method === "PUT") {
      try {
        const body = await readRequestBody(input, init) as { expectedRevision?: unknown; state?: unknown };
        if (body.expectedRevision !== snapshot.revision) {
          return jsonResponse({ error: "A demonstração foi atualizada em outra ação.", revision: snapshot.revision }, 409);
        }
        snapshot = { state: body.state, revision: snapshot.revision + 1 };
        writeSnapshot(snapshot);
        return jsonResponse({ revision: snapshot.revision, demoMode: true });
      } catch {
        return jsonResponse({ error: "Não foi possível salvar os dados fictícios." }, 422);
      }
    }

    return jsonResponse({ error: "Método não permitido na demonstração." }, 405);
  };
}
