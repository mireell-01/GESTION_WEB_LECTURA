# language: es
@gamificacion
Característica: Puntos, insignias, racha, reto del día y recompensas
  Como estudiante de LectoAventura
  Quiero ver lo que gano con cada lectura y tener retos y recompensas
  Para que leer sea una aventura que me den ganas de seguir

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-056 @RF-058 @RF-059 @camino-feliz @smoke
  Escenario: Al terminar una lectura ve lo que ganó y su pasaporte lo refleja
    Dado un niño de 9 años que respondió su lectura hasta la última pregunta
    Cuando responde la última pregunta y termina su lectura
    Entonces ve cuántos puntos ganó y su nueva insignia "Primera lectura"
    Y su Pasaporte del Lector muestra la insignia ganada y la lectura terminada

  @RF-060 @RN-18
  Escenario: El reto del día apunta a su habilidad más débil
    Dado un niño de 9 años que hizo su reto inicial bien en literal y vocabulario
    Cuando abre su inicio
    Entonces ve el reto del día para "descubrir lo que no se dice"
    Y el reto es el mismo cada vez que lo abre ese día

  @RF-061 @RN-11
  Escenario: El comodín semanal salva su racha y a los 7 días gana "Lector Perseverante"
    Dado un niño que leyó 6 días seguidos hasta anteayer
    Cuando termina una lectura hoy
    Entonces su racha llega a 7 días usando el comodín de la semana
    Y gana 30 puntos de racha y la insignia "Lector Perseverante"

  @RN-12 @negativo
  Escenario: Repetir una lectura ya terminada da solo el 25 % de los puntos
    Dado un niño que ya terminó una lectura
    Cuando la vuelve a leer completa
    Entonces cada logro de la repetición vale el 25 % y no suma a las insignias

  @RF-062
  Escenario: Canjea una recompensa con monedas sin perder puntos
    Dado un niño que ganó puntos leyendo
    Cuando canjea la "Lupa de detective" en su pasaporte
    Entonces la "Lupa de detective" es suya
    Y sus monedas bajan en 5 y sus puntos siguen iguales
