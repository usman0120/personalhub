import type { ItemKind, ItemSource, Platform, Rule, RuleCondition } from "./schemas/entities";

export interface RuleInput {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  /** note + selection + description */
  text?: string | null;
  platform?: Platform | null;
  kind?: ItemKind | null;
  source?: ItemSource | null;
}

export interface RuleResult {
  areaId?: string;
  tags: string[];
  kind?: ItemKind;
  status?: "active";
  projectId?: string;
  runAi?: boolean;
  /** ids of rules that matched, in evaluation order */
  rulesApplied: string[];
}

type RuleLike = Pick<Rule, "id" | "enabled" | "order" | "match" | "conditions" | "actions">;

function fieldValue(input: RuleInput, field: RuleCondition["field"]): string {
  const v = input[field];
  return (v ?? "").toString().toLowerCase();
}

function testOne(actual: string, op: RuleCondition["op"], expected: string, field: RuleCondition["field"]): boolean {
  const e = expected.trim().toLowerCase();
  if (!e) return false;
  switch (op) {
    case "equals":
      // domain equality also matches subdomains: "github.com" matches "gist.github.com"
      return actual === e || (field === "domain" && actual.endsWith(`.${e}`));
    case "contains":
      return actual.includes(e);
    case "startsWith":
      return actual.startsWith(e);
    case "endsWith":
      return actual.endsWith(e);
    case "in":
      return testOne(actual, "equals", e, field);
  }
}

export function matchCondition(input: RuleInput, c: RuleCondition): boolean {
  const actual = fieldValue(input, c.field);
  const values = Array.isArray(c.value)
    ? c.value
    : c.op === "in"
      ? c.value.split(",")
      : [c.value];
  if (!actual && c.op !== "in") return false;
  return values.some((v) => testOne(actual, c.op, v, c.field));
}

export function matchRule(input: RuleInput, rule: RuleLike): boolean {
  if (!rule.conditions.length) return false;
  return rule.match === "all"
    ? rule.conditions.every((c) => matchCondition(input, c))
    : rule.conditions.some((c) => matchCondition(input, c));
}

/**
 * Deterministic rules engine. Rules run in `order`; every matching rule applies; later rules
 * override single-value fields; tags are unioned. No user regex (ReDoS risk).
 */
export function applyRules(input: RuleInput, rules: readonly RuleLike[]): RuleResult {
  const result: RuleResult = { tags: [], rulesApplied: [] };
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.order - b.order);
  for (const rule of sorted) {
    if (!matchRule(input, rule)) continue;
    const a = rule.actions;
    result.rulesApplied.push(rule.id);
    if (a.setAreaId) result.areaId = a.setAreaId;
    if (a.setKind) result.kind = a.setKind;
    if (a.setStatus) result.status = a.setStatus;
    if (a.setProjectId) result.projectId = a.setProjectId;
    if (a.runAi !== undefined) result.runAi = a.runAi;
    for (const t of a.addTags ?? []) if (t && !result.tags.includes(t)) result.tags.push(t);
  }
  return result;
}
