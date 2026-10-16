# Módulo de red mínimo: VPC + subredes públicas.
resource "aws_vpc" "este" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-${var.environment}-vpc" }
}

resource "aws_subnet" "publicas" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.este.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-${var.environment}-public-${count.index}" }
}

output "vpc_id" {
  value = aws_vpc.este.id
}
