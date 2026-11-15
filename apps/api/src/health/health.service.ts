import { Injectable } from '@nestjs/common';
import { createHealthStatus, HealthStatus } from '@apuestas/shared';

@Injectable()
export class HealthService {
  /**
   * Returns the operational status of the NestJS API service.
   */
  getHealth(): HealthStatus {
    return createHealthStatus('api', 'ok');
  }
}
