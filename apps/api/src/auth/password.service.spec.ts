import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwordService = new PasswordService();

  it('hashes passwords with Argon2id and never returns plaintext', async () => {
    const raw = 'SuperSegura2026!';
    const digest = await passwordService.hash(raw);

    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(digest).not.toContain(raw);
    await expect(passwordService.verify(digest, raw)).resolves.toBe(true);
    await expect(passwordService.verify(digest, 'WrongPass2026!')).resolves.toBe(false);
  });

  it('returns false safely on malformed digests and rejects empty passwords', async () => {
    await expect(passwordService.hash('')).rejects.toThrow(/empty/i);
    await expect(
      passwordService.verify('not-a-valid-argon2-hash', 'SuperSegura2026!'),
    ).resolves.toBe(false);
  });
});
