import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articulos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articulos' }),
  schema: z.object({
    titulo: z.string(),
    resumen: z.string(),
    fecha: z.coerce.date(),
    tema: z.string(), // ej: "subvenciones", "maquinaria", "ganaderia"
    imagen: z.string().url().optional(), // URL de imagen destacada, opcional
  }),
});

export const collections = { articulos };
