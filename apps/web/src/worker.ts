type Env = {
  PUBLIC_PATTERNS_ENV: "dev" | "production";
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        environment: env.PUBLIC_PATTERNS_ENV,
        service: "public-patterns-web",
        status: "ok",
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>;
};
