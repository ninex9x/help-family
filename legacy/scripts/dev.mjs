import { constants } from "node:fs";
import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const secretsPath = resolve(projectRoot, ".dev.vars");
const variableName = "LOCAL_DATA_ENCRYPTION_KEY";

async function ensureEncryptionSecret() {
  try {
    await access(secretsPath, constants.F_OK);
    const contents = await readFile(secretsPath, "utf8");
    const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(`${variableName}=`));
    const encodedKey = line?.slice(variableName.length + 1) ?? "";
    const keyBytes = Buffer.from(encodedKey, "base64");
    if (keyBytes.byteLength !== 32 || keyBytes.toString("base64") !== encodedKey) {
      throw new Error(`Adicione ${variableName} com uma chave Base64 de 32 bytes em .dev.vars`);
    }
    await chmod(secretsPath, 0o600);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const secret = randomBytes(32).toString("base64");
      await writeFile(secretsPath, `${variableName}=${secret}\n`, { flag: "wx", mode: 0o600 });
      process.stdout.write("Chave local de criptografia criada em .dev.vars.\n");
      return;
    }
    throw error;
  }
}

await ensureEncryptionSecret();

const vinextCli = resolve(projectRoot, "node_modules/vinext/dist/cli.js");
const cliArguments = process.argv.slice(2);
const hasHostOverride = cliArguments.some(
  (argument) =>
    argument === "--hostname" ||
    argument.startsWith("--hostname=") ||
    argument === "--host" ||
    argument.startsWith("--host=") ||
    argument === "-H",
);

if (hasHostOverride) {
  throw new Error("O servidor sempre usa o hostname local fixo.");
}

const hasPortOverride = cliArguments.some(
  (argument) =>
    argument === "--port" ||
    argument.startsWith("--port=") ||
    argument === "-p",
);
const serverArguments = [vinextCli, "dev", "--hostname", "127.0.0.1"];

if (!hasPortOverride) {
  serverArguments.push("--port", "3001");
}

serverArguments.push(...cliArguments);

const child = spawn(process.execPath, serverArguments, {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
