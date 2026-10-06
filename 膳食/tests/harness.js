/* ==========================================================================
   膳食管理网站 · 测试公共部分
   —— 断言器 + 最小 DOM stub + 脚本抽取
   改完 index.html 后跑：node tests/run.js
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(APP, "utf8");
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* ---------- 断言器 ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra){
  if(cond){ pass++; console.log("  PASS  " + label); }
  else {
    fail++; failures.push(label);
    console.log("  FAIL  " + label + (extra !== undefined ? "  -> " + JSON.stringify(extra) : ""));
  }
}
function section(title){ console.log("\n--- " + title + " ---"); }
function summary(name){
  console.log("\n================ " + name + " ================");
  console.log("通过 " + pass + " / " + (pass + fail)
    + (fail ? "  ！！失败 " + fail + " 项" : "  全部通过"));
  if(fail) console.log("失败清单：\n  - " + failures.join("\n  - "));
  return fail;
}

/* ---------- 抽出「数据段 + 纯函数段」 ---------- */
const dataStart = code.indexOf("const FOODS_RAW");
const pStart = code.indexOf("/*@@PURE_START@@*/");
const pEnd   = code.indexOf("/*@@PURE_END@@*/");
const pureCode = code.slice(dataStart, pStart) + code.slice(pStart, pEnd);

/* 在纯函数段沙箱里取符号 */
function pureEnv(names){
  return new Function(pureCode + "\nreturn {" + names.join(",") + "};")();
}

/* ---------- 最小 DOM stub ---------- */
function mkEl(tag){
  const el = {
    tagName: tag || "div", innerHTML:"", textContent:"", value:"",
    dataset:{}, style:{}, children:[], parentElement:null,
    _cls:new Set(), _attrs:{},
    classList:{
      add(){}, remove(){}, contains(){ return false; },
      toggle(c, f){ if(f === undefined){ el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); }
                    else if(f){ el._cls.add(c); } else { el._cls.delete(c); } }
    },
    setAttribute(k, v){ el._attrs[k] = v; },
    getAttribute(k){ return el._attrs[k]; },
    addEventListener(){}, focus(){},
    closest(sel){ let p = el; while(p){ if(p._match(sel)) return p; p = p.parentElement; } return null; },
    querySelector(sel){ return el._find(sel, true) || mkEl(); },
    querySelectorAll(sel){ return el._findAll(sel); },
    _find(sel, first){ const r = el._findAll(sel); return r.length ? (first ? r[0] : r) : null; },
    _findAll(sel){
      const out = [];
      (function walk(n){ (n.children || []).forEach(c => { if(c._match(sel)) out.push(c); walk(c); }); })(el);
      return out;
    },
    _match(sel){
      if(sel.charAt(0) === ".") return el._cls.has(sel.slice(1));
      if(sel.charAt(0) === "["){
        const inner = sel.slice(1, -1);
        const eq = inner.indexOf("=");
        if(eq < 0) return el._attrs[inner] !== undefined || el.dataset[inner] !== undefined;
        let k = inner.slice(0, eq).trim();
        const v = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if(k.indexOf("data-") === 0) k = k.slice(5);
        return String(el.dataset[k]) === v;
      }
      return false;
    }
  };
  return el;
}
function append(parent, child){ child.parentElement = parent; parent.children.push(child); return child; }

/* 需要「子容器 innerHTML 变更后，父级快照跟着变」的嵌套关系。
   真实浏览器里 #reco-dish-list 是 #view-reco 的子节点，局部刷新时父级 DOM 会同步；
   stub 里父级只有一段字符串快照，所以这里手动把子容器内容镜像回父级字符串。 */
const MIRROR = { "reco-dish-list": "view-reco" };

/* 在 parent 的 innerHTML 字符串里，用 childHtml 替换 <div id="childId">…</div> 的内容 */
function mirrorInto(parentEl, childId, childHtml){
  const open = '<div id="' + childId + '">';
  const h = String(parentEl.innerHTML || "");
  const i = h.indexOf(open);
  if(i < 0) return;
  const body = i + open.length;
  let depth = 1, j = body, end = -1;
  while(j < h.length){
    const nd = h.indexOf("<div", j);
    const nc = h.indexOf("</div>", j);
    if(nc < 0) return;
    if(nd >= 0 && nd < nc){ depth++; j = nd + 4; }
    else { depth--; if(depth === 0){ end = nc; break; } j = nc + 6; }
  }
  if(end < 0) return;
  parentEl.innerHTML = h.slice(0, body) + childHtml + h.slice(end);
}

/* 搭一个隔离的 DOM 环境并把整段脚本跑起来。
   传入已有的 store 可模拟「刷新后重新加载」。 */
function boot(storeIn){
  const elById = {};
  function makeMirrored(id){
    const e = mkEl("div");
    const parentId = MIRROR[id];
    let buf = "";
    Object.defineProperty(e, "innerHTML", {
      get(){ return buf; },
      set(v){ buf = String(v); const p = elById[parentId]; if(p) mirrorInto(p, id, buf); }
    });
    return e;
  }
  const getById = id => (elById[id] || (elById[id] = MIRROR[id] ? makeMirrored(id) : mkEl("div")));

  const tabsEl = getById("tabs");
  tabsEl.querySelectorAll = () => [];
  getById("modal")._cls.add("hidden");

  const store = storeIn || {};
  const document = {
    getElementById: getById,
    querySelector: () => mkEl("div"),
    querySelectorAll: () => [],
    addEventListener(){},
    createElement: t => mkEl(t)
  };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  Object.defineProperty(localStorage, "length", { get: () => Object.keys(store).length });
  localStorage.key = i => Object.keys(store)[i];

  const toastMsgs = [];
  const sandboxWindow = {};                       /* 没有 matchMedia，测 auto 主题回退 */

  const runner = new Function("document", "localStorage", "window", "setTimeout", "toastMsgs",
    code + "\nreturn {" + EXPORTS.join(",") + "};");
  const A = runner(document, localStorage, sandboxWindow, () => 0, toastMsgs);

  A.__doc = document;
  A.__store = store;
  A.__getById = getById;
  A.__toasts = toastMsgs;
  A.__mkEl = mkEl;
  A.__append = append;
  return A;
}

/* 需要从完整脚本里取出的符号 */
const EXPORTS = [
  /* 入口与视图 */
  "init", "render", "switchTab", "onAction", "state",
  "renderToday", "renderReco", "renderDiy", "renderTrend", "renderMe",
  /* 数据与常量 */
  "FOODS", "FOOD_MAP", "RECIPES", "CATS", "MEALS", "MEAL_NAME", "ACTIVITY", "GOALS",
  "DRI", "GOAL_KCAL", "NUTRI_META", "MACRO_KEYS", "DISH_SORT_KEYS",
  /* 存储 */
  "LS", "K", "loadLogs", "saveLogs", "saveProfile", "saveWeights", "saveTemplates",
  "saveCustomRecipes", "saveTheme",
  /* 目标 */
  "calcTarget", "currentTarget", "currentGap", "defaultProfile",
  /* 菜品页 */
  "recoContext", "recoDishListHTML", "refreshRecoDishList", "dishSortBarHTML",
  "sortPlans", "sortValueOf", "defaultDishSort", "dishSortLabel", "dishSortDef",
  "openPlanModal", "planPreviewUpdate", "planToEntry",
  /* 弹窗 */
  "openRecordModal", "openRecipeModal", "openCustomModal", "closeModal",
  "recModalList", "openCopyModal", "copyEntriesTo",
  "openRecipeCustomModal", "renderRecipeCustomModal", "rcpIngListHTML",
  /* 自由搭配 */
  "foodRowHTML", "basketRowHTML", "refreshDiyFoodList", "registerCustomFoods",
  /* 第 8 轮功能 */
  "parseUnits", "unitSelectHTML", "weightCardHTML", "weightSparkHTML",
  "weightSeries", "weightLastBefore", "tmplCardHTML", "calendarHTML",
  "calMonthKey", "calShiftMonth", "calLevel", "allLogDates",
  "buildBackup", "downloadBackup", "sanitizeLogEntry", "applyBackup",
  "registerCustomRecipes", "applyTheme", "uid", "sumLogs", "gapOf"
];

module.exports = { APP, html, code, pureCode, pureEnv, mkEl, append, boot, ok, section, summary };
