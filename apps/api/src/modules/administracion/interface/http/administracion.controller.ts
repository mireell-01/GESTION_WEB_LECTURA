import { Body, Controller, Post } from '@nestjs/common';
// import { RbacGuard } from './guards/rbac.guard';
// import { ActualizarConfiguracionUseCase } from '../../application/use-cases/actualizar-configuracion.use-case';
// import { RegistrarAuditoriaUseCase } from '../../application/use-cases/registrar-auditoria.use-case';

/**
 * Adaptador primario: AdministracionController (HTTP + RBAC).
 */
@Controller('administracion')
// @UseGuards(RbacGuard)
export class AdministracionController {
  // TODO: exponer endpoints de los casos de uso con sus respectivos DTOs
  @Post('demo')
  demo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return { modulo: 'administracion', recibido: body };
  }
}
