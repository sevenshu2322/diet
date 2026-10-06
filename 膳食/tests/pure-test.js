/* ==========================================================================
   第一层：纯函数数值断言
   —— 只跑「数据段 + @@PURE@@ 段」，不碰 DOM
   ========================================================================== */
const { code, pureEnv, ok, section, summary } = require("./harness");

section("0. 语法与分段");
try{ new Function(code); ok(true, "整段脚本语法正确（打开不会白屏）"); }
catch(e){ ok(false, "整段脚本语法正确", e.message); }
try{ new Function(require("./harness").pureCode); ok(true, "纯函数段语法正确"); }
catch(e){ ok(false, "纯函数段语法正确", e.message); }

const E = pureEnv([
  "FOODS","FOOD_MAP","RECIPES","RECIPES_RAW","CATS","MEALS","MEAL_NAME","ACTIVITY","GOALS",
  "DRI","GOAL_KCAL","NUTRI_META","NUTRI_KEYS","MACRO_KEYS","DISH_SORT_KEYS",
  "KEY_LABEL","KEY_UNIT","PANTRY_IDS",
  "clamp","numOr","round1","roundG","dateKey","keyToDate","todayKey","shiftKey","esc",
  "zeroMacro","addMacro","mulMacro","macroOf","recipeVector","recipeTotalGrams","sumLogs","gapOf",
  "calcBMR","actIndex","proteinRefWeight","calcProteinTarget","goalCN","proteinNoteHTML",
  "calcWaterTarget","estimateFoodWater","drinkSuggest","calcAutoTarget","calcTarget",
  "solveAlpha","scoreRecipe","coveragePct","recommendRecipes","buildPlan","matchRecipeText","searchRecipes",
  "sortValueOf","dishSortDef","defaultDishSort","sortPlans","dishSortLabel",
  "isPantry","mainIngs","pairDishes","nextStepDishes",
  "greedyMaxG","greedySuggest","planToEntry","foodToEntry","waterToEntry","parseUnits",
  "GREEDY_KEYS","GREEDY_EXCLUDE_CATS","MACRO_KEYS","FAT_TARGET_RATIO","CARB_RATIO_CEIL","FOOD_WATER_PER_KCAL"
]);

ok(E.FOODS.length > 100, "食材库加载：" + E.FOODS.length + " 种");
ok(E.RECIPES.length >= 250, "菜谱库加载：" + E.RECIPES.length + " 道");

/* ---------- 1. 数据完整性 ---------- */
section("1. 数据完整性");
const badRef = [];
E.RECIPES.forEach(r => (r.ings || []).forEach(it => { if(!E.FOOD_MAP[it.fid]) badRef.push(r.id + "->" + it.fid); }));
ok(badRef.length === 0, "所有菜谱的食材引用都有效", badRef.slice(0, 5));

const dupId = {}, dups = [];
E.FOODS.forEach(f => { if(dupId[f.id]) dups.push(f.id); dupId[f.id] = 1; });
ok(dups.length === 0, "食材 id 无重复", dups);

const rcpIds = E.RECIPES.map(r => r.id);
ok(new Set(rcpIds).size === rcpIds.length, "菜谱 id 无重复");
const rcpNames = E.RECIPES.map(r => r.name);
ok(new Set(rcpNames).size === rcpNames.length, "菜谱名无重复");

const badNum = [];
E.FOODS.forEach(f => ["kcal","p","f","c"].forEach(k => {
  if(!isFinite(f[k])) badNum.push(f.id + "." + k + "=" + f[k]);
}));
ok(badNum.length === 0, "食材的营养值都是有限数（无 NaN）", badNum.slice(0, 5));

const allZero = E.RECIPES.filter(r => { const V = E.recipeVector(r); return V.p <= 0 && V.f <= 0 && V.c <= 0; });
ok(allZero.length === 0, "没有宏量全为 0 的菜谱", allZero.map(r => r.name));
ok(E.RECIPES.every(r => r.ings.length > 0), "每道菜都有食材");

const used = new Set();
E.RECIPES.forEach(r => r.ings.forEach(it => used.add(it.fid)));
ok(used.size >= 180, "菜谱覆盖的食材种类 = " + used.size + " / " + E.FOODS.length);
ok(E.CATS.length > 0 && E.MEALS.length >= 4, "分类与餐次表非空");

/* ---------- 2. 数值 / 日期工具 ---------- */
section("2. 工具函数");
ok(E.clamp(5, 0, 3) === 3 && E.clamp(-5, 0, 3) === 0 && E.clamp(2, 0, 3) === 2, "clamp 三态正确");
ok(E.round1(1.25) === 1.3 && E.round1(1.24) === 1.2, "round1 四舍五入到 1 位");
ok(E.roundG(3) === 3 && E.roundG(19) === 19 && E.roundG(20) === 20 && E.roundG(23) === 25,
   "roundG 取整规则（<20 取 1g 精度、≥20 取 5g 精度）",
   [E.roundG(3), E.roundG(19), E.roundG(20), E.roundG(23)]);
ok(E.roundG(0) === 0 && E.roundG(-5) === 0, "roundG 非正值返回 0");
const dk = E.dateKey(new Date(2026, 0, 5));
ok(dk === "2026-01-05", "dateKey 补零正确", dk);
ok(E.shiftKey("2026-03-01", -1) === "2026-02-28", "shiftKey 跨月正确", E.shiftKey("2026-03-01", -1));
ok(E.keyToDate("2026-10-05").getMonth() === 9, "keyToDate 月份从 0 起");
ok(E.esc('<a b="c">') === "&lt;a b=&quot;c&quot;&gt;", "esc 转义 HTML");
ok(E.esc(null) === "", "esc 处理 null");

/* 宏量运算 */
const m1 = E.macroOf({ kcal:100, p:10, f:2, c:3, fiber:1, water:50 }, 150);
ok(Math.abs(m1.kcal - 150) < 1e-9 && Math.abs(m1.p - 15) < 1e-9, "macroOf 按 100g 基准等比换算");
const ma = E.addMacro(E.zeroMacro(), m1);
ok(Math.abs(ma.kcal - m1.kcal) < 1e-9 && ma.water === 50 * 1.5, "addMacro 累加正确（含纤维/水分）");
ok(E.mulMacro(m1, 2).p === 30, "mulMacro 缩放正确");

/* 热量守恒：某道菜 4p+9f+4c 应约等于 kcal */
const rcp0 = E.RECIPES.find(r => r.ings.length >= 3);
const V0 = E.recipeVector(rcp0);
ok(Math.abs((V0.p * 4 + V0.f * 9 + V0.c * 4) - V0.kcal) / Math.max(V0.kcal, 1) < 0.12,
   "菜谱「" + rcp0.name + "」的 4p+9f+4c 与热量自洽（误差 <12%）");

/* ---------- 3. 已知真值：BMR / 日期 ---------- */
section("3. 目标引擎 · 基础代谢与热量");
const pr = { sex:"male", age:24, height:175, weight:70, activity:1.375, goal:"maintain",
             override:{ kcal:null, p:null, f:null, c:null, fiber:null, water:null } };
ok(Math.abs(E.calcBMR(pr) - 1678.75) < 1e-6, "男性 BMR = 1678.75（手算钉住公式）", E.calcBMR(pr));
ok(Math.abs(E.calcBMR(Object.assign({}, pr, { sex:"female" })) - 1512.75) < 1e-6, "女性 BMR = 1512.75");

const T0 = E.calcTarget(pr);
ok(Math.abs(T0.auto.tdee - 1678.75 * 1.375) < 1e-6, "TDEE = BMR × 活动系数", T0.auto.tdee);
ok(Math.abs(T0.kcal - T0.auto.tdee) < 1e-6, "维持目标热量 = TDEE");
const Tc = E.calcTarget(Object.assign({}, pr, { goal:"cut" }));
const Tb = E.calcTarget(Object.assign({}, pr, { goal:"bulk" }));
ok(Math.abs(Tc.kcal - T0.auto.tdee * 0.8) < 1e-6, "减脂热量 = TDEE × 0.80");
ok(Math.abs(Tb.kcal - T0.auto.tdee * 1.1) < 1e-6, "增肌热量 = TDEE × 1.10");

/* ---------- 4. 蛋白质按训练频率分档 ---------- */
section("4. 蛋白质：按每周运动频率分档");
const basePr = { sex:"male", age:30, height:175, weight:70, goal:"maintain",
                 activity:1.2, override:{ kcal:null,p:null,f:null,c:null,fiber:null,water:null } };
const byAct = E.ACTIVITY.map(a => {
  const t = E.calcTarget(Object.assign({}, basePr, { activity:a[0] }));
  return { label:a[1], perKg:t.p / 70, p:t.p, t:t };
});
ok(new Set(byAct.map(x => Math.round(x.perKg * 100))).size === 5,
   "五档活动量的 g/kg 互不相同（久坐/轻度/中度不再一刀切）",
   byAct.map(x => x.label.slice(0, 2) + ":" + x.perKg.toFixed(2)));
let mono = true;
for(let i = 1; i < byAct.length; i++) if(!(byAct[i].perKg > byAct[i - 1].perKg + 0.05)) mono = false;
ok(mono, "g/kg 随活动量单调递增", byAct.map(x => x.perKg.toFixed(2)));
ok(byAct[0].perKg >= 0.9 && byAct[0].perKg <= 1.15, "久坐 ≈ 0.9～1.15 g/kg（国标 RNI 水平）", byAct[0].perKg.toFixed(2));
ok(byAct[1].perKg >= 1.0 && byAct[1].perKg <= 1.35, "轻度 1.0～1.35 g/kg", byAct[1].perKg.toFixed(2));
ok(byAct[2].perKg >= 1.2 && byAct[2].perKg <= 1.65, "中度 1.2～1.65 g/kg", byAct[2].perKg.toFixed(2));
ok(byAct[3].perKg >= 1.6 && byAct[3].perKg <= 2.05, "高度 1.6～2.05 g/kg", byAct[3].perKg.toFixed(2));
ok(byAct[4].perKg >= 1.75 && byAct[4].perKg <= 2.25, "极高 1.75～2.25 g/kg", byAct[4].perKg.toFixed(2));
ok([3, 4].every(i => byAct[i].perKg >= 1.6 && byAct[i].perKg <= 2.2),
   "高度 / 极高都落在运动营养共识的 1.6～2.2 g/kg 内",
   [byAct[3].perKg.toFixed(2), byAct[4].perKg.toFixed(2)]);
ok(E.ACTIVITY.every((a, i) =>
     E.calcTarget(Object.assign({}, basePr, { activity:a[0] })).auto.protein.amdrHi ===
     E.DRI.proteinAMDRHiByAct[i]),
   "蛋白供能比上限按档位取值 [20,20,22,25,28]%", E.DRI.proteinAMDRHiByAct);

const midM = E.calcTarget(Object.assign({}, basePr, { activity:1.55, goal:"maintain" })).p;
const midC = E.calcTarget(Object.assign({}, basePr, { activity:1.55, goal:"cut" })).p;
const midB = E.calcTarget(Object.assign({}, basePr, { activity:1.55, goal:"bulk" })).p;
ok(midC > midM, "同一活动量下减脂蛋白 > 维持（保肌肉）", { cut:midC.toFixed(1), maintain:midM.toFixed(1) });
ok(midB > midC, "同一活动量下增肌蛋白 > 减脂", { bulk:midB.toFixed(1), cut:midC.toFixed(1) });

/* 调整体重 */
const ob = E.calcTarget({ sex:"male", age:50, height:165, weight:120, goal:"maintain", activity:1.9,
                          override:{ kcal:null,p:null,f:null,c:null,fiber:null,water:null } });
const ideal = 23 * 1.65 * 1.65;
ok(ob.auto.protein.refWeight.adjusted === true, "BMI ≥ 28 启用调整体重");
ok(Math.abs(ob.auto.protein.refWeight.kg - (ideal + 0.4 * (120 - ideal))) < 0.01,
   "调整体重 = 理想体重 + 40% 超出部分", ob.auto.protein.refWeight.kg.toFixed(1));
ok(ob.p < 1.8 * 120, "肥胖者蛋白目标明显低于「1.8 × 实际体重」",
   { now:+ob.p.toFixed(1), naive:+(1.8 * 120).toFixed(1) });
ok(E.calcTarget(Object.assign({}, ob, { weight:70, height:180 })).auto.protein.refWeight.adjusted === false,
   "BMI 正常时按实际体重计算");
ok(E.calcTarget(Object.assign({}, basePr, { activity:1.6 })).auto.protein.actIndex === 2,
   "非标准活动量 1.6 落到「中度」档（最近邻）");
ok(E.goalCN("cut") === "减脂" && E.goalCN("nope") === "维持", "goalCN 未知值时回退「维持」");

/* 60 组合的区间合规 */
let viol = [];
[ {sex:"male",age:30,height:175,weight:70}, {sex:"female",age:28,height:160,weight:55},
  {sex:"male",age:25,height:180,weight:80}, {sex:"male",age:50,height:165,weight:120},
  {sex:"female",age:60,height:150,weight:45} ].forEach(c => {
  E.ACTIVITY.forEach(a => ["cut","maintain","bulk"].forEach(g => {
    const t = E.calcTarget(Object.assign({}, c, { activity:a[0], goal:g,
      override:{ kcal:null,p:null,f:null,c:null,fiber:null,water:null } }));
    const R = t.auto;
    if(R.fRatio < 0.20 - 1e-9 || R.fRatio > 0.30 + 1e-9) viol.push(a[1] + "/" + g + " 脂肪");
    if(R.cRatio < 0.50 - 1e-9 || R.cRatio > 0.65 + 1e-9) viol.push(a[1] + "/" + g + " 碳水");
    if(Math.abs(R.pRatio + R.fRatio + R.cRatio - 1) > 1e-6) viol.push(a[1] + "/" + g + " 合计≠100%");
    if(!(t.p > 0) || !isFinite(t.p)) viol.push(a[1] + "/" + g + " 蛋白非法");
  }));
});
ok(viol.length === 0, "75 组「体征 × 目标 × 活动量」的供能比全部合规", viol.slice(0, 6));
ok(T0.auto.pRatio >= 0.10 - 1e-9 && T0.auto.pRatio <= 0.20 + 1e-9,
   "轻度活动蛋白供能比仍在国标 10%～20%", +(T0.auto.pRatio * 100).toFixed(2));
ok(Math.abs(T0.auto.fRatio - E.FAT_TARGET_RATIO) < 1e-9, "维持脂肪供能比 = 25%");
ok(T0.auto.cRatio >= 0.50 - 1e-9 && T0.auto.cRatio <= 0.65 + 1e-9, "碳水落在国标 50%～65%",
   +(T0.auto.cRatio * 100).toFixed(2));

/* ---------- 5. 水分与纤维 ---------- */
section("5. 水分与膳食纤维");
ok(T0.fiber === E.DRI.fiberAI, "膳食纤维恒取国标 AI 25 g");
const W = E.calcWaterTarget(pr, T0.auto.bmr, T0.auto.tdee);
ok(W.total > 1000 && W.total % 50 === 0, "总水目标是 50 的整数倍且 >1000", W.total);
const Wbig = E.calcWaterTarget({ sex:"male", weight:120, height:190, age:25, activity:1.9 },
                                E.calcBMR({ sex:"male", weight:120, height:190, age:25 }), 0);
ok(Wbig.total > W.total, "体型大 + 活动量高时总水目标更高", { big:Wbig.total, normal:W.total });
ok(E.estimateFoodWater(2000, 0, false) === 2000 * E.FOOD_WATER_PER_KCAL,
   "无记录时食物水按整日计划热量估算");
ok(E.estimateFoodWater(2000, 3000, true) === 3000, "有记录且实际更高时采用实际值");
ok(E.estimateFoodWater(2000, 100, true) === 2000 * E.FOOD_WATER_PER_KCAL,
   "记录不完整时不会被低估（取两者较大值）");
ok(E.drinkSuggest(3000, 1000) === 2000, "建议饮水 = 总水 − 食物水");
ok(E.drinkSuggest(1000, 3000) === 0, "食物水超过总水时建议饮水不为负");

/* 空记录时「建议饮水」不能等于总水目标（历史 bug 的回归） */
ok(E.drinkSuggest(T0.water, E.estimateFoodWater(T0.kcal, 0, false)) < T0.water - 300,
   "空记录时建议饮水已扣除食物水，不会等于总水目标",
   { want:E.drinkSuggest(T0.water, E.estimateFoodWater(T0.kcal, 0, false)), total:T0.water });

/* ---------- 6. 手动覆盖优先级 ---------- */
section("6. 手动覆盖");
const Tov = E.calcTarget(Object.assign({}, pr, { override:{ kcal:null, p:180, f:null, c:null } }));
ok(Tov.overridden.p === true && Tov.p === 180, "手动覆盖蛋白质生效");
ok(Tov.overridden.f === false && Math.abs(Tov.f - T0.f) < 1e-6, "未覆盖字段仍用自动值");
const Tov2 = E.calcTarget(Object.assign({}, pr, { override:{ kcal:null,p:null,f:null,c:null,fiber:35,water:4000 } }));
ok(Tov2.fiber === 35 && Tov2.water === 4000, "手动覆盖纤维 / 水分生效");
ok(Tov2.p === T0.p, "覆盖纤维/水分不影响蛋白质自动值");

/* ---------- 7. 推荐引擎 ---------- */
section("7. 推荐引擎");
const gap13 = { kcal:520, p:32, f:12, c:70 };
const reco = E.recommendRecipes(gap13, { lo:0.5, hi:2.5, limit:10 });
ok(reco.length > 0 && reco.length <= 10, "推荐返回 1~10 条", reco.length);
ok(reco.every((x, i) => i === 0 || reco[i - 1].score >= x.score - 1e-9), "推荐按 score 降序");
ok(reco.every(x => x.alpha >= 0.5 && x.alpha <= 2.5), "推荐方案的 α 都被夹在档位内");
ok(reco.every(x => isFinite(x.R.kcal) && x.R.kcal > 0), "推荐方案的缩放营养值为正有限数");
ok(reco.every(x => x.ings.every(it => it.food && it.g > 0)), "推荐方案里的食材都能解析出克数");
ok(E.recommendRecipes({ kcal:-100, p:-10, f:-5, c:-20 }, { lo:0.5, hi:2.5 }).length === 0,
   "缺口全为负时推荐列表为空");

/* α 过小应被剔除：缺口很大时，小份菜必须被排除 */
const bigGap = { kcal:1800, p:120, f:50, c:240 };
const small = E.recommendRecipes(bigGap, { lo:0.5, hi:2.5, limit:400 });
ok(!small.some(x => x.rawAlpha < 0.5), "α 小于下限的菜谱被剔除（避免半份方案）");
ok(small.every(x => x.grams > 0), "剔除后剩下的方案份量都为正");

/* buildPlan 兜底 */
const bp = E.buildPlan(E.RECIPES[0], { kcal:-100, p:-10, f:-5, c:-20 }, 0.5, 2.5);
ok(bp && bp.alpha === 1 && isFinite(bp.R.kcal), "无缺口时 buildPlan 回退到基准份量（α=1）");

/* 搜索绕过 α 档位 */
const srch = E.searchRecipes("红烧肉", { kcal:80, p:6, f:3, c:10 });
ok(srch.length === 1, "搜索能命中大份量菜（不受推荐档位限制）", srch.length);
ok(!E.recommendRecipes({ kcal:80, p:6, f:3, c:10 }, { lo:0.5, hi:2.5, limit:400 })
     .some(x => x.rcp.name === "红烧肉"),
   "同一道菜在推荐列表里被档位剔除（证明搜索确实绕开了它）");
ok(E.searchRecipes("", gap13).length === E.RECIPES.length, "空关键词返回全库（不截断）");
ok(E.searchRecipes("番茄", gap13).every(p => E.matchRecipeText(p.rcp, "番茄")),
   "搜索结果都真的命中关键词");
ok(E.searchRecipes("绝不可能存在的菜名xyz", gap13).length === 0, "搜不到时返回空数组");
ok(E.searchRecipes("番茄", gap13).every(p => isFinite(p.R.kcal) && p.R.kcal > 0),
   "搜索结果也按缺口缩放且数值合法");

/* ---------- 8. 菜品排序（本次新增） ---------- */
section("8. 菜品排序");
ok(E.DISH_SORT_KEYS.length === 6, "排序项共 6 个", E.DISH_SORT_KEYS.length);
ok(E.DISH_SORT_KEYS.map(x => x[0]).join(",") === "kcal,p,f,c,fiber,water",
   "排序字段顺序：热量/蛋白质/脂肪/碳水/膳食纤维/水分");
ok(E.DISH_SORT_KEYS.every(x => x[1] && (x[2] === "asc" || x[2] === "desc")),
   "每个排序项都带显示名与默认方向");

/* 默认方向：六个字段统一由高到低 */
ok(E.defaultDishSort("kcal").dir === "desc", "热量默认由高到低");
ok(E.defaultDishSort("p").dir === "desc", "蛋白质默认由高到低");
ok(E.defaultDishSort("f").dir === "desc", "脂肪默认由高到低");
ok(E.defaultDishSort("c").dir === "desc", "碳水默认由高到低");
ok(E.defaultDishSort("fiber").dir === "desc", "膳食纤维默认由高到低");
ok(E.defaultDishSort("water").dir === "desc", "水分默认由高到低");
ok(E.DISH_SORT_KEYS.every(x => x[2] === "desc"), "所有排序项的默认方向一致（由高到低）");
ok(E.DISH_SORT_KEYS.every(x => E.defaultDishSort(x[0]).dir === x[2]),
   "defaultDishSort 与常量里声明的默认方向一致");
ok(E.defaultDishSort("不存在") === null, "未知字段返回 null（调用方需兜底）");
ok(E.dishSortLabel(null) === "匹配度", "未排序时按钮显示「匹配度」");
ok(E.dishSortLabel(E.defaultDishSort("p")) === "蛋白质 ↓", "蛋白降序标签", E.dishSortLabel(E.defaultDishSort("p")));
ok(E.dishSortLabel({ key:"kcal", dir:"asc" }) === "热量 ↑", "热量升序标签");
ok(E.dishSortLabel({ key:"不存在的字段", dir:"asc" }) === "匹配度", "未知字段的标签回退");

/* 传入 null 时保持原顺序（推荐列表本来就是按匹配度排好的） */
ok(E.sortPlans(reco, null).map(x => x.rcp.id).join() === reco.map(x => x.rcp.id).join(),
   "sort 为 null 时保持入参顺序不变");
ok(E.sortPlans(reco, { key:"", dir:"asc" }).length === reco.length, "key 为空时同样不改顺序");

/* 每个字段升 / 降序都要真的有序，且用的是缩放后的 R */
E.DISH_SORT_KEYS.forEach(k => {
  [["asc", 1], ["desc", -1]].forEach(([dir, sign]) => {
    const s = E.sortPlans(reco, { key:k[0], dir:dir });
    let sorted = true;
    for(let i = 1; i < s.length; i++){
      const a = E.sortValueOf(s[i - 1], k[0]), b = E.sortValueOf(s[i], k[0]);
      if((b - a) * sign < -1e-6) sorted = false;
    }
    ok(sorted, "按「" + k[1] + "」" + (dir === "asc" ? "升序" : "降序") + "后确实有序");
    ok(s.length === reco.length, "排序不增删条目（" + k[1] + " " + dir + "）");
    ok(new Set(s.map(x => x.rcp.id)).size === s.length, "排序后无重复条目（" + k[1] + "）");
  });
});

/* 排序依据必须是缩放后的 R，不是每 100g 的值 */
const kcalAsc = E.sortPlans(reco, { key:"kcal", dir:"asc" });
ok(kcalAsc.every((x, i) => i === 0 || x.R.kcal >= kcalAsc[i - 1].R.kcal - 1e-6),
   "热量排序用的是缩放后的 R.kcal（与卡片显示一致）");
const pDesc = E.sortPlans(reco, { key:"p", dir:"desc" });
ok(pDesc[0].R.p >= pDesc[pDesc.length - 1].R.p, "蛋白降序：首项蛋白 ≥ 末项",
   [round1s(pDesc[0].R.p), round1s(pDesc[pDesc.length - 1].R.p)]);
function round1s(v){ return Math.round(v * 10) / 10; }

/* 同值时回退到匹配度，保证顺序稳定 */
const tie = [
  { rcp:{ id:"a", name:"甲" }, R:{ kcal:100, p:1, f:1, c:1, fiber:1, water:1 }, score:50 },
  { rcp:{ id:"b", name:"乙" }, R:{ kcal:100, p:1, f:1, c:1, fiber:1, water:1 }, score:90 },
  { rcp:{ id:"c", name:"丙" }, R:{ kcal:100, p:1, f:1, c:1, fiber:1, water:1 }, score:70 }
];
ok(E.sortPlans(tie, { key:"kcal", dir:"asc" }).map(x => x.rcp.id).join() === "b,c,a",
   "营养值相同时按匹配度降序（b90 > c70 > a50）",
   E.sortPlans(tie, { key:"kcal", dir:"asc" }).map(x => x.rcp.id));
ok(E.sortPlans(tie, { key:"kcal", dir:"asc" }).map(x => x.rcp.id).join()
   === E.sortPlans(tie, { key:"kcal", dir:"asc" }).map(x => x.rcp.id).join(),
   "同样输入重复排序结果稳定（可复现）");

/* 缺字段 / 非法值不能把列表搞崩 */
const messy = [
  { rcp:{ id:"x", name:"缺纤维" }, R:{ kcal:50, p:1, f:1, c:1 }, score:10 },
  { rcp:{ id:"y", name:"非法值" }, R:{ kcal:80, p:NaN, f:1, c:1, fiber:"abc", water:null }, score:20 },
  { rcp:{ id:"z", name:"正常" }, R:{ kcal:20, p:5, f:1, c:1, fiber:2, water:100 }, score:30 }
];
ok(E.sortValueOf(messy[0], "fiber") === 0, "缺失字段按 0 参与排序");
ok(E.sortValueOf(messy[1], "p") === 0 && E.sortValueOf(messy[1], "water") === 0,
   "NaN / null 按 0 参与排序（不会把整个列表搞成乱序）");
const ms = E.sortPlans(messy, { key:"fiber", dir:"desc" });
ok(ms.length === 3 && ms[0].rcp.id === "z", "脏数据下排序仍然可用，缺值的排后面",
   ms.map(x => x.rcp.id));
ok(E.sortPlans([], { key:"p", dir:"desc" }).length === 0, "空列表排序返回空");
ok(E.sortPlans(null, { key:"p", dir:"desc" }).length === 0, "null 列表排序返回空（不抛错）");
const sortedCopy = E.sortPlans(reco, { key:"p", dir:"desc" });
ok(Array.isArray(sortedCopy) && sortedCopy !== reco, "sortPlans 返回新数组，不改动入参引用");
ok(E.sortPlans(reco, null).map(x => x.rcp.id).join() === reco.map(x => x.rcp.id).join(),
   "对原数组没有副作用");

/* 搜索结果也能排序（搜索 + 排序共存） */
const srchAll = E.searchRecipes("", gap13);
const srchSorted = E.sortPlans(srchAll, { key:"p", dir:"desc" });
ok(srchSorted.length === srchAll.length, "搜索结果排序后条数不变");
let sSorted = true;
for(let i = 1; i < srchSorted.length; i++){
  if(srchSorted[i].R.p > srchSorted[i - 1].R.p + 1e-6) sSorted = false;
}
ok(sSorted, "全库按蛋白质降序后整体有序（" + srchSorted.length + " 道）");

/* ---------- 9. 贪心补足（反例优先） ---------- */
section("9. 自由搭配 · 贪心补足");
const needP = { kcal:0, p:60, f:0, c:0 };   /* 只缺蛋白 */
const sugP = E.greedySuggest(E.zeroMacro(), T0, E.zeroMacro());
ok(sugP && (sugP.food || sugP.key || sugP.tips || sugP.balanced !== undefined),
   "greedySuggest 返回结构正常");
const sug = E.greedySuggest(E.macroOf(E.FOOD_MAP[E.FOODS[0].id], 100), T0, E.zeroMacro());
if(sug && sug.tips){
  ok(sug.tips.every(t => t.food.cat !== "调味其他"),
     "补足建议里不会出现「调味其他」类（不会让你喝油 / 吃味精）",
     sug.tips.map(t => t.food.name + "/" + t.food.cat));
  ok(sug.tips.every(t => t.g <= 400), "补足建议的克数被限制在合理范围",
     sug.tips.map(t => t.g));
}
ok(E.greedyMaxG({ id:"x", cat:"坚果油脂" }) <= 40, "坚果油脂类单次建议上限 ≤ 40g");
ok(E.GREEDY_EXCLUDE_CATS["调味其他"] === 1, "调味其他在排除表里");

/* ---------- 10. 家常单位 ---------- */
section("10. 家常单位解析");
const u2 = E.parseUnits("1 个约 50g；1 碗约 200g");
ok(u2.length === 2, "解析出 2 个单位", u2);
ok(u2[0].unit === "个" && u2[0].g === 50, "个 = 50g");
ok(u2[1].unit === "碗" && u2[1].g === 200, "碗 = 200g");
ok(E.parseUnits("2 个约 100g")[0].g === 50, "「2 个约 100g」按人均换算 = 50g/个");
ok(E.parseUnits("").length === 0 && E.parseUnits(null).length === 0, "空提示不产出单位");
ok(E.parseUnits("净含量 250mL").length === 0, "没有「约 xx g」的文案不误判");
ok(E.parseUnits("1 勺约 20g")[0].unit === "勺", "单字单位（勺）可识别");
ok(E.parseUnits("1 片约 35g")[0].g === 35, "片 = 35g");
const badUnit = [];
E.FOODS.forEach(f => E.parseUnits(f.hint).forEach(u => {
  if(!(u.g > 0) || !isFinite(u.g) || !u.unit) badUnit.push(f.id + ":" + f.hint);
}));
ok(badUnit.length === 0, "库里所有单位提示都能解析出合法克数", badUnit.slice(0, 5));
const hintCount = E.FOODS.filter(f => E.parseUnits(f.hint).length > 0).length;
ok(hintCount >= 20, "至少 20 种食材支持家常单位（实际 " + hintCount + " 种）");

/* ---------- 11. 食材搭配反查 ---------- */
section("11. 已选食材反查菜谱");
ok(E.isPantry("garlic") && E.isPantry("scallion") && E.isPantry("peanut_oil")
   && !E.isPantry("tomato"), "葱姜蒜与食用油算常备、番茄算主料");
const sel = ["tomato", "egg"].filter(id => E.FOOD_MAP[id]);
if(sel.length === 2){
  const pair = E.pairDishes(sel, 8);
  ok(pair.length > 0, "「番茄 + 鸡蛋」能反查到菜（不受葱姜蒜影响）", pair.length);
  ok(pair[0].exact === true || pair[0].used.length >= 2, "首条结果主料基本齐备");
  ok(pair.every(d => d.used.length >= 2), "每条结果至少用上 2 样已选主料");
}
ok(E.pairDishes([], 8).length === 0, "没选食材时返回空");
const nextStep = E.nextStepDishes(["tomato"], 6);
ok(nextStep.every(d => d.missFid && d.missFid !== "tomato"),
   "「再加一样」推荐的是缺的那一样，不会重复推荐已选的番茄");

/* ---------- 汇总 ---------- */
process.exit(summary("纯函数测试") ? 1 : 0);
