import type { BrokerContractRef } from "../types/instrument";

export interface InstrumentRef {
  symbol: string;
  exchange?: string;
  brokerId?: string;
  brokerInstanceId?: string;
  instrument?: BrokerContractRef | null;
}
