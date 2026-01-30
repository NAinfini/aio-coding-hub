// Usage: Preview page for “Workspaces” (CLI configuration sets). Frontend-only: no backend calls, no filesystem operations.

import { ArrowRight, Copy, FolderTree, Layers, Plus, Settings2, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";

function Divider() {
  return (
    <div className="h-px w-full bg-gradient-to-r from-slate-200 via-slate-200/60 to-transparent" />
  );
}

export function WorkspacesPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="工作区"
        subtitle="为 Claude Code 准备可切换的本地配置集合（预览：仅 UI，功能即将支持）"
        actions={
          <>
            <Button variant="primary" disabled title="即将支持：创建工作区并生成模板目录结构">
              <Plus className="h-4 w-4" />
              创建工作区
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/cli-manager")}
              title="前往 CLI 管理页"
            >
              <Settings2 className="h-4 w-4" />
              CLI 管理
              <ArrowRight className="h-4 w-4 opacity-70" />
            </Button>
          </>
        }
      />

      <Card className="relative overflow-hidden border-slate-200 bg-gradient-to-br from-white via-white to-slate-50">
        <div className="pointer-events-none absolute inset-0 opacity-[0.5]" aria-hidden="true">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:18px_18px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,82,255,0.16),transparent_42%),radial-gradient(circle_at_85%_0%,rgba(77,124,255,0.14),transparent_38%)]" />
        </div>

        <div className="relative p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Layers className="h-4 w-4 text-[#0052FF]" />
                为什么需要“工作区”
              </div>
              <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-slate-700">
                现在网络上有很多开源组件/配置（例如
                agents、skills、plugins），但你本地可能已经有一套稳定的配置。 “工作区”希望把它们作为
                <strong>可切换的配置集合</strong>
                管理：保留当前配置、创建干净配置、快速试用、并可回滚。
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-700 shadow-sm backdrop-blur">
              <Shield className="h-3.5 w-3.5 text-emerald-700" />
              V1：前端预览（无读写）
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">隔离试用</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">
                在干净工作区里试用新配置，不污染当前环境。
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">可回滚</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">
                以“复制覆盖”为目标策略：切换前后都可做备份与恢复。
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">结构统一</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">
                用模板目录标准化组织：agents/skills/plugins。
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderTree className="h-4 w-4 text-slate-700" />
            模板结构（预览）
          </div>
          <p className="mt-2 text-sm text-slate-600">
            每个工作区都是一个文件夹，包含最小模板目录。后续会在切换时以“复制覆盖”的方式应用到
            Claude Code 的配置目录。
          </p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <pre className="overflow-auto text-xs leading-relaxed text-slate-700">
              <code>{`workspaces/
  my-clean/
    agents/
    skills/
    plugins/

  my-personal/
    agents/
    skills/
    plugins/`}</code>
            </pre>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              agents/
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              skills/
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              plugins/
            </span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Copy className="h-4 w-4 text-slate-700" />
            即将支持的动作（复制覆盖）
          </div>
          <p className="mt-2 text-sm text-slate-600">
            下面按钮仅用于占位展示。V2 会实现备份/创建/切换/还原，并在操作前给出明确确认与回滚路径。
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button disabled title="即将支持：备份 Claude 配置为一个工作区目录">
              备份为工作区
            </Button>
            <Button disabled title="即将支持：从工作区复制覆盖到 Claude 配置目录">
              切换到该工作区
            </Button>
            <Button disabled title="即将支持：创建一个干净的模板工作区">
              创建干净工作区
            </Button>
            <Button disabled title="即将支持：从备份恢复（复制覆盖回去）">
              从备份还原
            </Button>
          </div>

          <div className="mt-5">
            <Divider />
          </div>

          <ol className="mt-5 space-y-3">
            <li className="flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                1
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">备份当前配置</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  将当前 Claude Code 配置目录复制到某个工作区，确保随时可回滚。
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                2
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">创建干净工作区</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  生成模板目录结构（agents/skills/plugins），用于试用开源配置。
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                3
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">切换（复制覆盖）</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  将目标工作区内容复制覆盖到 Claude Code 配置目录，并记录切换点。
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                4
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">还原</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  从备份工作区恢复（复制覆盖回去），确保试用过程可控、可回滚。
                </div>
              </div>
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
