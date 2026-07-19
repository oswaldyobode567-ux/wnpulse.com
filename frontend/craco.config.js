const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        os: false,
        url: false,
        buffer: false,
      };
      // Fix pour Node.js 22
      if (webpackConfig.module && webpackConfig.module.rules) {
        webpackConfig.module.rules = webpackConfig.module.rules.map(rule => {
          if (rule.oneOf) {
            rule.oneOf = rule.oneOf.map(r => {
              if (r.loader && r.loader.includes('babel-loader')) {
                r.options = r.options || {};
                r.options.plugins = [
                  ...(r.options.plugins || []),
                ];
              }
              return r;
            });
          }
          return rule;
        });
      }
      return webpackConfig;
    },
  },
};
