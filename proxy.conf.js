const PROXY_CONFIG = {
  "/api": {
    "target": "https://hiring-dev.internal.kloudspot.com",
    "secure": true,
    "changeOrigin": true,
    "logLevel": "debug"
  }
};

module.exports = PROXY_CONFIG;

