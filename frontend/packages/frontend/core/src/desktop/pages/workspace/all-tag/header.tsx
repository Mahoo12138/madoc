import { ExplorerNavigation } from '@madoc/core/components/explorer/header/navigation';
import { Header } from '@madoc/core/components/pure/header';

export const AllTagHeader = () => {
  return <Header left={<ExplorerNavigation active={'tags'} />} />;
};
