import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { hasTauriRuntime } from "./tauriInvoke";

async function copyTextFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("CLIPBOARD_COPY_FAILED");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyText(text: string) {
  if (hasTauriRuntime()) {
    try {
      await writeText(text);
      return;
    } catch {
      // fallback below
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }

  await copyTextFallback(text);
}
