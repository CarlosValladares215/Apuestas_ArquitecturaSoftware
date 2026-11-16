import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenCryptoService {
  /**
   * Generates a URL-safe cryptographically random opaque token.
   */
  generateOpaqueToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  /**
   * Computes a deterministic lowercase hex SHA-256 digest for safe token storage.
   */
  sha256Hex(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}
