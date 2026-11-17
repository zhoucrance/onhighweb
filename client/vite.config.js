const { defineConfig, transformWithEsbuild } = require("vite");
const react = require("@vitejs/plugin-react");

const jsAsJsx = {
  name: "load-js-files-as-jsx",
  async transform(code, id) {
    if (!id.match(/src\/.*\.js$/)) return null;
    return transformWithEsbuild(code, id, {
      loader: "jsx",
      jsx: "automatic",
    });
  },
};

module.exports = defineConfig({
  plugins: [jsAsJsx, react()],
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5000",
      // Careers bot (interview practice API); in production nginx serves /careers-bot.
      "/careers-bot": {
        target: process.env.CAREERS_BOT_URL || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/careers-bot/, ""),
      },
      // Bill payments service (Paynow BillPay); in production nginx serves /bills-api.
      "/bills-api": {
        target: process.env.BILLS_URL || "http://localhost:8100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bills-api/, ""),
      },
    },
  },
});
