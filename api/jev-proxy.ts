// Jev API 代理：解决浏览器直连 api.typesafe.ai 的 CORS 限制。
// API Key 由前端每次请求时携带（来自用户浏览器的 localStorage），服务端不存储、不记录。
import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";

const DEFAULT_UPSTREAM = "https://api.typesafe.ai/v1/systemone";

export function registerJevProxy(app: Hono<{ Bindings: HttpBindings }>) {
  app.post("/api/jev/systemone", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const apiKey = String(body?.apiKey ?? "").trim();
    if (!apiKey) return c.json({ error: "missing apiKey" }, 400);

    const endpoint = String(body?.endpoint ?? "").trim() || DEFAULT_UPSTREAM;
    if (!/^https:\/\//i.test(endpoint)) {
      return c.json({ error: "endpoint must use https" }, 400);
    }

    const upstreamBody = {
      model: body?.model ?? "jev-latest",
      state: body?.state,
      questions: body?.questions,
    };

    let upstream: Response;
    try {
      upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamBody),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return c.json({ error: "upstream request failed", detail: String(e) }, 502);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  });
}
