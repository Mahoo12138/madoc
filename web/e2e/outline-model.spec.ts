import { expect, test } from '@playwright/test';
import { Transform } from '@milkdown/kit/prose/transform';
import { Schema } from '@milkdown/kit/prose/model';
import {
  headingAtPosition,
  readOutline,
  buildOutlineTree,
  mapOutlineFolds,
} from '../src/features/markdown/markdown-outline-model';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
    },
    code_block: { content: 'text*', group: 'block', code: true },
    text: { group: 'inline' },
  },
  marks: { strong: {} },
});

test('outline follows actual heading ancestry, preserves duplicates and excludes code', () => {
  const heading = (level: number, text = '') =>
    schema.node(
      'heading',
      { level },
      text ? schema.text(text, [schema.mark('strong')]) : [],
    );
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('intro')),
    heading(2, '重复标题'),
    heading(4, '跳级标题'),
    heading(3, '重复标题'),
    schema.node('code_block', null, schema.text('# 不是标题')),
    heading(1),
    heading(6, '末尾'),
  ]);
  const headings = readOutline(doc);
  expect(
    headings.map(({ level, depth, text }) => ({ level, depth, text })),
  ).toEqual([
    { level: 2, depth: 0, text: '重复标题' },
    { level: 4, depth: 1, text: '跳级标题' },
    { level: 3, depth: 1, text: '重复标题' },
    { level: 1, depth: 0, text: '未命名标题' },
    { level: 6, depth: 1, text: '末尾' },
  ]);
  expect(new Set(headings.map((heading) => heading.position)).size).toBe(5);
  expect(headingAtPosition(headings, 0)).toBeNull();
  expect(headingAtPosition(headings, headings[2].position + 2)).toBe(
    headings[2].position,
  );
  expect(
    readOutline(schema.node('doc', null, schema.node('paragraph'))),
  ).toEqual([]);
});

test('outline folds follow heading edits and insertion, and never transfer to a deleted sibling', () => {
  const heading = (level: number, text: string) =>
    schema.node('heading', { level }, schema.text(text));
  const doc = schema.node('doc', null, [
    heading(1, '重复'),
    heading(3, '子标题'),
    heading(1, '重复'),
    heading(2, '另一个子标题'),
  ]);
  const headings = readOutline(doc);
  const tree = buildOutlineTree(headings);
  expect(
    tree.map((branch) => [
      branch.text,
      branch.children.map((child) => child.text),
    ]),
  ).toEqual([
    ['重复', ['子标题']],
    ['重复', ['另一个子标题']],
  ]);
  const collapsed = new Set([headings[0].position, headings[2].position]);
  const inserted = new Transform(doc).insert(
    0,
    schema.node('paragraph', null, schema.text('新增正文')),
  );
  const moved = mapOutlineFolds(
    collapsed,
    inserted.mapping,
    readOutline(inserted.doc),
  );
  expect([...moved]).toEqual([6, headings[2].position + 6]);
  const renamed = new Transform(doc).insert(1, schema.text('新'));
  expect([
    ...mapOutlineFolds(collapsed, renamed.mapping, readOutline(renamed.doc)),
  ]).toEqual([0, headings[2].position + 1]);
  const deleted = new Transform(doc).delete(0, headings[2].position);
  expect([
    ...mapOutlineFolds(new Set([0]), deleted.mapping, readOutline(deleted.doc)),
  ]).toEqual([]);
});
