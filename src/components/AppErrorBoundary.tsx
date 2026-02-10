import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportRenderError } from "../services/frontendErrorReporter";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRenderError(error, { componentStack: errorInfo.componentStack ?? undefined });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-800 p-6 text-slate-900 dark:text-slate-100">
          <div className="max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <div className="text-base font-semibold">页面渲染异常</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              已记录错误日志，请重启应用后重试。如果问题重复出现，请在"设置 →
              数据管理"打开数据目录并提供 logs 文件。
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
