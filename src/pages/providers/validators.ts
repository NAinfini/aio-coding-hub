// Usage: Client-side validators for provider-related forms (toast-based UX).

export function validateProviderName(name: string) {
  if (name.trim()) return null;
  return "名称不能为空";
}

export function validateProviderApiKeyForCreate(apiKey: string) {
  if (apiKey.trim()) return null;
  return "API Key 不能为空（新增 Provider 必填）";
}

export function parseAndValidateCostMultiplier(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false as const, message: "价格倍率必须是数字" };
  }
  if (value <= 0) {
    return { ok: false as const, message: "价格倍率必须大于 0" };
  }
  if (value > 1000) {
    return { ok: false as const, message: "价格倍率不能大于 1000" };
  }
  return { ok: true as const, value };
}

const MAX_MODEL_NAME_LEN = 200;

function matchWildcard(pattern: string, text: string) {
  if (!pattern.includes("*")) return pattern === text;

  const parts = pattern.split("*");
  if (parts.length !== 2) return false;

  const [prefix, suffix] = parts;
  return text.startsWith(prefix) && text.endsWith(suffix);
}

function normalizeNonEmptyString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function supportedModelsHasCoverage(supportedModels: Record<string, boolean>, model: string) {
  if (supportedModels[model]) return true;
  return Object.keys(supportedModels).some(
    (pattern) => supportedModels[pattern] && matchWildcard(pattern, model)
  );
}

export function validateProviderModelConfig(input: {
  supportedModels: Record<string, boolean>;
  modelMapping: Record<string, string>;
}) {
  const supportedModels = input.supportedModels;
  const modelMapping = input.modelMapping;

  const supportedKeys = Object.keys(supportedModels).filter((k) => supportedModels[k]);
  const mappingEntries = Object.entries(modelMapping)
    .map(([k, v]) => [normalizeNonEmptyString(k), normalizeNonEmptyString(v)] as const)
    .filter(([k, v]) => k != null && v != null) as Array<[string, string]>;

  for (const key of supportedKeys) {
    if (key.length > MAX_MODEL_NAME_LEN) {
      return `模型白名单条目过长（最多 ${MAX_MODEL_NAME_LEN} 字符）：${key}`;
    }
  }

  for (const [k, v] of mappingEntries) {
    if (k.length > MAX_MODEL_NAME_LEN) {
      return `模型映射 key 过长（最多 ${MAX_MODEL_NAME_LEN} 字符）：${k}`;
    }
    if (v.length > MAX_MODEL_NAME_LEN) {
      return `模型映射 value 过长（最多 ${MAX_MODEL_NAME_LEN} 字符）：${v}`;
    }
  }

  // Align code-switch-R:
  // only validate mapping targets when BOTH supportedModels and modelMapping are configured.
  if (supportedKeys.length === 0 || mappingEntries.length === 0) return null;

  for (const [externalModel, internalModel] of mappingEntries) {
    if (internalModel.includes("*")) continue;
    if (!supportedModelsHasCoverage(supportedModels, internalModel)) {
      return `模型映射无效：'${externalModel}' -> '${internalModel}'，目标模型 '${internalModel}' 不在 supportedModels 中`;
    }
  }

  return null;
}
