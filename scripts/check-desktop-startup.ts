import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Exercise the native renderer and backend handshake from a copy outside the repo.
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "win" : "linux";
const scratch = await mkdtemp(join(tmpdir(), "vic1-startup-"));
const prefix = `stable-${platform}-${process.arch}-`;
const archive = (await readdir("artifacts")).find(name => name.startsWith(prefix) && name.endsWith(".tar.zst"));
if (!archive) throw new Error("The native app archive is missing");
const decompressor = resolve(`node_modules/electrobun/dist-${platform}-${process.arch}/zig-zstd${process.platform === "win32" ? ".exe" : ""}`);
const tar = join(scratch, "app.tar");
async function run(command: string[]) {
  const code = await Bun.spawn(command, { stdout: "inherit", stderr: "inherit" }).exited;
  if (code !== 0) throw new Error(`Archive preparation failed: ${command[0]} (${code})`);
}
await run([decompressor, "decompress", "-i", resolve("artifacts", archive), "-o", tar]);
await run(["tar", "-xf", tar, "-C", scratch]);
const candidates = (await readdir(scratch, { withFileTypes: true })).filter(entry => entry.isDirectory());
if (candidates.length !== 1) throw new Error("Expected one extracted app bundle");
const bundle = join(scratch, candidates[0]!.name);
const executable = join(bundle, ...(platform === "macos" ? ["Contents", "MacOS"] : ["bin"]),
  process.platform === "win32" ? "launcher.exe" : "launcher");
const cwd = join(scratch, "working-directory");
await mkdir(cwd);
const ready = join(scratch, "renderer-ready.json");
const child = Bun.spawn([executable], {
  cwd,
  env: { ...process.env, VIC1_HOME: join(scratch, "profile"), VIC1_STARTUP_CHECK_FILE: ready },
  stdout: "inherit", stderr: "inherit",
});
try {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await Bun.file(ready).exists()) {
      const result = await Bun.file(ready).json();
      if (result.rendererInitialized !== true || result.architecture !== process.arch || result.platform !== process.platform) {
        throw new Error("Renderer startup returned an unexpected platform or architecture");
      }
      console.log(JSON.stringify({ ...result, bundle: basename(bundle), outsideSourceTree: true,
        freshProfile: true, scope: "Native renderer/backend initialization; not interactive feature acceptance." }));
      break;
    }
    if (child.exitCode !== null) throw new Error(`App exited before renderer startup (${child.exitCode})`);
    await Bun.sleep(250);
  }
  if (!(await Bun.file(ready).exists())) throw new Error(`Renderer initialization timed out. Diagnostics: ${scratch}`);
} finally {
  if (process.platform === "win32") {
    await Bun.spawn(["taskkill", "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" }).exited;
  } else {
    // Kill only the launcher's direct runtime child, then the launcher itself.
    await Bun.spawn(["pkill", "-TERM", "-P", String(child.pid)], { stdout: "ignore", stderr: "ignore" }).exited;
    child.kill();
  }
}
