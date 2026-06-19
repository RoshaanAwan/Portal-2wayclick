import { toCents } from "./invoices";

// ── Salary cell formula engine ──────────────────────────────────────────────────
// A tiny, pure, dependency-free spreadsheet formula engine for the salary grid.
// Formulas reference OTHER CELLS IN THE SAME ROW only (a salary's other component
// columns), e.g. "=Dev*1.1", "=Dev+BD", "=SUM(A1:C1)". Money is integer cents end
// to end; intermediate results carry as exact JS numbers and are rounded ONCE at
// the evaluate() boundary (matching lib/invoices.ts's "round once" rule). There is
// NO eval / new Function / dynamic dispatch anywhere — parsing produces a closed
// AST and evaluation walks it with a hardcoded function switch.
//
// Two ref forms exist:
//   • DISPLAY/INPUT form uses A1 column letters ("=A1*1.1") — familiar Excel feel.
//   • STORED/INTERNAL form uses the component label ("={Dev}*1.1") — stable across
//     column reorder (letters reproject; the label key is unchanged).
// a1ToLabels / labelsToA1 translate between them against the current column order.

export type FormulaError =
  | "#REF!"
  | "#DIV/0!"
  | "#CYCLE!"
  | "#NAME?"
  | "#VALUE!";

const FORMULA_ERRORS: FormulaError[] = [
  "#REF!",
  "#DIV/0!",
  "#CYCLE!",
  "#NAME?",
  "#VALUE!",
];

export function isFormulaError(v: unknown): v is FormulaError {
  return typeof v === "string" && (FORMULA_ERRORS as string[]).includes(v);
}

/** A raw cell value is a formula iff it starts with "=" (after trim). */
export function isFormula(raw: string): boolean {
  return raw.trim().startsWith("=");
}

const MAX_LEN = 256;
const MAX_DEPTH = 64;
const FUNCTIONS = ["SUM", "AVERAGE", "MIN", "MAX", "ROUND", "ABS"] as const;
type FuncName = (typeof FUNCTIONS)[number];

// Reserved project-level named values usable in a salary formula. They resolve
// to the project's finance figures (cents), the SAME value for every cell in the
// block: POOL = salary pool, INCOME = total revenue, SHARED = total carved out by
// share lines. They are money-dimensioned, just like a cell ref.
export const NAMED_VALUES = ["POOL", "INCOME", "SHARED"] as const;
export type NamedValue = (typeof NAMED_VALUES)[number];
function isNamedValue(w: string): w is NamedValue {
  return (NAMED_VALUES as readonly string[]).includes(w);
}

// ── Column letter ⇄ index ───────────────────────────────────────────────────────
// Spreadsheet base-26 bijective: A=0, B=1, … Z=25, AA=26, …

export function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64); // 'A' = 65 → 1
  }
  return n - 1;
}

export function colToLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ── Tokenizer ───────────────────────────────────────────────────────────────────

type Token =
  | { t: "num"; cents: number }
  // A1-letter cell ref. `letters` = column; `row1` = the 1-based row digits, or
  // null when omitted ("A" with no digit = the SAME row the formula sits in).
  // 1D callers (recalcRow) ignore row1; 2D callers (recalcGrid) honor it.
  | { t: "ref"; letters: string; row1: number | null }
  | { t: "named"; name: NamedValue } // POOL / INCOME / SHARED
  | { t: "func"; name: FuncName }
  | { t: "op"; op: "+" | "-" | "*" | "/" }
  | { t: "pct" } // postfix %
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "colon" }
  | { t: "comma" };

class FormulaParseError extends Error {
  constructor(public code: FormulaError = "#VALUE!") {
    super(code);
  }
}

export function tokenize(src: string): Token[] {
  let s = src.trim();
  if (s.startsWith("=")) s = s.slice(1);
  if (s.length > MAX_LEN) throw new FormulaParseError("#VALUE!");

  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) => /[A-Za-z]/.test(c);

  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", op: c });
      i++;
      continue;
    }
    if (c === "%") {
      tokens.push({ t: "pct" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rparen" });
      i++;
      continue;
    }
    if (c === ":") {
      tokens.push({ t: "colon" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: "comma" });
      i++;
      continue;
    }
    // Number literal (major units) → cents via the shared toCents.
    if (isDigit(c) || (c === "." && isDigit(s[i + 1] ?? ""))) {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
      const raw = s.slice(i, j);
      if ((raw.match(/\./g)?.length ?? 0) > 1)
        throw new FormulaParseError("#VALUE!");
      tokens.push({ t: "num", cents: toCents(Number(raw)) });
      i = j;
      continue;
    }
    // Identifier: function name, or a cell ref (letters + optional row digits).
    if (isAlpha(c)) {
      let j = i;
      while (j < s.length && isAlpha(s[j])) j++;
      const word = s.slice(i, j).toUpperCase();
      // Trailing digits → the ROW part of an A1 ref like "A2".
      let k = j;
      while (k < s.length && isDigit(s[k])) k++;
      const hasDigits = k > j;
      if (!hasDigits && (FUNCTIONS as readonly string[]).includes(word)) {
        tokens.push({ t: "func", name: word as FuncName });
        i = j;
        continue;
      }
      // A reserved project value (POOL/INCOME/SHARED) — only as a bare word.
      if (!hasDigits && isNamedValue(word)) {
        tokens.push({ t: "named", name: word });
        i = j;
        continue;
      }
      // An A1-letter cell ref. Keep the row digits (1-based) when present, else
      // null = "same row" (the row the formula sits in).
      const row1 = hasDigits ? Number(s.slice(j, k)) : null;
      tokens.push({ t: "ref", letters: word, row1 });
      i = k;
      continue;
    }
    // Anything else is unrecognized.
    throw new FormulaParseError("#VALUE!");
  }
  return tokens;
}

// ── AST ─────────────────────────────────────────────────────────────────────────

type Node =
  | { k: "num"; cents: number }
  // resolved column INDEX (from A1 letters); `row` is the 0-based row INDEX, or
  // null = "same row" (1D / current row). 2D refs ("B2") set row explicitly.
  | { k: "ref"; col: number; row: number | null }
  | { k: "named"; name: NamedValue } // POOL / INCOME / SHARED
  | { k: "neg"; x: Node }
  | { k: "pct"; x: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node }
  | { k: "func"; name: FuncName; args: Node[] }
  // A rectangular range from (fromCol,fromRow) to (toCol,toRow). Rows null =
  // same-row span (1D, e.g. "A1:C1"); explicit rows give a 2D block.
  | {
      k: "range";
      fromCol: number;
      toCol: number;
      fromRow: number | null;
      toRow: number | null;
    };

// ── Pratt-ish recursive-descent parser ──────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }
  private next(): Token | undefined {
    return this.toks[this.pos++];
  }
  private expect(t: Token["t"]): Token {
    const tok = this.next();
    if (!tok || tok.t !== t) throw new FormulaParseError("#VALUE!");
    return tok;
  }

  parse(): Node {
    const node = this.parseExpr(0);
    if (this.pos !== this.toks.length) throw new FormulaParseError("#VALUE!");
    return node;
  }

  // expr := term (('+'|'-') term)*
  private parseExpr(depth: number): Node {
    if (depth > MAX_DEPTH) throw new FormulaParseError("#VALUE!");
    let left = this.parseTerm(depth);
    while (this.peek()?.t === "op") {
      const op = (this.peek() as { op: "+" | "-" | "*" | "/" }).op;
      if (op !== "+" && op !== "-") break;
      this.next();
      const right = this.parseTerm(depth);
      left = { k: "bin", op, l: left, r: right };
    }
    return left;
  }

  // term := unary (('*'|'/') unary)*
  private parseTerm(depth: number): Node {
    let left = this.parseUnary(depth);
    while (this.peek()?.t === "op") {
      const op = (this.peek() as { op: "+" | "-" | "*" | "/" }).op;
      if (op !== "*" && op !== "/") break;
      this.next();
      const right = this.parseUnary(depth);
      left = { k: "bin", op, l: left, r: right };
    }
    return left;
  }

  // unary := '-' unary | postfix
  private parseUnary(depth: number): Node {
    const tok = this.peek();
    if (tok?.t === "op" && tok.op === "-") {
      this.next();
      return { k: "neg", x: this.parseUnary(depth) };
    }
    if (tok?.t === "op" && tok.op === "+") {
      this.next();
      return this.parseUnary(depth);
    }
    return this.parsePostfix(depth);
  }

  // postfix := primary '%'?
  private parsePostfix(depth: number): Node {
    let node = this.parsePrimary(depth);
    while (this.peek()?.t === "pct") {
      this.next();
      node = { k: "pct", x: node };
    }
    return node;
  }

  private parsePrimary(depth: number): Node {
    const tok = this.next();
    if (!tok) throw new FormulaParseError("#VALUE!");
    if (tok.t === "num") return { k: "num", cents: tok.cents };
    if (tok.t === "named") return { k: "named", name: tok.name };
    if (tok.t === "lparen") {
      const inner = this.parseExpr(depth + 1);
      this.expect("rparen");
      return inner;
    }
    if (tok.t === "ref") {
      const col = letterToCol(tok.letters);
      // row digits are 1-based; convert to a 0-based index, or null = same row.
      const row = tok.row1 != null ? tok.row1 - 1 : null;
      // A range "A:C" / "A1:C1" (same-row span) or "A1:C3" (2D block).
      if (this.peek()?.t === "colon") {
        this.next();
        const end = this.next();
        if (!end || end.t !== "ref") throw new FormulaParseError("#VALUE!");
        const endRow = end.row1 != null ? end.row1 - 1 : null;
        return {
          k: "range",
          fromCol: col,
          toCol: letterToCol(end.letters),
          fromRow: row,
          toRow: endRow,
        };
      }
      return { k: "ref", col, row };
    }
    if (tok.t === "func") {
      this.expect("lparen");
      const args: Node[] = [];
      if (this.peek()?.t !== "rparen") {
        args.push(this.parseExpr(depth + 1));
        while (this.peek()?.t === "comma") {
          this.next();
          args.push(this.parseExpr(depth + 1));
        }
      }
      this.expect("rparen");
      return { k: "func", name: tok.name, args };
    }
    throw new FormulaParseError("#VALUE!");
  }
}

export function parse(tokens: Token[]): Node {
  return new Parser(tokens).parse();
}

// ── Dependency columns (1D cycle detection) ─────────────────────────────────────
// The set of column INDICES this AST references. Used by recalcRow (same-row);
// row info is ignored here.

export function refCols(ast: Node): number[] {
  const out = new Set<number>();
  const walk = (n: Node) => {
    switch (n.k) {
      case "ref":
        out.add(n.col);
        break;
      case "range":
        for (
          let c = Math.min(n.fromCol, n.toCol);
          c <= Math.max(n.fromCol, n.toCol);
          c++
        )
          out.add(c);
        break;
      case "neg":
      case "pct":
        walk(n.x);
        break;
      case "bin":
        walk(n.l);
        walk(n.r);
        break;
      case "func":
        n.args.forEach(walk);
        break;
    }
  };
  walk(ast);
  return [...out];
}

// ── Dependency cells (2D cycle detection) ───────────────────────────────────────
// The set of (col,row) cells this AST references, given the row the formula sits
// in (`selfRow`) so that null rows resolve to selfRow. Used by recalcGrid.

export function refCells(
  ast: Node,
  selfRow: number,
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const seen = new Set<string>();
  const add = (col: number, row: number) => {
    const key = `${col}:${row}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ col, row });
    }
  };
  const walk = (n: Node) => {
    switch (n.k) {
      case "ref":
        add(n.col, n.row ?? selfRow);
        break;
      case "range": {
        const r0 = n.fromRow ?? selfRow;
        const r1 = n.toRow ?? selfRow;
        for (let c = Math.min(n.fromCol, n.toCol); c <= Math.max(n.fromCol, n.toCol); c++)
          for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) add(c, r);
        break;
      }
      case "neg":
      case "pct":
        walk(n.x);
        break;
      case "bin":
        walk(n.l);
        walk(n.r);
        break;
      case "func":
        n.args.forEach(walk);
        break;
    }
  };
  walk(ast);
  return out;
}

// ── Evaluation ──────────────────────────────────────────────────────────────────
// resolve(col) returns the already-computed cents of a same-row column, or null
// if that column doesn't exist (→ #REF!). Operates on exact JS numbers; the
// caller rounds the final result once. A "money×money" multiply (both operands
// reference cells) is rejected as #VALUE! — cents² is meaningless. We track
// "is this subtree purely a cell quantity?" via a companion flag to catch that.

class EvalError extends Error {
  constructor(public code: FormulaError) {
    super(code);
  }
}

interface Val {
  n: number; // value in cents (may be fractional pre-round)
  money: boolean; // true if this value carries a currency dimension (a cell qty)
}

// The resolver maps a (col, row) cell to its computed cents, or null if missing.
// `row` is null for a same-row ref — the caller (evaluate) binds it to selfRow.
type Resolve = (col: number, row: number | null) => number | null;
// Looks up a project-level named value (POOL/INCOME/SHARED) → cents, or null if
// the caller didn't supply finance context (→ #NAME?). Optional everywhere.
type ResolveNamed = (name: NamedValue) => number | null;
interface EvalCtx {
  resolve: Resolve;
  named?: ResolveNamed;
}

function evalNode(node: Node, ctx: EvalCtx): Val {
  switch (node.k) {
    case "num":
      // A literal is a SCALAR carried in cents-space (it was toCents'd, so 1.1 →
      // 110). It has no currency dimension; only cell refs do. A standalone "=500"
      // therefore reads as 50000 cents ($500) — see how multiply/standalone work.
      return { n: node.cents, money: false };
    case "ref": {
      const v = ctx.resolve(node.col, node.row);
      if (v == null) throw new EvalError("#REF!");
      // A cell ref is the ONLY money-dimensioned quantity (already in cents).
      return { n: v, money: true };
    }
    case "named": {
      // A project value (cents) — money-dimensioned, like a cell. Unknown when no
      // finance context was provided.
      const v = ctx.named ? ctx.named(node.name) : null;
      if (v == null) throw new EvalError("#NAME?");
      return { n: v, money: true };
    }
    case "range":
      // A bare range only makes sense inside a function; using it as a scalar is
      // an error.
      throw new EvalError("#VALUE!");
    case "neg": {
      const x = evalNode(node.x, ctx);
      return { n: -x.n, money: x.money };
    }
    case "pct": {
      // X% = X/100 as a dimensionless multiplier (loses money dimension).
      const x = evalNode(node.x, ctx);
      return { n: x.n / 100, money: false };
    }
    case "bin": {
      const l = evalNode(node.l, ctx);
      const r = evalNode(node.r, ctx);
      if (node.op === "+" || node.op === "-") {
        return {
          n: node.op === "+" ? l.n + r.n : l.n - r.n,
          money: l.money || r.money,
        };
      }
      if (node.op === "*") {
        // Reject money × money (cents²). Allow money × scalar / scalar × money.
        if (l.money && r.money) throw new EvalError("#VALUE!");
        return { n: (l.n * r.n) / 100, money: l.money || r.money };
        // ÷100 keeps cents-space consistent: money(cents) × scalar where the
        // scalar was a literal in cents-space (e.g. 1.1 → 110) needs /100.
      }
      // division
      if (r.n === 0) throw new EvalError("#DIV/0!");
      if (l.money && r.money) {
        // money ÷ money → dimensionless ratio (×100 to undo cents-space).
        return { n: (l.n / r.n) * 100, money: false };
      }
      // money ÷ scalar → money; the scalar is in cents-space so ×100.
      return { n: (l.n * 100) / r.n, money: l.money };
    }
    case "func":
      return evalFunc(node, ctx);
  }
}

function flattenArgs(args: Node[], ctx: EvalCtx): number[] {
  const out: number[] = [];
  for (const a of args) {
    if (a.k === "range") {
      // Expand the rectangle. Rows null = same-row span (resolve binds to self).
      for (let c = Math.min(a.fromCol, a.toCol); c <= Math.max(a.fromCol, a.toCol); c++) {
        const rows =
          a.fromRow == null && a.toRow == null
            ? [null]
            : rangeInts(a.fromRow, a.toRow);
        for (const r of rows) {
          const v = ctx.resolve(c, r);
          if (v == null) throw new EvalError("#REF!");
          out.push(v);
        }
      }
    } else {
      out.push(evalNode(a, ctx).n);
    }
  }
  return out;
}

/** Inclusive integer range between two (possibly null→0) bounds. */
function rangeInts(a: number | null, b: number | null): number[] {
  const lo = Math.min(a ?? 0, b ?? 0);
  const hi = Math.max(a ?? 0, b ?? 0);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function evalFunc(node: Extract<Node, { k: "func" }>, ctx: EvalCtx): Val {
  const xs = flattenArgs(node.args, ctx);
  switch (node.name) {
    case "SUM":
      return { n: xs.reduce((a, b) => a + b, 0), money: true };
    case "AVERAGE":
      if (xs.length === 0) throw new EvalError("#DIV/0!");
      return { n: xs.reduce((a, b) => a + b, 0) / xs.length, money: true };
    case "MIN":
      if (xs.length === 0) throw new EvalError("#VALUE!");
      return { n: Math.min(...xs), money: true };
    case "MAX":
      if (xs.length === 0) throw new EvalError("#VALUE!");
      return { n: Math.max(...xs), money: true };
    case "ABS":
      if (xs.length !== 1) throw new EvalError("#VALUE!");
      return { n: Math.abs(xs[0]), money: true };
    case "ROUND": {
      // ROUND(value, n) rounds to n MAJOR-unit decimals. value is cents.
      const value = xs[0];
      const places = node.args.length > 1 ? Math.trunc(xs[1]) : 0;
      // scale in cents: n=2 → 1c, n=1 → 10c, n=0 → 100c.
      const scale = Math.pow(10, 2 - places);
      return { n: Math.round(value / scale) * scale, money: true };
    }
  }
}

/**
 * Evaluate a parsed formula to integer cents (rounded once here) or an error.
 * `resolve(col)` returns same-row column cents, or null for a missing column.
 */
export function evaluate(
  ast: Node,
  resolve: (col: number) => number | null,
  named?: ResolveNamed,
): { ok: true; cents: number } | { ok: false; error: FormulaError } {
  // 1D entry point: ignore any row dimension (same-row semantics).
  return evaluate2D(ast, (col) => resolve(col), named);
}

/**
 * 2D evaluation. `resolve(col, row)` returns a cell's cents (row is null for a
 * same-row ref — the caller maps it to the formula's own row before calling, or
 * the resolver handles null itself). `named` resolves POOL/INCOME/SHARED. Rounds
 * the final value once.
 */
export function evaluate2D(
  ast: Node,
  resolve: Resolve,
  named?: ResolveNamed,
): { ok: true; cents: number } | { ok: false; error: FormulaError } {
  try {
    const v = evalNode(ast, { resolve, named });
    return { ok: true, cents: Math.round(v.n) };
  } catch (e) {
    if (e instanceof EvalError) return { ok: false, error: e.code };
    if (e instanceof FormulaParseError) return { ok: false, error: e.code };
    return { ok: false, error: "#VALUE!" };
  }
}

// ── Row recompute (topological, with cycle detection) ────────────────────────────
// A row is a list of cells aligned to `columns`. Each cell is either a literal
// (cents) or a formula string (STORED label form). Returns per-column resolved
// cents or an error. Same-row only → the dependency graph is within the row.

export interface RowCell {
  /** Stored formula in LABEL form ("={Dev}*1.1"), or null for a literal. */
  formula: string | null;
  /** Literal cents (used when formula is null). */
  cents: number;
}

export type CellResult =
  | { ok: true; cents: number }
  | { ok: false; error: FormulaError };

/**
 * Recompute one row. `columns` is the ordered label list; `cells[i]` aligns to
 * `columns[i]`. Formulas are in STORED label form and are resolved against the
 * row's own columns. Cycles (incl. self-reference) yield #CYCLE! for the cells
 * involved.
 */
export function recalcRow(
  columns: string[],
  cells: RowCell[],
): CellResult[] {
  const n = columns.length;
  const lower = columns.map((c) => c.toLowerCase());
  const labelToCol = new Map<string, number>();
  lower.forEach((l, idx) => {
    if (!labelToCol.has(l)) labelToCol.set(l, idx);
  });

  // Parse each formula cell; record its ref columns for the dep graph.
  const asts: (Node | null)[] = new Array(n).fill(null);
  const parseError: (FormulaError | null)[] = new Array(n).fill(null);
  const deps: number[][] = new Array(n).fill(null).map(() => []);

  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    if (!cell || !cell.formula) continue;
    // A stored {label} that no longer maps to a column is a deterministic #REF!
    // (don't let the projected literal "#REF!" break tokenization downstream).
    const unresolved = [...cell.formula.matchAll(/\{([^}]*)\}/g)].some(
      (m) => !labelToCol.has(m[1].trim().toLowerCase()),
    );
    if (unresolved) {
      parseError[i] = "#REF!";
      continue;
    }
    try {
      const ast = parse(tokenize(formulaWithCols(cell.formula, columns)));
      asts[i] = ast;
      deps[i] = refCols(ast).filter((c) => c >= 0);
    } catch (e) {
      parseError[i] =
        e instanceof FormulaParseError ? e.code : "#VALUE!";
    }
  }

  // Kahn topological sort over formula cells. Literals are always "ready".
  const results: (CellResult | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (!cells[i]?.formula) {
      results[i] = { ok: true, cents: cells[i]?.cents ?? 0 };
    } else if (parseError[i]) {
      results[i] = { ok: false, error: parseError[i]! };
    }
  }

  // Iteratively resolve formula cells whose deps are all resolved.
  let progressed = true;
  const pending = new Set<number>();
  for (let i = 0; i < n; i++)
    if (cells[i]?.formula && !parseError[i]) pending.add(i);

  while (progressed && pending.size > 0) {
    progressed = false;
    for (const i of [...pending]) {
      const ast = asts[i]!;
      // Ready iff every dependency column is resolved to a value (not pending).
      const ready = deps[i].every((c) => {
        if (c < 0 || c >= n) return true; // missing col → handled as #REF! in eval
        return results[c] != null; // literal or already-computed formula
      });
      if (!ready) continue;
      const res = evaluate(ast, (col) => {
        if (col < 0 || col >= n) return null;
        const r = results[col];
        if (!r) return null;
        return r.ok ? r.cents : null; // an errored dependency propagates
      });
      // If a dep errored, propagate that error rather than a generic one.
      const erroredDep = deps[i]
        .map((c) => results[c])
        .find((r) => r && !r.ok) as
        | { ok: false; error: FormulaError }
        | undefined;
      results[i] = erroredDep ?? res;
      pending.delete(i);
      progressed = true;
    }
  }

  // Anything still pending is in a cycle.
  for (const i of pending) results[i] = { ok: false, error: "#CYCLE!" };

  return results.map((r) => r ?? { ok: true, cents: 0 });
}

// ── A1 ⇄ label translation ───────────────────────────────────────────────────────
// STORED form uses "={Label}" tokens; DISPLAY form uses A1 letters. We translate
// by swapping ref tokens, leaving operators/numbers/functions intact.

/** Replace {Label} refs with their A1 letters for display/editing. */
export function labelsToA1(stored: string, columns: string[]): string {
  return stored.replace(/\{([^}]*)\}/g, (_m, label: string) => {
    const idx = columns.findIndex(
      (c) => c.toLowerCase() === label.trim().toLowerCase(),
    );
    return idx >= 0 ? `${colToLetter(idx)}1` : "#REF!";
  });
}

/** Convert a DISPLAY formula (A1 letters) into STORED label form for saving. */
export function a1ToLabels(display: string, columns: string[]): string {
  // Walk tokens; rewrite each bare cell ref (letters[+digits]) to {Label}. We
  // must avoid rewriting function names, so reuse the tokenizer's word logic.
  let s = display.trim();
  const eq = s.startsWith("=");
  if (eq) s = s.slice(1);
  let out = "";
  let i = 0;
  const isAlpha = (c: string) => /[A-Za-z]/.test(c);
  const isDigit = (c: string) => c >= "0" && c <= "9";
  while (i < s.length) {
    const c = s[i];
    if (isAlpha(c)) {
      let j = i;
      while (j < s.length && isAlpha(s[j])) j++;
      const word = s.slice(i, j);
      let k = j;
      while (k < s.length && isDigit(s[k])) k++;
      const hasDigits = k > j;
      const upper = word.toUpperCase();
      if (
        !hasDigits &&
        ((FUNCTIONS as readonly string[]).includes(upper) ||
          isNamedValue(upper))
      ) {
        out += word; // a function name or reserved value — leave as-is
        i = j;
      } else {
        const col = letterToCol(word);
        const label = columns[col];
        out += label != null ? `{${label}}` : word;
        i = k;
      }
    } else {
      out += c;
      i++;
    }
  }
  return `=${out}`;
}

/**
 * For recalcRow, formulas arrive in STORED label form. tokenize() understands A1
 * letters, not {Label}. This converts a stored formula to the A1 form the parser
 * eats, against the current column order.
 */
function formulaWithCols(stored: string, columns: string[]): string {
  return labelsToA1(stored, columns);
}

/**
 * Rewrite stored formulas when a column is renamed (case-insensitive match), so
 * "={Old}" becomes "={New}" across a set of formula strings. Returns the new
 * string, or the original if it doesn't reference `oldLabel`. Handles both the
 * column part of a 2D ref ("{Row|Old}") and a same-row ref ("{Old}").
 */
export function rewriteFormulaRefs(
  stored: string,
  oldLabel: string,
  newLabel: string,
): string {
  const target = oldLabel.trim().toLowerCase();
  return stored.replace(/\{([^}]*)\}/g, (_m, body: string) => {
    const parts = body.split("|");
    if (parts.length === 2) {
      // 2D ref "{Row|Col}" — rename only the COLUMN part.
      const col = parts[1].trim().toLowerCase() === target ? newLabel : parts[1];
      return `{${parts[0]}|${col}}`;
    }
    return body.trim().toLowerCase() === target ? `{${newLabel}}` : `{${body}}`;
  });
}

// ── 2D GRID: stored ⇄ A1 translation + whole-block recompute ─────────────────────
// In a project block, ROWS are employees and COLUMNS are components. A1 display
// refs carry an explicit 1-based row ("B2" = col B, row 2); a column-only "B"
// means the SAME row the formula sits in. STORED form mirrors that:
//   • "{Col}"        → same row, that column   (1D, back-compatible)
//   • "{Row|Col}"    → that employee row, that column   (2D)
// Storing labels (not letters/indices) keeps refs stable across row/column
// reorder, exactly like the 1D engine.

/** Display A1 → STORED grid form, against the block's row & column labels. */
export function a1ToGrid(
  display: string,
  rowLabels: string[],
  colLabels: string[],
  selfRow: number,
): string {
  let s = display.trim();
  if (s.startsWith("=")) s = s.slice(1);
  let out = "";
  let i = 0;
  const isAlpha = (c: string) => /[A-Za-z]/.test(c);
  const isDigit = (c: string) => c >= "0" && c <= "9";
  while (i < s.length) {
    const c = s[i];
    if (isAlpha(c)) {
      let j = i;
      while (j < s.length && isAlpha(s[j])) j++;
      const word = s.slice(i, j);
      let k = j;
      while (k < s.length && isDigit(s[k])) k++;
      const hasDigits = k > j;
      const upper = word.toUpperCase();
      if (
        !hasDigits &&
        ((FUNCTIONS as readonly string[]).includes(upper) ||
          isNamedValue(upper))
      ) {
        out += word; // function name or reserved value (POOL/INCOME/SHARED)
        i = j;
        continue;
      }
      const col = letterToCol(word);
      const colLabel = colLabels[col];
      const row = hasDigits ? Number(s.slice(j, k)) - 1 : selfRow;
      if (colLabel == null) {
        out += word; // unknown column — leave raw (will #REF! at eval)
      } else if (!hasDigits || row === selfRow) {
        out += `{${colLabel}}`; // same row → 1D form
      } else {
        const rowLabel = rowLabels[row];
        out += rowLabel != null ? `{${rowLabel}|${colLabel}}` : `{#REF!|${colLabel}}`;
      }
      i = k;
    } else {
      out += c;
      i++;
    }
  }
  return `=${out}`;
}

/** STORED grid form → display A1, against the block's row & column labels. */
export function gridToA1(
  stored: string,
  rowLabels: string[],
  colLabels: string[],
): string {
  return stored.replace(/\{([^}]*)\}/g, (_m, body: string) => {
    const parts = body.split("|");
    const colLabel = (parts.length === 2 ? parts[1] : parts[0]).trim();
    const col = colLabels.findIndex(
      (c) => c.toLowerCase() === colLabel.toLowerCase(),
    );
    if (col < 0) return "#REF!";
    if (parts.length === 2) {
      const rowLabel = parts[0].trim();
      const row = rowLabels.findIndex(
        (r) => r.toLowerCase() === rowLabel.toLowerCase(),
      );
      if (row < 0) return "#REF!";
      return `${colToLetter(col)}${row + 1}`;
    }
    return colToLetter(col); // same-row → no row digit
  });
}

/** A cell in the 2D block: a stored formula (grid form) or a literal (cents). */
export interface GridCell {
  formula: string | null;
  cents: number;
}

/**
 * Recompute a whole project block. `cells[r][c]` aligns to (rowLabels[r],
 * colLabels[c]). Formulas are in STORED grid form and may reference ANY cell in
 * the block, plus project-level named values (POOL/INCOME/SHARED) via the
 * optional `named` map (label → cents). Resolves with 2D topological ordering;
 * cells in a cycle (incl. self-reference) yield #CYCLE!. Returns [r][c] results.
 */
export function recalcGrid(
  rowLabels: string[],
  colLabels: string[],
  cells: GridCell[][],
  named?: Partial<Record<NamedValue, number>>,
): CellResult[][] {
  const lookupNamed: ResolveNamed = (name) =>
    named && named[name] != null ? named[name]! : null;
  const R = rowLabels.length;
  const C = colLabels.length;
  const key = (r: number, c: number) => r * C + c;
  const colIdx = new Map<string, number>();
  colLabels.forEach((l, i) => {
    if (!colIdx.has(l.toLowerCase())) colIdx.set(l.toLowerCase(), i);
  });
  const rowIdx = new Map<string, number>();
  rowLabels.forEach((l, i) => {
    if (!rowIdx.has(l.toLowerCase())) rowIdx.set(l.toLowerCase(), i);
  });

  const asts: (Node | null)[] = new Array(R * C).fill(null);
  const parseErr: (FormulaError | null)[] = new Array(R * C).fill(null);
  const deps: { col: number; row: number }[][] = new Array(R * C)
    .fill(null)
    .map(() => []);
  const results: (CellResult | null)[] = new Array(R * C).fill(null);
  const pending = new Set<number>();

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cell = cells[r]?.[c];
      const id = key(r, c);
      if (!cell || !cell.formula) {
        results[id] = { ok: true, cents: cell?.cents ?? 0 };
        continue;
      }
      // A stored {…} that no longer maps to a known row/column → deterministic
      // #REF! (mirrors recalcRow's guard, but checks BOTH axes for 2D refs).
      const unresolved = [...cell.formula.matchAll(/\{([^}]*)\}/g)].some((m) => {
        const parts = m[1].split("|");
        const cl = (parts.length === 2 ? parts[1] : parts[0]).trim().toLowerCase();
        if (!colIdx.has(cl)) return true;
        if (parts.length === 2 && !rowIdx.has(parts[0].trim().toLowerCase()))
          return true;
        return false;
      });
      if (unresolved) {
        parseErr[id] = "#REF!";
        results[id] = { ok: false, error: "#REF!" };
        continue;
      }
      try {
        const ast = parse(tokenize(gridToA1(cell.formula, rowLabels, colLabels)));
        asts[id] = ast;
        deps[id] = refCells(ast, r).filter(
          (d) => d.col >= 0 && d.col < C && d.row >= 0 && d.row < R,
        );
        pending.add(id);
      } catch (e) {
        parseErr[id] = e instanceof FormulaParseError ? e.code : "#VALUE!";
        results[id] = { ok: false, error: parseErr[id]! };
      }
    }
  }

  // Iteratively resolve cells whose deps are all resolved (Kahn-style).
  let progressed = true;
  while (progressed && pending.size > 0) {
    progressed = false;
    for (const id of [...pending]) {
      const r = Math.floor(id / C);
      const ast = asts[id]!;
      const ready = deps[id].every((d) => results[key(d.row, d.col)] != null);
      if (!ready) continue;
      const erroredDep = deps[id]
        .map((d) => results[key(d.row, d.col)])
        .find((res) => res && !res.ok) as
        | { ok: false; error: FormulaError }
        | undefined;
      const res =
        erroredDep ??
        evaluate2D(
          ast,
          (col, row) => {
            const rr = row ?? r;
            if (col < 0 || col >= C || rr < 0 || rr >= R) return null;
            const dep = results[key(rr, col)];
            if (!dep) return null;
            return dep.ok ? dep.cents : null;
          },
          lookupNamed,
        );
      results[id] = res;
      pending.delete(id);
      progressed = true;
    }
  }

  // Anything still pending is in a cycle.
  for (const id of pending) results[id] = { ok: false, error: "#CYCLE!" };

  // Reshape flat → [r][c].
  const out: CellResult[][] = [];
  for (let r = 0; r < R; r++) {
    const row: CellResult[] = [];
    for (let c = 0; c < C; c++) row.push(results[key(r, c)] ?? { ok: true, cents: 0 });
    out.push(row);
  }
  return out;
}
