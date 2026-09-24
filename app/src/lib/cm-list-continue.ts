/**
 * cm-list-continue.ts — Enter continues a list / quote in CodeMirror.
 *
 * The CodeMirror twin of the plain editor's `computeSmartEnter`: CodeMirror is
 * the macOS / Linux / Vim surface (Windows without Vim uses the plain
 * `<textarea>`s), so without this the two toolbar toggles would do nothing
 * outside Windows. The rules themselves live in `list-continue.ts`; this file
 * only turns them into an editor command.
 *
 * A separate module rather than a closure inside `Editor.vue` so the binding
 * can be exercised against a real `EditorView` in a browser harness.
 */

import { keymap, type EditorView } from '@codemirror/view';
import { nextListMarker, type ListContinueOptions } from './list-continue';

/**
 * @param opts read on every keypress, so a toolbar click takes effect without
 *   rebuilding the editor.
 */
export function listContinueKeymap(opts: () => ListContinueOptions) {
  return keymap.of([
    {
      key: 'Enter',
      run: (view: EditorView): boolean => {
        if (view.composing) return false; // the IME candidate window owns Enter
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const line = view.state.doc.lineAt(sel.head);
        const next = nextListMarker(line.text, opts());
        if (next === null) return false; // not a list line: CodeMirror's Enter
        if (next === 'end') {
          // Empty item: drop the marker and leave a blank line behind.
          view.dispatch({
            changes: { from: line.from, to: sel.head, insert: '' },
            selection: { anchor: line.from },
          });
          return true;
        }
        // Insert at the caret, not at the line end: Enter in the middle of an
        // item splits it and continues the list.
        const insert = `\n${next.marker}`;
        view.dispatch({
          changes: { from: sel.head, insert },
          selection: { anchor: sel.head + insert.length },
        });
        return true;
      },
    },
  ]);
}
