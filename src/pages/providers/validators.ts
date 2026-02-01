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

const MAX_LIMIT_USD = 1_000_000_000;

export function parseAndValidateLimitUsd(raw: string, label: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true as const, value: null };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false as const, message: `${label} 必须是数字` };
  }
  if (value < 0) {
    return { ok: false as const, message: `${label} 必须大于等于 0` };
  }
  if (value > MAX_LIMIT_USD) {
    return { ok: false as const, message: `${label} 不能大于 ${MAX_LIMIT_USD}` };
  }
  return { ok: true as const, value };
}

export function parseAndNormalizeResetTimeHms(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true as const, value: "00:00:00" };
  }

  const match = /^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(trimmed);
  if (!match) {
    return { ok: false as const, message: "固定重置时间格式必须为 HH:mm:ss（或 HH:mm）" };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return { ok: false as const, message: "固定重置时间必须在 00:00:00 到 23:59:59 之间" };
  }

  return {
    ok: true as const,
    value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`,
  };
}

const MAX_MODEL_NAME_LEN = 200;

export function validateProviderClaudeModels(input: {
  main_model?: string | null;
  reasoning_model?: string | null;
  haiku_model?: string | null;
  sonnet_model?: string | null;
  opus_model?: string | null;
}) {
  const fields: Array<[label: string, value: string | null | undefined]> = [
    ["主模型", input.main_model],
    ["推理模型(Thinking)", input.reasoning_model],
    ["Haiku 默认模型", input.haiku_model],
    ["Sonnet 默认模型", input.sonnet_model],
    ["Opus 默认模型", input.opus_model],
  ];

  for (const [label, value] of fields) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_MODEL_NAME_LEN) {
      return `${label} 过长（最多 ${MAX_MODEL_NAME_LEN} 字符）`;
    }
  }

  return null;
}
