import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentTamperedException extends HttpException {
  constructor(
    message = 'Los datos confirmados por la pasarela no coinciden con la intención de pago registrada',
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'PAYMENT_TAMPERED',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
