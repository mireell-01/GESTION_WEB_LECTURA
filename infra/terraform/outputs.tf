output "vpc_id" {
  description = "ID de la VPC creada."
  value       = module.red.vpc_id
}

output "environment" {
  description = "Entorno desplegado."
  value       = var.environment
}
