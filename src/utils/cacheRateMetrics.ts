type MaybeNumber = number | null | undefined;

function normalizeTokenCount(value: MaybeNumber) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function computeEffectiveInputTokens(
  cliKey: string,
  inputTokens: MaybeNumber,
  cacheReadTokens: MaybeNumber
) {
  const input = normalizeTokenCount(inputTokens);
  const read = normalizeTokenCount(cacheReadTokens);
  if (cliKey === "codex" || cliKey === "gemini") return Math.max(input - read, 0);
  return input;
}

export function computeCacheHitRateDenomTokens(
  effectiveInputTokens: MaybeNumber,
  cacheCreationTokens: MaybeNumber,
  cacheReadTokens: MaybeNumber
) {
  const effectiveInput = normalizeTokenCount(effectiveInputTokens);
  const creation = normalizeTokenCount(cacheCreationTokens);
  const read = normalizeTokenCount(cacheReadTokens);
  return effectiveInput + creation + read;
}

export function computeCacheHitRate(
  effectiveInputTokens: MaybeNumber,
  cacheCreationTokens: MaybeNumber,
  cacheReadTokens: MaybeNumber
) {
  const read = normalizeTokenCount(cacheReadTokens);
  const denom = computeCacheHitRateDenomTokens(
    effectiveInputTokens,
    cacheCreationTokens,
    cacheReadTokens
  );
  if (denom <= 0) return NaN;
  return read / denom;
}
