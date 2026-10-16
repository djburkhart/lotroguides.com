const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("./link-public-assets");

const root = path.join(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const webPort = process.env.PORT || "3000";

function stableSecret(name) {
  return crypto.createHash("sha256").update((process.env.DO_APP_ID || "lotroguides") + ":" + name).digest("base64url");
}

fs.mkdirSync(path.join(root, "cms", ".tmp"), { recursive: true });

function launch(script, cwd, env) {
  return spawn(npm, ["run", script], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: true,
  });
}

const cms = launch("start", path.join(root, "cms"), {
  PORT: "1337",
  HOST: "127.0.0.1",
  APP_KEYS: process.env.APP_KEYS || stableSecret("app-keys-a") + "," + stableSecret("app-keys-b"),
  API_TOKEN_SALT: process.env.API_TOKEN_SALT || stableSecret("api-token-salt"),
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || stableSecret("admin-jwt"),
  TRANSFER_TOKEN_SALT: process.env.TRANSFER_TOKEN_SALT || stableSecret("transfer-token"),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || stableSecret("encryption-key"),
  JWT_SECRET: process.env.JWT_SECRET || stableSecret("jwt"),
});
const web = launch("start", path.join(root, "web"), {
  PORT: webPort,
  STRAPI_URL: process.env.STRAPI_URL || "http://127.0.0.1:1337",
});

function shutdown() {
  cms.kill();
  web.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

cms.on("exit", (code) => {
  if (code) {
    web.kill();
    process.exit(code);
  }
});
web.on("exit", (code) => {
  if (code) {
    cms.kill();
    process.exit(code);
  }
});
