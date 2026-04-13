import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { rust } from '@codemirror/lang-rust';
import { oneDark } from '@codemirror/theme-one-dark';
import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const langByExt: Record<string, () => Extension> = {
  ts: () => javascript({ jsx: true, typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  js: () => javascript({ jsx: true }),
  jsx: () => javascript({ jsx: true }),
  json: () => json(),
  md: () => markdown(),
  rs: () => rust(),
};

function getLangExtension(filename: string): Extension[] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const factory = langByExt[ext];
  return factory ? [factory()] : [];
}

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    height: '100%',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  '.cm-gutters': {
    border: 'none',
  },
});

interface CodeEditorProps {
  value: string;
  filename: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}

export function CodeEditor({ value, filename, readOnly = false, onChange, className }: CodeEditorProps) {
  const extensions: Extension[] = [
    baseTheme,
    ...getLangExtension(filename),
    EditorView.lineWrapping,
  ];

  if (readOnly) {
    extensions.push(EditorView.editable.of(false));
  }

  const props: ReactCodeMirrorProps = {
    value,
    theme: oneDark,
    extensions,
    basicSetup: {
      lineNumbers: true,
      foldGutter: true,
      bracketMatching: true,
      closeBrackets: !readOnly,
      autocompletion: false,
      highlightActiveLine: !readOnly,
      highlightSelectionMatches: true,
      indentOnInput: !readOnly,
    },
  };

  if (onChange) {
    props.onChange = onChange;
  }

  return (
    <div className={className ?? 'h-full'} style={{ minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <CodeMirror {...props} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} height="100%" />
      </div>
    </div>
  );
}
