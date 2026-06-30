import { ExplorerDisplayMenuButton } from '@madoc/core/components/explorer/display-menu';
import { ExplorerNavigation } from '@madoc/core/components/explorer/header/navigation';
import type { ExplorerDisplayPreference } from '@madoc/core/components/explorer/types';
import { Header } from '@madoc/core/components/pure/header';

export const TagDetailHeader = ({
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
      left={<ExplorerNavigation active={'tags'} />}
      right={
        <ExplorerDisplayMenuButton
          displayPreference={displayPreference}
          onDisplayPreferenceChange={onDisplayPreferenceChange}
        />
      }
    />
  );
};
