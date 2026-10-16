import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { PublicarTextoUseCase } from '../../application/use-cases/publicar-texto.use-case';
// import { ClasificarTextoUseCase } from '../../application/use-cases/clasificar-texto.use-case';

/**
 * Adaptador primario: ContenidoController (HTTP + RBAC).
 */
@Controller('contenido')
// @UseGuards(RbacGuard)
export class ContenidoController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'contenido', recibido: body };
  }
}
