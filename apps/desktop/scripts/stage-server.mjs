/**
 * Stage a self-contained specpasa server into src-tauri/resources/server for
 * the Tauri bundle.
 *
 * The Astro build bundles all workspace code into dist/, but leaves its
 * runtime dependencies (react, drizzle-orm, @libsql, the agent SDK, …) as
 * bare imports — the Dockerfile ships the whole workspace node_modules for
 * the same reason. A pnpm-deploy tree can't ship inside a .app: its virtual
 * store is an absolute-symlink forest that breaks on relocation and defeats
 * code signing. Instead this script scans dist for its actual bare imports,
 * pins each to the version the workspace resolved, and lets npm (real-file,
 * hoisted layout by construction) install exactly those into the staged tree.
 *
 * Run from apps/desktop (the package "stage"/"build" scripts do).
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { isAbsolute, join, resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopDir, "../..");
const webDir = join(repoRoot, "apps/web");
const distDir = join(webDir, "dist");
const serverDir = join(desktopDir, "src-tauri/resources/server");

/** The port the shell prefers; baked into PUBLIC_APP_URL (cosmetic only). */
const DESKTOP_PORT = 4977;

const run = (command, options = {}) =>
  execSync(command, { stdio: "inherit", cwd: repoRoot, ...options });

console.error("[stage] building @specpasa/web with desktop env…");
run("pnpm --filter @specpasa/web build", {
  env: {
    ...process.env,
    PUBLIC_APP_URL: `http://localhost:${DESKTOP_PORT}`,
    // Bakes desktop-only settings into the build — most importantly a
    // non-Secure session cookie, since WKWebView drops Secure cookies over
    // plain http://127.0.0.1 and login silently loops without it.
    SPECPASA_DESKTOP_BUILD: "1",
  },
});

console.error("[stage] collecting bare imports from dist…");
const builtins = new Set(builtinModules);
// Seeded with deps reached only through another external's subpath (e.g.
// drizzle-orm/libsql imports @libsql/client, so it never appears in dist).
const packages = new Set(["@libsql/client"]);
const IMPORT_RE = /(?:from\s*|import\s*\(?\s*)["']([^."'/][^"']*)["']/g;

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(IMPORT_RE)) {
        const spec = match[1];
        if (spec.startsWith("node:")) continue;
        const name = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        // Valid npm-name shape only — the regex also matches prose inside
        // bundled string literals; anything else is noise.
        if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) continue;
        if (!builtins.has(name)) packages.add(name);
      }
    }
  }
}
scan(join(distDir, "server"));

/** Version the workspace actually resolved for a package. */
function resolvedVersion(name) {
  const bases = [
    webDir,
    repoRoot,
    join(repoRoot, "packages/db"),
    join(repoRoot, "packages/providers"),
    join(repoRoot, "packages/core"),
    join(repoRoot, "packages/integrations"),
  ];
  for (const base of bases) {
    const manifest = join(base, "node_modules", name, "package.json");
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, "utf8")).version;
  }
  return null;
}

const dependencies = {};
for (const name of [...packages].sort()) {
  const version = resolvedVersion(name);
  if (version) dependencies[name] = version;
  else console.error(`[stage] skipping unresolvable import "${name}" (bundled or virtual)`);
}

console.error(`[stage] npm-installing ${Object.keys(dependencies).length} runtime deps…`);
rmSync(serverDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });
writeFileSync(
  join(serverDir, "package.json"),
  JSON.stringify({ name: "specpasa-server", private: true, type: "module", dependencies }, null, 2),
);
run("npm install --omit=dev --no-audit --no-fund --install-links", { cwd: serverDir });

// npm installs every @libsql prebuilt whose os/cpu match — including the
// musl variant on glibc hosts (npm does not reliably honor the libc field).
// Foreign prebuilds are dead weight in every bundle, and on Linux the musl
// index.node breaks Tauri's AppImage bundler (linuxdeploy ldd-scans the
// AppDir and ldd cannot process musl binaries). Keep only the host's variant.
const libsqlDir = join(serverDir, "node_modules/@libsql");
const platformKey = `${process.platform}-${process.arch}`;
for (const entry of readdirSync(libsqlDir)) {
  if (!/^(darwin|linux|win32)-/.test(entry)) continue;
  if (entry.startsWith(platformKey) && !entry.endsWith("-musl")) continue;
  console.error(`[stage] pruning foreign prebuilt @libsql/${entry}`);
  rmSync(join(libsqlDir, entry), { recursive: true, force: true });
}

console.error("[stage] copying dist, migrations, and migrate.mjs…");
cpSync(distDir, join(serverDir, "dist"), { recursive: true });
// The @specpasa/db package is bundled into dist, so its migration SQL is
// staged as a plain folder; the shell passes this path to migrate.mjs.
cpSync(join(repoRoot, "packages/db/drizzle"), join(serverDir, "drizzle"), { recursive: true });
cpSync(join(desktopDir, "src-tauri/resources/migrate.mjs"), join(serverDir, "migrate.mjs"));

const assertions = [
  "dist/server/entry.mjs",
  "drizzle",
  "node_modules/@libsql/client",
  "node_modules/@anthropic-ai/claude-agent-sdk",
  "node_modules/drizzle-orm",
  "node_modules/react",
  "migrate.mjs",
];
for (const path of assertions) {
  if (!existsSync(join(serverDir, path))) {
    console.error(`[stage] FAILED: ${path} missing from staged server`);
    process.exit(1);
  }
}
// Relative symlinks inside the tree (npm's .bin shims) relocate fine; an
// absolute target would break the moment the app is installed elsewhere.
// (On Windows npm writes .cmd shims instead — the walk simply finds nothing.)
const absoluteLinks = [];
(function findAbsoluteSymlinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (absoluteLinks.length >= 5) return;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (isAbsolute(readlinkSync(path))) absoluteLinks.push(path);
    } else if (entry.isDirectory()) {
      findAbsoluteSymlinks(path);
    }
  }
})(join(serverDir, "node_modules"));
if (absoluteLinks.length > 0) {
  console.error(
    `[stage] FAILED: absolute symlinks in staged node_modules:\n${absoluteLinks.join("\n")}`,
  );
  process.exit(1);
}
console.error(`[stage] done: ${serverDir}`);
