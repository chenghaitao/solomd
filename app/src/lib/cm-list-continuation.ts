/**
 * cm-list-continuation.ts — Enter continues a list / quote in CodeMirror.
 *
 * Fork addition. CodeMirror is the macOS / Linux / Vim surface (Windows
 * without Vim uses the plain `<textarea>`s), so without this the two toolbar
 * toggles would do nothing outside Windows — and `insertNewlineContinueMarkup`
 * is not wired anywhere in this app to inherit the behaviour from.
 *
 * The rules themselves live in `list-continuation.ts`; this file only turns
 * them into an editor command. Kept out of `Editor.vue` so the binding can be
 * exercised against a real `EditorView` in a browser harness.
 */

import { keymap, type EditorView } from '@codemirror/view';
import { computeListContinuation, type ListContinuationOptions } from './list-continuation';

/**
 * @param opts read on every keypress, so a toolbar click takes effect without
 *   rebuilding the editor.
 */
export function listContinuationKeymap(opts: () => ListContinuationOptions) {
  return keymap.of([
    {
      key: 'Enter',
      run: (view: EditorView): boolean => {
        if (view.composing) return false; // the IME candidate window owns Enter
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const line = view.state.doc.lineAt(sel.head);
        // The same rule the textarea paths run, applied to this line only:
        // replacing the line's own range keeps the change minimal and lets the
        // caret be reported relative to it. Feeding it the line rather than the
        // whole document is also why the fence guard (`insideFence`) cannot see
        // a fence opened above — one line carries no such context.
        const edit = computeListContinuation(
          line.text,
          sel.head - line.from,
          sel.head - line.from,
          opts(),
        );
        if (!edit) return false; // not a list line: CodeMirror's own Enter
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: edit.value },
          selection: { anchor: line.from + edit.caret },
        });
        return true;
      },
    },
  ]);
}
