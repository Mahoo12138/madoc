import { useMemo } from 'react';
import { Select, Text, TextInput } from '@mantine/core';
import type { Item } from '@/api/types';

export function importTargetError(items: Item[], parentId: string | null, title: string) {
  if (!title.trim()) return '请输入导入目录名称。';
  if (parentId !== null && !items.some((item) => item.id === parentId && item.type === 'folder'))
    return '目标目录已不可用，请重新选择。';
  if (items.some((item) => item.parentId === parentId && item.title === title.trim()))
    return '目标位置已有同名内容，请修改导入目录名称。';
  return '';
}

export function PortableImportTarget({
  items,
  parentId,
  title,
  disabled,
  error,
  onParentChange,
  onTitleChange,
}: {
  items: Item[];
  parentId: string | null;
  title: string;
  disabled: boolean;
  error: string;
  onParentChange: (id: string | null) => void;
  onTitleChange: (title: string) => void;
}) {
  const folders = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return items
      .filter((item) => item.type === 'folder')
      .map((item) => {
        const names = [item.title];
        const seen = new Set([item.id]);
        let parent = item.parentId ? byId.get(item.parentId) : undefined;
        while (parent && !seen.has(parent.id)) {
          seen.add(parent.id);
          names.unshift(parent.title);
          parent = parent.parentId ? byId.get(parent.parentId) : undefined;
        }
        return { value: item.id, label: names.join(' / ') };
      });
  }, [items]);
  return (
    <>
      <Select
        label="导入位置"
        searchable
        allowDeselect={false}
        disabled={disabled}
        data={[{ value: 'root', label: '工作区根目录' }, ...folders]}
        value={parentId ?? 'root'}
        onChange={(value) => onParentChange(value === 'root' ? null : value)}
      />
      <TextInput
        label="新目录名称"
        value={title}
        disabled={disabled}
        onChange={(event) => onTitleChange(event.currentTarget.value)}
        error={error || undefined}
      />
      <Text size="sm" c="dimmed">
        将在所选位置新建一个完整目录，保留包内结构，不覆盖已有内容。整组成功后才会出现在目录中。
      </Text>
    </>
  );
}
