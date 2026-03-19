/**
 * Almacenamiento de documentos: bucket S3 (AWS o MinIO) o disco local.
 * Configurar S3_BUCKET + credenciales para usar bucket.
 */

import { writeFile, mkdir, readFile } from 'fs/promises'
import path from 'path'

const BUCKET = process.env.S3_BUCKET
const BUCKET_PREFIX = process.env.S3_PREFIX || 'expedientes'

export type StorageResult = { type: 'bucket'; key: string } | { type: 'local'; filePath: string }

/** Verifica si el bucket está configurado */
export function isBucketConfigured(): boolean {
  return !!BUCKET
}

/**
 * Sube un archivo al bucket o disco local.
 * @param key Ruta lógica: radicado/carpeta/nombreArchivo
 * @param buffer Contenido del archivo
 * @param contentType MIME type
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<StorageResult> {
  if (isBucketConfigured()) {
    return uploadToBucket(key, buffer, contentType)
  }
  return uploadToLocal(key, buffer)
}

async function uploadToBucket(
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ type: 'bucket'; key: string }> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION || 'us-east-1'
  const accessKey = process.env.S3_ACCESS_KEY
  const secretKey = process.env.S3_SECRET_KEY

  const client = new S3Client({
    region,
    ...(endpoint && {
      endpoint,
      forcePathStyle: true,
    }),
    ...(accessKey && secretKey && {
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }),
  })

  const fullKey = BUCKET_PREFIX ? `${BUCKET_PREFIX}/${key}` : key

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: fullKey,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  )

  return { type: 'bucket', key: fullKey }
}

async function uploadToLocal(key: string, buffer: Buffer): Promise<{ type: 'local'; filePath: string }> {
  const baseDir = path.join(process.cwd(), 'uploads')
  const filePath = path.join(baseDir, key.replace(/\//g, path.sep))
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
  await writeFile(filePath, buffer)
  return { type: 'local', filePath }
}

/**
 * Obtiene el contenido de un archivo (bucket o local).
 */
export async function getFile(
  bucketKey: string | null,
  localPath: string | null
): Promise<{ buffer: Buffer; contentType?: string }> {
  if (bucketKey && isBucketConfigured()) {
    return getFromBucket(bucketKey)
  }
  if (localPath) {
    const buffer = await readFile(localPath)
    return { buffer }
  }
  throw new Error('Archivo no encontrado: sin bucketKey ni ruta local')
}

async function getFromBucket(key: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION || 'us-east-1'
  const accessKey = process.env.S3_ACCESS_KEY
  const secretKey = process.env.S3_SECRET_KEY

  const client = new S3Client({
    region,
    ...(endpoint && {
      endpoint,
      forcePathStyle: true,
    }),
    ...(accessKey && secretKey && {
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }),
  })

  const res = await client.send(
    new GetObjectCommand({
      Bucket: BUCKET!,
      Key: key,
    })
  )

  if (!res.Body) throw new Error('Objeto vacío en bucket')
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  const contentType = res.ContentType || undefined
  return { buffer, contentType }
}

/**
 * Genera URL firmada para ver el archivo en el navegador (solo bucket).
 * Si no hay bucket, retorna null.
 */
export async function getSignedUrl(key: string, expiresIn = 3600): Promise<string | null> {
  if (!isBucketConfigured() || !key) return null
  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const endpoint = process.env.S3_ENDPOINT
    const region = process.env.S3_REGION || 'us-east-1'
    const accessKey = process.env.S3_ACCESS_KEY
    const secretKey = process.env.S3_SECRET_KEY

    const client = new S3Client({
      region,
      ...(endpoint && { endpoint, forcePathStyle: true }),
      ...(accessKey && secretKey && {
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      }),
    })

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: BUCKET!, Key: key }),
      { expiresIn }
    )
    return url
  } catch {
    return null
  }
}
