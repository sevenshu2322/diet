# 膳食管理网站 · 项目长期笔记

## 产物与工具链
- `E:\workboddy\膳食\index.html`：单文件 HTML（约 4300+ 行），零依赖零外链，数据存 localStorage。
- **测试脚本常驻 `E:\workboddy\膳食\tests\`**（原先放 `%TEMP%` 被系统清理删过，别再放临时目录）：
  `harness.js`（断言器 + 最小 DOM stub + 抽取脚本体）、
  `pure-test.js`（纯函数，切「FOODS_RAW 起始 → PURE_END」段执行，167 项）、
  `dom-test.js`（最小 DOM stub 冒烟，真实执行整段 script 含 init，219 项）、
  `run.js`（一键跑完两套，任一失败退出码非 0）。两套都必须全绿。
- 命令：`node tests/run.js`；Node 用受管版本
  `C:\Users\sevenshu\.workbuddy\binaries\node\versions\22.22.2-2\node.exe`。
- 改完先 `node --check` 抽取出的 script，再跑两套测试。

## 当前状态（2026-10-05）
- 跟踪 6 项营养素：kcal / 蛋白 / 脂肪 / 碳水 / 膳食纤维 / 水分。
- 每日目标：Mifflin-St Jeor BMR × 活动系数 × 目标系数（减脂 0.80 / 维持 1.00 / 增肌 1.10）；
  脂肪取 25%；碳水补位（三者供能比由构造保证落在国标区间）；纤维 AI 25 g。
- **蛋白质是动态的，按「每周运动频率」分五档**（2026-10-04 修正，原先不看活动量）：
  国标 RNI 男 65 / 女 55 g 只是「久坐底线」（≈1.0 g/kg），规律运动后需求明显更高。
  `DRI.proteinPerKgByAct`（与 ACTIVITY 同序）：久坐 0.9~1.1／轻度 1.0~1.3／中度 1.2~1.6／
  **高度 1.6~2.0／极高 1.8~2.2**（ISSN、ACSM/AND/DC、IOC 三大共识给运动人群的推荐是 1.2~2.2 g/kg）。
  `DRI.proteinPickAtGoal` 决定在区间内取位：cut 0.85（保肌肉）／maintain 0.55／bulk 0.90。
  `DRI.proteinAMDRHiByAct = [.20,.20,.22,.25,.28]` —— 供能比上限按活动量放宽，
  否则高训练量 + 减脂（热量压低）会被国标 20% 硬夹到远低于 1.6 g/kg。
  `actIndex(pal)` 取最近邻档，兼容非标准活动量值。
- **肥胖者蛋白质用「调整体重」**：BMI ≥ 28 时 `proteinRefWeight()` 返回
  理想体重(BMI 23 反推) + 0.4×(实际−理想)，否则 120kg/165cm + 极高 + 增肌 会算出 242g（28% 供能比）。
- 脂肪：取 25%，但**双向给碳水让路**——碳水下破 50% 时把脂肪压到 20% 以上腾位，
  超过 65% 时把脂肪抬到 30% 以下压回来（原来只能抬不能压，蛋白放宽后会撞破碳水下限）。
- **水分目标是动态的**：国标总水 AI（男 3000 / 女 2700 mL）× 体型系数
  （clamp(BMR/参考体型BMR, 0.80, 1.30)）+ 活动补水（clamp(TDEE − BMR×1.5, −400, +1000) mL）；
  食物水按「整日计划 kcal × 0.5」估（不能用已摄入热量，空数据会算出荒谬值）；
  建议饮水 = 总水 − 食物水。
- 菜谱库 282 道，用到 199 / 252 种食材；食材库 252 种 + 并行数据块 `FOOD_WF`（水分/纤维，须放 PURE_START 之前）。
- 推荐引擎：α 加权最小二乘缩放 + 评分；推荐档位 α∈[0.5,2.5]，空结果放宽到 [0.4,3.0]。
- 菜品页（原「推荐菜品」）：搜索栏支持菜名/食材/分类/标签，**绕过 α 档位**（buildPlan 兜底），
  份量仍按缺口缩放；「加入今日」走弹窗——填克数其他营养等比换算，右上角「按照推荐添加」一键按推荐份量加。
- 自由搭配：已选食材反查菜谱（`PANTRY_IDS` 剔除葱姜蒜/食用油/调味其他，否则番茄+鸡蛋匹配不到番茄炒蛋）
  ＋「再加一样就能做」一键补齐；`diy-dish` 只补缺的食材、已选的保留用户克数。
- 所有删除操作二次确认：UI 挂 `ask-xxx` 弹窗 → `confirm-yes` 把原动作按原参数派发回去（删除逻辑只写一处）。

## 第 8 轮新增的 8 个功能（2026-10-03，全部完成）
存储键：`diet:weight` / `diet:tmpl` / `diet:recipes:custom` / `diet:theme`（都在 `K` 里）。
1. **备份**：`buildBackup()`（app:"diet" + exportVersion + logs/profile/customFoods/customRecipes/weights/templates）；
   `downloadBackup()` 用 Blob，失败降级成「手动复制」弹窗；`import-pick` → FileReader → `askConfirm` → `applyBackup(obj, merge|replace)`。
   导入前 `sanitizeLogEntry` 清洗；**覆盖模式下备份里缺的项（体重/套餐/菜谱）要真的清空**，不能留旧数据。
2. **家常单位**：`parseUnits(hint)` 正则 `/(\d+(?:\.\d+)?)\s*([^\s\d约]+)\s*约\s*(\d+(?:\.\d+)?)\s*g/g`
   从「1 个约 50g」取每单位克数（放 PURE 区内，纯函数可单测）。记录弹窗用 `unitSelectHTML`（select 的 value = 克/单位，克为 1），
   `rec-add` 里 `g = 数量 × 单位克数`；自由搭配的食材行给最多 2 个「+1个/碗」快捷键。库里 33 种食材有单位提示。
3. **复制**：`openCopyModal()` 列最近 8 个有记录的日期，按餐次 / 整天复制；`copyEntriesTo` 克隆时换新 id + 新 ts。
4. **体重**：`state.weights[date]`，`weightSeries/weightLastBefore/weightSparkHTML/weightCardHTML`；
   记录时同步 `profile.weight`（目标随之更新）；今日页有卡片，趋势页有曲线；删除有二次确认。
5. **常用套餐**：`state.templates = [{id,name,items:[{fid,g}]}]`，自由搭配下方卡片，套用=累加到篮子。
6. **自定义菜谱**：`state._rcpDraft` 草稿 → `rcp-save` → `registerCustomRecipes()` 打 `custom:true` 推入 `RECIPES`
   （先清旧 `.custom` 再推，否则重复注册会翻倍）；搜索 / 推荐 / 反查天然可用。
7. **趋势 30 天 + 日历**：`state.trendDays`（7/30），`sparkHTML(..., dense)` 30 天时只留每 5 天刻度 + 隐藏柱顶数值；
   `calendarHTML()` 按月渲染（周一开头，`calShiftMonth` 跨年，`calLevel` 按 kcal/目标分 5 档），格子 `day-goto` 可跳转。
8. **深色模式**：`data-theme` 属性 + CSS 变量覆盖；顶栏 `<select id="theme-sel">`（change 事件），
   `applyTheme()` 里回写 select 值；**浅色下硬编码 `#fff` 的控件（.btn.ghost/.seg button/.chip/.topbar）必须逐个在 dark 块里覆盖**。

## 第 9 轮：菜品页排序控件（2026-10-05）
- 位置：`recoDishListHTML()` 顶部用 `.sec-h`（flex + space-between）把 `sec-t` 标题和排序按钮排一行两侧；
  **推荐列表和搜索结果两个分支都渲染同一控件**（同一函数 `dishSortBarHTML(titleText)`）。
- 选项 `DISH_SORT_KEYS = [字段, 显示名, 默认方向]`：
  kcal 热量 / p 蛋白质 / f 脂肪 / c 碳水 / fiber 膳食纤维 / water 水分，
  **六个字段的默认方向统一为 "desc"（由高到低）**——用户明确要求「从高到低排序」；
  点同一项可翻转为升序。菜单副标题会写「默认由高到低」，未选中时也能发现默认档。
- 纯函数（在 PURE 段内，可单测）：`sortValueOf(plan,key)` / `dishSortDef` / `defaultDishSort` /
  `sortPlans(list,sort)` / `dishSortLabel(sort)`。排序读 `plan.R`（缺口缩放后的份量），
  同值按 `score` 再按菜名兜底（稳定排序，不会每次刷新乱跳）。
- 状态：`state.dishSort={key,dir}|null` + `state.dishSortOpen`，**都不持久化**（UI 瞬时态）。
- 交互：`dish-sort-toggle` 开合；点同一字段反转方向、换字段用该字段默认方向；`dish-sort-pick` 选完自动收起；
  全局 click 里点 `.dish-sort` 外部收起；`keydown` 的 Esc **先收下拉再关弹窗**；`switchTab` 里强制 `dishSortOpen=false`。
- 反馈：按钮文案「排序：字段 ↑/↓」+ caret 旋转 180°（`.dish-sort.open > .btn .caret`）；
  标题变「推荐方案 · 按 X 由低到高排序」；菜单当前项 `.on` 高亮 + 显示「↑ 由低到高 / ↓ 由高到低」；
  `dish-sort-clear`（菜单底部「匹配度（默认）」）恢复匹配度并 toast。
- 菜单全部用 CSS 变量（--card/--line/--text2/--brand-l），深色模式零额外覆盖。

## 关键坑（勿重蹈）
- **DOM stub 不模拟嵌套节点**：真实浏览器里 `#reco-dish-list` 是 `#view-reco` 的子元素，局部刷新父级 DOM 会同步；
  但 stub 里父级只是一段字符串快照，子容器 `innerHTML=` 不会回写。
  → `harness.js` 里为此加了 `MIRROR = {"reco-dish-list":"view-reco"}` + `mirrorInto()`（按 div 深度配对替换）。
  **以后再加「局部刷新型」容器，记得往 MIRROR 里登记**，否则针对父级 `text("view-xxx")` 的断言会读到旧快照。
- 测「模拟刷新」要 `boot(同一个 store)`；`boot()` 默认新建空 store，等于清库，断言必然 0≠N。
- 测试里删掉唯一一条记录后，别再对 `logs[logs.length-1].id` 取值 —— 列表已空；取消删除分支前先补录一条。
- 断言「记录条目字段完整」时注意：导入测试塞的样例条目可能缺 kcal，或当天记录被清空后走 else 跳过分支。
- `applyBackup` 覆盖模式原来漏清旧记录（`if(!arr.length) return;` 导致备份里没有的日期残留），
  已修成 replace 前先删掉所有 `diet:log:*` 键。改备份逻辑时连同「清空」一起验证。
- 批量数据补录必须脚本+断言；**往已有 JS 数组字面量追加行，先确认最后一条有无尾逗号**
  （缺了会被解析成属性访问，产生非数组元素）。拼接后必须真实 `new Function` 解析产物并检查条目。
- 测试：变量名勿与既有 const 撞名（如 tiny/huge）；DOM stub 复用容器要手动清 children；
  断言围绕目标元素切片，别断言全局数量或固定字符偏移（数据一变就脆断）；
  DOM stub 的 `document.querySelector` 是空桩，需要读输入框时要临时替换。
- 派生「建议值」要用计划口径当分母（用已摄入量会在空数据时给出荒谬值）。
- 搜索/列表的默认 limit 要给够（282 道 vs 默认 200 会静默截断结果）。
- 改交互流程（如删除加确认）后，旧测试里直连旧动作的调用要同步改成两步。
- DOM stub 里 `localStorage` 只有 get/setItem，**用了 `localStorage.length` / `key(i)` 的扫描函数在测试里要补上**
  （用 `Object.defineProperty` 挂 length getter）；`window` / `document.documentElement` 默认不存在，
  测主题前要手动挂一个带 setAttribute 的假对象。
- 统计「图表柱子数」这类断言会被同页其它图表污染（体重曲线也用 `tb-col`），测之前先清掉无关数据。
- 想让纯函数测试覆盖新函数，要把它写进 `/*@@PURE_START@@*/ ~ /*@@PURE_END@@*/` 区间并加进 runner 的 return 列表。
- **测试脚本里 `lean` / `tiny` / `huge` 这类短名很容易跟前面的 const 撞**（`SyntaxError: already been declared`），
  新加断言时用带前缀的具名变量（如 `leanBody` / `midCut`）。
- 改目标计算引擎后，必然会有旧断言按原模型写死数值；要**先把旧断言改成新模型的表达式**，
  再补新断言，别直接删。
- `Edit` 工具对长而含大量全角标点/换行的 old_string 偶尔匹配不上（可能行尾差异），
  改用 Python 脚本按「起止锚点切片」替换最稳，替换后务必再跑一遍测试。

## 用户偏好
- 中文沟通；要结构化、简洁的输出；倾向直接执行而非反复确认；方案要讲清「为什么」。
