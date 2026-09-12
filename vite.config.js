import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** ทำให้ `npm run dev` เรียก api/*.js ได้เหมือนตอนรันบน Vercel จริง
 *  (Vite เปล่า ๆ ไม่รู้จักโฟลเดอร์ api/ ซึ่งเป็น convention ของ Vercel เท่านั้น
 *   ถ้าไม่มีตัวนี้ /api/login จะ 404 แล้วล็อกอินไม่ได้เลยตอน dev) */
function vercelApiDevPlugin(env) {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        // ให้ api/*.js อ่าน process.env ได้เหมือนบน Vercel (Vite ไม่ inject ให้เอง)
        for (const [k, v] of Object.entries(env)) {
          if (!(k in process.env)) process.env[k] = v;
        }

        const route = req.url.split('?')[0].replace(/\/$/, '');
        const modulePath = `.${route}.js`;

        try {
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default;
          if (typeof handler !== 'function') return next();

          // อ่าน body เป็น JSON ให้ก่อน เพราะ handler ฝั่ง Vercel คาดหวัง req.body ที่ parse แล้ว
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf8');
          req.body = raw ? JSON.parse(raw) : {};

          // จำลอง res.status().json() แบบ Vercel
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };

          await handler(req, res);
        } catch (err) {
          console.error(`[vercel-api-dev] ${route} ล้มเหลว:`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: String(err?.message || err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // '' = โหลดทุกตัวแปร ไม่ใช่เฉพาะที่ขึ้นต้นด้วย VITE_ (ฝั่ง server ต้องใช้ FIREBASE_*)
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), vercelApiDevPlugin(env)],
  };
});
