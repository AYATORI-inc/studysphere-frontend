const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const proxyTarget = process.env.REACT_APP_API_PROXY_TARGET || 'http://localhost:5050';

  // /apiで始まるパスのみをバックエンドにプロキシ
  app.use(
    '/api',
    createProxyMiddleware({
      target: proxyTarget,
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ${req.method} ${req.url} to ${proxyTarget}${req.url}`);
      }
    })
  );
};

