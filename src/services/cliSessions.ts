import { invokeService } from "./invokeServiceCommand";

export type CliSessionsSource = "claude" | "codex";

export type CliSessionsProjectSummary = {
  source: CliSessionsSource;
  id: string;
  display_path: string;
  short_name: string;
  session_count: number;
  last_modified: number | null;
  model_provider: string | null;
};

export type CliSessionsSessionSummary = {
  source: CliSessionsSource;
  session_id: string;
  file_path: string;
  first_prompt: string | null;
  message_count: number;
  created_at: number | null;
  modified_at: number | null;
  git_branch: string | null;
  project_path: string | null;
  is_sidechain: boolean | null;
  cwd: string | null;
  model_provider: string | null;
  cli_version: string | null;
};

export type CliSessionsDisplayContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
  | { type: "reasoning"; text: string }
  | { type: "function_call"; name: string; arguments: string; call_id: string }
  | { type: "function_call_output"; call_id: string; output: string };

export type CliSessionsDisplayMessage = {
  uuid: string | null;
  role: string;
  timestamp: string | null;
  model: string | null;
  content: CliSessionsDisplayContentBlock[];
};

export type CliSessionsPaginatedMessages = {
  messages: CliSessionsDisplayMessage[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
};

export async function cliSessionsProjectsList(source: CliSessionsSource) {
  return invokeService<CliSessionsProjectSummary[]>(
    "读取会话项目列表失败",
    "cli_sessions_projects_list",
    {
      source,
    }
  );
}

export async function cliSessionsSessionsList(source: CliSessionsSource, projectId: string) {
  return invokeService<CliSessionsSessionSummary[]>(
    "读取会话列表失败",
    "cli_sessions_sessions_list",
    {
      source,
      projectId,
    }
  );
}

export async function cliSessionsMessagesGet(input: {
  source: CliSessionsSource;
  file_path: string;
  page: number;
  page_size: number;
  from_end: boolean;
}) {
  return invokeService<CliSessionsPaginatedMessages>(
    "读取会话消息失败",
    "cli_sessions_messages_get",
    {
      source: input.source,
      filePath: input.file_path,
      page: input.page,
      pageSize: input.page_size,
      fromEnd: input.from_end,
    }
  );
}
