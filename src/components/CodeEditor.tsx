import { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';

type LanguageKey =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'text'
  | 'sql';

const languageExtensions: Record<LanguageKey, () => Extension> = {
  javascript: () => javascript({ jsx: true, typescript: false }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  python: () => python(),
  json: () => json(),
  markdown: () => markdown(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  text: () => [],
};

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      color: '#e2e8f0',
      borderRadius: '14px',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      overflow: 'hidden',
    },
    '.cm-content': {
      fontFamily:
        "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: '13.5px',
      lineHeight: '1.5',
      padding: '16px',
    },
    '.cm-scroller': {
      fontFamily:
        "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      background:
        'radial-gradient(circle at top left, rgba(148, 163, 184, 0.12), transparent 55%), rgba(15, 23, 42, 0.75)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#94a3b8',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(59, 130, 246, 0.12)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(96, 165, 250, 0.25)',
    },
  },
  { dark: true },
);

function resolveLanguage(language: string | undefined): LanguageKey {
  if (!language) return 'text';
  const lower = language.toLowerCase();
  if (lower.includes('typescript') || lower === 'ts' || lower === 'tsx') return 'typescript';
  if (lower.includes('javascript') || lower === 'js' || lower === 'jsx') return 'javascript';
  if (lower === 'py' || lower.includes('python')) return 'python';
  if (lower.includes('json')) return 'json';
  if (lower.includes('markdown') || lower === 'md') return 'markdown';
  if (lower.includes('html')) return 'html';
  if (lower.includes('css')) return 'css';
  if (lower.includes('sql')) return 'sql';
  return 'text';
}

export interface CodeEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  minHeight?: number;
  className?: string;
}

export function CodeEditor({
  value,
  language,
  readOnly = false,
  onChange,
  minHeight = 160,
  className,
}: CodeEditorProps) {
  const resolvedLanguage = resolveLanguage(language);

  const extensions = useMemo(() => {
    const base: Extension[] = [
      basicSetup({
        foldGutter: false,
        dropCursor: true,
        allowMultipleSelections: true,
        highlightActiveLine: true,
        indentOnInput: true,
      }),
      editorTheme,
      languageExtensions[resolvedLanguage](),
    ];

    if (readOnly) {
      base.push(EditorState.readOnly.of(true));
      base.push(EditorView.editable.of(false));
    }

    if (minHeight) {
      base.push(
        EditorView.theme({
          '.cm-editor': {
            minHeight: `${minHeight}px`,
          },
        }),
      );
    }

    return base;
  }, [minHeight, readOnly, resolvedLanguage]);

  const handleChange = useCallback(
    (nextValue: string) => {
      if (readOnly) return;
      onChange?.(nextValue);
    },
    [onChange, readOnly],
  );

  const containerClass = ['code-editor-container', className].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <CodeMirror
        value={value}
        theme={editorTheme}
        extensions={extensions}
        basicSetup={false}
        readOnly={readOnly}
        height={`${minHeight}px`}
        onChange={handleChange}
      />
    </div>
  );
}
