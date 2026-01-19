# Pages ↔ Services ↔ Tauri Commands（契约映射）

目标：让前端页面与后端 `#[tauri::command]` 的对应关系可读、可维护，并把命令契约稳定地固化在 `src/services/*` 与 `src-tauri/src/commands/*`。

## 约定（推荐）

- **页面只依赖 services**：`src/pages/*` 不直接 `invoke()`，而是调用 `src/services/*`。
- **services 是命令契约层**：`src/services/<feature>.ts` 对应后端 `src-tauri/src/commands/<feature>.rs`。
- **commands 层唯一允许出现 `#[tauri::command]`**：后端命令入口统一集中在 `src-tauri/src/commands/*`。
- **命令名稳定**：`invoke("providers_list", ...)` 这类字符串视为 API 契约，重构时禁止无意改名。

## 映射表（高层）

| Page                   | 主要 services                                                                | 主要后端 commands 前缀 / 模块                                                          |
| ---------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `HomePage.tsx`         | `requestLogs`, `gateway`, `providers`, `sortModes`, `usage`                  | `request_logs_*`, `gateway_*`, `providers_*`, `sort_modes_*`, `usage_*`                |
| `ProvidersPage.tsx`    | `providers`, `sortModes`                                                     | `providers_*`, `sort_modes_*`                                                          |
| `PromptsPage.tsx`      | `prompts`, `startup`                                                         | `prompts_*`, `prompt_*`（含 `prompts_default_sync_from_files`）                        |
| `SettingsPage.tsx`     | `settings*`, `gateway`, `cliProxy`, `modelPrices`, `usage`, `dataManagement` | `settings_*`, `gateway_*`, `cli_proxy_*`, `model_prices_*`, `usage_*`, `app_data_*`    |
| `CliManagerPage.tsx`   | `cliManager`, `settings*`, `cliProxy`                                        | `cli_manager_*`, `settings_*`, `cli_proxy_*`                                           |
| `McpPage.tsx`          | `mcp`                                                                        | `mcp_servers_list`, `mcp_server_*`, `mcp_parse_json`, `mcp_import_servers`             |
| `SkillsPage.tsx`       | `skills`                                                                     | `skills_installed_list`, `skills_local_list`, `skill_*`                                |
| `SkillsMarketPage.tsx` | `skills`                                                                     | `skills_discover_available`, `skill_install`, `skill_repos_*`, `skills_installed_list` |
| `ConsolePage.tsx`      | `consoleLog`, `requestLogs`, `traceStore`                                    | `request_logs_*`（含 trace 查询）、`request_attempt_logs_by_trace_id`                  |
| `UsagePage.tsx`        | `usage`                                                                      | `usage_summary_v2`, `usage_leaderboard_v2`                                             |

> 说明：这里按“命令名前缀/模块”聚合，便于重构时先定位 `src-tauri/src/commands/<feature>.rs`，再沿着调用链下钻到领域实现（例如 `providers.rs`、`usage_stats.rs` 等）。
