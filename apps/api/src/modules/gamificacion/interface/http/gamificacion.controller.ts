import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { OtorgarInsigniaUseCase } from '../../application/use-cases/otorgar-insignia.use-case';
// import { AcumularPuntajeUseCase } from '../../application/use-cases/acumular-puntaje.use-case';

/**
 * Adaptador primario: GamificacionController (HTTP + RBAC).
 */
@Controller('gamificacion')
// @UseGuards(RbacGuard)
export class GamificacionController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'gamificacion', recibido: body };
  }
}
