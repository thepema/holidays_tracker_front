export default {
  '/api': {
    target: 'http://127.0.0.1:3000',
    secure: false,
    changeOrigin: true,
    cookieDomainRewrite: '',
    configure(proxy) {
      proxy.on('proxyRes', (proxyRes) => {
        const setCookie = proxyRes.headers['set-cookie'];
        if (Array.isArray(setCookie)) {
          proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
            cookie
              .replace(/;\s*Domain=[^;]*/gi, '')
              .replace(/;\s*Secure/gi, '')
              .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          );
        }
      });
    },
  },
};
