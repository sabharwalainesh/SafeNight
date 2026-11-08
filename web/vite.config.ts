// @ts-ignore node types are not installed in this package; the import works at runtime.
import { networkInterfaces } from 'node:os';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** When the server is exposed on the LAN, print the phone URLs and the host reminder. */
function lanHint(): Plugin {
  const print = (server: { config: { server: { host?: string | boolean; port?: number } }; httpServer: unknown }, label: string) => {
    const host = server.config.server.host;
    if (!host) return;
    const port = server.config.server.port ?? 5173;
    const ips: string[] = [];
    for (const list of Object.values(networkInterfaces() as Record<string, { family: string; internal: boolean; address: string }[] | undefined>)) {
      for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    }
    const lines = ips.flatMap(ip => [`  Sam:  http://${ip}:${port}/?as=sam`, `  Maya: http://${ip}:${port}/?as=maya`]);
    console.log(
      [
        '',
        `SafeNight ${label}: open on phones (same Wi-Fi):`,
        ...lines,
        '',
        'Reminder: VITE_SPACETIMEDB_HOST must be reachable from the phones',
        '(Maincloud wss URL, or ws://<laptop-ip>:3000), never localhost.',
        '',
      ].join('\n')
    );
  };
  return {
    name: 'safenight-lan-hint',
    configureServer(server) {
      server.httpServer?.once('listening', () => print(server as never, 'dev server'));
    },
    configurePreviewServer(server) {
      server.httpServer?.once('listening', () => print(server as never, 'preview server'));
    },
  };
}

export default defineConfig({
  plugins: [react(), lanHint()],
  server: { port: 5173, strictPort: false },
});
