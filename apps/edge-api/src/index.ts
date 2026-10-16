import { handleEdgeApi, prepareTomorrowsSalt } from './handler'

export interface Env {
  LINKS: KVNamespace
  EDGE_API_SECRET: string
}

export default {
  fetch: (request, env) => handleEdgeApi(request, env.LINKS, env.EDGE_API_SECRET),
  scheduled: async (_event, env, ctx) => {
    ctx.waitUntil(prepareTomorrowsSalt(env.LINKS))
  },
} satisfies ExportedHandler<Env>
