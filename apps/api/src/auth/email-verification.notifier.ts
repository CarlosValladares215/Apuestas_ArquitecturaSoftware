import { Injectable, Logger } from '@nestjs/common';

export interface VerificationNotification {
  userId: string;
  email: string;
  rawToken: string;
  expiresAt: Date;
}

const verificationLogger = new Logger('EmailVerificationNotifier');

/**
 * Out-of-band verification dispatcher abstraction.
 * In academic/development environments it emits non-production diagnostics; in tests it is mocked.
 */
@Injectable()
export class EmailVerificationNotifier {
  sendVerificationToken(input: VerificationNotification): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      verificationLogger.log(
        `Verification token dispatched for user ${input.userId} (expires ${input.expiresAt.toISOString()}).`,
      );
    }
    return Promise.resolve();
  }
}
