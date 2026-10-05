import { createRemoteJWKSet, jwtVerify } from "jose";
import { AuthContext } from "./types.js";

export interface AuthVerifier {
  verifyAuthorizationHeader(header: string | undefined): Promise<AuthContext>;
}

export interface JwksAuthVerifierOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  tenantClaim?: string;
}

function extractBearer(header: string | undefined): string {
  if (!header) throw new Error("Missing authorization header");
  const [scheme, credential] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !credential) {
    throw new Error("Bearer authentication is required");
  }
  return credential;
}

export class JwksAuthVerifier implements AuthVerifier {
  private readonly jwks;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly tenantClaim: string;

  constructor(options: JwksAuthVerifierOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.tenantClaim = options.tenantClaim ?? "tenant_id";
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
  }

  async verifyAuthorizationHeader(header: string | undefined): Promise<AuthContext> {
    const credential = extractBearer(header);
    const { payload } = await jwtVerify(credential, this.jwks, {
      issuer: this.issuer,
      audience: this.audience
    });

    if (!payload.sub) throw new Error("Identity subject is missing");
    const tenant = payload[this.tenantClaim];
    if (typeof tenant !== "string" || !tenant.trim()) {
      throw new Error("Identity tenant claim is missing");
    }

    return {
      tenantId: tenant,
      userId: payload.sub,
      subject: payload.sub
    };
  }
}

export class FixedAuthVerifier implements AuthVerifier {
  constructor(private readonly context: AuthContext) {}

  async verifyAuthorizationHeader(header: string | undefined): Promise<AuthContext> {
    if (!header) throw new Error("Authorization is required");
    return this.context;
  }
}

export class DevelopmentAuthVerifier implements AuthVerifier {
  async verifyAuthorizationHeader(header: string | undefined): Promise<AuthContext> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Development authentication is disabled in production");
    }
    if (!header) throw new Error("Authorization is required");
    const [scheme, credential] = header.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !credential?.startsWith("dev:")) {
      throw new Error("Development credential is invalid");
    }
    const [, tenantId, userId] = credential.split(":");
    if (!tenantId || !userId) throw new Error("Development credential is invalid");
    return {
      tenantId,
      userId,
      subject: userId
    };
  }
}
