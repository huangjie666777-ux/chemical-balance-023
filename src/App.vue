<script setup lang="ts">
import { computed, ref } from 'vue';
import FormulaText from './components/FormulaText.vue';
import { parseSubstance, collectElementSpans, isBlankSubstance } from './lib/parser';
import { solve, type SolveStatus } from './lib/solver';
import { plainFormula } from './lib/render';

interface Row { id: number; text: string }
type Side = 'reactants' | 'products';

let nextId = 1;
const makeRows = (texts: string[]): Row[] => texts.map((text) => ({ id: nextId++, text }));

const reactants = ref<Row[]>(makeRows(['H2', 'O2']));
const products = ref<Row[]>(makeRows(['H2O']));

// 已配平时的输入快照；与当前输入不一致则旧结果立即失效
const snapshot = ref<string>('');
const solveResult = ref<SolveStatus | null>(null);
const selectedElement = ref<string | null>(null);
const copyHint = ref('');
let copyTimer: ReturnType<typeof setTimeout> | undefined;

interface ParsedRow {
  row: Row;
  index: number;
  result: ReturnType<typeof parseSubstance>;
}

function parseSide(side: Side): ParsedRow[] {
  const rows = side === 'reactants' ? reactants.value : products.value;
  return rows.map((row, index) => ({ row, index: index + 1, result: parseSubstance(row.text) }));
}
const parsedLeft = computed(() => parseSide('reactants'));
const parsedRight = computed(() => parseSide('products'));

const hasError = computed(() =>
  [...parsedLeft.value, ...parsedRight.value].some((p) => p.result.ok === false),
);

const currentKey = computed(() =>
  JSON.stringify({ l: reactants.value.map((r) => r.text), p: products.value.map((r) => r.text) }),
);
const isStale = computed(() => solveResult.value !== null && currentKey.value !== snapshot.value);

function addRow(side: Side) {
  (side === 'reactants' ? reactants : products).value.push({ id: nextId++, text: '' });
}
function removeRow(side: Side, id: number) {
  const list = (side === 'reactants' ? reactants : products).value;
  const i = list.findIndex((r) => r.id === id);
  if (i >= 0) list.splice(i, 1);
}
function move(side: Side, id: number, delta: -1 | 1) {
  const list = (side === 'reactants' ? reactants : products).value;
  const i = list.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i >= 0 && j >= 0 && j < list.length) {
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
  }
}

function doBalance() {
  selectedElement.value = null;
  if (hasError.value) return;
  const inputs = [
    ...reactants.value.filter((r) => !isBlankSubstance(r.text)).map((r) => ({ side: 'reactant' as const, text: r.text })),
    ...products.value.filter((r) => !isBlankSubstance(r.text)).map((r) => ({ side: 'product' as const, text: r.text })),
  ];
  solveResult.value = solve(
    inputs.map(({ side, text }) => {
      const r = parseSubstance(text);
      return { side, elements: r.ok ? r.elements : {}, charge: r.ok ? r.charge : 0 };
    }),
  );
  snapshot.value = currentKey.value;
}

const uniqueResult = computed(() =>
  solveResult.value?.kind === 'unique' && !isStale.value ? solveResult.value : null,
);

interface BalancedItem {
  side: 'reactant' | 'product';
  raw: string;
  coeff: number;
  parsed: ParsedRow;
}
const balancedItems = computed<BalancedItem[]>(() => {
  if (!uniqueResult.value) return [];
  const coeffs = uniqueResult.value.coefficients;
  const pick = (side: 'reactant' | 'product', rows: ParsedRow[]) =>
    rows.filter((p) => !isBlankSubstance(p.row.text)).map((p) => ({ side, raw: p.row.text, parsed: p }));
  const all = [...pick('reactant', parsedLeft.value), ...pick('product', parsedRight.value)];
  return all.map((item, i) => ({ ...item, coeff: coeffs[i] }));
});

const allElements = computed(() => {
  const set = new Set<string>();
  for (const item of balancedItems.value) {
    const r = item.parsed.result;
    if (r.ok) Object.keys(r.elements).forEach((el) => set.add(el));
  }
  return [...set].sort();
});

interface CheckRow { label: string; left: number; right: number; ok: boolean; isCharge: boolean }
const checkRows = computed<CheckRow[]>(() => {
  const rows: CheckRow[] = allElements.value.map((el) => {
    let left = 0, right = 0;
    for (const item of balancedItems.value) {
      const r = item.parsed.result;
      if (!r.ok) continue;
      const v = (r.elements[el] ?? 0) * item.coeff;
      if (item.side === 'reactant') left += v; else right += v;
    }
    return { label: el, left, right, ok: left === right, isCharge: false };
  });
  let ql = 0, qr = 0;
  let hasCharge = false;
  for (const item of balancedItems.value) {
    const r = item.parsed.result;
    if (!r.ok) continue;
    if (r.charge !== 0) hasCharge = true;
    const v = r.charge * item.coeff;
    if (item.side === 'reactant') ql += v; else qr += v;
  }
  if (hasCharge) rows.push({ label: '电荷', left: ql, right: qr, ok: ql === qr, isCharge: true });
  return rows;
});

function spansFor(item: BalancedItem) {
  if (!selectedElement.value) return [];
  const r = item.parsed.result;
  if (!r.ok) return [];
  return collectElementSpans(r.formula)
    .filter((s) => s.element === selectedElement.value)
    .map((s) => ({ start: s.start, end: s.end }));
}

function contribution(item: BalancedItem, label: string): number {
  const r = item.parsed.result;
  if (!r.ok) return 0;
  if (label === '电荷') return r.charge * item.coeff;
  return (r.elements[label] ?? 0) * item.coeff;
}

function perMolecule(item: BalancedItem, label: string): number {
  const r = item.parsed.result;
  if (!r.ok) return 0;
  if (label === '电荷') return r.charge;
  return r.elements[label] ?? 0;
}

function toggleElement(label: string) {
  selectedElement.value = selectedElement.value === label ? null : label;
}

const plainEquation = computed(() => {
  if (!uniqueResult.value) return '';
  const fmt = (side: 'reactant' | 'product') =>
    balancedItems.value
      .filter((i) => i.side === side)
      .map((i) => `${i.coeff === 1 ? '' : i.coeff}${plainFormula(i.raw)}`)
      .join(' + ');
  return `${fmt('reactant')} -> ${fmt('product')}`;
});

async function copyEquation() {
  const text = plainEquation.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  copyHint.value = '已复制纯文本方程式';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copyHint.value = ''), 2000);
}

interface Example { name: string; reactants: string[]; products: string[] }
const examples: Example[] = [
  { name: '普通反应（甲烷燃烧）', reactants: ['CH4', 'O2'], products: ['CO2', 'H2O'] },
  { name: '嵌套分组（磷灰石）', reactants: ['Ca5(PO4)3F', 'H2SO4'], products: ['H3PO4', 'CaSO4', 'HF'] },
  { name: '结晶水（胆矾脱水）', reactants: ['CuSO4.5H2O'], products: ['CuSO4', 'H2O'] },
  { name: '带电子离子反应', reactants: ['MnO4^-', 'H^+', 'e^-'], products: ['Mn^2+', 'H2O'] },
];

function loadExample(ex: Example) {
  reactants.value = makeRows(ex.reactants);
  products.value = makeRows(ex.products);
  solveResult.value = null;
  snapshot.value = '';
  selectedElement.value = null;
}

function errText(p: ParsedRow, sideName: string): string | null {
  if (p.result.ok) return null;
  return `${sideName} ${p.index}：${p.result.error.message}（第 ${p.result.error.start + 1} 个字符附近）`;
}

const allErrors = computed(() => [
  ...parsedLeft.value.map((p) => errText(p, '反应物')),
  ...parsedRight.value.map((p) => errText(p, '生成物')),
].filter((x): x is string => x !== null));

const leftBalanced = computed(() => balancedItems.value.filter((i) => i.side === 'reactant'));
const rightBalanced = computed(() => balancedItems.value.filter((i) => i.side === 'product'));
</script>

<template>
  <main class="app">
    <header>
      <h1>化学方程式配平与守恒核对工作台</h1>
      <p class="hint">
        语法：元素符号大写开头（Fe、Cl）；下标为正整数（H2O、Ca(OH)2）；支持多层圆括号，括号外下标乘整个分组；
        结晶水用点号分隔（<code>CuSO4.5H2O</code>，点号后的整数只乘该段，<code>.</code> 与 <code>·</code> 均可）；
        电荷写在物质末尾（<code>^2+</code>、<code>^-</code>）；电子写作 <code>e^-</code>。
      </p>
    </header>

    <section class="examples" aria-label="示例">
      <span class="examples-label">载入示例：</span>
      <button v-for="ex in examples" :key="ex.name" type="button" class="btn-link" @click="loadExample(ex)">
        {{ ex.name }}
      </button>
    </section>

    <section class="columns">
      <div class="column">
        <h2>反应物（左侧）</h2>
        <div v-for="(p, idx) in parsedLeft" :key="p.row.id" class="row" :class="{ invalid: !p.result.ok }">
          <div class="row-line">
            <label class="row-label" :for="`l-${p.row.id}`">R{{ idx + 1 }}</label>
            <input
              :id="`l-${p.row.id}`"
              v-model="p.row.text"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="如 H2SO4、Ca(OH)2、CuSO4.5H2O"
              :aria-invalid="!p.result.ok"
              @keydown.ctrl.enter="doBalance"
              @keydown.meta.enter="doBalance"
            />
            <div class="row-ops">
              <button type="button" @click="move('reactants', p.row.id, -1)" :disabled="idx === 0" aria-label="上移">↑</button>
              <button type="button" @click="move('reactants', p.row.id, 1)" :disabled="idx === parsedLeft.length - 1" aria-label="下移">↓</button>
              <button type="button" class="danger" @click="removeRow('reactants', p.row.id)">删除</button>
            </div>
          </div>
          <p v-if="!p.result.ok" class="err" role="alert">
            {{ errText(p, '反应物') }}
          </p>
        </div>
        <button type="button" class="btn-add" @click="addRow('reactants')">+ 添加反应物</button>
      </div>

      <div class="column">
        <h2>生成物（右侧）</h2>
        <div v-for="(p, idx) in parsedRight" :key="p.row.id" class="row" :class="{ invalid: !p.result.ok }">
          <div class="row-line">
            <label class="row-label" :for="`r-${p.row.id}`">P{{ idx + 1 }}</label>
            <input
              :id="`r-${p.row.id}`"
              v-model="p.row.text"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="如 H2O、e^-"
              :aria-invalid="!p.result.ok"
              @keydown.ctrl.enter="doBalance"
              @keydown.meta.enter="doBalance"
            />
            <div class="row-ops">
              <button type="button" @click="move('products', p.row.id, -1)" :disabled="idx === 0" aria-label="上移">↑</button>
              <button type="button" @click="move('products', p.row.id, 1)" :disabled="idx === parsedRight.length - 1" aria-label="下移">↓</button>
              <button type="button" class="danger" @click="removeRow('products', p.row.id)">删除</button>
            </div>
          </div>
          <p v-if="!p.result.ok" class="err" role="alert">
            {{ errText(p, '生成物') }}
          </p>
        </div>
        <button type="button" class="btn-add" @click="addRow('products')">+ 添加生成物</button>
      </div>
    </section>

    <section class="actions">
      <button type="button" class="btn-primary" :disabled="hasError" @click="doBalance">
        配平（或按 Ctrl/⌘ + Enter）
      </button>
      <p v-if="hasError" class="err summary" role="alert">
        存在解析错误，请先修正后再配平：{{ allErrors[0] }}
      </p>
      <p v-if="isStale" class="stale" role="status">
        ⚠ 输入自上次配平后已修改，下方旧结果已失效；修改完成后请重新点击“配平”。
      </p>
    </section>

    <section v-if="solveResult && !isStale" class="result" aria-live="polite">
      <template v-if="uniqueResult">
        <h2>配平结果</h2>
        <div class="equation">
          <span class="side">
            <template v-for="(item, i) in leftBalanced" :key="item.raw + i">
              <span class="term">
                <strong v-if="item.coeff !== 1" class="coeff">{{ item.coeff }}</strong>
                <FormulaText
                  :raw="item.raw"
                  :formula="item.parsed.result.ok ? item.parsed.result.formula : { segments: [], charge: 0, chargeStart: -1, chargeEnd: -1, isElectron: false }"
                  :highlight-spans="spansFor(item)"
                />
              </span>
              <span v-if="i < leftBalanced.length - 1" class="plus">+</span>
            </template>
          </span>
          <span class="arrow">→</span>
          <span class="side">
            <template v-for="(item, i) in rightBalanced" :key="item.raw + i">
              <span class="term">
                <strong v-if="item.coeff !== 1" class="coeff">{{ item.coeff }}</strong>
                <FormulaText
                  :raw="item.raw"
                  :formula="item.parsed.result.ok ? item.parsed.result.formula : { segments: [], charge: 0, chargeStart: -1, chargeEnd: -1, isElectron: false }"
                  :highlight-spans="spansFor(item)"
                />
              </span>
              <span v-if="i < rightBalanced.length - 1" class="plus">+</span>
            </template>
          </span>
        </div>
        <div class="copy-row">
          <button type="button" class="btn-link" @click="copyEquation">复制纯文本方程式</button>
          <span v-if="copyHint" class="copy-hint">{{ copyHint }}</span>
        </div>

        <h2>守恒核对表</h2>
        <p class="hint">点击某一行的元素可在方程式中高亮该元素，并查看各物质的逐份原子数与系数贡献；再次点击取消。</p>
        <table class="check-table">
          <thead>
            <tr>
              <th>守恒量</th>
              <th v-for="item in balancedItems" :key="item.raw + item.side">
                {{ item.side === 'reactant' ? 'R' : 'P' }}<br />
                <FormulaText
                  :raw="item.raw"
                  :formula="item.parsed.result.ok ? item.parsed.result.formula : { segments: [], charge: 0, chargeStart: -1, chargeEnd: -1, isElectron: false }"
                  :highlight-spans="selectedElement ? spansFor(item) : []"
                />
                <br /><span class="coeff-note">系数 {{ item.coeff }}</span>
              </th>
              <th>左合计</th>
              <th>右合计</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in checkRows"
              :key="row.label"
              :class="{ selected: selectedElement === row.label }"
            >
              <td>
                <button type="button" class="el-btn" @click="toggleElement(row.label)">{{ row.label }}</button>
              </td>
              <td
                v-for="item in balancedItems"
                :key="item.raw + item.side"
                :class="{ contrib: selectedElement === row.label && contribution(item, row.label) !== 0 }"
              >
                <template v-if="selectedElement === row.label">
                  <span class="per">{{ perMolecule(item, row.label) }}</span>
                  <span class="times">×{{ item.coeff }}</span>
                  <span class="eq">＝</span>
                </template>
                <strong>{{ contribution(item, row.label) }}</strong>
              </td>
              <td class="total">{{ row.left }}</td>
              <td class="total">{{ row.right }}</td>
              <td :class="row.ok ? 'ok' : 'bad'" class="verdict">{{ row.ok ? '✓ 守恒' : '✗ 不等' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="selectedElement" class="hint highlight-note">
          已高亮元素 <strong>{{ selectedElement }}</strong>：表格中“逐份×系数＝贡献”展示每个分子中该元素的数量（含嵌套括号与结晶水段乘数）乘以配平系数。
        </p>
      </template>

      <template v-else-if="solveResult.kind === 'inconsistent'">
        <h2>无法配平</h2>
        <p class="bad-msg">无解：{{ solveResult.reason }}。</p>
      </template>
      <template v-else-if="solveResult.kind === 'nonpositive'">
        <h2>无法配平</h2>
        <p class="bad-msg">无正整数解：{{ solveResult.reason }}。</p>
        <p class="hint">求解得到的最简系数向量为：{{ solveResult.coefficients.join(', ') }}（必须全部为正才能作为配平系数）。</p>
      </template>
      <template v-else-if="solveResult.kind === 'undertermined'">
        <h2>配平不唯一</h2>
        <p class="bad-msg">解空间不止一维：{{ solveResult.reason }}。</p>
        <p class="hint">请检查是否遗漏了参与反应的物质，或反应本身可由多个独立反应线性组合而成。</p>
      </template>
    </section>
  </main>
</template>

<style>
:root {
  --bg: #f6f8fb; --panel: #ffffff; --border: #d4dbe6; --text: #1f2937;
  --muted: #6b7280; --primary: #2563eb; --danger: #dc2626; --ok: #15803d;
  --highlight: #fde68a; --lit: #f59e0b;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.app { max-width: 1080px; margin: 0 auto; padding: 24px 20px 60px; }
h1 { font-size: 1.4rem; margin: 0 0 8px; }
h2 { font-size: 1.05rem; margin: 20px 0 10px; }
.hint { color: var(--muted); font-size: 0.86rem; line-height: 1.6; }
.hint code { background: #eef2f7; padding: 1px 5px; border-radius: 4px; font-size: 0.84rem; }
.examples { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 14px 0; }
.examples-label { color: var(--muted); font-size: 0.88rem; }
.btn-link {
  background: var(--panel); border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 12px; font-size: 0.82rem; cursor: pointer; color: var(--primary);
}
.btn-link:hover { background: #eff6ff; }
.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) { .columns { grid-template-columns: 1fr; } }
.column { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
.row { margin-bottom: 8px; }
.row.invalid input { border-color: var(--danger); background: #fef2f2; }
.row-line { display: flex; gap: 6px; align-items: center; }
.row-label { flex: 0 0 auto; font-size: 0.75rem; color: var(--muted); width: 26px; text-align: right; }
.row-line input {
  flex: 1 1 auto; min-width: 0; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 6px; font-size: 0.95rem;
  font-family: 'STIX Two Math', 'Cambria Math', Georgia, serif;
}
.row-line input:focus { outline: 2px solid #93c5fd; border-color: var(--primary); }
.row-ops { display: flex; gap: 4px; flex: 0 0 auto; }
.row-ops button {
  border: 1px solid var(--border); background: #f9fafb; border-radius: 5px;
  padding: 4px 8px; cursor: pointer; font-size: 0.8rem;
}
.row-ops button:disabled { opacity: 0.4; cursor: default; }
.row-ops .danger { color: var(--danger); }
.err { color: var(--danger); font-size: 0.8rem; margin: 4px 0 0 32px; }
.err.summary { margin: 10px 0 0; }
.btn-add {
  width: 100%; margin-top: 6px; border: 1px dashed var(--border); background: none;
  border-radius: 6px; padding: 8px; color: var(--primary); cursor: pointer;
}
.btn-add:hover { background: #eff6ff; }
.actions { margin: 18px 0; }
.btn-primary {
  background: var(--primary); color: #fff; border: none; border-radius: 8px;
  padding: 10px 22px; font-size: 0.95rem; cursor: pointer;
}
.btn-primary:disabled { background: #9ca3af; cursor: not-allowed; }
.stale {
  background: #fffbeb; border: 1px solid #fcd34d; color: #92400e;
  border-radius: 8px; padding: 8px 12px; font-size: 0.86rem;
}
.result { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
.equation {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 1.35rem;
  font-family: 'STIX Two Math', 'Cambria Math', Georgia, serif; padding: 12px 4px;
}
.equation .side { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.term { display: inline-flex; align-items: baseline; gap: 4px; }
.coeff { color: var(--primary); margin-right: 2px; }
.plus { color: var(--muted); }
.arrow { font-size: 1.5rem; color: var(--primary); }
.formula .tok.sub { font-size: 0.72em; vertical-align: sub; }
.formula .tok.segMult { font-weight: 600; color: #0f766e; }
.formula .tok.charge { font-size: 0.78em; vertical-align: super; }
.formula .tok.dot { margin: 0 2px; color: var(--muted); }
.formula .lit { background: var(--highlight); border-radius: 3px; box-shadow: 0 0 0 2px var(--lit); }
.copy-row { display: flex; align-items: center; gap: 10px; }
.copy-hint { color: var(--ok); font-size: 0.82rem; }
.check-table { border-collapse: collapse; width: 100%; font-size: 0.85rem; margin-top: 6px; }
.check-table th, .check-table td { border: 1px solid var(--border); padding: 6px 8px; text-align: center; }
.check-table th {
  background: #f1f5f9; font-weight: 600;
  font-family: 'STIX Two Math', 'Cambria Math', Georgia, serif;
}
.check-table td.contrib { background: #fffbeb; }
.check-table tr.selected { background: #fef9c3; }
.el-btn {
  border: none; background: none; color: var(--primary); font-weight: 700;
  cursor: pointer; font-size: 0.9rem;
  font-family: 'STIX Two Math', 'Cambria Math', Georgia, serif;
}
.el-btn:hover { text-decoration: underline; }
.per { color: var(--muted); }
.times { color: var(--muted); margin: 0 2px; }
.eq { color: var(--muted); margin-right: 4px; }
.total { font-weight: 700; }
.ok { color: var(--ok); font-weight: 700; }
.bad, .bad-msg { color: var(--danger); font-weight: 700; }
.coeff-note { font-size: 0.72rem; color: var(--muted); font-family: inherit; font-weight: 400; }
.highlight-note { margin-top: 8px; }
</style>
