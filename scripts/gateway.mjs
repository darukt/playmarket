// Development has the same public entry point as production: nginx :8088.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = join(root, '.runtime', 'nginx');
await mkdir(join(runtime, 'logs'), { recursive: true });
await mkdir(join(runtime, 'temp'), { recursive: true });
const located = process.env.NGINX_BIN || (process.platform === 'win32'
  ? spawnSync('where.exe', ['nginx'], { encoding: 'utf8' }).stdout?.trim().split(/\r?\n/)[0]
  : 'nginx');
if (!located) throw new Error('Install nginx and add it to PATH, or set NGINX_BIN.');
const path = (value) => value.replaceAll('\\', '/');
const mime = process.platform === 'win32' ? join(dirname(located), 'conf', 'mime.types') : '/etc/nginx/mime.types';
const config = `worker_processes 1;
pid logs/nginx.pid;
error_log logs/error.log;
events { worker_connections 512; }
http {
  include "${path(mime)}";
  server_tokens off;
  log_format safe '$remote_addr $request_method $uri $status';
  access_log logs/access.log safe;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  server {
    listen 127.0.0.1:8088;
    client_max_body_size 250m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;
    location ~ ^/\\. { return 404; }
    location ~ ^/(backend|data|internal|deploy)(/|$) { return 404; }
    location /api/ {
      proxy_pass http://127.0.0.1:8080;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Admin-Key '';
      proxy_read_timeout 600s;
      proxy_buffering off;
    }
    location /uploads/ { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $http_host; }
    location /ws/ {
      proxy_pass http://127.0.0.1:8080;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_read_timeout 600s;
    }
    location / {
      proxy_pass http://127.0.0.1:5173;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
    }
  }
}
`;
await writeFile(join(runtime, 'nginx.conf'), config);
const args = ['-p', path(runtime) + '/', '-c', 'nginx.conf'];
const checked = spawnSync(located, [...args, '-t'], { stdio: 'inherit', windowsHide: true });
if (checked.status !== 0) process.exit(checked.status ?? 1);
if (!process.argv.includes('--check')) {
  console.log('Gateway: http://localhost:8088 (Vite :5173, API :8080)');
  const child = spawn(located, [...args, '-g', 'daemon off;'], { stdio: 'inherit', windowsHide: true });
  const stop = () => { spawnSync(located, [...args, '-s', 'quit'], { stdio: 'ignore', windowsHide: true }); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', code => process.exit(code ?? 0));
}
