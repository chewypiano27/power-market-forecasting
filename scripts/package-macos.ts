import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DESKTOP_APP_NAME } from "../src/renderers/electrobun/shared/app-name";
import pkg from "../package.json";

if (process.platform !== "darwin") throw new Error("Package the macOS app on a Mac.");
function run(command: string[]) {
  const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (!result.success) throw new Error(`Command failed (${result.exitCode}): ${command[0]}`);
}

// A stable bundle includes its Bun runtime and does not need the source folder.
run([process.execPath, "run", "desktop:build", "--env=stable"]);
const prefix = `stable-macos-${process.arch}-`;
const archive = (await readdir("artifacts")).find(name => name.startsWith(prefix) && name.endsWith(".app.tar.zst"));
if (!archive) throw new Error("Electrobun did not produce the macOS app archive.");
const staging = await mkdtemp(join(tmpdir(), "vic1-package-"));
const output = join("artifacts", `macos-${process.arch}`);
await mkdir(output, { recursive: true });
try {
  const tarPath = join(staging, "app.tar");
  run([join("node_modules", "electrobun", `dist-macos-${process.arch}`, "zig-zstd"), "decompress", "-i", join("artifacts", archive), "-o", tarPath]);
  run(["/usr/bin/tar", "-xf", tarPath, "-C", staging]);
  const appPath = join(staging, `${DESKTOP_APP_NAME}.app`);
  const zipPath = join(output, `VIC1-${pkg.version}-macos-${process.arch}.zip`);
  run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zipPath]);
  const digest = createHash("sha256").update(await Bun.file(zipPath).arrayBuffer().then(bytes => new Uint8Array(bytes))).digest("hex");
  await writeFile(`${zipPath}.sha256`, `${digest}  ${basename(zipPath)}\n`);
  console.log(`Ready to share: ${zipPath}\nSHA-256: ${digest}\nThis app is not Developer ID signed or notarised.`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
