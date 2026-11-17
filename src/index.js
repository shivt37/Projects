export default {
  async fetch(request, env, ctx) {
    return new Response("Projects gateway — phase 1 scaffold\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
