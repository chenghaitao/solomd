import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const { markdownToDocxBlob } = await import('./docx-export.ts');

// #553 — a minimal Word "reference doc": only the parts the merge reads.
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults/><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '</w:styles>';
const PG_SZ = '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>';
const PG_MAR = '<w:pgMar w:top="2000" w:right="1200" w:bottom="2000" w:left="1200"/>';
const FONT_TABLE_XML = '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';
const THEME_XML = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>';

function referenceDocx(): Uint8Array {
  const templateDocXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body><w:p/><w:sectPr>${PG_SZ}${PG_MAR}</w:sectPr></w:body></w:document>`;
  return zipSync(
    {
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
      'word/document.xml': strToU8(templateDocXml),
      'word/styles.xml': strToU8(STYLES_XML),
      'word/fontTable.xml': strToU8(FONT_TABLE_XML),
      'word/theme/theme1.xml': strToU8(THEME_XML),
    },
    { level: 6 },
  );
}

async function generatedParts(reference?: Uint8Array | null): Promise<Record<string, Uint8Array>> {
  const blob = await markdownToDocxBlob(
    '# 标题\n\n正文内容 Body text',
    '测试文档',
    undefined,
    'plain',
    'Contents',
    null,
    reference ?? null,
  );
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

test('#553 a reference .docx replaces styles/fonts/theme and the page setup', async () => {
  const parts = await generatedParts(referenceDocx());
  const docXml = strFromU8(parts['word/document.xml']);
  const mergedStyles = strFromU8(parts['word/styles.xml']);

  // The template's stylesheet is the base; generated-only styles are appended
  // after it (see #603) instead of replacing it outright.
  assert.ok(
    mergedStyles.startsWith(STYLES_XML.replace('</w:styles>', '')),
    'template stylesheet is kept as the base',
  );
  assert.ok(mergedStyles.includes('w:styleId="Normal"'), 'template Normal kept');
  assert.equal(
    (mergedStyles.match(/<w:name w:val="Normal"\/>/g) || []).length,
    1,
    'the generated default style must not be appended a second time',
  );
  assert.equal(strFromU8(parts['word/fontTable.xml']), FONT_TABLE_XML);
  assert.equal(strFromU8(parts['word/theme/theme1.xml']), THEME_XML);
  assert.ok(docXml.includes(PG_SZ), 'paper size comes from the template');
  assert.ok(docXml.includes(PG_MAR), 'margins come from the template');
  assert.ok(docXml.includes('正文内容 Body text'), 'the generated content is untouched');
  // The template's placeholder must never replace the generated manifest.
  const contentTypes = strFromU8(parts['[Content_Types].xml']);
  assert.ok(contentTypes.includes('wordprocessingml'));
  assert.ok(!contentTypes.includes('<Types/>'));
});

test('#553 a non-docx reference is ignored instead of failing the export', async () => {
  const parts = await generatedParts(new Uint8Array([1, 2, 3, 4]));
  assert.notEqual(strFromU8(parts['word/styles.xml']), STYLES_XML);
  assert.ok(strFromU8(parts['word/document.xml']).includes('正文内容 Body text'));
});

test('#553 with no reference the package is byte-for-byte the normal output', async () => {
  const without = await generatedParts(null);
  const baseline = await generatedParts(undefined);
  assert.deepEqual(
    Array.from(without['word/styles.xml']),
    Array.from(baseline['word/styles.xml']),
  );
  assert.ok(strFromU8(without['word/document.xml']).includes('正文内容 Body text'));
});

// #603 — Word/WPS templates number their heading style ids (`1`, `2`, …) while
// the `docx` library writes `Heading1`: the references have to be re-pointed,
// or Word shows every heading as body text and the outline stays empty.
const NUMERIC_STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults/>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="1"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 1"/>' +
  '<w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="5"><w:name w:val="heading 2"/>' +
  '<w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>' +
  '</w:styles>';

function numericReferenceDocx(): Uint8Array {
  const templateDocXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p/><w:sectPr/></w:body></w:document>';
  return zipSync(
    {
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
      'word/document.xml': strToU8(templateDocXml),
      'word/styles.xml': strToU8(NUMERIC_STYLES_XML),
      'word/fontTable.xml': strToU8(FONT_TABLE_XML),
    },
    { level: 6 },
  );
}

test('#603 a template whose heading styles are numbered still yields real Word headings', async () => {
  const blob = await markdownToDocxBlob(
    '# 一级标题\n\n正文\n\n## 二级标题\n\n更多正文',
    '测试文档',
    undefined,
    'plain',
    'Contents',
    null,
    numericReferenceDocx(),
  );
  const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const docXml = strFromU8(parts['word/document.xml']);
  const stylesXml = strFromU8(parts['word/styles.xml']);

  const usedStyles = Array.from(docXml.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)).map((m) => m[1]);
  assert.ok(usedStyles.includes('2'), `H1 must use the template's heading 1 style, got ${usedStyles}`);
  assert.ok(usedStyles.includes('5'), `H2 must use the template's heading 2 style, got ${usedStyles}`);
  assert.ok(!usedStyles.includes('Heading1'), 'no dangling Heading1 reference may survive');
  assert.ok(!usedStyles.includes('Heading2'), 'no dangling Heading2 reference may survive');

  // Every referenced style must exist in the merged stylesheet.
  for (const id of new Set(usedStyles)) {
    assert.ok(stylesXml.includes(`w:styleId="${id}"`), `style ${id} used by a paragraph is missing`);
  }
  // And the template's own heading styles must not be shadowed by duplicates.
  assert.equal((stylesXml.match(/<w:name w:val="heading 1"\/>/g) || []).length, 1);
});
