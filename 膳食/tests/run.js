/* ==========================================================================
   膳食管理网站 · 一键跑完两套测试
   node tests/run.js
   —— 1) 纯函数测试（数据段 + @@PURE@@ 段，真实求值断言）
   —— 2) DOM 冒烟测试（最小 stub 下执行整段脚本，含 init 与交互）
   ========================================================================== */
const { spawnSync } = require("child_process");
const path = require("path");

const node = process.execPath;
const suites = ["pure-test.js", "dom-test.js"];
let bad = 0;

for(const s of suites){
  const r = spawnSync(node, [path.join(__dirname, s)], { stdio: "inherit" });
  if(r.status !== 0) bad++;
}

console.log("\n############################################");
console.log(bad ? "！！有 " + bad + " 套测试未通过" : "两套测试全部通过 ✔");
console.log("############################################");
process.exit(bad ? 1 : 0);
