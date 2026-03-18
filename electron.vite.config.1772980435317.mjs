// electron.vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import path, { resolve } from "path";
import { visualizer } from "rollup-plugin-visualizer";

// release/app/package.json
var package_default = {
  name: "xyz.chatboxapp.ce",
  productName: "xyz.chatboxapp.ce",
  version: "1.19.0",
  description: "A desktop client for multiple cutting-edge AI models",
  author: {
    name: "Mediocre Company",
    email: "hi@chatboxai.com",
    url: "https://github.com/chatboxai"
  },
  main: "./dist/main/main.js",
  scripts: {
    rebuild: "node ../../.erb/scripts/electron-rebuild.cjs",
    postinstall: "pnpm run rebuild && pnpm run link-modules",
    "link-modules": "node ../../.erb/scripts/link-modules.cjs"
  },
  dependencies: {
    "@libsql/client": "^0.15.6"
  }
};

// electron.vite.config.ts
var __electron_vite_injected_dirname = "/home/hrbust-su/hrbust-ai/chatbox";
function injectBaseTag() {
  return {
    name: "inject-base-tag",
    transformIndexHtml() {
      return [
        {
          tag: "base",
          attrs: { href: "/" },
          injectTo: "head-prepend"
          // Inject at the beginning of <head>
        }
      ];
    }
  };
}
function dvhToVh() {
  return {
    name: "dvh-to-vh",
    transform(code, id) {
      if (id.endsWith(".css") || id.endsWith(".scss") || id.endsWith(".sass")) {
        return {
          code: code.replace(/(\d+)dvh/g, "$1vh"),
          map: null
        };
      }
      return null;
    }
  };
}
var inferredRelease = process.env.SENTRY_RELEASE || package_default.version;
var inferredDist = process.env.SENTRY_DIST || void 0;
process.env.SENTRY_RELEASE = inferredRelease;
if (inferredDist) {
  process.env.SENTRY_DIST = inferredDist;
}
var electron_vite_config_default = defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  const isWeb = process.env.CHATBOX_BUILD_PLATFORM === "web";
  return {
    main: {
      plugins: [
        ...isProduction ? [
          visualizer({
            filename: "release/app/dist/main/stats.html",
            open: false,
            title: "Main Process Dependency Analysis"
          })
        ] : [externalizeDepsPlugin()],
        process.env.SENTRY_AUTH_TOKEN ? sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: "sentry",
          project: "chatbox",
          url: "https://sentry.midway.run/",
          release: {
            name: inferredRelease,
            ...inferredDist ? { dist: inferredDist } : {}
          },
          sourcemaps: {
            assets: isProduction ? "release/app/dist/main/**" : "output/main/**"
          },
          telemetry: false
        }) : void 0
      ].filter(Boolean),
      build: {
        outDir: isProduction ? "release/app/dist/main" : void 0,
        lib: {
          entry: resolve(__electron_vite_injected_dirname, "src/main/main.ts")
        },
        sourcemap: isProduction ? "hidden" : true,
        minify: isProduction,
        rollupOptions: {
          external: Object.keys(package_default.dependencies || {}),
          output: {
            entryFileNames: "[name].js",
            inlineDynamicImports: true
          }
        }
      },
      resolve: {
        alias: {
          "@": path.resolve(__electron_vite_injected_dirname, "./src/renderer"),
          "src/shared": path.resolve(__electron_vite_injected_dirname, "./src/shared")
        }
      },
      define: {
        "process.type": '"browser"',
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
        "process.env.CHATBOX_BUILD_TARGET": JSON.stringify(process.env.CHATBOX_BUILD_TARGET || "unknown"),
        "process.env.CHATBOX_BUILD_PLATFORM": JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || "unknown"),
        "process.env.USE_LOCAL_API": JSON.stringify(process.env.USE_LOCAL_API || ""),
        "process.env.USE_BETA_API": JSON.stringify(process.env.USE_BETA_API || "")
      }
    },
    preload: {
      plugins: [
        visualizer({
          filename: "release/app/dist/preload/stats.html",
          open: false,
          title: "Preload Process Dependency Analysis"
        })
      ],
      build: {
        outDir: isProduction ? "release/app/dist/preload" : void 0,
        lib: {
          entry: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        },
        sourcemap: isProduction ? "hidden" : true,
        minify: isProduction
      },
      resolve: {
        alias: {
          "@": path.resolve(__electron_vite_injected_dirname, "./src/renderer"),
          "src/shared": path.resolve(__electron_vite_injected_dirname, "./src/shared")
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          "@": path.resolve(__electron_vite_injected_dirname, "src/renderer"),
          "@shared": path.resolve(__electron_vite_injected_dirname, "src/shared")
        }
      },
      plugins: [
        TanStackRouterVite({
          target: "react",
          autoCodeSplitting: true,
          routesDirectory: "./src/renderer/routes",
          generatedRouteTree: "./src/renderer/routeTree.gen.ts"
        }),
        react({}),
        dvhToVh(),
        isWeb ? injectBaseTag() : void 0,
        visualizer({
          filename: "release/app/dist/renderer/stats.html",
          open: false,
          title: "Renderer Process Dependency Analysis"
        }),
        process.env.SENTRY_AUTH_TOKEN ? sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: "sentry",
          project: "chatbox",
          url: "https://sentry.midway.run/",
          release: {
            name: inferredRelease,
            ...inferredDist ? { dist: inferredDist } : {}
          },
          sourcemaps: {
            assets: isProduction ? "release/app/dist/renderer/**" : "output/renderer/**"
          },
          telemetry: false
        }) : void 0
      ].filter(Boolean),
      build: {
        outDir: isProduction ? "release/app/dist/renderer" : void 0,
        target: "es2020",
        // Avoid static initialization blocks for browser compatibility
        sourcemap: isProduction ? "hidden" : true,
        minify: isProduction ? "esbuild" : false,
        // Use esbuild for faster, less memory-intensive minification
        rollupOptions: {
          output: {
            entryFileNames: "js/[name].[hash].js",
            chunkFileNames: "js/[name].[hash].js",
            assetFileNames: (assetInfo) => {
              if (assetInfo.name?.endsWith(".css")) {
                return "styles/[name].[hash][extname]";
              }
              if (/\.(woff|woff2|eot|ttf|otf)$/i.test(assetInfo.name || "")) {
                return "fonts/[name].[hash][extname]";
              }
              if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(assetInfo.name || "")) {
                return "images/[name].[hash][extname]";
              }
              return "assets/[name].[hash][extname]";
            },
            // Optimize chunk splitting to reduce memory usage during build
            manualChunks(id) {
              if (id.includes("node_modules")) {
                if (id.includes("@ai-sdk") || id.includes("ai/")) {
                  return "vendor-ai";
                }
                if (id.includes("@mantine") || id.includes("@tabler")) {
                  return "vendor-ui";
                }
                if (id.includes("mermaid") || id.includes("d3")) {
                  return "vendor-charts";
                }
              }
            }
          }
        }
      },
      css: {
        modules: {
          generateScopedName: "[name]__[local]___[hash:base64:5]"
        },
        postcss: "./postcss.config.cjs"
      },
      server: {
        port: 1212,
        strictPort: true
      },
      define: {
        "process.type": '"renderer"',
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
        "process.env.CHATBOX_BUILD_TARGET": JSON.stringify(process.env.CHATBOX_BUILD_TARGET || "unknown"),
        "process.env.CHATBOX_BUILD_PLATFORM": JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || "unknown"),
        "process.env.USE_LOCAL_API": JSON.stringify(process.env.USE_LOCAL_API || ""),
        "process.env.USE_BETA_API": JSON.stringify(process.env.USE_BETA_API || "")
      },
      optimizeDeps: {
        include: ["mermaid"],
        esbuildOptions: {
          target: "es2015"
        }
      }
    }
  };
});
export {
  electron_vite_config_default as default,
  dvhToVh,
  injectBaseTag
};
