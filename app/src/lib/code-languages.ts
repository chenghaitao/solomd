import { LanguageDescription } from '@codemirror/language';

/**
 * The languages the code editor can actually highlight.
 *
 * `markdown({ codeLanguages })` hands this to lezer, so this array — not any
 * list maintained elsewhere — is the truth for "what a fence language lights
 * up". `fence-languages.ts` derives the ``` completion list from it rather
 * than keeping a second copy that could drift.
 *
 * Moved out of `Editor.vue` for exactly that reason (issue #297). Behaviour is
 * unchanged: same entries, same order, same supports.
 *
 * Each grammar is a `load()` description, not a `support()`, so it becomes its
 * own chunk and is fetched the first time a fence actually asks for it. All 13
 * grammars up front were ~390 kB of parser tables in the eager bundle — paid
 * by every launch, including documents with no code in them at all. lezer
 * accepts an unresolved description: it skips the nested parse and schedules a
 * fresh one when the promise lands (`ParseContext.getSkippingParser`), so a
 * block highlights a few ms after it scrolls into view instead of never.
 */
export const codeLanguages = [
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'jsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts', 'tsx'],
    load: () =>
      import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true, typescript: true })),
  }),
  LanguageDescription.of({
    name: 'python',
    alias: ['py'],
    load: () => import('@codemirror/lang-python').then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: 'rust',
    alias: ['rs'],
    load: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: 'html',
    load: () => import('@codemirror/lang-html').then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: 'css',
    load: () => import('@codemirror/lang-css').then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: 'json',
    load: () => import('@codemirror/lang-json').then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: 'cpp',
    alias: ['c', 'c++'],
    load: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  }),
  LanguageDescription.of({
    name: 'java',
    load: () => import('@codemirror/lang-java').then((m) => m.java()),
  }),
  LanguageDescription.of({
    name: 'go',
    alias: ['golang'],
    load: () => import('@codemirror/lang-go').then((m) => m.go()),
  }),
  LanguageDescription.of({
    name: 'yaml',
    alias: ['yml'],
    load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'sql',
    load: () => import('@codemirror/lang-sql').then((m) => m.sql()),
  }),
  LanguageDescription.of({
    name: 'xml',
    load: () => import('@codemirror/lang-xml').then((m) => m.xml()),
  }),
];
