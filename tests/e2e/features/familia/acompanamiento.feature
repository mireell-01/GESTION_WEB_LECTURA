# language: es
@familia
Característica: Acompañamiento familiar
  Como madre, padre o adulto responsable
  Quiero ver cómo lee mi hijo o hija y saber cómo ayudarle en casa
  Para acompañar su aventura lectora sin tener que ser especialista

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-068 @RF-069 @camino-feliz @smoke
  Escenario: La familia ve el avance de su hijo y cómo acompañarle en casa
    Dado una familia que acompaña a Mateo, que esta semana terminó una lectura y tiene inferencias por reforzar
    Cuando abre el avance de Mateo
    Entonces ve cuánto leyó esta semana y en qué mundo va
    Y ve inferencias como habilidad a reforzar con al menos una idea práctica para casa

  @RN-17 @negativo
  Escenario: Una familia no ve el avance de un niño que no es suyo
    Dado dos familias, cada una con su hija
    Cuando una intenta abrir el avance de la hija de la otra
    Entonces ve "No encontramos a este niño o niña entre tus hijos." y ningún dato de ella

  @RF-070
  Escenario: Recibe el resumen el domingo y se da de baja con un clic
    Dado una familia con su hija Lucía
    Cuando llega el domingo a las 18:00
    Entonces recibe por correo el resumen semanal de Lucía con un enlace para darse de baja
    Y con un clic en ese enlace, sin iniciar sesión, deja de recibirlo
    Y el domingo siguiente ya no le llega

  @RF-070
  Escenario: Decide desde su panel si recibe el resumen
    Dado una familia con su hija Lucía
    Cuando desactiva "Recibir el resumen semanal" en su panel
    Entonces el domingo no le llega el resumen
    Y al activarlo de nuevo, el domingo siguiente sí le llega

  @RF-071
  Escenario: Gestiona los perfiles de sus hijos, hasta 6
    Dado una familia con 5 perfiles de hijos
    Cuando cambia el avatar de Lucía, le restablece el PIN y la desactiva
    Entonces Lucía aparece con su nuevo avatar y desactivada
    Y al crear el sexto perfil ya no puede agregar otro
