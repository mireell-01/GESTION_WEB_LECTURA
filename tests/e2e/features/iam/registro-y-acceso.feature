# language: es
@iam @familia
Característica: Registro y acceso seguro de una familia
  Como madre, padre o apoderado
  Quiero crear mi cuenta y entrar de forma segura
  Para acompañar la lectura de mis hijos desde casa

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-001 @RF-002 @RF-003 @RF-009 @camino-feliz
  Escenario: La familia crea su cuenta, verifica el correo y llega a su panel
    Dado que estoy en la página de registro
    Cuando me registro como familiar con el nombre "Rosa Prueba", un correo nuevo y una contraseña segura
    Y abro el enlace de verificación que me llegó por correo
    Y ingreso con mi correo y mi contraseña
    Entonces veo mi panel familiar con el saludo "Hola, Rosa"

  @RF-002 @borde
  Escenario: Si pierdo el correo de confirmación, pido un enlace nuevo y activo mi cuenta
    Dado que me registré pero perdí el correo de confirmación
    Cuando ingreso con mi correo y mi contraseña
    Entonces veo el aviso "Tu cuenta aún no está verificada"
    Cuando pido un nuevo enlace de verificación
    Y abro el enlace más reciente
    Entonces veo el título "¡Correo verificado! 🎉"
    Cuando ingreso con mi correo y mi contraseña
    Entonces veo mi panel familiar con el saludo "Hola, Rosa"

  @RF-001 @negativo
  Escenario: Una contraseña muy común no se acepta al registrarse
    Dado que estoy en la página de registro
    Cuando me registro como familiar con el nombre "Rosa Prueba", un correo nuevo y la contraseña "1234567890"
    Entonces veo el mensaje "aparece en filtraciones conocidas o es muy común"

  @RF-003 @negativo
  Escenario: Con una contraseña equivocada no se puede entrar
    Dado que tengo una cuenta familiar verificada
    Cuando intento ingresar con una contraseña equivocada
    Entonces veo el mensaje "Correo o contraseña incorrectos"
    Y sigo en la pantalla de ingreso
