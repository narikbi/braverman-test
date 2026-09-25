import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// В dev Vite не исполняет /api (это Vercel-функции) — прокидываем запросы
// в те же обработчики, чтобы тестировать всю цепочку локально.
const DEV_ROUTES = ['attempt', 'checkout', 'invoice-status', 'kaspi-gw-webhook', 'result', 'recover', 'track', 'admin', 'tg-webhook']

function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      // /admin → admin.html, /t/<код> → /?t=<код> (в проде это делают rewrites/redirects в vercel.json)
      server.middlewares.use((req, res, nextFn) => {
        if (req.url && /^\/admin\/?(\?|$)/.test(req.url)) {
          req.url = req.url.replace(/^\/admin\/?/, '/admin.html')
        } else if (req.url) {
          const m = /^\/t\/([A-Za-z0-9_-]{2,32})\/?(\?.*)?$/.exec(req.url)
          if (m) {
            res.statusCode = 302
            res.setHeader('Location', `/?t=${m[1]}${m[2] ? '&' + m[2].slice(1) : ''}`)
            res.end()
            return
          }
        }
        nextFn()
      })
      for (const route of DEV_ROUTES) {
        server.middlewares.use(`/api/${route}`, async (req, res) => {
          const chunks: Buffer[] = []
          if (req.method === 'POST') {
            for await (const c of req) chunks.push(c as Buffer)
          }
          const rawBody = Buffer.concat(chunks).toString()
          let body = {}
          try { body = JSON.parse(rawBody || '{}') } catch { /* leave empty */ }

          const { default: handler } = await server.ssrLoadModule(`/api/${route}.ts`) as {
            default: (rq: unknown, rs: unknown) => Promise<void>
          }
          const shim = {
            setHeader: (k: string, v: string) => res.setHeader(k, v),
            status: (code: number) => ({
              json: (o: object) => {
                res.statusCode = code
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(o))
              }
            })
          }
          try {
            await handler({
              method: req.method,
              body,
              headers: req.headers,
              url: req.url,
              // вебхуку нужно сырое тело для проверки подписи
              on: (event: string, cb: (chunk?: unknown) => void) => {
                if (event === 'data' && rawBody) cb(Buffer.from(rawBody))
                if (event === 'end') cb()
              }
            }, shim)
          } catch (e) {
            console.error(`[api/${route} dev]`, e)
            if (!res.writableEnded) {
              res.statusCode = 500
              res.end('{"ok":false,"error":"dev_handler"}')
            }
          }
        })
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  // подхватываем .env целиком (включая серверные переменные без префикса VITE_)
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (!(k in process.env)) process.env[k] = v
  }
  return {
    plugins: [apiDevPlugin()],
    build: {
      target: 'es2018',
      cssMinify: true,
      assetsInlineLimit: 8192,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html')
        }
      }
    },
    server: {
      port: 5173
    }
  }
})
