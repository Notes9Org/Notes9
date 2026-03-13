/**
 * AWS S3 utilities for Biomni data access.
 *
 * Supports BIOMNI_DATA_PATH as:
 * - Local path
 * - S3 URI (s3://bucket/prefix)
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  type _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export interface ParsedS3Path {
  bucket: string;
  key: string;
}

interface SyncOptions {
  maxFiles?: number;
}

export function isS3Path(value: string): boolean {
  return value.startsWith('s3://');
}

export function parseS3Path(s3Path: string): ParsedS3Path {
  if (!s3Path.startsWith('s3://')) {
    throw new Error(`Invalid S3 path format: ${s3Path}`);
  }

  const match = s3Path.match(/^s3:\/\/([a-zA-Z0-9.-]+)\/?(.*)$/);
  if (!match) {
    throw new Error(`Invalid S3 path: ${s3Path}`);
  }

  const bucket = match[1];
  let key = match[2] ?? '';

  key = key.replace(/^\/+/, '').replace(/\/+/g, '/');

  if (key.includes('..') || key.includes('~')) {
    throw new Error(`Invalid characters in S3 key: ${s3Path}`);
  }

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error(`Invalid S3 bucket name: ${bucket}`);
  }

  return { bucket, key };
}

function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function toLocalPath(baseDir: string, relativeKey: string): string {
  const safe = relativeKey
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join(path.sep);
  return path.join(baseDir, safe);
}

async function readBodyAsBuffer(body: unknown): Promise<Buffer> {
  if (!body || !(Symbol.asyncIterator in (body as object))) {
    throw new Error('S3 response body is not streamable');
  }

  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadFromS3(s3Path: string, localPath: string): Promise<void> {
  const { bucket, key } = parseS3Path(s3Path);
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty response for S3 object: ${s3Path}`);
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const content = await readBodyAsBuffer(response.Body);
  fs.writeFileSync(localPath, content);
}

export async function uploadToS3(localPath: string, s3Path: string): Promise<void> {
  const { bucket, key } = parseS3Path(s3Path);
  const fileContent = fs.readFileSync(localPath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
    })
  );
}

export async function getPresignedUploadUrl(s3Path: string, expiresIn = 3600): Promise<string> {
  const { bucket, key } = parseS3Path(s3Path);
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  s3Path: string,
  expiresIn = 3600
): Promise<string> {
  const { bucket, key } = parseS3Path(s3Path);
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function listS3Objects(s3Path: string, suffixPrefix = ''): Promise<string[]> {
  const { bucket, key } = parseS3Path(s3Path);
  const prefix = `${normalizePrefix(key)}${suffixPrefix}`.replace(/^\/+/, '');

  let continuationToken: string | undefined;
  const keys: string[] = [];

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

function shouldDownload(localPath: string, object: _Object): boolean {
  if (!fs.existsSync(localPath)) return true;

  const stat = fs.statSync(localPath);
  const remoteSize = object.Size ?? -1;
  const remoteMtime = object.LastModified?.getTime() ?? 0;

  if (remoteSize >= 0 && stat.size !== remoteSize) return true;
  if (remoteMtime > 0 && stat.mtimeMs < remoteMtime) return true;

  return false;
}

export async function syncS3PrefixToLocal(
  s3Path: string,
  localDir: string,
  options: SyncOptions = {}
): Promise<number> {
  const { bucket, key } = parseS3Path(s3Path);
  const prefix = normalizePrefix(key);

  fs.mkdirSync(localDir, { recursive: true });

  let continuationToken: string | undefined;
  let processed = 0;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key || object.Key.endsWith('/')) continue;

      const relativeKey = prefix ? object.Key.slice(prefix.length) : object.Key;
      const targetPath = toLocalPath(localDir, relativeKey);

      if (!shouldDownload(targetPath, object)) {
        processed += 1;
        if (options.maxFiles && processed >= options.maxFiles) return processed;
        continue;
      }

      const objectUri = `s3://${bucket}/${object.Key}`;
      await downloadFromS3(objectUri, targetPath);
      processed += 1;

      if (options.maxFiles && processed >= options.maxFiles) {
        return processed;
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return processed;
}
