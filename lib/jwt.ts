import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "your-fallback-secret-at-least-32-chars-long-!!!";

function base64urlEncode(str: string | Buffer): string {
  const buf = typeof str === "string" ? Buffer.from(str) : str;
  return buf.toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

export function signToken(payload: { userId: string; email: string }): string {
  const header = { alg: "HS256", typ: "JWT" };
  // Expire in 30 days
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(fullPayload));

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest();
  
  const encodedSignature = base64urlEncode(signature);
  return `${signatureInput}.${encodedSignature}`;
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(signatureInput)
      .digest();
    
    const expectedEncodedSignature = base64urlEncode(expectedSignature);

    if (encodedSignature !== expectedEncodedSignature) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }

    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}
