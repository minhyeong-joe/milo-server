import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client = null;

export const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;
export const S3_PRESIGNED_GET_EXPIRES_IN_SECONDS = 60 * 60;
export const S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS = 5 * 60;

export function getS3Client() {
	if (s3Client) {
		return s3Client;
	}

	s3Client = new S3Client({
		region: process.env.AWS_REGION,
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		},
	});

	return s3Client;
}

export function createPresignedPutUrl({ objectKey, contentType }) {
	const command = new PutObjectCommand({
		Bucket: S3_BUCKET,
		Key: objectKey,
		ContentType: contentType,
	});

	return getSignedUrl(getS3Client(), command, {
		expiresIn: S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS,
	});
}

export function createPresignedGetUrl({ objectKey }) {
	const command = new GetObjectCommand({
		Bucket: S3_BUCKET,
		Key: objectKey,
	});

	return getSignedUrl(getS3Client(), command, {
		expiresIn: S3_PRESIGNED_GET_EXPIRES_IN_SECONDS,
	});
}

export function deleteS3Object({ objectKey }) {
	const command = new DeleteObjectCommand({
		Bucket: S3_BUCKET,
		Key: objectKey,
	});

	return getS3Client().send(command);
}
