import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthStatus } from '@apuestas/shared';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }
}
