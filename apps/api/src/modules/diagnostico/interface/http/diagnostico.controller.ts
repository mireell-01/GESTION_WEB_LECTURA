import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { AplicarPruebaUseCase } from '../../application/use-cases/aplicar-prueba.use-case';
// import { AsignarNivelUseCase } from '../../application/use-cases/asignar-nivel.use-case';

/**
 * Adaptador primario: DiagnosticoController (HTTP + RBAC).
 */
@Controller('diagnostico')
// @UseGuards(RbacGuard)
export class DiagnosticoController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'diagnostico', recibido: body };
  }
}
