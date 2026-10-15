import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { ResponderItemUseCase } from '../../application/use-cases/responder-item.use-case';
// import { SolicitarPistaUseCase } from '../../application/use-cases/solicitar-pista.use-case';

/**
 * Adaptador primario: LecturaController (HTTP + RBAC).
 */
@Controller('lectura')
// @UseGuards(RbacGuard)
export class LecturaController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'lectura', recibido: body };
  }
}
