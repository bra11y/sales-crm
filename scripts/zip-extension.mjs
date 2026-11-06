import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const out = "public/sales-crm-apply.zip";
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", `../${out}`, ".", "-x", ".*", "-x", "*/.*"], { cwd: "extension", stdio: "inherit" });
console.log(`Packed extension ${version} into ${out}`);
