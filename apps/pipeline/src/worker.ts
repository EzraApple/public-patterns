import { routeRequest, type Env } from "./pipeline.ts";

export default {
  fetch: routeRequest,
} satisfies ExportedHandler<Env>;
