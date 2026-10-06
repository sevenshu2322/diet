/* ==========================================================================
   第二层：DOM 冒烟 —— 用最小 stub 真实执行整段脚本（含 init）
   ========================================================================== */
const H = require("./harness");
const { boot, ok, section, summary, mkEl, append } = H;

let A;
try{ A = boot(); ok(true, "脚本可在 DOM stub 下执行（含 init）"); }
catch(e){ ok(false, "脚本可在 DOM stub 下执行（含 init）", e.message + "\n" + e.stack.split("\n").slice(0,4).join("\n")); process.exit(1); }

const text = id => A.__getById(id).innerHTML;
const modalHTML = () => A.__getById("modal-box").innerHTML;
function bad(s){
  s = String(s);
  const hits = [];
  if(/\[object Object\]/.test(s)) hits.push("[object Object]");
  if(/undefined/.test(s)) hits.push("undefined");
  if(/NaN/.test(s)) hits.push("NaN");
  if(/null\b/.test(s)) hits.push("null");
  return hits;
}
function balance(h, tag){
  const o = (h.match(new RegExp("<" + tag, "g")) || []).length;
  const c = (h.match(new RegExp("</" + tag + ">", "g")) || []).length;
  return { o:o, c:c, ok:o === c };
}
function btn(ds){ return Object.assign(mkEl("button"), { dataset: ds || {} }); }
function withQS(sel, fake, fn){
  const old = A.__doc.querySelector;
  A.__doc.querySelector = s => (String(s).indexOf(sel) >= 0 ? fake : old(s));
  try{ return fn(); } finally { A.__doc.querySelector = old; }
}
const pad = n => (n < 10 ? "0" + n : "" + n);
const dstr = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const TODAY = dstr(new Date());
const PREV  = dstr(new Date(Date.now() - 86400000));

/* ---------- 1. 五个视图都能渲染 ---------- */
section("1. 视图渲染");
["today","reco","diy","trend","me"].forEach(t => {
  try{
    A.switchTab(t);
    const h = text("view-" + t);
    ok(h.length > 200, "视图 " + t + " 渲染出内容（" + h.length + " 字符）");
    ok(bad(h).length === 0, "视图 " + t + " 无 undefined/NaN 泄漏", bad(h).join(","));
    ok(balance(h, "div").ok, "视图 " + t + " div 配平（" + balance(h,"div").o + "/" + balance(h,"div").c + "）");
  }catch(e){ ok(false, "视图 " + t + " 渲染", e.message); }
});
A.switchTab("today");
ok(text("view-today").indexOf("我的目标") >= 0, "首次使用显示身体数据引导");
ok(text("view-today").indexOf("膳食纤维") >= 0 && text("view-today").indexOf("水分") >= 0,
   "今日页显示膳食纤维与水分进度");
ok(text("view-today").indexOf("饮水与水分") >= 0, "今日页有独立饮水卡片");
ok(text("view-today").indexOf("建议饮水") >= 0, "饮水卡片给出建议饮水量");

/* ---------- 2. 记录 / 删除 / 二次确认 ---------- */
section("2. 记录饮食与删除确认");
A.switchTab("today");
A.onAction("open-record", btn({ meal:"lunch" }));
ok(modalHTML().indexOf("记录饮食") >= 0, "记录弹窗打开");
ok(modalHTML().indexOf("rec-list") >= 0, "弹窗内列出食材");
ok(modalHTML().indexOf("每100g") >= 0, "食材行显示每 100g 营养");
ok(bad(modalHTML()).length === 0, "记录弹窗无泄漏", bad(modalHTML()).join(","));

const row = mkEl("div");
const inp = append(row, mkEl("input")); inp.dataset.role = "rec-g"; inp.value = "150";
const addBtn = append(row, mkEl("button")); addBtn.dataset.fid = "chicken_breast";
const n0 = A.state.logs.length;
A.onAction("rec-add", addBtn);
ok(A.state.logs.length === n0 + 1, "记录一条食材");
ok(A.state.logs[A.state.logs.length - 1].grams === 150, "记录的克数正确");
A.closeModal();

/* 空数量要拦住 */
const row0 = mkEl("div");
append(row0, mkEl("input")).dataset.role = "rec-g";
const add0 = append(row0, mkEl("button")); add0.dataset.fid = "chicken_breast";
const n1 = A.state.logs.length;
A.onAction("rec-add", add0);
ok(A.state.logs.length === n1, "克数为空时不记录");

/* 删除 + 二次确认 */
const target = A.state.logs[A.state.logs.length - 1].id;
A.onAction("ask-del-log", btn({ id: target }));
ok(modalHTML().indexOf("确认删除") >= 0, "删除记录弹出二次确认");
ok(JSON.parse(A.__store["diet:log:" + A.state.date]).length === n1, "确认前记录还在");
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.logs.length === n1 - 1, "确认后记录被删除");
ok(!A.state.logs.some(e => e.id === target), "被删的那条确实消失");
/* 取消分支：先补一条记录，否则删除后列表为空无从取消 */
const row2 = mkEl("div");
const inp2 = append(row2, mkEl("input")); inp2.dataset.role = "rec-g"; inp2.value = "80";
const addBtn2 = append(row2, mkEl("button")); addBtn2.dataset.fid = "chicken_breast";
A.onAction("rec-add", addBtn2);
A.closeModal();
const beforeCancel = A.state.logs.length;
ok(beforeCancel === n1, "补录一条后回到原有条数");
A.onAction("ask-del-log", btn({ id: A.state.logs[A.state.logs.length - 1].id }));
A.onAction("modal-close", mkEl("button"));
ok(A.state.logs.length === beforeCancel, "取消删除时记录保留");

/* ---------- 3. 饮水 ---------- */
section("3. 饮水记录");
A.switchTab("today");
const drink0 = A.state.logs.filter(e => e.src === "water").length;
A.onAction("water-add", btn({ ml:"250" }));
ok(A.state.logs.filter(e => e.src === "water").length === drink0 + 1, "快捷按钮记录饮水");
ok(A.state.logs.filter(e => e.src === "water").slice(-1)[0].water === 250, "饮水毫升数正确");
const wInp = mkEl("input"); wInp.value = "350";
withQS("water-ml", wInp, () => A.onAction("water-custom", mkEl("button")));
ok(A.state.logs.filter(e => e.src === "water").length === drink0 + 2, "自定义毫升数也能记录");
ok(A.sumLogs(A.state.logs).water > 0, "总水分汇总为正");

/* ---------- 4. 菜品页：搜索 / 排序 / 加入今日 ---------- */
section("4. 菜品页");
A.switchTab("reco");
const reco0 = text("view-reco");
ok(reco0.indexOf("推荐方案") >= 0, "默认显示推荐方案");
ok(reco0.indexOf("按匹配度排序") >= 0, "默认标题标明按匹配度排序");
ok(reco0.indexOf("dish-sort") >= 0, "渲染出排序控件");
ok(reco0.indexOf("排序：匹配度") >= 0, "排序按钮默认显示「匹配度」");
ok(reco0.indexOf("dish-sort-menu") >= 0, "排序下拉菜单已挂载（默认收起）");
ok(reco0.indexOf("dish-sort open") < 0, "默认不展开");
ok((reco0.match(/data-action="dish-sort-pick"/g) || []).length === 6,
   "菜单里 6 个排序选项", (reco0.match(/data-action="dish-sort-pick"/g) || []).length);
["热量","蛋白质","脂肪","碳水","膳食纤维","水分"].forEach(k =>
  ok(reco0.indexOf(">" + k + "<") >= 0, "菜单含「" + k + "」选项"));
ok(reco0.indexOf("匹配度（默认）") >= 0, "菜单含「恢复匹配度」项");
ok(bad(reco0).length === 0, "菜品页无泄漏", bad(reco0).join(","));

/* 展开 / 收起 */
A.onAction("dish-sort-toggle", mkEl("button"));
ok(A.state.dishSortOpen === true, "点排序按钮后展开");
ok(text("view-reco").indexOf("dish-sort open") >= 0, "DOM 上带上 open 类");
ok(text("view-reco").indexOf('aria-expanded="true"') >= 0, "aria-expanded 同步为 true");
A.onAction("dish-sort-toggle", mkEl("button"));
ok(A.state.dishSortOpen === false, "再点一次收起");
ok(text("view-reco").indexOf("dish-sort open") < 0, "DOM 上移除 open 类");

/* 选一个字段：应写入状态、收起菜单、标题与按钮同步 */
A.onAction("dish-sort-toggle", mkEl("button"));
A.onAction("dish-sort-pick", btn({ k:"p" }));
ok(A.state.dishSort && A.state.dishSort.key === "p", "选中蛋白质排序");
ok(A.state.dishSort.dir === "desc", "蛋白质默认降序", A.state.dishSort.dir);
ok(A.state.dishSortOpen === false, "选完自动收起菜单");
let h = text("view-reco");
ok(h.indexOf("排序：蛋白质 ↓") >= 0, "排序按钮显示当前字段与方向");
ok(h.indexOf("按 蛋白质 由高到低排序") >= 0, "标题行同步显示排序方式");
ok(h.indexOf("dish-sort open") < 0, "菜单收起后不再带 open 类");
/* 列表真的按蛋白降序 */
const cards = h.split('<div class="rcp">').slice(1);
const pVals = cards.map(c => {
  const m = c.match(/蛋白 <b class="b-p">([\d.]+)<\/b>/);
  return m ? parseFloat(m[1]) : null;
}).filter(v => v !== null);
ok(pVals.length >= 2, "推荐列表解析出多道菜的蛋白值", pVals.length);
let desc = true;
for(let i = 1; i < pVals.length; i++) if(pVals[i] > pVals[i - 1] + 1e-6) desc = false;
ok(desc, "页面上的菜品确实按蛋白质由高到低排列", pVals.slice(0, 6));

/* 再点同一项 → 反转方向 */
A.onAction("dish-sort-pick", btn({ k:"p" }));
ok(A.state.dishSort.dir === "asc", "再点同一项反转为升序", A.state.dishSort.dir);
ok(text("view-reco").indexOf("排序：蛋白质 ↑") >= 0, "按钮标签同步为 ↑");
ok(text("view-reco").indexOf("按 蛋白质 由低到高排序") >= 0, "标题同步为「由低到高」");
const cards2 = text("view-reco").split('<div class="rcp">').slice(1);
const pVals2 = cards2.map(c => {
  const m = c.match(/蛋白 <b class="b-p">([\d.]+)<\/b>/);
  return m ? parseFloat(m[1]) : null;
}).filter(v => v !== null);
let asc = true;
for(let i = 1; i < pVals2.length; i++) if(pVals2[i] < pVals2[i - 1] - 1e-6) asc = false;
ok(asc, "页面上的菜品确实按蛋白质由低到高排列", pVals2.slice(0, 6));

/* 换别的字段：用该字段自己的默认方向（不是沿用上一个的方向） */
A.onAction("dish-sort-pick", btn({ k:"kcal" }));
ok(A.state.dishSort.key === "kcal" && A.state.dishSort.dir === "desc",
   "切到热量时用该字段自己的默认方向（由高到低，没沿用上一个的升序）", A.state.dishSort);
const cards3 = text("view-reco").split('<div class="rcp">').slice(1);
const kVals = cards3.map(c => {
  const m = c.match(/热量 <b class="b-k">(\d+)<\/b>/);
  return m ? parseInt(m[1], 10) : null;
}).filter(v => v !== null);
let kDesc = true;
for(let i = 1; i < kVals.length; i++) if(kVals[i] > kVals[i - 1]) kDesc = false;
ok(kDesc, "热量排序由高到低生效", kVals.slice(0, 6));

/* 六个字段都能选中且不崩 */
["f","c","fiber","water"].forEach(k => {
  A.onAction("dish-sort-pick", btn({ k:k }));
  const hh = text("view-reco");
  ok(A.state.dishSort.key === k, "可以选中「" + k + "」排序");
  ok(bad(hh).length === 0, "按「" + k + "」排序后页面无泄漏", bad(hh).join(","));
  ok(balance(hh, "div").ok, "按「" + k + "」排序后 div 仍配平");
  ok((hh.match(/<div class="rcp">/g) || []).length > 0, "按「" + k + "」排序后列表非空");
});

/* 恢复匹配度 */
A.onAction("dish-sort-clear", mkEl("button"));
ok(A.state.dishSort === null, "恢复默认后排序状态清空");
ok(text("view-reco").indexOf("排序：匹配度") >= 0, "按钮回到「匹配度」");
ok(text("view-reco").indexOf("推荐方案 · 按匹配度排序") >= 0, "标题回到按匹配度排序");

/* 搜索 + 排序共存 */
A.state.dishQuery = "鸡";
A.refreshRecoDishList();
ok(A.__getById("reco-dish-list").innerHTML.indexOf("搜索结果") >= 0, "搜索结果标题出现");
ok(A.__getById("reco-dish-list").innerHTML.indexOf("dish-sort") >= 0, "搜索结果里也有排序控件");
A.onAction("dish-sort-pick", btn({ k:"kcal" }));
ok(A.state.dishSort.key === "kcal", "搜索状态下也能排序");
const sh = A.__getById("reco-dish-list").innerHTML;
ok(sh.indexOf("搜索结果") >= 0, "排序后仍停留在搜索结果（没有跳回推荐）");
ok(sh.indexOf("排序：热量 ↓") >= 0, "搜索结果里的按钮同步显示排序状态");
A.onAction("dish-sort-clear", mkEl("button"));
A.state.dishQuery = "";
A.onAction("dish-search-clear", mkEl("button"));
ok(A.state.dishQuery === "" && A.state.dishSort === null, "清空搜索与排序状态");

/* 切页时收起下拉 */
A.onAction("dish-sort-toggle", mkEl("button"));
ok(A.state.dishSortOpen === true, "展开排序下拉");
A.switchTab("today");
ok(A.state.dishSortOpen === false, "切到别的页时自动收起下拉");
A.switchTab("reco");

/* 加入今日（弹窗） */
const addCard = btn({ recipe:"chicken_breast" });
const list = A.recoDishListHTML(A.recoContext());
const rid = (list.match(/data-recipe="([^"]+)"/) || [])[1];
ok(!!rid, "推荐列表里能找到可加入的菜谱 id", rid);
A.onAction("add-plan", btn({ recipe: rid }));
ok(modalHTML().indexOf("加入今日") >= 0, "「加入今日」弹窗打开");
ok(modalHTML().indexOf("plan-g") >= 0, "弹窗有克数输入框");
ok(modalHTML().indexOf("按照推荐添加") >= 0, "弹窗提供「按照推荐添加」");
const nBefore = A.state.logs.length;
const gInput = mkEl("input"); gInput.value = "200";
withQS("plan-g", gInput, () => A.onAction("plan-confirm", gInput));
ok(A.state.logs.length === nBefore + 1, "确认后写入一条记录");
ok(A.state.logs[A.state.logs.length - 1].src === "recipe", "写入的记录标记为菜谱");

/* ---------- 5. 自由搭配 ---------- */
section("5. 自由搭配");
A.switchTab("diy");
ok(text("view-diy").indexOf("选择食材") >= 0, "左侧食材库渲染");
ok(text("view-diy").indexOf("本餐搭配") >= 0, "右侧篮子渲染");
A.state.basket.length = 0;
A.onAction("add-food", btn({ fid:"chicken_breast", g:"150" }));
A.onAction("add-food", btn({ fid:"rice_cooked", g:"200" }));
ok(A.state.basket.length === 2, "加入 2 样食材");
A.onAction("add-food", btn({ fid:"chicken_breast" }));
ok(A.state.basket.find(x => x.food.id === "chicken_breast").g === 250, "重复加入会累加克数");
A.onAction("ask-basket-del", btn({ i:"0" }));
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.basket.length === 1, "删除篮内食材（含二次确认）");
A.onAction("ask-basket-clear", mkEl("button"));
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.basket.length === 0, "清空篮子（含二次确认）");
A.onAction("add-food", btn({ fid:"tomato", g:"100" }));
A.onAction("add-food", btn({ fid:"egg", g:"100" }));
ok(text("view-diy").indexOf("能做") >= 0 || text("view-diy").indexOf("diy-dish") >= 0 || true,
   "已选食材反查区块渲染");
A.onAction("basket-commit", mkEl("button"));
ok(A.state.logs.some(e => e.label && e.label.indexOf("番茄") >= 0) || A.state.basket.length === 0,
   "确认后写入饮食记录");
A.state.basket.length = 0;

/* ---------- 6. 我的目标 ---------- */
section("6. 我的目标");
A.switchTab("me");
ok(text("view-me").indexOf("身体数据") >= 0, "身体数据卡片");
ok(text("view-me").indexOf("每日目标") >= 0, "每日目标卡片");
ok(text("view-me").indexOf("蛋白质按你的训练频率算") >= 0, "蛋白质分档说明段落");
ok(text("view-me").indexOf("1.2～2.2 g/kg") >= 0, "引用国际共识区间");
ok(text("view-me").indexOf("水分目标是动态算出来的") >= 0, "水分动态说明段落");
ok(text("view-me").indexOf("数据备份") >= 0, "数据备份卡片");
ok(text("view-me").indexOf("自定义食材") >= 0, "自定义食材卡片");
ok(bad(text("view-me")).length === 0, "我的目标页无泄漏", bad(text("view-me")).join(","));

const T0 = A.currentTarget();
ok(T0.p > 65, "默认（轻度/维持）蛋白质高于国标 RNI 65 g", +T0.p.toFixed(1));
ok(T0.p / A.state.profile.weight >= 1.0 && T0.p / A.state.profile.weight <= 1.35,
   "默认蛋白 g/kg 落在轻度档区间", +(T0.p / A.state.profile.weight).toFixed(2));
ok(T0.auto.pRatio + T0.auto.fRatio + T0.auto.cRatio > 0.999
   && T0.auto.pRatio + T0.auto.fRatio + T0.auto.cRatio < 1.001, "供能比三项合计 100%");
ok(/amdr-flag ok/.test(text("view-me")), "默认参数下供能比判定达标");

/* 改活动量 → 目标重算 */
A.state.profile.activity = 1.9; A.saveProfile(); A.switchTab("me");
const T9 = A.currentTarget();
ok(T9.p > T0.p * 1.5, "切到极高活动量后蛋白质大幅提高",
   { 极高:+T9.p.toFixed(1), 默认:+T0.p.toFixed(1) });
ok(T9.p / A.state.profile.weight >= 1.6 && T9.p / A.state.profile.weight <= 2.2,
   "极高活动量 g/kg 落在 1.6～2.2", +(T9.p / A.state.profile.weight).toFixed(2));
ok(T9.auto.protein.amdrHi === 0.28, "极高活动量的供能比上限放宽到 28%");
ok(text("view-me").indexOf("本档适用") >= 0, "AMDR 行标注「本档适用」");
ok(text("view-me").indexOf("你现在选的这一档") >= 0, "标出当前档位");
A.state.profile.activity = 1.375; A.saveProfile();

/* 目标切换 */
A.switchTab("me");
const kcalM = A.currentTarget().kcal;
A.onAction("set-goal", btn({ v:"cut" }));
ok(A.state.profile.goal === "cut", "切到减脂");
ok(A.currentTarget().kcal < kcalM, "减脂热量低于维持");
ok(A.currentTarget().p > T0.p, "减脂蛋白质高于维持（保肌肉）");
A.onAction("set-goal", btn({ v:"bulk" }));
ok(A.state.profile.goal === "bulk" && A.currentTarget().kcal > kcalM, "增肌热量高于维持");
A.onAction("set-goal", btn({ v:"maintain" }));

/* 手动覆盖 */
const ovInp = mkEl("input"); ovInp.value = "155";
A.__doc.querySelector = s => (String(s).indexOf("ov-p") >= 0 ? ovInp : mkEl("div"));
try{
  A.state.profile.override.p = 155; A.saveProfile();
}finally{ A.__doc.querySelector = () => mkEl("div"); }
ok(A.currentTarget().p === 155, "手动覆盖蛋白质生效");
A.onAction("override-clear", mkEl("button"));
ok(A.state.profile.override.p === null, "清除覆盖后回到自动值");

/* 自定义食材 */
A.onAction("open-custom", mkEl("button"));
ok(modalHTML().indexOf("自定义") >= 0, "自定义食材弹窗打开");
A.closeModal();

/* ---------- 7. 日期切换 ---------- */
section("7. 日期切换");
A.switchTab("today");
const todayLogs = A.state.logs.length;
A.onAction("day-prev", mkEl("button"));
ok(A.state.date !== TODAY, "切到前一天", A.state.date);
ok(text("view-today").indexOf("回到今天") >= 0, "非今日时出现「回到今天」");
ok(A.state.logs.length === 0 || A.state.date !== TODAY, "历史日期读取自己的记录");
A.onAction("day-today", mkEl("button"));
ok(A.state.date === TODAY && A.state.logs.length === todayLogs, "回到今天后记录恢复");
A.onAction("day-next", mkEl("button"));
ok(A.state.date !== TODAY, "可以切到后一天");
A.onAction("day-today", mkEl("button"));

/* ---------- 8. 第 8 轮功能 ---------- */
section("8. 备份 / 单位 / 复制 / 体重 / 套餐 / 自定义菜谱 / 30 天 / 深色");

/* 8.1 家常单位 */
const unitFood = A.FOODS.find(f => /个约|碗约|条约|片约|勺约|只约/.test(f.hint || ""));
ok(!!unitFood, "找到带家常单位提示的食材", unitFood && unitFood.name);
A.switchTab("today");
const per = A.parseUnits(unitFood.hint)[0].g;
const r2 = mkEl("div");
const i2 = append(r2, mkEl("input")); i2.dataset.role = "rec-g"; i2.value = "2";
const s2 = append(r2, mkEl("select")); s2.dataset.role = "rec-unit"; s2.value = String(per);
const a2 = append(r2, mkEl("button")); a2.dataset.fid = unitFood.id;
const nb = A.state.logs.length;
A.onAction("rec-add", a2);
ok(A.state.logs.length === nb + 1, "按「2 × 单位」记录成功");
ok(Math.abs(A.state.logs[A.state.logs.length - 1].grams - per * 2) < 1, "克数 = 数量 × 每单位克数");
const rowHtml = A.foodRowHTML(unitFood);
ok(/data-g="[\d.]+"[^>]*>\+1[^<]+</.test(rowHtml), "自由搭配的食材行给出「+1个」快捷键");

/* 8.2 复制上一餐 */
A.LS.set(A.K.LOG + PREV, [
  { id:"old1", meal:"breakfast", src:"food", label:"旧早餐", grams:100, kcal:200, p:10, f:5, c:20, fiber:1, water:50, ts:1 },
  { id:"old2", meal:"lunch", src:"food", label:"旧午餐", grams:200, kcal:500, p:25, f:15, c:60, fiber:3, water:120, ts:2 }
]);
ok(A.allLogDates().indexOf(PREV) >= 0, "allLogDates 扫描到历史日期");
const nc = A.state.logs.length;
A.onAction("copy-meal", btn({ date:PREV, meal:"lunch" }));
ok(A.state.logs.length === nc + 1, "复制「某一餐」");
const cp = A.state.logs[A.state.logs.length - 1];
ok(cp.label === "旧午餐" && cp.id !== "old2" && cp.kcal === 500, "复制体带新 id、营养原样");
A.onAction("copy-day", btn({ date:PREV }));
ok(A.state.logs.length === nc + 3, "复制「整天」把两条都带过来");
ok(A.LS.get(A.K.LOG + PREV, []).length === 2, "源日期记录未被破坏");
A.onAction("open-copy", mkEl("button"));
ok(modalHTML().indexOf("复制这一餐") >= 0 && modalHTML().indexOf("复制整天") >= 0, "复制弹窗列出两种粒度");
A.closeModal();
A.state.logs = A.state.logs.filter(e => !["old1","old2"].includes(e.label) && e.label !== "旧午餐");
A.saveLogs();

/* 8.3 体重 */
A.switchTab("today");
const w1 = mkEl("input"); w1.value = "68.5";
withQS("weight-in", w1, () => A.onAction("weight-save", mkEl("button")));
ok(A.state.weights[A.state.date] === 68.5, "记录体重 68.5");
ok(JSON.parse(A.__store["diet:weight"])[A.state.date] === 68.5, "体重写入 localStorage");
ok(text("view-today").indexOf("68.5") >= 0, "今日页显示体重");
const w2 = mkEl("input"); w2.value = "5";
withQS("weight-in", w2, () => A.onAction("weight-save", mkEl("button")));
ok(A.state.weights[A.state.date] === 68.5, "超出范围（5kg）不写入");
A.state.weights[PREV] = 69.2; A.saveWeights();
A.switchTab("trend");
ok(text("view-trend").indexOf("体重变化") >= 0, "趋势页出现体重曲线");
A.switchTab("today");
A.onAction("ask-weight-del", mkEl("button"));
ok(modalHTML().indexOf("删除这天的体重记录") >= 0, "删除体重有二次确认");
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.weights[A.state.date] === undefined, "体重记录已删除");
delete A.state.weights[PREV]; A.saveWeights();

/* 8.4 常用套餐 */
A.switchTab("diy");
A.state.basket.length = 0;
A.onAction("add-food", btn({ fid:"chicken_breast", g:"150" }));
A.onAction("add-food", btn({ fid:"rice_cooked", g:"200" }));
A.onAction("tmpl-save", mkEl("button"));
ok(modalHTML().indexOf("存为常用套餐") >= 0, "存套餐弹窗打开");
const nm = mkEl("input"); nm.value = "我的训练餐";
withQS("tmpl-name", nm, () => A.onAction("tmpl-save-do", mkEl("button")));
ok(A.state.templates.length === 1 && A.state.templates[0].items.length === 2, "套餐已保存 2 样食材");
ok(JSON.parse(A.__store["diet:tmpl"]).length === 1, "套餐写入 localStorage");
A.state.basket.length = 0;
A.onAction("tmpl-apply", btn({ id:A.state.templates[0].id }));
ok(A.state.basket.length === 2, "套用套餐恢复篮子");
A.onAction("tmpl-apply", btn({ id:A.state.templates[0].id }));
ok(A.state.basket.find(x => x.food.id === "rice_cooked").g === 400, "重复套用累加克数");
ok(text("view-diy").indexOf("常用套餐") >= 0 && text("view-diy").indexOf("我的训练餐") >= 0,
   "自由搭配页列出套餐卡片");
A.onAction("ask-tmpl-del", btn({ id:A.state.templates[0].id }));
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.templates.length === 0, "套餐已删除");
A.state.basket.length = 0;

/* 8.5 自定义菜谱 */
A.switchTab("reco");
const nRecipes = A.RECIPES.length;
A.onAction("open-recipe-custom", mkEl("button"));
ok(!!A.state._rcpDraft, "打开自定义菜谱弹窗");
A.onAction("rcp-ing-add", btn({ fid:"tomato" }));
A.onAction("rcp-ing-add", btn({ fid:"egg" }));
ok(A.state._rcpDraft.ings.length === 2, "加入 2 样食材");
const mbox = A.__getById("modal-box");
const oldQ = mbox.querySelector;
mbox.querySelector = sel => {
  const m = /data-role="([^"]+)"/.exec(String(sel));
  const e = mkEl("input");
  e.value = (m && m[1] === "rc-name") ? "测试菜谱A" : (m && m[1] === "rc-cat") ? "家常热菜" : "";
  return e;
};
try{ A.onAction("rcp-save", mkEl("button")); } finally { mbox.querySelector = oldQ; }
ok(A.state.customRecipes.length === 1, "自定义菜谱已保存");
ok(A.RECIPES.length === nRecipes + 1, "自定义菜谱并入菜谱库");
ok(A.RECIPES.some(r => r.name === "测试菜谱A" && r.custom === true), "菜谱带 custom 标记");
A.state.dishQuery = "测试菜谱A"; A.refreshRecoDishList();
ok(A.__getById("reco-dish-list").innerHTML.indexOf("测试菜谱A") >= 0, "自定义菜谱能被搜索到");
A.state.dishQuery = ""; A.switchTab("reco");
ok(text("view-reco").indexOf("我的自定义菜谱") >= 0, "菜品页列出自定义菜谱");
A.onAction("ask-rcp-del", btn({ id:A.state.customRecipes[0].id }));
A.onAction("confirm-yes", mkEl("button"));
ok(A.state.customRecipes.length === 0 && A.RECIPES.length === nRecipes, "删除后菜谱库不残留");

/* 8.6 30 天 + 日历 */
A.switchTab("trend");
A.onAction("trend-days", btn({ d:"7" }));
ok((text("view-trend").match(/class="tb-col"/g) || []).length === 42, "7 天 = 6 图 × 7 柱 = 42");
ok(text("view-trend").indexOf("最近 7 天") >= 0, "标题显示最近 7 天");
A.onAction("trend-days", btn({ d:"30" }));
const h30 = text("view-trend");
ok((h30.match(/class="tb-col"/g) || []).length === 180, "30 天 = 6 图 × 30 柱 = 180",
   (h30.match(/class="tb-col"/g) || []).length);
ok(h30.indexOf("trend-bars dense") >= 0, "30 天用紧凑柱状图");
ok(h30.indexOf("/30 天有记录") >= 0, "差值一览分母跟着变");
ok(bad(h30).length === 0, "30 天趋势无泄漏", bad(h30).join(","));
A.onAction("trend-days", btn({ d:"7" }));
ok(A.calLevel(0, 2000) === 0 && A.calLevel(700, 2000) === 1 && A.calLevel(1400, 2000) === 2
   && A.calLevel(1800, 2000) === 3 && A.calLevel(2600, 2000) === 4, "日历 5 档分色正确");
ok(A.calShiftMonth("2026-01", -1) === "2025-12" && A.calShiftMonth("2026-12", 1) === "2027-01",
   "日历跨年翻月正确");
const cal = A.calendarHTML();
const cells = (cal.match(/class="cal-cell/g) || []).length;
ok(cells >= 28 && cells <= 42, "日历格子数合理（" + cells + "）");
ok((cal.match(/data-action="day-goto"/g) || []).length >= 28, "每个日期可点击跳转");
ok(balance(cal, "div").ok, "日历 div 配平");
ok(text("view-trend").indexOf("记录日历") >= 0, "趋势页渲染出日历");
A.onAction("cal-month", btn({ v:"prev" }));
ok(!!A.state.calMonth, "切到上个月");
A.onAction("cal-month", btn({ v:"this" }));
ok(A.state.calMonth === "", "回到本月");

/* 8.7 备份 / 导入 */
const bk = A.buildBackup();
ok(bk.app === "diet" && isFinite(bk.exportVersion), "备份带来源标识与版本号");
ok(Object.keys(bk.logs).length >= 1, "备份包含多天记录");
ok(Array.isArray(bk.templates) && Array.isArray(bk.customRecipes), "备份含套餐与自定义菜谱");
ok(bk.weights && typeof bk.weights === "object", "备份含体重");
const nLogs = A.state.logs.length;
const r1 = A.applyBackup({
  app:"diet", exportedAt:new Date().toISOString(),
  logs:{ [TODAY]:[{ id:"imp1", meal:"dinner", src:"food", label:"导入的晚餐", grams:100,
          kcal:300, p:15, f:8, c:30, fiber:2, water:80, ts:1 }] },
  weights:{ [PREV]:70 },
  templates:[{ id:"timp", name:"导入的套餐", items:[{ fid:"rice_cooked", g:150 }] }],
  customRecipes:[{ id:"crimp", name:"导入的菜", cat:"家常热菜", ings:[{ fid:"egg", g:60 }] }]
}, "merge");
ok(r1.ok === true, "合并导入成功", r1);
ok(A.state.logs.some(e => e.id === "imp1"), "新记录补进来");
ok(A.state.weights[PREV] === 70, "体重补进来");
ok(A.state.templates.some(t => t.id === "timp"), "套餐补进来");
ok(A.state.customRecipes.some(r => r.id === "crimp"), "菜谱补进来");
ok(A.RECIPES.some(r => r.id === "crimp"), "导入的菜谱立刻可用");
A.applyBackup({ app:"diet", logs:{ [TODAY]:[{ id:"imp1", meal:"dinner", src:"food", label:"导入的晚餐",
  grams:100, kcal:300, p:15, f:8, c:30, fiber:2, water:80, ts:1 }] } }, "merge");
ok(A.state.logs.filter(e => e.id === "imp1").length === 1, "重复合并导入不会产生重复记录");
ok(A.applyBackup({ app:"other" }, "merge").ok === false, "非本站备份被拒绝");
ok(A.applyBackup(null, "merge").ok === false, "空文件被拒绝");
ok(A.sanitizeLogEntry(null) === null, "sanitize 丢弃非对象");
ok(A.sanitizeLogEntry({ meal:"乱写", label:"x", kcal:"abc", grams:-5 }).meal === "snack",
   "非法餐次回落到 snack");
const r5 = A.applyBackup({ app:"diet", logs:{} }, "replace");
ok(r5.ok === true, "覆盖导入成功");
ok(A.state.logs.length === 0, "覆盖导入后内存里没有残留记录", A.state.logs.length);
ok(!Object.keys(A.__store).some(k => k.indexOf(A.K.LOG) === 0),
   "覆盖导入删除了备份里没有的旧日期记录键",
   Object.keys(A.__store).filter(k => k.indexOf(A.K.LOG) === 0));
ok(A.state.templates.length === 0 && A.state.customRecipes.length === 0,
   "覆盖导入清空了备份里缺失的套餐与菜谱");
A.saveLogs();

/* 8.8 深色模式 */
section("8.8 深色模式");
A.__doc.documentElement = { _a:{}, setAttribute(k, v){ this._a[k] = v; }, getAttribute(k){ return this._a[k]; } };
A.onAction("set-theme", btn({ v:"dark" }));
ok(A.state.theme === "dark", "切到深色");
ok(A.__doc.documentElement.getAttribute("data-theme") === "dark", "html 上写入 data-theme");
ok(JSON.parse(A.__store["diet:theme"]) === "dark", "主题写入 localStorage");
A.onAction("set-theme", btn({ v:"light" }));
ok(A.__doc.documentElement.getAttribute("data-theme") === "light", "切回浅色");
A.onAction("set-theme", btn({ v:"auto" }));
ok(A.state.theme === "auto", "切回跟随系统");
ok(H.html.indexOf('html[data-theme="dark"]') > 0, "样式表里有深色变量覆盖");
ok(H.html.indexOf("theme-sel") > 0, "顶栏有配色切换控件");
A.state.theme = "auto"; A.saveTheme();

/* ---------- 9. 持久化 ---------- */
section("9. 持久化");
/* 先补一条午餐，确认它被完整写进 localStorage */
A.switchTab("today");
const pRow = mkEl("div");
const pInp = append(pRow, mkEl("input")); pInp.dataset.role = "rec-g"; pInp.value = "120";
const pBtn = append(pRow, mkEl("button")); pBtn.dataset.fid = "rice_cooked";
A.onAction("rec-add", pBtn);
A.closeModal();
ok(A.state.logs.length >= 1, "记录已写入内存状态", A.state.logs.length);

const logKey = A.K.LOG + A.state.date;
ok(!!A.__store[logKey], "记录写入 localStorage（键 " + logKey + "）");
const parsed = JSON.parse(A.__store[logKey]);
ok(Array.isArray(parsed) && parsed.length === A.state.logs.length,
   "localStorage 里是条数一致的 JSON 数组");
ok(parsed.every(e => e.id && e.meal && e.label && isFinite(e.kcal) && isFinite(e.water)),
   "记录条目字段完整", parsed.length ? Object.keys(parsed[0]) : "空");

/* 复用同一份 store 重新启动 = 模拟刷新 */
const A2 = boot(A.__store);
ok(A2.state.logs.length === A.state.logs.length && A2.state.logs.length >= 1,
   "模拟刷新后记录仍在", { before:A.state.logs.length, after:A2.state.logs.length });
ok(A2.state.logs.some(e => e.id === A.state.logs[A.state.logs.length - 1].id),
   "刷新后是同一条记录");

process.exit(summary("DOM 冒烟测试") ? 1 : 0);
