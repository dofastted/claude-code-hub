import type { Key } from "@/types/key";

export interface TemporaryKeyBatch {
  id: number;
  providerGroup: string;
  name: string;
  sourceUserId: number;
  sourceKeyId: number;
  createdCount: number;
  createdByUserId: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemporaryKeyBatchKey {
  id: number;
  batchId: number;
  keyId: number;
  createdAt: Date;
}

export interface TemporaryKeyBatchWithKeys extends TemporaryKeyBatch {
  keys: Key[];
}

export interface CreateTemporaryKeyBatchInput {
  providerGroup: string;
  name?: string;
  sourceUserId: number;
  sourceKeyId: number;
  count: number;
  createdByUserId?: number | null;
  customLimitTotalUsd?: number | null;
}

export interface CreateTemporaryKeyBatchResult {
  batch: TemporaryKeyBatch;
  keys: Key[];
}

export interface DeleteTemporaryKeyBatchResult {
  batchId: number;
  deletedKeyIds: number[];
  affectedUserIds: number[];
}
