import { spawn } from "node:child_process";

const port = String(process.env.PORT || "4173");

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "preview", "--host", "0.0.0.0", "--port", port],
  {
    stdio: "inherit",
    shell: false,
    env: process.env,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
