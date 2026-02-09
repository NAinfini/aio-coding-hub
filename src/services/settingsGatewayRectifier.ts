import { invokeService } from "./invokeServiceCommand";
import type { AppSettings } from "./settings";

export type GatewayRectifierSettingsPatch = {
  intercept_anthropic_warmup_requests: boolean;
  enable_thinking_signature_rectifier: boolean;
  enable_response_fixer: boolean;
  response_fixer_fix_encoding: boolean;
  response_fixer_fix_sse_format: boolean;
  response_fixer_fix_truncated_json: boolean;
  response_fixer_max_json_depth: number;
  response_fixer_max_fix_size: number;
};

export async function settingsGatewayRectifierSet(input: GatewayRectifierSettingsPatch) {
  return invokeService<AppSettings>("保存网关修复配置失败", "settings_gateway_rectifier_set", {
    interceptAnthropicWarmupRequests: input.intercept_anthropic_warmup_requests,
    enableThinkingSignatureRectifier: input.enable_thinking_signature_rectifier,
    enableResponseFixer: input.enable_response_fixer,
    responseFixerFixEncoding: input.response_fixer_fix_encoding,
    responseFixerFixSseFormat: input.response_fixer_fix_sse_format,
    responseFixerFixTruncatedJson: input.response_fixer_fix_truncated_json,
    responseFixerMaxJsonDepth: input.response_fixer_max_json_depth,
    responseFixerMaxFixSize: input.response_fixer_max_fix_size,
  });
}
