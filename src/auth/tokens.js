export function getBearerToken(req) {
	const header = req.get("authorization");

	if (!header) {
		return null;
	}

	const [scheme, token] = header.split(" ");

	if (scheme?.toLowerCase() !== "bearer" || !token) {
		return null;
	}

	return token;
}
