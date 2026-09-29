import {mkdir, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createInterface} from "node:readline/promises";
import {hashPassword} from "./auth.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const target = resolve(root, "../secrets/landing/admin.json");

async function credentials() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 4096) throw new Error("Input too large");
    }
    return JSON.parse(input);
  }
  const prompt = createInterface({input:process.stdin, output:process.stdout});
  const login = await prompt.question("Логин: ");
  prompt.close();
  process.stdout.write("Пароль (ввод скрыт): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const password = await new Promise((resolvePassword, reject) => {
    let value = "";
    function onData(chunk) {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          finish(); reject(new Error("Cancelled")); return;
        }
        if (character === "\r" || character === "\n") {
          finish(); resolvePassword(value); return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    }
    function finish() {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    }
    process.stdin.on("data", onData);
  });
  return {login, password};
}

try {
  const {login, password} = await credentials();
  if (typeof login !== "string" || !login.trim() || login.length > 64
      || typeof password !== "string" || password.length < 8 || password.length > 256) throw new Error("Invalid credentials");
  const passwordHash = await hashPassword(password);
  await mkdir(dirname(target), {recursive:true, mode:0o700});
  await writeFile(target, JSON.stringify({login:login.trim(), passwordHash}, null, 2) + "\n", {mode:0o600, flag:"wx"});
  console.log("Администратор создан. Настройки сохранены в secrets/landing/admin.json.");
} catch {
  console.error("Не удалось создать администратора. Проверьте ввод и наличие secrets/landing/admin.json.");
  process.exitCode = 1;
}
