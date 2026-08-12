import http from 'http';
import httpProxy from 'http-proxy';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '2096', 10);
const TARGET = process.env.TARGET || 'http://127.0.0.1:3001';

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  changeOrigin: true,
});

const server = http.createServer((req, res) => {
  proxy.web(req, res, {}, (err) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`Playground proxy listening on 0.0.0.0:${PROXY_PORT} → ${TARGET}`);
});
