const { spawn } = require("child_process");
const path = require("path");

require("./link-public-assets");

const root = path.join(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const webPort = process.env.PORT || "3000";

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
