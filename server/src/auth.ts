import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export type JwtPayload = { sub: number };

export function signToken(userId: number) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { sub?: number | string };
    const sub = decoded.sub;
    const userId = typeof sub === "number" ? sub : Number(sub);
    if (!Number.isFinite(userId)) return null;
    return { sub: userId };
  } catch {
    return null;
  }
}
