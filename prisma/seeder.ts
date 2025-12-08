import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

// Cargar variables de entorno
config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    console.log('🌱 Iniciando seed completo de Mercado Copado...');

    // Crear usuarios si no existen
    const existingUsers = await prisma.user.findMany();
    if (existingUsers.length === 0) {
      console.log('👤 Creando usuarios de ejemplo...');

      // Crear usuario administrador
      const adminPassword = await bcrypt.hash('admin123', 10);
      const admin = await prisma.user.create({
        data: {
          email: 'admin@mercadocopado.com',
          password: adminPassword,
          firstName: 'Admin',
          lastName: 'Mercado Copado',
          role: 'ADMIN',
          isVerified: true,
        },
      });

      // Crear usuario normal
      const userPassword = await bcrypt.hash('user123', 10);
      const user = await prisma.user.create({
        data: {
          email: 'usuario@mercadocopado.com',
          password: userPassword,
          firstName: 'Juan',
          lastName: 'Pérez',
          role: 'USER',
          isVerified: true,
        },
      });

      console.log('✅ Usuarios creados:');
      console.log(`   👑 Admin: ${admin.email} / admin123`);
      console.log(`   👤 Usuario: ${user.email} / user123`);
    } else {
      console.log(
        `⏭️  Ya existen ${existingUsers.length} usuarios en la base de datos`,
      );
    }

    // Verificar si ya hay productos
    const existingProducts = await prisma.product.findMany({
      include: {
        images: true,
      },
    });

    if (existingProducts.length === 0) {
      console.log(
        '📦 No hay productos. Creando categorías, subcategorías y productos de ejemplo...',
      );

      // Crear categorías
      const categoriaElectronica = await prisma.category.create({
        data: {
          name: 'Electrónica',
          subcategories: {
            create: [
              { name: 'Smartphones' },
              { name: 'Laptops' },
              { name: 'Tablets' },
            ],
          },
        },
        include: { subcategories: true },
      });

      const categoriaRopa = await prisma.category.create({
        data: {
          name: 'Ropa',
          subcategories: {
            create: [{ name: 'Hombre' }, { name: 'Mujer' }, { name: 'Niños' }],
          },
        },
        include: { subcategories: true },
      });

      const categoriaHogar = await prisma.category.create({
        data: {
          name: 'Hogar',
          subcategories: {
            create: [
              { name: 'Muebles' },
              { name: 'Decoración' },
              { name: 'Cocina' },
            ],
          },
        },
        include: { subcategories: true },
      });

      console.log('✅ Categorías y subcategorías creadas');

      // Crear productos de ejemplo
      const productosEjemplo = [
        // Electrónica - Smartphones
        {
          name: 'iPhone 15 Pro',
          description:
            'El último smartphone de Apple con chip A17 Pro y cámara de 48MP',
          price: 999.99,
          discount: 0,
          categoryId: categoriaElectronica.id,
          subcategoryId: categoriaElectronica.subcategories[0].id,
        },
        {
          name: 'Samsung Galaxy S24',
          description: 'Smartphone Android con pantalla AMOLED de 6.2 pulgadas',
          price: 899.99,
          discount: 10,
          categoryId: categoriaElectronica.id,
          subcategoryId: categoriaElectronica.subcategories[0].id,
        },
        // Electrónica - Laptops
        {
          name: 'MacBook Pro 16"',
          description: 'Laptop profesional con chip M3 Pro y pantalla Retina',
          price: 2499.99,
          discount: 5,
          categoryId: categoriaElectronica.id,
          subcategoryId: categoriaElectronica.subcategories[1].id,
        },
        {
          name: 'Dell XPS 15',
          description: 'Laptop ultrabook con procesador Intel i7 y pantalla 4K',
          price: 1799.99,
          discount: 15,
          categoryId: categoriaElectronica.id,
          subcategoryId: categoriaElectronica.subcategories[1].id,
        },
        // Ropa - Hombre
        {
          name: 'Camisa Formal Azul',
          description: 'Camisa de algodón 100% para ocasiones formales',
          price: 49.99,
          discount: 20,
          categoryId: categoriaRopa.id,
          subcategoryId: categoriaRopa.subcategories[0].id,
        },
        {
          name: 'Jeans Clásicos',
          description: 'Pantalón jeans de corte clásico, cómodo y duradero',
          price: 79.99,
          discount: 0,
          categoryId: categoriaRopa.id,
          subcategoryId: categoriaRopa.subcategories[0].id,
        },
        // Ropa - Mujer
        {
          name: 'Vestido Casual',
          description: 'Vestido elegante perfecto para el día a día',
          price: 59.99,
          discount: 25,
          categoryId: categoriaRopa.id,
          subcategoryId: categoriaRopa.subcategories[1].id,
        },
        // Hogar - Muebles
        {
          name: 'Sofá Moderno',
          description: 'Sofá de 3 plazas con tapizado en tela gris',
          price: 599.99,
          discount: 30,
          categoryId: categoriaHogar.id,
          subcategoryId: categoriaHogar.subcategories[0].id,
        },
        {
          name: 'Mesa de Centro',
          description: 'Mesa de centro de madera con diseño minimalista',
          price: 149.99,
          discount: 10,
          categoryId: categoriaHogar.id,
          subcategoryId: categoriaHogar.subcategories[0].id,
        },
        // Hogar - Cocina
        {
          name: 'Set de Ollas Premium',
          description: 'Set completo de ollas y sartenes antiadherentes',
          price: 199.99,
          discount: 20,
          categoryId: categoriaHogar.id,
          subcategoryId: categoriaHogar.subcategories[2].id,
        },
      ];

      for (const productoData of productosEjemplo) {
        await prisma.product.create({
          data: productoData,
        });
      }

      console.log(`✅ Creados ${productosEjemplo.length} productos de ejemplo`);
    }

    // Obtener todos los productos (nuevos o existentes)
    const products = await prisma.product.findMany({
      include: {
        images: true,
      },
    });

    console.log(`📦 Total de productos: ${products.length}`);

    // Para cada producto, agregar imágenes si no tiene
    for (const product of products) {
      if (product.images.length === 0) {
        // Generar 2-3 imágenes por producto usando Picsum Photos
        // Usamos el ID del producto como seed para obtener imágenes consistentes
        const imageCount = Math.floor(Math.random() * 2) + 2; // 2 o 3 imágenes

        const images: Array<{ url: string; order: number }> = [];
        for (let i = 0; i < imageCount; i++) {
          // Usar el ID del producto + índice como seed para obtener imágenes diferentes pero consistentes
          const seed = `${product.id}-${i}`;
          const imageUrl = `https://picsum.photos/seed/${seed}/800/600`;

          images.push({
            url: imageUrl,
            order: i,
          });
        }

        // Crear las imágenes en la base de datos
        await prisma.productImage.createMany({
          data: images.map((img) => ({
            productId: product.id,
            url: img.url,
            order: img.order,
          })),
        });

        console.log(
          `✅ Agregadas ${imageCount} imágenes al producto: ${product.name}`,
        );
      } else {
        console.log(
          `⏭️  Producto "${product.name}" ya tiene ${product.images.length} imágenes`,
        );
      }
    }

    console.log('✨ Seed de imágenes completado!');
  } catch (error) {
    console.error('❌ Error durante el seed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
