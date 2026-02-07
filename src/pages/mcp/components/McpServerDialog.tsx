import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMcpServerUpsertMutation } from "../../../query/mcp";
import { logToConsole } from "../../../services/consoleLog";
import { mcpParseJson, type McpServerSummary, type McpTransport } from "../../../services/mcp";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { cn } from "../../../utils/cn";

export type McpServerDialogProps = {
  workspaceId: number;
  open: boolean;
  editTarget: McpServerSummary | null;
  onOpenChange: (open: boolean) => void;
};

type McpDialogDraft = {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  url: string;
  headers: Record<string, string>;
};

function parseLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseKeyValueLines(text: string, hint: string) {
  const out: Record<string, string> = {};
  const lines = parseLines(text);
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) {
      throw new Error(`${hint} 格式错误：请使用 KEY=VALUE（示例：FOO=bar）`);
    }
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) throw new Error(`${hint} 格式错误：KEY 不能为空`);
    out[k] = v;
  }
  return out;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readStringMap(value: unknown): Record<string, string> {
  const object = asObject(value);
  if (!object) return {};

  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(object)) {
    if (typeof val === "string") {
      out[key] = val;
    }
  }
  return out;
}

function inferTransport(spec: Record<string, unknown>): McpTransport {
  const transportValue =
    readString(spec.type) || readString(spec.transport) || readString(spec.transport_type);
  const transport = transportValue.trim().toLowerCase();
  if (transport === "http" || transport === "sse") return "http";
  if (transport === "stdio") return "stdio";

  if (
    readString(spec.url).trim() ||
    readString(spec.httpUrl).trim() ||
    asObject(spec.headers) ||
    asObject(spec.http_headers) ||
    asObject(spec.httpHeaders)
  ) {
    return "http";
  }

  return "stdio";
}

function selectCandidate(
  root: unknown
): { nameHint: string; entry: Record<string, unknown> } | null {
  const rootObj = asObject(root);
  if (rootObj) {
    const mcpServers = asObject(rootObj.mcpServers);
    if (mcpServers) {
      const first = Object.entries(mcpServers)[0];
      if (first) {
        const [nameHint, entry] = first;
        const entryObj = asObject(entry);
        if (entryObj) return { nameHint, entry: entryObj };
      }
    }

    for (const cliKey of ["claude", "codex", "gemini"] as const) {
      const cliSection = asObject(rootObj[cliKey]);
      const cliServers = asObject(cliSection?.servers);
      if (!cliServers) continue;

      const first = Object.entries(cliServers)[0];
      if (!first) continue;

      const [nameHint, entry] = first;
      const entryObj = asObject(entry);
      if (entryObj) return { nameHint, entry: entryObj };
    }
  }

  if (Array.isArray(root)) {
    const first = root.map((item) => asObject(item)).find(Boolean);
    if (first) {
      return { nameHint: readString(first.name), entry: first };
    }
  }

  if (rootObj) {
    return { nameHint: readString(rootObj.name), entry: rootObj };
  }

  return null;
}

function parseJsonDraftFallback(jsonText: string): McpDialogDraft {
  const root = JSON.parse(jsonText) as unknown;
  const candidate = selectCandidate(root);
  if (!candidate) {
    throw new Error("JSON 结构不支持：请提供 mcpServers、code-switch 格式或单条 server 配置");
  }

  const spec =
    asObject(candidate.entry.server) ?? asObject(candidate.entry.spec) ?? candidate.entry;
  const transport = inferTransport(spec);
  const command = readString(spec.command).trim();
  const url = (readString(spec.url) || readString(spec.httpUrl)).trim();

  if (transport === "stdio" && !command) {
    throw new Error("JSON 缺少 stdio command 字段");
  }

  if (transport === "http" && !url) {
    throw new Error("JSON 缺少 http url 字段");
  }

  const name =
    candidate.nameHint.trim() ||
    readString(candidate.entry.name).trim() ||
    readString(spec.name).trim();

  return {
    name,
    transport,
    command,
    args: readStringArray(spec.args),
    env: readStringMap(spec.env),
    cwd: readString(spec.cwd).trim(),
    url,
    headers: readStringMap(spec.headers ?? spec.http_headers ?? spec.httpHeaders),
  };
}

function fromServerSummary(
  server: Pick<
    McpServerSummary,
    "name" | "transport" | "command" | "args" | "env" | "cwd" | "url" | "headers"
  >
): McpDialogDraft {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command ?? "",
    args: server.args ?? [],
    env: server.env ?? {},
    cwd: server.cwd ?? "",
    url: server.url ?? "",
    headers: server.headers ?? {},
  };
}

function mapToLines(input: Record<string, string>) {
  return Object.entries(input)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export function McpServerDialog({
  workspaceId,
  open,
  editTarget,
  onOpenChange,
}: McpServerDialogProps) {
  const upsertMutation = useMcpServerUpsertMutation(workspaceId);
  const saving = upsertMutation.isPending;

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [cwd, setCwd] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      const draft = fromServerSummary(editTarget);
      setName(draft.name);
      setTransport(draft.transport);
      setCommand(draft.command);
      setArgsText(draft.args.join("\n"));
      setEnvText(mapToLines(draft.env));
      setCwd(draft.cwd);
      setUrl(draft.url);
      setHeadersText(mapToLines(draft.headers));
      setJsonText("");
      return;
    }

    setName("");
    setTransport("stdio");
    setCommand("");
    setArgsText("");
    setEnvText("");
    setCwd("");
    setUrl("");
    setHeadersText("");
    setJsonText("");
  }, [open, editTarget]);

  const transportHint = transport === "http" ? "HTTP（远程服务）" : "STDIO（本地命令）";

  function applyDraft(draft: McpDialogDraft) {
    setName((prev) => (draft.name.trim() ? draft.name.trim() : prev.trim() ? prev : "MCP Server"));
    setTransport(draft.transport);
    setCommand(draft.command);
    setArgsText(draft.args.join("\n"));
    setEnvText(mapToLines(draft.env));
    setCwd(draft.cwd);
    setUrl(draft.url);
    setHeadersText(mapToLines(draft.headers));
  }

  async function fillFromJson() {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      toast("请先粘贴 JSON");
      return;
    }

    try {
      const parsed = await mcpParseJson(trimmed);
      if (parsed?.servers?.length) {
        const server = parsed.servers[0];
        applyDraft(
          fromServerSummary({
            name: server.name,
            transport: server.transport,
            command: server.command,
            args: server.args,
            env: server.env,
            cwd: server.cwd,
            url: server.url,
            headers: server.headers,
          })
        );
        toast("已从 JSON 填充字段");
        return;
      }

      const fallback = parseJsonDraftFallback(trimmed);
      applyDraft(fallback);
      toast("已从 JSON 填充字段");
    } catch (primaryErr) {
      try {
        const fallback = parseJsonDraftFallback(trimmed);
        applyDraft(fallback);
        toast("已从 JSON 填充字段");
      } catch (fallbackErr) {
        const message = String(fallbackErr || primaryErr);
        logToConsole("error", "从 JSON 填充 MCP 字段失败", { error: message });
        toast(`JSON 解析失败：${message}`);
      }
    }
  }

  async function save() {
    if (saving) return;
    try {
      const next = await upsertMutation.mutateAsync({
        serverId: editTarget?.id ?? null,
        serverKey: editTarget?.server_key ?? "",
        name,
        transport,
        command: transport === "stdio" ? command : null,
        args: transport === "stdio" ? parseLines(argsText) : [],
        env: transport === "stdio" ? parseKeyValueLines(envText, "Env") : {},
        cwd: transport === "stdio" ? (cwd.trim() ? cwd : null) : null,
        url: transport === "http" ? url : null,
        headers: transport === "http" ? parseKeyValueLines(headersText, "Headers") : {},
      });

      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      logToConsole("info", editTarget ? "更新 MCP Server" : "新增 MCP Server", {
        id: next.id,
        server_key: next.server_key,
        transport: next.transport,
      });

      toast(editTarget ? "已更新" : "已新增");
      onOpenChange(false);
    } catch (err) {
      logToConsole("error", "保存 MCP Server 失败", { error: String(err) });
      toast(`保存失败：${String(err)}`);
    }
  }

  return (
    <Dialog
      open={open}
      title={editTarget ? "编辑 MCP 服务" : "添加 MCP 服务"}
      description={
        editTarget ? "修改后会自动同步到所有 CLI 的当前工作区配置文件。" : `类型：${transportHint}`
      }
      onOpenChange={onOpenChange}
      className="max-w-3xl"
    >
      <div className="grid gap-4">
        {!editTarget ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">快速导入 JSON（可选）</div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.currentTarget.value)}
              placeholder='示例：{"type":"stdio","command":"uvx","args":["mcp-server-fetch"]}'
              rows={4}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" onClick={() => void fillFromJson()} disabled={saving}>
                从 JSON 填充
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50/60 dark:from-slate-800 dark:to-slate-800/60 p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">基础信息</div>
          </div>

          <div className="mt-3">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">名称</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="例如：Fetch 工具"
              className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">类型</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">二选一</div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "stdio",
                    title: "STDIO",
                    desc: "本地命令（通过 command/args 启动）",
                    icon: "⌘",
                  },
                  {
                    value: "http",
                    title: "HTTP",
                    desc: "远程服务（通过 URL 调用）",
                    icon: "⇄",
                  },
                ] as const
              ).map((item) => (
                <label key={item.value} className="relative block">
                  <input
                    type="radio"
                    name="mcp-transport"
                    value={item.value}
                    checked={transport === item.value}
                    onChange={() => setTransport(item.value)}
                    className="peer sr-only"
                  />
                  <div
                    className={cn(
                      "flex h-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 shadow-sm transition-all",
                      "bg-white dark:bg-slate-800",
                      "hover:border-slate-300 hover:bg-slate-50/60 dark:hover:border-slate-600 dark:hover:bg-slate-700",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-[#0052FF]/20 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-slate-900",
                      "peer-checked:border-[#0052FF]/60 peer-checked:bg-[#0052FF]/5 peer-checked:shadow dark:peer-checked:bg-[#0052FF]/10"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border bg-white dark:bg-slate-800 shadow-sm",
                        "border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-300",
                        "peer-checked:border-[#0052FF]/40 peer-checked:bg-[#0052FF]/10 peer-checked:text-[#0052FF]"
                      )}
                    >
                      <span className="text-sm font-semibold">{item.icon}</span>
                    </div>

                    <div className="min-w-0 pr-7">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.desc}
                      </div>
                    </div>

                    <div className="pointer-events-none absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] text-white shadow-sm transition peer-checked:border-[#0052FF] peer-checked:bg-[#0052FF]">
                      ✓
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {transport === "stdio" ? (
          <>
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Command</div>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.currentTarget.value)}
                placeholder="例如：npx"
                className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Args（每行一个）</div>
                <textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.currentTarget.value)}
                  placeholder={`例如：\n-y\n@modelcontextprotocol/server-fetch`}
                  rows={6}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Env（每行 KEY=VALUE）</div>
                <textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.currentTarget.value)}
                  placeholder={`例如：\nFOO=bar\nTOKEN=xxx`}
                  rows={6}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">CWD（可选）</div>
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.currentTarget.value)}
                placeholder="例如：/Users/xxx/project"
                className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">URL</div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                placeholder="例如：https://example.com/mcp"
                className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Headers（每行 KEY=VALUE）</div>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.currentTarget.value)}
                placeholder={`例如：\nAuthorization=Bearer xxx\nX-Env=dev`}
                rows={6}
                className="mt-2 w-full resize-y rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 shadow-sm outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={save}
            variant="primary"
            disabled={saving || (transport === "stdio" ? !command.trim() : !url.trim())}
          >
            {saving ? "保存中…" : "保存并同步"}
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={saving}>
            取消
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
