import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { IniciarConversacionUseCase } from '../../application/use-cases/iniciar-conversacion.use-case';
// import { GenerarSugerenciaUseCase } from '../../application/use-cases/generar-sugerencia.use-case';

/**
 * Adaptador primario: AsistenteController (HTTP + RBAC).
 */
@Controller('asistente')
// @UseGuards(RbacGuard)
export class AsistenteController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'asistente', recibido: body };
  }
}
