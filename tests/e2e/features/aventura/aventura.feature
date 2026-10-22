# language: es
@aventura
Característica: Mapa de aventuras, mundos y misiones
  Como estudiante de LectoAventura
  Quiero recorrer los 5 mundos completando misiones de lectura
  Para sentir que avanzo y desbloquear nuevos desafíos

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-030 @RF-033 @camino-feliz @smoke
  Escenario: Tras su reto inicial, un niño empieza en el mundo Explorador y los demás están bloqueados
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Cuando entra con su avatar y su PIN
    Entonces su mapa lo ubica en el mundo "Explorador"
    Y los mundos "Detective", "Investigador", "Crítico" y "Maestro de la Lectura" aparecen bloqueados

  @RF-032 @camino-feliz
  Escenario: La editora arma una misión y el niño la encuentra en su mundo
    Dado que hay una lectura publicada para 8–9 años llamada "La cueva del eco"
    Cuando una editora arma en el mundo "Explorador" la misión "Huellas en el bosque" con esa lectura
    Y un niño de 9 años abre el mundo "Explorador"
    Entonces ve la misión "Huellas en el bosque" por empezar, con la lectura "La cueva del eco"

  @RF-030 @negativo
  Escenario: Un mundo bloqueado no se puede abrir
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Cuando entra con su avatar y su PIN
    Y intenta abrir el mundo "Investigador"
    Entonces le explica que primero debe completar el mundo anterior

  @RF-031 @RN-09
  Escenario: Al desbloquear el mundo Detective el niño lo celebra una sola vez
    Dado un niño de 9 años que ya hizo su reto inicial, con la tablet activada
    Y que ya entró y tiene su mapa
    Cuando cumple el umbral de maestría y misiones del Explorador
    Y vuelve a su mapa
    Entonces ve la celebración "¡Desbloqueaste el mundo Detective!"
    Y al cerrarla, el Explorador aparece completado y la celebración no vuelve a salir
