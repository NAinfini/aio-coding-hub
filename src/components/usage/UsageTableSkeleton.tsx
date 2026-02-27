// Usage: 用量表格加载态骨架屏。

import { TABLE_COLUMNS } from "./UsageTableColumns";

const SKELETON_ROWS = 5;

const TH_CLASS =
  "border-b border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-3 py-2.5 backdrop-blur-sm";

export function UsageTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {TABLE_COLUMNS.map((col) => (
              <th key={col.key} className={TH_CLASS}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="animate-pulse">
          {Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
            <tr key={idx} className="align-top">
              {TABLE_COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="border-b border-slate-100 dark:border-slate-700 px-3 py-3.5"
                >
                  <div className={`h-3 ${col.width} rounded-md bg-slate-200 dark:bg-slate-700`} />
                  {col.key === "name" ? (
                    <div className="mt-2 h-3 w-48 rounded-md bg-slate-100 dark:bg-slate-600" />
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
