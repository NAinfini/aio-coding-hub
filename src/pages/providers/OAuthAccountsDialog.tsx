import { cliLongLabel } from "../../constants/clis";
import type { CliKey } from "../../services/providers";
import { Dialog } from "../../ui/Dialog";
import { OAuthAccountsPanel } from "./OAuthAccountsPanel";

export type OAuthAccountsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliKey: CliKey;
};

export function OAuthAccountsDialog({ open, onOpenChange, cliKey }: OAuthAccountsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`OAuth 账号管理 · ${cliLongLabel(cliKey)}`}
      description="支持浏览器登录添加、手动录入、编辑、刷新与删除。"
      className="max-w-5xl"
    >
      <OAuthAccountsPanel cliKey={cliKey} active={open} />
    </Dialog>
  );
}
