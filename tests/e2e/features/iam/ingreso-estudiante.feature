# language: es
@iam @estudiante
Característica: Ingreso del estudiante con avatar y PIN
  Como niña o niño de 6 a 12 años
  Quiero entrar tocando mi avatar y escribiendo mi PIN
  Para empezar a leer sin depender de una contraseña

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  Antecedentes:
    Dado que mi familia vinculó esta tablet y creó mi perfil "Lucía" con el avatar "Zorro" y el PIN "3691"

  @RF-007 @camino-feliz @smoke
  Escenario: Entro con mi avatar y mi PIN
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Entonces llego a mi área de lectura con el saludo "Hola, Lucía"

  @RF-008 @negativo
  Escenario: Un PIN equivocado me avisa cuántos intentos me quedan
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "9090"
    Entonces veo el mensaje "Te quedan 4 intentos"

  @RF-008 @RN-03 @borde
  Escenario: Cinco PIN equivocados seguidos bloquean mi perfil
    Cuando toco mi avatar "Lucía"
    Y escribo 5 veces el PIN equivocado "9090"
    Entonces veo el mensaje "Espera 15 minutos o pide ayuda a un adulto"

  @RF-009 @seguridad
  Escenario: Desde mi sesión no puedo abrir el panel de mi familia
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Y intento abrir el panel familiar
    Entonces vuelvo a mi área de lectura con el saludo "Hola, Lucía"

  @RF-010 @R-02 @reloj
  Escenario: Si dejo la tablet sin usar 10 minutos, se cierra mi sesión
    Cuando toco mi avatar "Lucía"
    Y escribo el PIN "3691"
    Y llego a mi área de lectura con el saludo "Hola, Lucía"
    Y nadie toca la tablet durante 10 minutos
    Entonces vuelvo a la pantalla de ingreso con el aviso "no hubo actividad por un rato"
