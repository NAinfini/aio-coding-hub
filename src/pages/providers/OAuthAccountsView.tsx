// Usage: Rendered by ProvidersPage when `view === "oauth"`.

import { useState } from "react";
import { CLIS, cliLongLabel } from "../../constants/clis";
import type { CliKey } from "../../services/providers";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { OAuthAccountsPanel } from "./OAuthAccountsPanel";

export type OAuthAccountsViewProps = {
  activeCli: CliKey;
  setActiveCli: (cliKey: CliKey) => void;
};

export function OAuthAccountsView({ activeCli, setActiveCli }: OAuthAccountsViewProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CLIS.map((cli) => (
            <Button
              key={cli.key}
              onClick={() => setActiveCli(cli.key)}
              variant={activeCli === cli.key ? "primary" : "secondary"}
              size="sm"
            >
              {cli.name}
            </Button>
          ))}
        </div>
        <Button onClick={() => setAddDialogOpen(true)} variant="secondary" size="sm">
          添加 OAuth
        </Button>
      </div>

      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <OAuthAccountsPanel cliKey={activeCli} active showAddSection={false} />
      </div>

      <Dialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        title={`添加 OAuth 账号 · ${cliLongLabel(activeCli)}`}
        description="填写账号标签后可浏览器登录，或手动录入令牌。"
        className="max-w-5xl"
      >
        <OAuthAccountsPanel
          cliKey={activeCli}
          active={addDialogOpen}
          showAccountsList={false}
          onAdded={() => setAddDialogOpen(false)}
        />
      </Dialog>
    </div>
  );
}
