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
    },
  },
});
