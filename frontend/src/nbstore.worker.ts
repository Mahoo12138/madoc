import '@madoc/core/bootstrap/browser';

import { broadcastChannelStorages } from '@madoc/nbstore/broadcast-channel';
import { cloudStorages } from '@madoc/nbstore/cloud';
import { idbStorages } from '@madoc/nbstore/idb';
import { idbV1Storages } from '@madoc/nbstore/idb/v1';
import {
  StoreManagerConsumer,
  type WorkerManagerOps,
} from '@madoc/nbstore/worker/consumer';
import { type MessageCommunicapable, OpConsumer } from '@madoc/infra/op';

const consumer = new StoreManagerConsumer([
  ...idbStorages,
  ...idbV1Storages,
  ...broadcastChannelStorages,
  ...cloudStorages,
]);

if ('onconnect' in globalThis) {
  // if in shared worker

  (globalThis as any).onconnect = (event: MessageEvent) => {
    const port = event.ports[0];
    consumer.bindConsumer(new OpConsumer<WorkerManagerOps>(port));
  };
} else {
  // if in worker
  consumer.bindConsumer(
    new OpConsumer<WorkerManagerOps>(globalThis as MessageCommunicapable)
  );
}
