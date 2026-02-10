import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { placeholder as placeholderExt } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { cn } from "../utils/cn";
import { BRAND } from "../constants/colors";

export type CodeEditorLanguage = "toml" | "text";

export type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeEditorLanguage;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  height?: string | number;
  className?: string;
};

export function CodeEditor({
  value,
  onChange,
  language = "text",
  placeholder,
  readOnly = false,
  minHeight = "280px",
  height,
  className,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editorRef.current) return;

    const heightValue = height ? (typeof height === "number" ? `${height}px` : height) : undefined;

    const baseTheme = EditorView.baseTheme({
      ".cm-editor": {
        border: "1px solid rgb(226 232 240)",
        borderRadius: "0.5rem",
        background: "transparent",
      },
      ".cm-editor.cm-focused": {
        outline: "none",
        borderColor: BRAND.accent,
      },
      ".cm-scroller": {
        background: "transparent",
      },
      ".cm-gutters": {
        background: "transparent",
        borderRight: "1px solid rgb(226 232 240)",
        color: "rgb(100 116 139)",
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        background: "rgba(0, 82, 255, 0.18)",
      },
      ".cm-activeLine": {
        background: "rgba(0, 82, 255, 0.06)",
      },
      ".cm-activeLineGutter": {
        background: "rgba(0, 82, 255, 0.06)",
      },
    });

    const sizingTheme = EditorView.theme({
      "&": heightValue ? { height: heightValue } : { minHeight },
      ".cm-scroller": { overflow: "auto" },
      ".cm-content": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: "13px",
      },
    });

    const languageExtension = language === "toml" ? StreamLanguage.define(tomlMode) : [];

    const extensions = [
      basicSetup,
      baseTheme,
      sizingTheme,
      languageExtension,
      EditorState.readOnly.of(readOnly),
      placeholder && !readOnly ? placeholderExt(placeholder) : [],
      !readOnly
        ? EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            onChangeRef.current?.(update.state.doc.toString());
          })
        : [],
      readOnly
        ? EditorView.theme({
            ".cm-cursor, .cm-dropCursor": { border: "none" },
            ".cm-activeLine": { background: "transparent !important" },
            ".cm-activeLineGutter": { background: "transparent !important" },
          })
        : [],
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // value is intentionally omitted: initial doc only; synced via the second useEffect.
    // onChange is accessed via onChangeRef to avoid recreating the editor on callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, minHeight, height, placeholder]);

  useEffect(() => {
    if (!viewRef.current) return;
    if (viewRef.current.state.doc.toString() === value) return;
    viewRef.current.dispatch({
      changes: {
        from: 0,
        to: viewRef.current.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  return <div ref={editorRef} className={cn("w-full", className)} />;
}
