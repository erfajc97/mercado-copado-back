# Estándares de Desarrollo Backend

Este documento define las buenas prácticas y estructura estándar para el desarrollo del backend en NestJS, asegurando código escalable, mantenible y consistente.

## 📁 Estructura de Carpetas

Cada módulo/feature debe seguir esta estructura:

```
src/{module-name}/
├── dto/                    # Data Transfer Objects (DTOs)
│   ├── create-{entity}.dto.ts
│   ├── update-{entity}.dto.ts
│   └── {query}-{entity}.dto.ts
├── {module}.controller.ts   # Controlador (endpoints HTTP)
├── {module}.service.ts     # Lógica de negocio
└── {module}.module.ts       # Módulo NestJS
```

## 🎯 Separación de Responsabilidades

### Controllers
- **Responsabilidad**: Manejar peticiones HTTP, validar parámetros, y retornar respuestas
- **NO debe contener**: Lógica de negocio, queries a base de datos, validaciones complejas
- **Debe hacer**:
  - Validar DTOs usando decoradores de NestJS
  - Llamar a métodos del service
  - Retornar respuestas HTTP apropiadas
  - Manejar autenticación y autorización con guards

**Ejemplo:**
```typescript
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;
    return this.productsService.findAll(search, pageNumber, limitNumber);
  }
}
```

### Services
- **Responsabilidad**: Contener toda la lógica de negocio
- **Debe hacer**:
  - Interactuar con Prisma (base de datos)
  - Aplicar reglas de negocio
  - Transformar datos
  - Validar permisos y autorizaciones
- **NO debe hacer**:
  - Manejar directamente peticiones HTTP
  - Retornar objetos HTTP directamente (debe retornar datos)

**Ejemplo:**
```typescript
@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    search?: string,
    page?: number,
    limit?: number,
  ) {
    // Lógica de negocio aquí
    const whereClause = search ? { name: { contains: search } } : {};
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereClause,
        skip,
        take: limitNumber,
      }),
      this.prisma.product.count({ where: whereClause }),
    ]);

    return createPaginationResponse(products, total, pageNumber, limitNumber);
  }
}
```

### DTOs
- **Responsabilidad**: Validar y tipar datos de entrada
- **Debe usar**: Class-validator y class-transformer
- **Debe definir**: Tipos claros y validaciones apropiadas

**Ejemplo:**
```typescript
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

## 📄 Estructura de Respuestas

### Respuestas Paginadas

**TODAS las respuestas paginadas deben usar el helper `createPaginationResponse` y seguir esta estructura:**

```typescript
{
  content: Array<T>,        // Array de items
  pagination: {
    page: number,           // Página actual
    limit: number,           // Items por página
    total: number,           // Total de items
    totalPages: number,      // Total de páginas
  }
}
```

**Uso del helper:**
```typescript
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';

// En el service
const [items, total] = await Promise.all([
  this.prisma.entity.findMany({ skip, take: limit }),
  this.prisma.entity.count({ where }),
]);

return createPaginationResponse(items, total, page, limit);
```

**IMPORTANTE**: 
- ❌ NO usar `users`, `orders`, `products` como nombre del array
- ✅ SIEMPRE usar `content` para mantener consistencia
- ✅ SIEMPRE usar el helper `createPaginationResponse`

### Respuestas Simples

Para respuestas que no requieren paginación, retornar directamente el objeto o array:

```typescript
// Retornar un objeto
return { message: 'Operación exitosa', data: result };

// Retornar un array
return items;
```

## 🔧 Helpers Comunes

### Paginación

**Ubicación**: `src/common/helpers/pagination.helper.ts`

**Uso obligatorio** para todas las respuestas paginadas:

```typescript
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';

return createPaginationResponse(items, total, page, limit);
```

## 🛡️ Autenticación y Autorización

### Guards

- **JwtAuthGuard**: Verificar que el usuario esté autenticado
- **AdminGuard / RolesGuard**: Verificar roles específicos
- **Public**: Decorador para endpoints públicos

**Ejemplo:**
```typescript
@Get('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
findAllForAdmin(@Query() queryDto: AdminQueryDto) {
  return this.service.findAllForAdmin(queryDto);
}
```

## 📝 Validación de Datos

### DTOs con Class Validator

Todos los DTOs deben usar decoradores de `class-validator`:

```typescript
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsPositive } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

### Validación de Query Parameters

Para query parameters, usar DTOs o validar manualmente:

```typescript
@Get()
findAll(
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  const pageNumber = page ? parseInt(page, 10) : undefined;
  const limitNumber = limit ? parseInt(limit, 10) : undefined;
  // Validar que sean números válidos
  return this.service.findAll(pageNumber, limitNumber);
}
```

## 🗄️ Interacción con Base de Datos

### Prisma Service

- **Inyectar**: `PrismaService` en los services
- **Usar transacciones**: Para operaciones que requieren atomicidad
- **Optimizar queries**: Usar `Promise.all` para queries paralelas

**Ejemplo:**
```typescript
const [items, total] = await Promise.all([
  this.prisma.entity.findMany({ skip, take: limit }),
  this.prisma.entity.count({ where }),
]);
```

### Manejo de Errores

- **Prisma errors**: Capturar y transformar a errores HTTP apropiados
- **Validaciones**: Lanzar `BadRequestException` para datos inválidos
- **No encontrado**: Lanzar `NotFoundException` cuando un recurso no existe

**Ejemplo:**
```typescript
async findOne(id: string) {
  const entity = await this.prisma.entity.findUnique({ where: { id } });
  if (!entity) {
    throw new NotFoundException(`Entity with ID ${id} not found`);
  }
  return entity;
}
```

## 🧹 Código Limpio

### Funciones Pequeñas

- **Máximo 50 líneas por función** (idealmente menos)
- **Una responsabilidad por función**
- **Extraer lógica compleja a funciones helper**

### Archivos No Muy Extensos

- **Máximo 400-500 líneas por archivo**
- **Si un service es muy grande, considerar dividirlo en múltiples services o usar helpers**

### Nomenclatura

- **Controllers**: `{Module}Controller` (ej: `ProductsController`)
- **Services**: `{Module}Service` (ej: `ProductsService`)
- **DTOs**: `{Action}{Entity}Dto` (ej: `CreateProductDto`, `UpdateProductDto`)
- **Métodos**: Verbos descriptivos (ej: `findAll`, `create`, `update`, `remove`)

### Comentarios

- **Documentar funciones complejas** con JSDoc
- **Evitar comentarios obvios** que solo repiten el código
- **Usar comentarios para explicar "por qué"**, no "qué"

**Ejemplo:**
```typescript
/**
 * Calcula el total de una orden incluyendo descuentos y envío
 * @param items Items de la orden
 * @param discount Descuento aplicado (0-100)
 * @param shippingCost Costo de envío
 * @returns Total calculado
 */
calculateOrderTotal(items: OrderItem[], discount: number, shippingCost: number): number {
  // Lógica aquí
}
```

## 🔄 Reutilización de Código

### Helpers Comunes

- **Crear helpers reutilizables** en `src/common/helpers/`
- **Evitar duplicación** de lógica entre services
- **Usar funciones puras** cuando sea posible

### Servicios Compartidos

- **Crear servicios compartidos** para lógica común entre módulos
- **Ejemplo**: `EmailService`, `FileUploadService`, `NotificationService`

## 📦 Imports

### Orden de Imports

1. Imports de NestJS/core
2. Imports de librerías externas
3. Imports relativos (mismo módulo)
4. Imports absolutos (otros módulos)

**Ejemplo:**
```typescript
// 1. NestJS
import { Injectable, NotFoundException } from '@nestjs/common';

// 2. Librerías externas
import { Prisma } from '@prisma/client';

// 3. Relativos
import { CreateProductDto } from './dto/create-product.dto.js';

// 4. Absolutos
import { PrismaService } from '../prisma/prisma.service.js';
import { createPaginationResponse } from '../common/helpers/pagination.helper.js';
```

### Extensiones .js

- **Usar `.js` en imports** para compatibilidad con ESM:
```typescript
import { Something } from './something.js';
```

## 🚫 Anti-Patrones a Evitar

### ❌ NO hacer:

1. **Lógica de negocio en controllers**
2. **Queries directas a Prisma en controllers**
3. **Respuestas inconsistentes** (usar `users` en lugar de `content`)
4. **Validaciones manuales** cuando se puede usar class-validator
5. **Funciones muy largas** (>100 líneas)
6. **Archivos muy extensos** (>500 líneas)
7. **Duplicación de código** entre services
8. **Manejo de errores genérico** sin contexto
9. **Queries N+1** (usar `include` o `select` apropiadamente)
10. **Transacciones innecesarias** (solo cuando se requiere atomicidad)

### ✅ SÍ hacer:

1. **Separar responsabilidades** claramente
2. **Usar helpers comunes** para lógica repetida
3. **Validar datos** con DTOs y class-validator
4. **Manejar errores** apropiadamente
5. **Optimizar queries** con `Promise.all` y `include`
6. **Documentar código complejo**
7. **Mantener funciones pequeñas** y enfocadas
8. **Usar tipos** de TypeScript apropiadamente
9. **Seguir estructura estándar** de carpetas
10. **Usar `createPaginationResponse`** para todas las respuestas paginadas

## 📚 Recursos Adicionales

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Class Validator](https://github.com/typestack/class-validator)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
