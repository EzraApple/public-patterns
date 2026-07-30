type MediaBucket = {
  get(key: string): Promise<{
    body: BodyInit;
    httpEtag: string;
    writeHttpMetadata(headers: Headers): void;
  } | null>;
};

type Env = {
  LAB_TOKEN: string;
  MEDIA: MediaBucket;
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

  const image = url.pathname.match(
    /^\/media\/articles\/([a-z0-9-]+\.webp)$/,
  );
  if (request.method === "GET" && image) {
    const object = await env.MEDIA.get(`article-media/${image[1]}`);
    if (!object) {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set(
      "cache-control",
      "public, max-age=31536000, immutable",
    );
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/api/articles" ||
      url.pathname.startsWith("/api/articles/"))
  ) {
    const path = url.pathname.slice("/api".length);
    return env.PIPELINE.fetch(
      new Request(`https://pipeline${path}${url.search}`),
    );
  }

  if (url.pathname.startsWith("/api/internal/")) {
    if (!env.LAB_TOKEN) {
      console.error("Internal API credential missing", {
        event: "credential.configuration.failed",
        credential: "LAB_TOKEN",
        action:
          "Set LAB_TOKEN in the active Doppler config and redeploy the web Worker.",
      });
      return Response.json(
        { error: "internal API is not configured" },
        { status: 503 },
      );
    }
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
