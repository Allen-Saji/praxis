import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("packages/db/migrations/"))
  .filter((file) => /\.(?:css|html|js|json|jsx|md|mjs|move|sh|sql|ts|tsx|yaml|yml)$/.test(file));

const failures = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (source.includes("\r")) failures.push(`${file}: contains CRLF line endings`);
  if (source.length && !source.endsWith("\n")) failures.push(`${file}: missing final newline`);
  source.split("\n").forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(`${file}:${index + 1}: trailing whitespace`);
  });
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${files.length} text files.`);
