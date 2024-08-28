// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as z from "zod";
import {
  AnonymousCredential,
  ContainerClient,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
  BlobLeaseClient,
  BlobClient,
  LeaseOperationResponse,
  RestError,
} from "@azure/storage-blob";
import { TokenCredential, isTokenCredential } from "@azure/core-http";
import { Utils } from "./utils";
import { logging } from "../telemetry/loggerManager";

const logger = logging.getLogger("bot.blobsStorageLeaseManager");

/**
 * Optional settings for BlobsStorage
 */
export interface BlobsStorageOptions {
  /**
   * [StoragePipelineOptions](xref:@azure/storage-blob.StoragePipelineOptions) to pass to azure blob
   * storage client
   */
  storagePipelineOptions?: StoragePipelineOptions;
}

function isCredentialType(value: any): value is TokenCredential {
  return (
    isTokenCredential(value) ||
    value instanceof StorageSharedKeyCredential ||
    value instanceof AnonymousCredential
  );
}

/**
 * BlobsStorageLeaseManager provides an implementation of a distributed state management backed by Azure Blob Storage
 */
export class BlobsStorageLeaseManager {
  private readonly _containerClient: ContainerClient;
  private readonly _concurrency = Infinity;
  private _initializePromise?: Promise<unknown>;

  /**
   * Constructs a BlobsStorageLeaseManager instance.
   *
   * @param {string} connectionString Azure Blob Storage connection string
   * @param {string} containerName Azure Blob Storage container name
   * @param {BlobsStorageOptions} options Other options for BlobsStorage
   * @param {string} url Azure Blob Storage container url
   * @param {StorageSharedKeyCredential | AnonymousCredential | TokenCredential} credential Azure credential to access the resource
   */
  constructor(
    connectionString: string,
    containerName: string,
    options?: BlobsStorageOptions,
    url = "",
    credential?:
      | StorageSharedKeyCredential
      | AnonymousCredential
      | TokenCredential
  ) {
    if (url != "" && credential != null) {
      z.object({ url: z.string() }).parse({
        url,
      });

      if (typeof credential != "object" || !isCredentialType(credential)) {
        throw new ReferenceError("Invalid credential type.");
      }

      this._containerClient = new ContainerClient(
        url,
        credential,
        options?.storagePipelineOptions
      );

      // At most one promise at a time to be friendly to local emulator users
      if (url.trim() === "UseDevelopmentStorage=true;") {
        this._concurrency = 1;
      }
    } else {
      z.object({
        connectionString: z.string(),
        containerName: z.string(),
      }).parse({
        connectionString,
        containerName,
      });

      this._containerClient = new ContainerClient(
        connectionString,
        containerName,
        options?.storagePipelineOptions
      );

      // At most one promise at a time to be friendly to local emulator users
      if (connectionString.trim() === "UseDevelopmentStorage=true;") {
        this._concurrency = 1;
      }
    }
  }

  // Initialize the container client
  private _initialize(): Promise<unknown> {
    if (!this._initializePromise) {
      this._initializePromise = this._containerClient.createIfNotExists();
    }
    return this._initializePromise;
  }

  private async getBlobClient(key: string): Promise<BlobClient> {
    await this._initialize();
    return this._containerClient.getBlobClient(Utils.sanitizeBlobKey(key));
  }

  private async acquireBlobLeaseAsync(blobClient: BlobClient): Promise<string> {
    const leaseClient: BlobLeaseClient = blobClient.getBlobLeaseClient();
    const leaseResponse = await leaseClient.acquireLease(60);
    if (leaseResponse.leaseId === undefined) {
      logger.error("LeaseId is undefined. Failed to acquire lease.");
      throw new Error("LeaseId is undefined. Failed to acquire lease.");
    }
    return leaseResponse.leaseId;
  }

  // Create an empty blob if it does not exist
  private async createBlobIfNotExist(blobClient: BlobClient): Promise<void> {
    if (!(await blobClient.exists())) {
      const blobBlockClient = blobClient.getBlockBlobClient();
      await blobBlockClient.upload("", 0);
    }
  }

  // Release the lease with the leaseId
  private async releaseBlobLeaseAsync(
    blobClient: BlobClient,
    leaseId: string
  ): Promise<LeaseOperationResponse> {
    const leaseClient: BlobLeaseClient = blobClient.getBlobLeaseClient(leaseId);
    return await leaseClient.releaseLease();
  }

  // Acquire a lease for the blob
  async acquireLeaseAsync(key: string): Promise<string> {
    const blobClient = await this.getBlobClient(key);
    try {
      return await this.acquireBlobLeaseAsync(blobClient);
    } catch (err) {
      // Acquiring a lease will fail if the blob does not exist
      // Or if the blob has an existing lease
      if (err instanceof RestError && err?.code == "BlobNotFound") {
        logger.warn("Blob not found, creating blob and acquiring lease.");
        // If the blob does not exist, create it and try to acquire the lease
        await this.createBlobIfNotExist(blobClient);
        return await this.acquireBlobLeaseAsync(blobClient);
      }
      // If the blob has an existing lease or any other error is thrown
      // rethrow the error
      throw err;
    }
  }

  // Release the lease with the leaseId
  async releaseLeaseAsync(
    key: string,
    leaseId: string
  ): Promise<LeaseOperationResponse> {
    const blobClient = await this.getBlobClient(key);
    return await this.releaseBlobLeaseAsync(blobClient, leaseId);
  }
}
