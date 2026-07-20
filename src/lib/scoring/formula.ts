const MAX_FORMULA_LENGTH = 4_000;
const MAX_FORMULA_TOKENS = 1_000;
const MAX_PARSE_DEPTH = 64;

type Operator = "+" | "-" | "*" | "/" | "^";
type FunctionName =
  | "min" | "max" | "abs" | "sqrt" | "pow" | "exp" | "log" | "clamp"
  | "if" | "coalesce" | "safe_div"
  | "gt" | "gte" | "lt" | "lte" | "eq"
  | "poisson_groups";

type Token =
  | { type: "number"; value: number }
  | { type: "metric"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: Operator }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma"; value: "," };

type FormulaNode =
  | { type: "number"; value: number }
  | { type: "metric"; value: string }
  | { type: "unary"; operator: "+" | "-"; operand: FormulaNode }
  | { type: "binary"; operator: Operator; left: FormulaNode; right: FormulaNode }
  | { type: "call"; name: FunctionName; args: FormulaNode[] };

type ParseState = {
  tokens: Token[];
  index: number;
  depth: number;
};

const functionArities: Record<FunctionName, { min: number; max: number }> = {
  min: { min: 1, max: Number.POSITIVE_INFINITY },
  max: { min: 1, max: Number.POSITIVE_INFINITY },
  abs: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  pow: { min: 2, max: 2 },
  exp: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
  clamp: { min: 3, max: 3 },
  if: { min: 3, max: 3 },
  coalesce: { min: 1, max: Number.POSITIVE_INFINITY },
  safe_div: { min: 2, max: 3 },
  gt: { min: 2, max: 2 },
  gte: { min: 2, max: 2 },
  lt: { min: 2, max: 2 },
  lte: { min: 2, max: 2 },
  eq: { min: 2, max: 2 },
  poisson_groups: { min: 2, max: 2 }
};

export function calculateCustomFormulaScore(formula: string, rawMetrics: Record<string, unknown>) {
  const tree = parseFormula(formula);
  const value = evaluateNode(tree, rawMetrics);
  const numericValue = value ?? 0;

  if (!Number.isFinite(numericValue)) {
    throw new Error("Formula result is not a finite number.");
  }

  return numericValue;
}

export function validateCustomFormula(formula: string) {
  if (!formula.trim()) return { ok: true as const };

  try {
    parseFormula(formula);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Formula is invalid."
    };
  }
}

export function normalizeFormulaMetric(metric: string) {
  return metric
    .trim()
    .replace(/\/\s*per\s*90/gi, " per 90")
    .replace(/\bper\s*90\b/gi, "per 90")
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_per90(?=_|$)/g, "_per_90")
    .replace(/^_+|_+$/g, "");
}

function parseFormula(formula: string) {
  const tokens = tokenizeFormula(formula);
  const state: ParseState = { tokens, index: 0, depth: 0 };
  const tree = parseExpression(state);

  if (state.index < tokens.length) {
    throw new Error(`Unexpected token near "${formatToken(tokens[state.index])}".`);
  }

  return tree;
}

function tokenizeFormula(formula: string) {
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new Error(`Formula exceeds ${MAX_FORMULA_LENGTH} characters.`);
  }

  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token) => {
    tokens.push(token);
    if (tokens.length > MAX_FORMULA_TOKENS) {
      throw new Error(`Formula exceeds ${MAX_FORMULA_TOKENS} tokens.`);
    }
  };

  while (index < formula.length) {
    const char = formula[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const number = formula.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${number[0]}".`);
      push({ type: "number", value });
      index += number[0].length;
      continue;
    }

    if (char === "{") {
      const end = formula.indexOf("}", index + 1);
      if (end === -1) throw new Error("Metric reference is missing a closing brace.");

      const value = normalizeFormulaMetric(formula.slice(index + 1, end));
      if (!value) throw new Error("Metric reference cannot be empty.");
      push({ type: "metric", value });
      index = end + 1;
      continue;
    }

    const identifier = formula.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      push({ type: "identifier", value: identifier[0].toLowerCase() });
      index += identifier[0].length;
      continue;
    }

    if (char === "(" || char === ")") {
      push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    if (char === ",") {
      push({ type: "comma", value: "," });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^") {
      push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character "${char}". Use numbers, +, -, *, /, ^, parentheses, functions, and {metric} fields.`);
  }

  if (tokens.length === 0) throw new Error("Formula is empty.");
  return tokens;
}

function parseExpression(state: ParseState): FormulaNode {
  let node = parseTerm(state);

  while (matchOperator(state, "+") || matchOperator(state, "-")) {
    const operator = (previous(state) as Extract<Token, { type: "operator" }>).value;
    node = { type: "binary", operator, left: node, right: parseTerm(state) };
  }

  return node;
}

function parseTerm(state: ParseState): FormulaNode {
  let node = parseUnary(state);

  while (matchOperator(state, "*") || matchOperator(state, "/")) {
    const operator = (previous(state) as Extract<Token, { type: "operator" }>).value;
    node = { type: "binary", operator, left: node, right: parseUnary(state) };
  }

  return node;
}

function parseUnary(state: ParseState): FormulaNode {
  if (matchOperator(state, "+") || matchOperator(state, "-")) {
    const operator = (previous(state) as Extract<Token, { type: "operator" }>).value as "+" | "-";
    return withParseDepth(state, () => ({ type: "unary", operator, operand: parseUnary(state) }));
  }
  return parsePower(state);
}

function parsePower(state: ParseState): FormulaNode {
  const left = parsePrimary(state);
  if (!matchOperator(state, "^")) return left;
  return withParseDepth(state, () => ({ type: "binary", operator: "^", left, right: parseUnary(state) }));
}

function parsePrimary(state: ParseState): FormulaNode {
  const token = advance(state);
  if (!token) throw new Error("Formula ended unexpectedly.");

  if (token.type === "number") return { type: "number", value: token.value };
  if (token.type === "metric") return { type: "metric", value: token.value };
  if (token.type === "identifier") return parseFunctionCall(state, token.value);

  if (token.type === "paren" && token.value === "(") {
    return withParseDepth(state, () => {
      const node = parseExpression(state);
      const closing = advance(state);
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new Error("Missing closing parenthesis.");
      }
      return node;
    });
  }

  throw new Error(`Unexpected token "${formatToken(token)}".`);
}

function parseFunctionCall(state: ParseState, rawName: string): FormulaNode {
  if (!(rawName in functionArities)) throw new Error(`Unsupported function "${rawName}".`);
  const name = rawName as FunctionName;
  const opening = advance(state);
  if (!opening || opening.type !== "paren" || opening.value !== "(") {
    throw new Error(`Function "${name}" must be followed by parentheses.`);
  }

  return withParseDepth(state, () => {
    const args: FormulaNode[] = [];
    const next = state.tokens[state.index];
    if (!(next?.type === "paren" && next.value === ")")) {
      do {
        args.push(parseExpression(state));
      } while (matchComma(state));
    }

    const closing = advance(state);
    if (!closing || closing.type !== "paren" || closing.value !== ")") {
      throw new Error(`Function "${name}" is missing a closing parenthesis.`);
    }
    validateFunctionArity(name, args.length);
    return { type: "call", name, args };
  });
}

function validateFunctionArity(name: FunctionName, count: number) {
  const { min, max } = functionArities[name];
  if (count >= min && count <= max) return;
  const expected = min === max ? String(min) : max === Number.POSITIVE_INFINITY ? `at least ${min}` : `${min}-${max}`;
  throw new Error(`Function "${name}" expects ${expected} argument${min === 1 && max === 1 ? "" : "s"}; received ${count}.`);
}

function evaluateNode(node: FormulaNode, rawMetrics: Record<string, unknown>): number | null {
  if (node.type === "number") return node.value;
  if (node.type === "metric") return nullableNumericMetric(rawMetrics[node.value]);
  if (node.type === "unary") {
    const value = numericValue(evaluateNode(node.operand, rawMetrics));
    return node.operator === "-" ? -value : value;
  }
  if (node.type === "binary") {
    const left = numericValue(evaluateNode(node.left, rawMetrics));
    const right = numericValue(evaluateNode(node.right, rawMetrics));
    if (node.operator === "+") return finite(left + right);
    if (node.operator === "-") return finite(left - right);
    if (node.operator === "*") return finite(left * right);
    if (node.operator === "^") return finite(left ** right);
    if (right === 0) throw new Error("Division by zero.");
    return finite(left / right);
  }

  return evaluateFunction(node.name, node.args, rawMetrics);
}

function evaluateFunction(name: FunctionName, args: FormulaNode[], rawMetrics: Record<string, unknown>) {
  if (name === "if") {
    const condition = numericValue(evaluateNode(args[0], rawMetrics));
    return evaluateNode(condition !== 0 ? args[1] : args[2], rawMetrics);
  }
  if (name === "coalesce") {
    for (const arg of args) {
      const value = evaluateNode(arg, rawMetrics);
      if (value !== null) return value;
    }
    return 0;
  }

  const values = args.map((arg) => numericValue(evaluateNode(arg, rawMetrics)));
  if (name === "min") return finite(Math.min(...values));
  if (name === "max") return finite(Math.max(...values));
  if (name === "abs") return Math.abs(values[0]);
  if (name === "sqrt") {
    if (values[0] < 0) throw new Error("Function \"sqrt\" requires a non-negative argument.");
    return Math.sqrt(values[0]);
  }
  if (name === "pow") return finite(Math.pow(values[0], values[1]));
  if (name === "exp") return finite(Math.exp(values[0]));
  if (name === "log") {
    if (values[0] <= 0) throw new Error("Function \"log\" requires a positive argument.");
    return Math.log(values[0]);
  }
  if (name === "clamp") {
    if (values[1] > values[2]) throw new Error("Function \"clamp\" requires min to be less than or equal to max.");
    return Math.min(Math.max(values[0], values[1]), values[2]);
  }
  if (name === "safe_div") {
    return values[1] === 0 ? values[2] ?? 0 : finite(values[0] / values[1]);
  }
  if (name === "gt") return values[0] > values[1] ? 1 : 0;
  if (name === "gte") return values[0] >= values[1] ? 1 : 0;
  if (name === "lt") return values[0] < values[1] ? 1 : 0;
  if (name === "lte") return values[0] <= values[1] ? 1 : 0;
  if (name === "eq") return values[0] === values[1] ? 1 : 0;
  if (name === "poisson_groups") return poissonGroups(values[0], values[1]);

  throw new Error(`Unsupported function "${name satisfies never}".`);
}

/** E[floor(N / groupSize)] for N ~ Poisson(lambda). */
function poissonGroups(lambda: number, groupSize: number) {
  if (lambda < 0) throw new Error("Function \"poisson_groups\" requires a non-negative lambda.");
  if (!Number.isInteger(groupSize) || groupSize <= 0) {
    throw new Error("Function \"poisson_groups\" requires a positive integer group size.");
  }
  // Fantasy event rates are small. The ceiling also prevents a formula from
  // turning one evaluation into an unbounded loop.
  if (lambda > 1_000) throw new Error("Function \"poisson_groups\" supports lambda up to 1000.");
  if (lambda === 0) return 0;

  const upper = Math.ceil(lambda + 12 * Math.sqrt(lambda) + 10 * groupSize);
  let logFactorial = 0;
  let expectedGroups = 0;
  for (let events = 1; events <= upper; events += 1) {
    logFactorial += Math.log(events);
    const probability = Math.exp(-lambda + events * Math.log(lambda) - logFactorial);
    expectedGroups += Math.floor(events / groupSize) * probability;
  }
  return finite(expectedGroups);
}

function withParseDepth<T>(state: ParseState, parse: () => T) {
  state.depth += 1;
  if (state.depth > MAX_PARSE_DEPTH) throw new Error(`Formula exceeds maximum nesting depth of ${MAX_PARSE_DEPTH}.`);
  try {
    return parse();
  } finally {
    state.depth -= 1;
  }
}

function matchOperator(state: ParseState, operator: Operator) {
  const token = state.tokens[state.index];
  if (!token || token.type !== "operator" || token.value !== operator) return false;
  state.index += 1;
  return true;
}

function matchComma(state: ParseState) {
  const token = state.tokens[state.index];
  if (!token || token.type !== "comma") return false;
  state.index += 1;
  return true;
}

function advance(state: ParseState) {
  if (state.index >= state.tokens.length) return null;
  const token = state.tokens[state.index];
  state.index += 1;
  return token;
}

function previous(state: ParseState) {
  return state.tokens[state.index - 1];
}

function nullableNumericMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function numericValue(value: number | null) {
  return value ?? 0;
}

function finite(value: number) {
  if (!Number.isFinite(value)) throw new Error("Formula result is not a finite number.");
  return value;
}

function formatToken(token: Token) {
  return token.type === "number" ? String(token.value) : token.value;
}
