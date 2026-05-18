type Token =
  | { type: "number"; value: number }
  | { type: "metric"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

type ParseState = {
  tokens: Token[];
  index: number;
  rawMetrics: Record<string, unknown>;
};

export function calculateCustomFormulaScore(formula: string, rawMetrics: Record<string, unknown>) {
  const tokens = tokenizeFormula(formula);
  const state: ParseState = { tokens, index: 0, rawMetrics };
  const value = parseExpression(state);

  if (state.index < tokens.length) {
    throw new Error(`Unexpected token near "${formatToken(tokens[state.index])}".`);
  }

  if (!Number.isFinite(value)) {
    throw new Error("Formula result is not a finite number.");
  }

  return value;
}

export function validateCustomFormula(formula: string) {
  if (!formula.trim()) return { ok: true as const };

  try {
    calculateCustomFormulaScore(formula, {});
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

function tokenizeFormula(formula: string) {
  const tokens: Token[] = [];
  let index = 0;

  while (index < formula.length) {
    const char = formula[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      index += 1;
      while (index < formula.length && /[0-9.]/.test(formula[index])) index += 1;

      const value = Number(formula.slice(start, index));
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${formula.slice(start, index)}".`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (char === "{") {
      const end = formula.indexOf("}", index + 1);
      if (end === -1) throw new Error("Metric reference is missing a closing brace.");

      const value = normalizeFormulaMetric(formula.slice(index + 1, end));
      if (!value) throw new Error("Metric reference cannot be empty.");
      tokens.push({ type: "metric", value });
      index = end + 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character "${char}". Use numbers, +, -, *, /, parentheses, and {metric} fields.`);
  }

  if (tokens.length === 0) throw new Error("Formula is empty.");
  return tokens;
}

function parseExpression(state: ParseState) {
  let value = parseTerm(state);

  while (matchOperator(state, "+") || matchOperator(state, "-")) {
    const operator = previous(state) as Extract<Token, { type: "operator" }>;
    const right = parseTerm(state);
    value = operator.value === "+" ? value + right : value - right;
  }

  return value;
}

function parseTerm(state: ParseState) {
  let value = parseFactor(state);

  while (matchOperator(state, "*") || matchOperator(state, "/")) {
    const operator = previous(state) as Extract<Token, { type: "operator" }>;
    const right = parseFactor(state);

    if (operator.value === "/" && right === 0) {
      throw new Error("Division by zero.");
    }

    value = operator.value === "*" ? value * right : value / right;
  }

  return value;
}

function parseFactor(state: ParseState): number {
  if (matchOperator(state, "+")) return parseFactor(state);
  if (matchOperator(state, "-")) return -parseFactor(state);

  const token = advance(state);
  if (!token) throw new Error("Formula ended unexpectedly.");

  if (token.type === "number") return token.value;
  if (token.type === "metric") return numericMetric(state.rawMetrics[token.value]);

  if (token.type === "paren" && token.value === "(") {
    const value = parseExpression(state);
    const closing = advance(state);
    if (!closing || closing.type !== "paren" || closing.value !== ")") {
      throw new Error("Missing closing parenthesis.");
    }
    return value;
  }

  throw new Error(`Unexpected token "${formatToken(token)}".`);
}

function matchOperator(state: ParseState, operator: "+" | "-" | "*" | "/") {
  const token = state.tokens[state.index];
  if (!token || token.type !== "operator" || token.value !== operator) return false;
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

function numericMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function formatToken(token: Token) {
  return token.type === "number" ? String(token.value) : token.value;
}
