import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { RegistrarProgresoUseCase } from '../../application/use-cases/registrar-progreso.use-case';
// import { ConsultarProgresoUseCase } from '../../application/use-cases/consultar-progreso.use-case';

/**
 * Adaptador primario: ProgresoController (HTTP + RBAC).
 */
@Controller('progreso')
// @UseGuards(RbacGuard)
export class ProgresoController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'progreso', recibido: body };
  }
}
