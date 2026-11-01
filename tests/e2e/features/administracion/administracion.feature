# language: es
@administracion
Característica: Administración de la plataforma
  Como administración de LectoAventura
  Quiero gestionar los colegios, las cuentas docentes, la auditoría y la gamificación
  Para cuidar la plataforma y a los niños que la usan

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-076 @camino-feliz @smoke
  Escenario: Suspender a una docente le quita el acceso y sus niños siguen leyendo
    Dado una docente con su aula y su estudiante Mateo
    Cuando la administración la suspende
    Entonces la docente ya no puede ingresar
    Y Mateo sigue entrando con su PIN en la tablet del aula
    Y la administración ve sus aulas en solo lectura

  @RF-076
  Escenario: Reactivar a una docente suspendida
    Dado una docente con su aula y su estudiante Mateo
    Y la administración la suspende
    Cuando la administración la reactiva
    Entonces la docente vuelve a ingresar a su panel

  @RF-076
  Escenario: Dar de alta a un docente que crea su contraseña por correo
    Cuando la administración da de alta a "Luis Ramos" con su correo
    Entonces Luis recibe un correo para crear su contraseña
    Y con ese enlace crea su contraseña e ingresa a su panel de docente

  @RF-076
  Escenario: Una institución suspendida no se elige para aulas nuevas
    Dado una docente con su aula y su estudiante Mateo
    Y una institución registrada por la administración
    Cuando la administración suspende la institución
    Entonces la docente no puede crear un aula en ella

  @RF-077
  Escenario: La auditoría muestra quién cambió un PIN y desde dónde
    Dado una docente con su aula y su estudiante Mateo
    Y la docente cambió el PIN de Mateo
    Cuando la administración filtra la auditoría por "PIN restablecido"
    Entonces ve el cambio con la docente, el estudiante y la dirección IP

  @RF-078
  Escenario: Publicar una versión nueva de la gamificación que aplica desde ahora
    Cuando la administración cambia los puntos por lectura terminada a 25 y publica
    Entonces queda vigente la versión nueva desde ese momento
    Y la versión anterior sigue en la lista de versiones

  @RN-17 @negativo
  Escenario: Una docente no entra a la administración
    Dado una docente con su aula y su estudiante Mateo
    Cuando la docente intenta abrir la administración de docentes
    Entonces vuelve a su panel de docente
