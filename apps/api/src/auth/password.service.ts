import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  /**
   * Hashes a plaintext password using OWASP-recommended Argon2id parameters.
   */
  async hash(plainPassword: string): Promise<string> {
    if (!plainPassword) {
      throw new Error('Password must not be empty');
    }

    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  /**
   * Verifies a plaintext password against a stored Argon2id digest safely.
   */
  async verify(storedHash: string, plainPassword: string): Promise<boolean> {
    if (!storedHash || !plainPassword) {
      return false;
    }

    try {
      return await argon2.verify(storedHash, plainPassword);
    } catch {
      return false;
    }
  }
}
