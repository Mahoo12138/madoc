import { FlexWrapper } from '@madoc/component';
import { ExplorerDisplayMenuButton } from '@madoc/core/components/explorer/display-menu';
import { ViewToggle } from '@madoc/core/components/explorer/display-menu/view-toggle';
import { ExplorerNavigation } from '@madoc/core/components/explorer/header/navigation';
import type { ExplorerDisplayPreference } from '@madoc/core/components/explorer/types';
import { Header } from '@madoc/core/components/pure/header';

export const CollectionDetailHeader = ({
  displayPreference,
  onDisplayPreferenceChange,
}: {
  displayPreference: ExplorerDisplayPreference;
  onDisplayPreferenceChange: (
    displayPreference: ExplorerDisplayPreference
  ) => void;
}) => {
  return (
    <Header
      right={
        <FlexWrapper gap={16}>
          <ViewToggle
            view={displayPreference.view ?? 'list'}
            onViewChange={view => {
              onDisplayPreferenceChange({ ...displayPreference, view });
            }}
          />
          <ExplorerDisplayMenuButton
            displayPreference={displayPreference}
            onDisplayPreferenceChange={onDisplayPreferenceChange}
          />
        </FlexWrapper>
      }
      left={<ExplorerNavigation active="collections" />}
    />
  );
};
