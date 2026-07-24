export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        service: "public-patterns-web",
        status: "ok",
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies {
  fetch(request: Request): Promise<Response>;
};
