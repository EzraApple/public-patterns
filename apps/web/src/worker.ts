type Env = {
  LAB_TOKEN: string;
  PIPELINE: {
    fetch(request: Request): Promise<Response>;
  };
  PUBLIC_PATTERNS_ENV: "dev" | "production";
};

export async function routeRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/internal/")) {
    if (request.headers.get("authorization") !== `Bearer ${env.LAB_TOKEN}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    const path = url.pathname.slice("/api/internal".length);
    return env.PIPELINE.fetch(
      new Request(`https://pipeline${path}${url.search}`, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body,
      }),
    );
  }

  if (url.pathname === "/api/health") {
    return Response.json({
      environment: env.PUBLIC_PATTERNS_ENV,
      service: "public-patterns-web",
      status: "ok",
    });
  }

  return new Response("Not found", { status: 404 });
}

export default {
  fetch: routeRequest,
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>;
};
