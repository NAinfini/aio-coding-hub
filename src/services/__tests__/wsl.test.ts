import { describe, expect, it, vi } from "vitest";
import { invokeTauriOrNull } from "../tauriInvoke";
import { wslConfigStatusGet, wslConfigureClients, wslDetect, wslHostAddressGet } from "../wsl";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return { ...actual, invokeTauriOrNull: vi.fn() };
});

describe("services/wsl", () => {
  it("invokes wsl commands with expected parameters", async () => {
    vi.mocked(invokeTauriOrNull).mockResolvedValue(null as any);

    await wslDetect();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("wsl_detect");

    await wslHostAddressGet();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("wsl_host_address_get");

    await wslConfigStatusGet();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("wsl_config_status_get", undefined);

    await wslConfigStatusGet(["Ubuntu"]);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("wsl_config_status_get", {
      distros: ["Ubuntu"],
    });

    await wslConfigureClients({
      targets: { claude: true, codex: false, gemini: true } as any,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("wsl_configure_clients", {
      targets: { claude: true, codex: false, gemini: true },
    });
  });
});
