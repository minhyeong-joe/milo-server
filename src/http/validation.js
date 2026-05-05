import { z } from "zod";

function parseSchema(schema, value, message) {
	const result = schema.safeParse(value);

	if (!result.success) {
		return {
			error: {
				code: "VALIDATION_ERROR",
				message,
				details: z.treeifyError(result.error),
			},
		};
	}

	return { data: result.data };
}

export function parseBody(schema, body) {
	return parseSchema(schema, body, "Request body is invalid.");
}

export function parseParams(schema, params) {
	return parseSchema(schema, params, "Request params are invalid.");
}
