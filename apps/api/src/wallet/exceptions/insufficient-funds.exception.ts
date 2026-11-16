import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientFundsException extends HttpException {
  constructor(message = 'Saldo insuficiente para completar la operación') {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code: 'INSUFFICIENT_FUNDS',
        message,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
