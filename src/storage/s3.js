import { S3Client } from "@aws-sdk/client-s3";

let s3Client = null;

export const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;

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
