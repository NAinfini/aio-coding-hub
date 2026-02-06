import { useEffect, useState } from "react";

function isDocumentVisible() {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

export function useDocumentVisibility() {
  const [visible, setVisible] = useState(isDocumentVisible);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      setVisible(document.visibilityState === "visible");
    }

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return visible;
}
