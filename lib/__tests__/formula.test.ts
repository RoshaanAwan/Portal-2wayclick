// Run: npx tsx lib/__tests__/formula.test.ts
// A lightweight assertion harness (no framework) for the salary formula engine.
// Money is integer cents; columns are component labels.

import {
  isFormula,
  tokenize,
  parse,
  evaluate,
  recalcRow,
  recalcGrid,
  a1ToLabels,
  labelsToA1,
  a1ToGrid,
  gridToA1,
  rewriteFormulaRefs,
  colToLetter,
  letterToCol,
  type RowCell,
  type CellResult,
  type GridCell,
} from "../formula";

let passed = 0;
let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}

// Evaluate a DISPLAY formula (A1 letters) against a same-row cents map by column.
// Catches parse/tokenize failures and surfaces them as an error result, matching
// how recalcRow handles a bad formula cell.
function evalA1(src: string, colsCents: (number | null)[]): CellResult {
  let ast;
  try {
    ast = parse(tokenize(src));
  } catch {
    return { ok: false, error: "#VALUE!" };
  }
  return evaluate(ast, (col) =>
    col >= 0 && col < colsCents.length ? colsCents[col] : null,
  );
}

// Columns: A=Dev(800), B=BD(200), C=Lead(300)
const ROW = [800, 200, 300];

// ── isFormula ──
eq("isFormula =", isFormula("=A1+B1"), true);
eq("isFormula plain", isFormula("500"), false);
eq("isFormula trim", isFormula("  =1"), true);

// ── column letters ──
eq("colToLetter 0", colToLetter(0), "A");
eq("colToLetter 25", colToLetter(25), "Z");
eq("colToLetter 26", colToLetter(26), "AA");
eq("letterToCol A", letterToCol("A"), 0);
eq("letterToCol AA", letterToCol("AA"), 26);

// ── basic arithmetic (cents) ──
eq("ref add", evalA1("=A1+B1", ROW), { ok: true, cents: 1000 });
eq("ref sub", evalA1("=A1-B1", ROW), { ok: true, cents: 600 });
eq("literal alone $500", evalA1("=500", ROW), { ok: true, cents: 50000 });
eq("money + literal", evalA1("=A1+100", ROW), { ok: true, cents: 10800 }); // $8 + $100
eq("scale 1.1 (10% raise)", evalA1("=A1*1.1", ROW), { ok: true, cents: 880 });
eq("double", evalA1("=A1*2", ROW), { ok: true, cents: 1600 });
eq("half", evalA1("=A1/2", ROW), { ok: true, cents: 400 });
eq("percent of cell", evalA1("=A1*10%", ROW), { ok: true, cents: 80 });
eq("parens", evalA1("=(A1+B1)*2", ROW), { ok: true, cents: 2000 });
eq("unary neg", evalA1("=-A1+B1", ROW), { ok: true, cents: -600 });
eq("literal scalars", evalA1("=500*2", ROW), { ok: true, cents: 100000 }); // $500*2

// ── functions ──
eq("SUM range", evalA1("=SUM(A1:C1)", ROW), { ok: true, cents: 1300 });
eq("SUM args", evalA1("=SUM(A1,B1,C1)", ROW), { ok: true, cents: 1300 });
eq("AVERAGE", evalA1("=AVERAGE(A1:C1)", ROW), {
  ok: true,
  cents: Math.round((800 + 200 + 300) / 3),
}); // 433
eq("MIN", evalA1("=MIN(A1:C1)", ROW), { ok: true, cents: 200 });
eq("MAX", evalA1("=MAX(A1:C1)", ROW), { ok: true, cents: 800 });
eq("ABS", evalA1("=ABS(B1-A1)", ROW), { ok: true, cents: 600 });
eq("ROUND to dollars", evalA1("=ROUND(A1,0)", [12345]), {
  ok: true,
  cents: 12300,
}); // $123.45 → $123.00

// ── no float drift (round once) ──
eq("=A1/3*3 stays exact", evalA1("=A1/3*3", [1000]), {
  ok: true,
  cents: 1000,
});
eq("0.1+0.2 → 30c", evalA1("=0.1+0.2", ROW), { ok: true, cents: 30 });
eq("seven 10/3 sum", evalA1("=SUM(A1:G1)", [333, 333, 333, 334, 333, 333, 334]), {
  ok: true,
  cents: 2333,
});

// ── error codes ──
eq("div by zero", evalA1("=A1/0", ROW), { ok: false, error: "#DIV/0!" });
eq("missing ref", evalA1("=Z1", ROW), { ok: false, error: "#REF!" });
eq("money×money", evalA1("=A1*B1", ROW), { ok: false, error: "#VALUE!" });
eq("garbage", evalA1("=A1@@", ROW), { ok: false, error: "#VALUE!" });

// ── A1 ⇄ label translation ──
const COLS = ["Dev", "BD", "Lead"];
eq("a1ToLabels", a1ToLabels("=A1*1.1", COLS), "={Dev}*1.1");
eq("a1ToLabels multi", a1ToLabels("=A1+B1", COLS), "={Dev}+{BD}");
eq("a1ToLabels func", a1ToLabels("=SUM(A1:C1)", COLS), "=SUM({Dev}:{Lead})");
eq("labelsToA1", labelsToA1("={Dev}*1.1", COLS), "=A1*1.1");
eq(
  "round-trip",
  a1ToLabels(labelsToA1("={Dev}+{BD}", COLS), COLS),
  "={Dev}+{BD}",
);
// reorder survival: same stored label, new column order → new letter
eq("reorder reprojects", labelsToA1("={Dev}", ["BD", "Dev"]), "=B1");

// ── rewriteFormulaRefs (column rename) ──
eq(
  "rename rewrites",
  rewriteFormulaRefs("={Dev}*1.1", "Dev", "Developer"),
  "={Developer}*1.1",
);
eq(
  "rename case-insensitive",
  rewriteFormulaRefs("={Dev}+{BD}", "dev", "Engineering"),
  "={Engineering}+{BD}",
);
eq(
  "rename leaves others",
  rewriteFormulaRefs("={Dev}+{BD}", "QA", "Quality"),
  "={Dev}+{BD}",
);

// ── recalcRow: literals + formulas + cycle ──
function rc(cols: string[], cells: RowCell[]) {
  return recalcRow(cols, cells).map((r) => (r.ok ? r.cents : r.error));
}
eq(
  "recalc same-row formula",
  rc(
    ["Dev", "BD", "Total"],
    [
      { formula: null, cents: 800 },
      { formula: null, cents: 200 },
      { formula: "=SUM({Dev}:{BD})", cents: 0 },
    ],
  ),
  [800, 200, 1000],
);
eq(
  "recalc raise",
  rc(
    ["Base", "Raise"],
    [
      { formula: null, cents: 1000 },
      { formula: "={Base}*1.1", cents: 0 },
    ],
  ),
  [1000, 1100],
);
eq(
  "recalc chain",
  rc(
    ["A", "B", "C"],
    [
      { formula: null, cents: 100 },
      { formula: "={A}*2", cents: 0 },
      { formula: "={B}+{A}", cents: 0 },
    ],
  ),
  [100, 200, 300],
);
eq(
  "recalc self-cycle",
  rc(
    ["A"],
    [{ formula: "={A}+1", cents: 0 }],
  ),
  ["#CYCLE!"],
);
eq(
  "recalc 2-cycle",
  rc(
    ["A", "B"],
    [
      { formula: "={B}", cents: 0 },
      { formula: "={A}", cents: 0 },
    ],
  ),
  ["#CYCLE!", "#CYCLE!"],
);
eq(
  "recalc error propagates",
  rc(
    ["A", "B"],
    [
      { formula: "=1/0", cents: 0 },
      { formula: "={A}+1", cents: 0 },
    ],
  ),
  ["#DIV/0!", "#DIV/0!"],
);
eq(
  "recalc ref to deleted column",
  rc(
    ["Dev"],
    [{ formula: "={BD}+1", cents: 0 }], // BD no longer a column
  ),
  ["#REF!"],
);

// ── 2D grid: stored ⇄ A1 translation ──
const RLABELS = ["Ali", "Roshaan"]; // rows = employees
const CLABELS = ["Dev", "BD"]; // cols = components
// Same-row ref stays 1D form; cross-row ref carries the row label.
eq("a1ToGrid same-row", a1ToGrid("=A*1.1", RLABELS, CLABELS, 0), "={Dev}*1.1");
eq("a1ToGrid explicit self", a1ToGrid("=A1*1.1", RLABELS, CLABELS, 0), "={Dev}*1.1");
eq("a1ToGrid cross-row", a1ToGrid("=A2", RLABELS, CLABELS, 0), "={Roshaan|Dev}");
eq("a1ToGrid 2D mix", a1ToGrid("=A1+B2", RLABELS, CLABELS, 0), "={Dev}+{Roshaan|BD}");
eq("gridToA1 same-row", gridToA1("={Dev}*1.1", RLABELS, CLABELS), "=A*1.1");
eq("gridToA1 cross-row", gridToA1("={Roshaan|Dev}", RLABELS, CLABELS), "=A2");
// Round-trip from selfRow=1 (Roshaan): a ref to Ali (row 0) stays 2D, a ref to
// Roshaan (self) collapses to same-row form.
eq(
  "grid round-trip",
  a1ToGrid(gridToA1("={Ali|Dev}+{Roshaan|BD}", RLABELS, CLABELS), RLABELS, CLABELS, 1),
  "={Ali|Dev}+{BD}",
);
// reorder survival: swap row order → ref reprojects to the new letter/row
eq(
  "grid reorder reprojects",
  gridToA1("={Roshaan|Dev}", ["Roshaan", "Ali"], CLABELS),
  "=A1",
);

// ── recalcGrid: 2D references across employees ──
function rg(rows: string[], cols: string[], cells: GridCell[][]) {
  return recalcGrid(rows, cols, cells).map((row) =>
    row.map((r) => (r.ok ? r.cents : r.error)),
  );
}
// Ali Dev=100, BD=50; Roshaan Dev = Ali's Dev (={Ali|Dev}), BD=10.
eq(
  "grid cross-row ref",
  rg(RLABELS, CLABELS, [
    [{ formula: null, cents: 100 }, { formula: null, cents: 50 }],
    [{ formula: "={Ali|Dev}", cents: 0 }, { formula: null, cents: 10 }],
  ]),
  [
    [100, 50],
    [100, 10],
  ],
);
// Same-row formula still works inside the grid.
eq(
  "grid same-row raise",
  rg(["A"], ["Base", "Raise"], [
    [{ formula: null, cents: 1000 }, { formula: "={Base}*1.1", cents: 0 }],
  ]),
  [[1000, 1100]],
);
// SUM down a column across rows: B1 = SUM(A1:A2) = Ali.Dev + Roshaan.Dev.
eq(
  "grid column sum",
  rg(RLABELS, ["Dev", "Total"], [
    [{ formula: null, cents: 100 }, { formula: null, cents: 0 }],
    [{ formula: null, cents: 200 }, { formula: "=SUM({Ali|Dev}:{Roshaan|Dev})", cents: 0 }],
  ]),
  [
    [100, 0],
    [200, 300],
  ],
);
// 2D cycle: Ali.Dev = Roshaan.Dev, Roshaan.Dev = Ali.Dev → both #CYCLE!.
eq(
  "grid 2D cycle",
  rg(RLABELS, ["Dev"], [
    [{ formula: "={Roshaan|Dev}", cents: 0 }],
    [{ formula: "={Ali|Dev}", cents: 0 }],
  ]),
  [["#CYCLE!"], ["#CYCLE!"]],
);
// Ref to a missing row → #REF!.
eq(
  "grid missing row ref",
  rg(["Ali"], ["Dev"], [[{ formula: "={Ghost|Dev}", cents: 0 }]]),
  [["#REF!"]],
);
// Error propagates across rows.
eq(
  "grid error propagates",
  rg(RLABELS, ["Dev"], [
    [{ formula: "=1/0", cents: 0 }],
    [{ formula: "={Ali|Dev}+1", cents: 0 }],
  ]),
  [["#DIV/0!"], ["#DIV/0!"]],
);

// ── Named project values: POOL / INCOME / SHARED ──
// Pass a named map (cents): POOL = $7,000, INCOME = $10,000, SHARED = $3,000.
const NAMED = { POOL: 700000, INCOME: 1000000, SHARED: 300000 };
function rgN(
  rows: string[],
  cols: string[],
  cells: GridCell[][],
  named: Partial<Record<"POOL" | "INCOME" | "SHARED", number>>,
) {
  return recalcGrid(rows, cols, cells, named).map((row) =>
    row.map((r) => (r.ok ? r.cents : r.error)),
  );
}
// DEV = 40% of pool = $2,800; BD = INCOME*0.1 = $1,000.
eq(
  "named POOL & INCOME",
  rgN(
    ["Ali"],
    ["Dev", "BD"],
    [[{ formula: "=POOL*0.4", cents: 0 }, { formula: "=INCOME*0.1", cents: 0 }]],
    NAMED,
  ),
  [[280000, 100000]],
);
// SHARED alone.
eq(
  "named SHARED",
  rgN(["Ali"], ["X"], [[{ formula: "=SHARED", cents: 0 }]], NAMED),
  [[300000]],
);
// Named value combined with a cell ref.
eq(
  "named minus cell",
  rgN(
    ["Ali"],
    ["Dev", "Rest"],
    [[{ formula: null, cents: 200000 }, { formula: "=POOL-{Dev}", cents: 0 }]],
    NAMED,
  ),
  [[200000, 500000]],
);
// No finance context provided → #NAME?.
eq(
  "named without context",
  rgN(["Ali"], ["X"], [[{ formula: "=POOL", cents: 0 }]], {}),
  [["#NAME?"]],
);
// money × money still rejected (POOL × cell).
eq(
  "named × cell rejected",
  rgN(
    ["Ali"],
    ["Dev", "Bad"],
    [[{ formula: null, cents: 100 }, { formula: "=POOL*{Dev}", cents: 0 }]],
    NAMED,
  ),
  [[100, "#VALUE!"]],
);
// Round-trips through stored form unchanged (a reserved word, not a {label}).
eq("a1ToGrid keeps POOL", a1ToGrid("=POOL*0.4", ["Ali"], ["Dev"], 0), "=POOL*0.4");
eq("gridToA1 keeps POOL", gridToA1("=POOL*0.4", ["Ali"], ["Dev"]), "=POOL*0.4");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
