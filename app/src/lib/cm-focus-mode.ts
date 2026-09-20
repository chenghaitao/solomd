/**
 * Focus mode & typewriter mode extensions for CodeMirror 6.
 *
 *   - focusModeExtension(): dims every visible line EXCEPT the one(s) that
 *     contain the current selection. Dimming is done with a line decoration
 *     carrying the `cm-line-dimmed` class plus an injected theme defining
 *     that class.
 *   - typewriterModeExtension(): keeps the current cursor line vertically
 *     centered in the viewport on every selection change.
 *
 * #316 — the "which lines are a paragraph" rule lives in
 * `lib/focus-paragraph.ts` so the Windows plain-<textarea> editors dim exactly
 * the same lines as this extension does. Do not re-inline it here.
 */

import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

import { activeParagraphLines, type LineSource } from './focus-paragraph';

const dimmedLine = Decoration.line({ class: 'cm-line-dimmed' });

/** The opacity the plain-editor paths have to reproduce with paint. */
export const FOCUS_DIM_OPACITY = 0.35;

const dimTheme = EditorView.theme({
  '.cm-line-dimmed': { opacity: String(FOCUS_DIM_OPACITY) },
});

const focusPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      // Probed lazily: the shared rule asks `isBlank` only for the lines it
      // actually walks, so this stays as cheap as the hand-rolled loop it
      // replaced — no string[] is built for the whole document.
      const source: LineSource = {
        count: doc.lines,
        isBlank: (n) => doc.line(n).text.trim().length === 0,
      };
      const activeLines = activeParagraphLines(
        source,
        view.state.selection.ranges.map((range) => ({
          from: doc.lineAt(range.from).number,
          to: doc.lineAt(range.to).number,
        })),
      );

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          if (!activeLines.has(line.number)) {
            builder.add(line.from, line.from, dimmedLine);
          }
          pos = line.to + 1;
          if (pos > doc.length) break;
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function focusModeExtension() {
  return [dimTheme, focusPlugin];
}

const typewriterPlugin = ViewPlugin.fromClass(
  class {
    constructor(_view: EditorView) {}

    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged) return;
      // Only react to selection moves (docChanged usually implies
      // selectionSet too; filter redundant scrolls).
      if (!update.selectionSet) return;
      // IME composition guard (#108 class): a transaction dispatched while
      // `view.composing` aborts the IME composition on Windows/WebView2 —
      // the same root cause that dropped Sogou pinyin. Typing moves the
      // cursor every keystroke, so without this the typewriter recenter
      // fires a (scroll-only) dispatch mid-composition and can eat the
      // character/punctuation being committed. Selection settles after
      // compositionend, which fires its own update — we recenter then.
      if (update.view.composing) return;
      const view = update.view;
      const head = update.state.selection.main.head;
      // Defer to avoid re-entrant dispatch inside an update pass.
      queueMicrotask(() => {
        try {
          view.dispatch({
            effects: EditorView.scrollIntoView(head, { y: 'center' }),
          });
        } catch {
          /* view may have been destroyed */
        }
      });
    }
  },
);

export function typewriterModeExtension() {
  return [typewriterPlugin];
}
