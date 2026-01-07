# Groups Service

| Metadatos | Detalle |
| :--- | :--- |
| **Asignatura** | Fundamentos de Ingeniería de Software |
| **Curso** | 2025/26 |
| **Nota a la que se opta** | **10** |
| **Integrantes** | Luigi Di Donna y Giulia Barresi |

## 📝 DESCRIPCIÓN DEL MICROSERVICIO

Este microservicio es el núcleo de la gestión de comunidades en **0debt**. Se encarga del ciclo de vida de los grupos, la gestión de membresías, la aplicación de políticas de acceso basadas en planes de precios y la sincronización de estados mediante vistas materializadas.

---

## ✅ MICROSERVICIO BÁSICO

Todos los requisitos del microservicio básico están implementados y operativos:

| Requisito | Implementación / Referencia | Estado |
| :--- | :--- | :---: |
| **API REST** (GET, POST, PATCH, DELETE) | `src/routes/groups.ts` (Implementado con Hono) | ✅ |
| **Mecanismo de autenticación** | Middleware propio que inyecta contexto de usuario (`src/middlware/auth.ts`) | ✅ |
| **Frontend con todas las operaciones** | Frontend común Next.js (integrado mediante API Gateway) | ✅ |
| **Desplegado en la nube** | Coolify (Docker container en VPS Hetzner) | ✅ |
| **API versionada** | Endpoints base accesibles y versionados | ✅ |
| **Documentación de operaciones** | OpenAPI/Swagger nativo (`@hono/zod-openapi`) | ✅ |
| **Persistencia MongoDB** | MongoDB Atlas + Mongoose (`src/services/services.ts`) | ✅ |
| **Validación de datos** | Zod schemas en rutas (`src/routes/groups.ts`) | ✅ |
| **Imagen Docker** | `Dockerfile` optimizado con Bun en raíz del proyecto | ✅ |
| **GitHub Flow** | Repositorio con gestión de ramas y Pull Requests | ✅ |
| **CI/CD GitHub Actions** | Workflows para testing y build de imagen Docker | ✅ |
| **Tests de componente** | **30+ tests** con Bun Test (`src/tests/routes.test.ts`) | ✅ |

---

## 🚀 MICROSERVICIO AVANZADO

Se han implementado **6 características** requeridas para la nota máxima (requisito: mín. 6):

| # | Característica | Descripción | Referencia |
| :---: | :--- | :--- | :--- |
| **1** | **Materialized View** | Vista desnormalizada `GroupSummary` para lecturas ultrarrápidas de contadores y totales sin joins costosos. | `src/services/summaryGroup.ts` |
| **2** | **Caché Redis** | Estrategia *Cache-Aside* para perfiles de usuario y sumarios de grupo (TTL variable). | `src/routes/groups.ts`, `src/services/services.ts` |
| **3** | **API Externa** | Consumo de **Unsplash API** para generación de portadas y **Users Service** para validación de miembros. | `src/services/services.ts` (`requestPhoto`), `src/routes/groups.ts` |
| **4** | **Circuit Breaker** | Implementación propia para proteger llamadas a Users Service y Unsplash (Estados: OPEN, CLOSED, HALF_OPEN). | `src/lib/circuitBreaker.ts`, `src/routes/groups.ts` |
| **5** | **Comunicación Asíncrona** | Publicación de eventos de dominio (`group.deleted`, `group.member.added`) vía Redis Pub/Sub. | `src/lib/redisPublisher.ts` |
| **6** | **Gestión de Capacidad** | **Throttling lógico**: Limitación de creación de grupos y miembros según el plan del usuario (FREE, PRO, ENTERPRISE). | `src/routes/groups.ts` (Lógica `PLAN_LIMITS`) |

---

## 🌐 APLICACIÓN AVANZADA

Contribuciones del microservicio `groups-service` a las características de la aplicación avanzada:

| # | Característica | Contribución | Referencia |
| :---: | :--- | :--- | :--- |
| **1** | **Límites de uso en plan de precios** | Control estricto de cuotas (Max Grupos/Miembros) basado en el plan del usuario inyectado en el JWT. | `src/config/plans.ts`, `src/routes/groups.ts` |
| **2** | **Interacción Backend-Backend** | Integración directa con **Users Service** para resolución de emails a IDs internos. | `src/routes/groups.ts` (Endpoint `/updateMember`) |
| **3** | **Sistema comunicación asíncrono** | Fuente de verdad para eventos críticos (`group.deleted`) que disparan limpieza en otros servicios (Gastos, Notificaciones). | `src/lib/redisPublisher.ts` |
| **4** | **Tests de Integración Automatizados** | Suite de tests que simula la interacción completa con dependencias externas mockeadas. | `src/tests/routes.test.ts` |

---

## 🏆 REQUISITOS ESPECÍFICOS (Nota 9 - 10)

Cumplimiento estricto de los criterios de evaluación superior:

| Requisito | Estado | V |
| :--- | :--- | :---: |
| Mínimo 20 pruebas de componente (escenarios positivos y negativos) | **30+ tests implementados** | ✅ |
| API documentada con Swagger/OpenAPI | `@hono/zod-openapi` → JSON Spec | ✅ |
| Al menos 5 características microservicio avanzado (nota 9) | **6 implementadas** | ✅ |
| Al menos 6 características microservicio avanzado (nota 10) | **6 implementadas** | ✅ |
| Al menos 3 características aplicación avanzada (nota 9) | **4 contribuciones** | ✅ |
| Al menos 4 características aplicación avanzada (nota 10) | **4 contribuciones** | ✅ |

---

## 🧪 DETALLE DE TESTS

Desglose de la cobertura de pruebas realizada con **Bun Test**:

| Archivo | Tests | Descripción |
| :--- | :---: | :--- |
| `src/tests/routes.test.ts` | 22 | Tests de componentes de API (CRUD, Validación Zod, Auth, Cache, Límites de Plan, Manejo de Errores 4xx/5xx). |
| `src/tests/circuitBreaker.test.ts` | 6 | Tests unitarios de la máquina de estados del Circuit Breaker (Transiciones Closed -> Open -> Half-Open). |
| `src/tests/auth.test.ts` | 3 | Verificación de seguridad, headers y validación de tokens. |
| **TOTAL** | **31** | **Cobertura completa de escenarios de éxito y fallo.** |

---

## 🔌 ENDPOINTS DE LA API

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| **GET** | `/{groupId}/summary` | Obtiene la vista materializada del grupo (Optimizado con Redis). |
| **GET** | `/{groupId}/members/{userId}` | Verifica membresía (Utilizado por Gateway/Otros servicios). |
| **POST** | `/` | Crea un nuevo grupo (Con validación de límites de plan y foto Unsplash). |
| **DELETE** | `/{id}` | Elimina un grupo y dispara evento `group.deleted`. |
| **POST** | `/updateMember` | Añade o elimina miembros (Con validación contra Users Service). |
| **PATCH** | `/{groupId}` | Actualiza nombre o descripción del grupo. |
| **GET** | `/` | Lista grupos del usuario autenticado. |

---

## 📂 ESTRUCTURA DEL PROYECTO

| Ruta | Descripción |
| :--- | :--- |
| `src/routes/groups.ts` | Controladores y definición OpenAPI de la API. |
| `src/services/services.ts` | Lógica de negocio, modelos Mongoose y llamadas a APIs externas. |
| `src/services/summaryGroup.ts` | Lógica de la Vista Materializada (`GroupSummary`). |
| `src/lib/circuitBreaker.ts` | Implementación de la clase Circuit Breaker. |
| `src/lib/redisPublisher.ts` | Cliente Redis para publicación de eventos. |
| `src/middlware/auth.ts` | Middleware de autenticación y contexto de usuario. |
| `src/config/plans.ts` | Configuración estática de límites por plan (Free/Pro/Ent). |
| `src/tests/` | Suite de tests (Rutas, Auth, Circuit Breaker). |

---

## 🏁 CONCLUSIÓN

El microservicio `groups-service` cumple todos los requisitos para optar a la nota máxima (**10**):

* ✅ Microservicio básico completo
* ✅ 6 características de microservicio avanzado
* ✅ 4 contribuciones a aplicación avanzada
* ✅ 31 tests implementados
* ✅ Documentación OpenAPI/Swagger completa