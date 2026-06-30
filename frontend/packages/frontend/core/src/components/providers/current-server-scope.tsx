import { ServersService } from '@madoc/core/modules/cloud';
import { GlobalContextService } from '@madoc/core/modules/global-context';
import { FrameworkScope, useLiveData, useService } from '@madoc/infra';
import { useMemo } from 'react';

export const CurrentServerScopeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const globalContext = useService(GlobalContextService).globalContext;
  const serversService = useService(ServersService);
  const currentServerId = useLiveData(globalContext.serverId.$);
  const serverService = useLiveData(
    useMemo(() => {
      if (!currentServerId) {
        return null;
      }
      return serversService.server$(currentServerId);
    }, [currentServerId, serversService])
  );

  if (!serverService) {
    // todo(@pengx17): render a loading/error component here if not found?
    return null;
  }

  return (
    <FrameworkScope scope={serverService.scope}>{children}</FrameworkScope>
  );
};

export const useCurrentServerService = () => {
  const globalContext = useService(GlobalContextService).globalContext;
  const serversService = useService(ServersService);
  const currentServerId = useLiveData(globalContext.serverId.$);
  const serverService = useLiveData(
    useMemo(() => {
      if (!currentServerId) {
        return null;
      }
      return serversService.server$(currentServerId);
    }, [currentServerId, serversService])
  );

  return serverService ?? undefined;
};
