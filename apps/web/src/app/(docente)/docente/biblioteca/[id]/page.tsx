'use client';

import { useParams } from 'next/navigation';

import { DetalleLecturaBiblioteca } from '@/features/contenido/Biblioteca';

export default function LecturaBibliotecaPage() {
  const { id } = useParams<{ id: string }>();
  return <DetalleLecturaBiblioteca lecturaId={id} base="/docente/biblioteca" />;
}
