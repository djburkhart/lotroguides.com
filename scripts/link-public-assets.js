const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pub = path.join(root, "web", "public");
fs.mkdirSync(pub, { recursive: true });

for (const name of ["css", "js", "plugins", "img", "data"]) {
  const target = path.join(root, name);
  const link = path.join(pub, name);
  if (!fs.existsSync(target)) {
    if (name === "data") fs.mkdirSync(target, { recursive: true });
    else continue;
  }
  try {
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink()) continue;
  } catch {
    const type = process.platform === "win32" ? "junction" : undefined;
    const dest = process.platform === "win32" ? path.resolve(target) : path.relative(path.dirname(link), target);
    fs.symlinkSync(dest, link, type);
    console.log(`linked web/public/${name}`);
  }
}
