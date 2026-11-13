import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { LimiteTasa, Publico, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import { leerCookie, responderSesion } from './cookies';

/**
 * Cookie del viaje a Google (state, nonce y verificador PKCE, firmados): SameSite=Lax porque la vuelta llega
 * desde accounts.google.com (navegación de nivel superior), httpOnly y solo para las rutas de Google.
 */
const COOKIE_GOOGLE = 'la_google';
const RUTA_GOOGLE = '/api/v1/auth/google';
const DIEZ_MINUTOS_MS = 10 * 60_000;

function guardarCookieViaje(res: Response, valor: string): void {
  res.cookie(COOKIE_GOOGLE, valor, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: RUTA_GOOGLE,
    maxAge: DIEZ_MINUTOS_MS,
  });
}

/**
 * Adaptador primario: ingreso con Google para docentes y familias — `/api/v1/auth/google/*` (OpenID Connect con PKCE).
 * Las páginas de la web enlazan aquí; la vuelta deja la cookie de sesión de siempre (RF-003) y redirige a su panel.
 */
@Controller('auth/google')
export class GoogleController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  /** La web muestra el botón solo si el ingreso con Google está disponible. */
  @Publico()
  @Get('disponible')
  disponible() {
    return this.iam.ingresoGoogle.disponible();
  }

  /** Ingresar o registrarse: lleva el navegador a Google (con `rol` DOCENTE o FAMILIAR para registrarse). */
  @Publico()
  @LimiteTasa({ nombre: 'google-inicio', maximoPorMinuto: 20, por: 'ip' })
  @Get('inicio')
  inicio(@Query('intencion') intencion: string | undefined, @Query('rol') rol: string | undefined, @Query('pista') pista: string | undefined, @Res() res: Response) {
    const r = this.iam.ingresoGoogle.iniciar({ intencion: intencion === 'registrar' ? 'REGISTRAR' : 'INGRESAR', rol, pista });
    if ('destino' in r) return res.redirect(302, r.destino);
    guardarCookieViaje(res, r.cookie);
    return res.redirect(302, r.url);
  }

  /** Vincular su cuenta de Google desde su panel: la web navega a la URL que devuelve. */
  @Roles('DOCENTE', 'FAMILIAR')
  @Post('vincular')
  @HttpCode(200)
  vincular(@UsuarioActual() u: UsuarioAutenticado, @Res({ passthrough: true }) res: Response) {
    const r = this.iam.ingresoGoogle.iniciar({ intencion: 'VINCULAR', cuentaId: u.sub });
    if ('destino' in r) throw new BadRequestException('El ingreso con Google no está disponible');
    guardarCookieViaje(res, r.cookie);
    return { url: r.url };
  }

  /** La vuelta de Google: valida todo y deja la sesión (o explica en la web por qué no se pudo). */
  @Publico()
  @LimiteTasa({ nombre: 'google-vuelta', maximoPorMinuto: 20, por: 'ip' })
  @Get('callback')
  async callback(
    @Query('code') codigo: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') errorProveedor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.iam.ingresoGoogle.completar({ cookie: leerCookie(req, COOKIE_GOOGLE), state, codigo, errorProveedor });
    // El viaje termina aquí, salga bien o mal: su cookie ya no sirve.
    res.clearCookie(COOKIE_GOOGLE, { path: RUTA_GOOGLE, httpOnly: true, sameSite: 'lax' });
    if (r.sesion) responderSesion(res, r.sesion);
    return res.redirect(302, r.destino);
  }

  @Roles('DOCENTE', 'FAMILIAR')
  @Get('estado')
  estado(@UsuarioActual() u: UsuarioAutenticado) {
    return this.iam.ingresoGoogle.estado(u.sub);
  }

  @Roles('DOCENTE', 'FAMILIAR')
  @Post('desvincular')
  @HttpCode(200)
  desvincular(@UsuarioActual() u: UsuarioAutenticado) {
    return this.iam.ingresoGoogle.desvincular(u.sub);
  }
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * "Google de prueba" — `/api/v1/dev/google/*`. Existe solo fuera de producción, con la web en esta computadora
 * (origen local) y sin credenciales de Google:
 * una página para elegir el correo con el que "ingresar con Google" en la computadora del equipo y en las pruebas.
 */
@Controller('dev/google')
export class GoogleSimuladoController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  private simulado() {
    if (!this.iam.googleSimulado || process.env['NODE_ENV'] === 'production') throw new NotFoundException();
    return this.iam.googleSimulado;
  }

  @Publico()
  @Get('autorizar')
  autorizarPagina(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const simulado = this.simulado();
    const datos = { clientId: q['client_id'], redirectUri: q['redirect_uri'], state: q['state'], nonce: q['nonce'], codeChallenge: q['code_challenge'] };
    // Con `login_hint` (las pruebas automáticas) se elige esa cuenta sin mostrar la página.
    if (q['login_hint']) return this.volver(res, () => simulado.autorizar({ ...datos, email: q['login_hint'] }));
    const ocultos = Object.entries({ client_id: datos.clientId, redirect_uri: datos.redirectUri, state: datos.state, nonce: datos.nonce, code_challenge: datos.codeChallenge })
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapar(v ?? '')}">`)
      .join('');
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google de prueba</title><style>body{font-family:system-ui,sans-serif;background:#f5f3ff;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
main{background:#fff;border-radius:20px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 24px rgba(61,42,158,.12)}h1{font-size:1.4rem;margin:0 0 6px}
p{color:#4b4778;margin:0 0 16px}label{display:grid;gap:4px;font-weight:600;margin-bottom:12px}input{font:inherit;padding:10px 12px;border:2px solid #d9d1ff;border-radius:12px}
button{font:inherit;font-weight:700;background:#5b3fd9;color:#fff;border:0;border-radius:12px;padding:12px 16px;width:100%;cursor:pointer}.aviso{background:#fff6dc;border-radius:12px;padding:10px 12px;font-size:.9rem}</style></head>
<body><main><h1>Google de prueba</h1><p class="aviso">Solo existe en esta computadora, para probar el ingreso con Google sin una cuenta real. En la página publicada se usa Google de verdad.</p>
<form method="post" action="/api/v1/dev/google/autorizar">${ocultos}<label>Correo de Google<input name="email" type="email" required autocomplete="email"></label>
<label>Nombre<input name="nombre" autocomplete="name"></label><button type="submit">Continuar</button></form></main></body></html>`);
  }

  @Publico()
  @Post('autorizar')
  autorizar(@Body() f: Record<string, string | undefined>, @Res() res: Response) {
    const simulado = this.simulado();
    return this.volver(res, () =>
      simulado.autorizar({ clientId: f['client_id'], redirectUri: f['redirect_uri'], state: f['state'], nonce: f['nonce'], codeChallenge: f['code_challenge'], email: f['email'], nombre: f['nombre'] }),
    );
  }

  private volver(res: Response, autorizar: () => string) {
    try {
      return res.redirect(302, autorizar());
    } catch (error) {
      return res.status(400).type('text/plain').send((error as Error).message);
    }
  }
}
