import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION || 'eu-north-1';
const bucket = process.env.S3_BUCKET;

// Credentials come from the ECS task role via the default provider chain.
// No access keys are ever set in the container.
const s3 = new S3Client({ region });

export async function uploadImage(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// Images are served through CloudFront, not directly from S3 (the bucket is
// private). CLOUDFRONT_DOMAIN is injected by the task definition.
export function imageUrl(key) {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  if (domain) return `https://${domain}/${key}`;
  return `/${key}`;
}
