/**
 * Infraestructura como código — Lectoaventura.
 * Esqueleto base: red + clúster. Se expandirá según el ADR-010.
 */

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # backend "s3" { ... }  # configurar según el entorno
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "lectoaventura"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "disponibles" {
  state = "available"
}

module "red" {
  source = "./modules/network"

  project            = "lectoaventura"
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.disponibles.names, 0, 2)
}
