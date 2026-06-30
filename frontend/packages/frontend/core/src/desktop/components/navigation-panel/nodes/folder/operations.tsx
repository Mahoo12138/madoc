import { MenuItem } from '@madoc/component';
import { IsFavoriteIcon } from '@madoc/core/components/pure/icons';
import { CompatibleFavoriteItemsAdapter } from '@madoc/core/modules/favorite';
import { useI18n } from '@madoc/i18n';
import { useLiveData, useService } from '@madoc/infra';
import { useMemo } from 'react';

export const FavoriteFolderOperation = ({ id }: { id: string }) => {
  const t = useI18n();
  const compatibleFavoriteItemsAdapter = useService(
    CompatibleFavoriteItemsAdapter
  );

  const favorite = useLiveData(
    useMemo(() => {
      return compatibleFavoriteItemsAdapter.isFavorite$(id, 'folder');
    }, [compatibleFavoriteItemsAdapter, id])
  );

  return (
    <MenuItem
      prefixIcon={<IsFavoriteIcon favorite={favorite} />}
      onClick={() => compatibleFavoriteItemsAdapter.toggle(id, 'folder')}
    >
      {favorite
        ? t['com.affine.rootAppSidebar.organize.folder-rm-favorite']()
        : t['com.affine.rootAppSidebar.organize.folder-add-favorite']()}
    </MenuItem>
  );
};
