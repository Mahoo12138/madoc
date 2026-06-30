import { EmptyTags } from '@madoc/core/components/affine/empty';
import { TagService } from '@madoc/core/modules/tag';
import { useLiveData, useService } from '@madoc/infra';

import { TagItem } from './item';
import { list } from './styles.css';

export const TagList = () => {
  const tagList = useService(TagService).tagList;
  const tags = useLiveData(tagList.tags$);

  if (!tags.length) {
    return <EmptyTags absoluteCenter />;
  }

  return (
    <ul className={list}>
      {tags.map(tag => (
        <TagItem key={tag.id} tag={tag} />
      ))}
    </ul>
  );
};
