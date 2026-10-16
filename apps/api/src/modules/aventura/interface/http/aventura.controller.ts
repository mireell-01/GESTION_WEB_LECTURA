import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { IniciarAventuraUseCase } from '../../application/use-cases/iniciar-aventura.use-case';
// import { DesbloquearNodoUseCase } from '../../application/use-cases/desbloquear-nodo.use-case';

/**
 * Adaptador primario: AventuraController (HTTP + RBAC).
 */
@Controller('aventura')
// @UseGuards(RbacGuard)
export class AventuraController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'aventura', recibido: body };
  }
}
