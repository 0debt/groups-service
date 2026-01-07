# Groups Service

Microservice for managing groups in a shared expense management application. The service provides RESTful APIs to create, update, delete, and manage user groups, with support for subscription plans, Redis caching, pub/sub events, and integration with external services.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Technologies](#-technologies)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Starting the Service](#-starting-the-service)
- [API Endpoints](#-api-endpoints)
- [Subscription Plans](#-subscription-plans)
- [Implemented Patterns](#-implemented-patterns)
- [Testing](#-testing)
- [Docker](#-docker)

## 🚀 Features

- **Complete group management**: creation, modification, deletion, and retrieval
- **Member management**: add and remove members with permission control
- **Plan system**: FREE, PRO, ENTERPRISE with differentiated limits
- **JWT authentication**: middleware for token verification
- **Intelligent caching**: Redis for performance optimization
- **Event-driven architecture**: event publishing via Redis Pub/Sub
- **Circuit Breaker**: protection against external service failures
- **Unsplash integration**: random images for groups
- **Materialized Views**: pre-calculated group summaries
- **API documentation**: integrated Swagger UI
- **Event consumer**: listen to events from expenses-service

## 🏗️ Architecture

The service follows a microservice architecture with the following components:

```
┌─────────────────┐
│   API Gateway   │
└────────┬────────┘
         │
    ┌────▼─────────────────┐
    │  Groups Service      │
    │  (Hono + OpenAPI)    │
    └──┬────────────────┬──┘
       │                │
  ┌────▼────┐      ┌────▼────┐
  │ MongoDB │      │  Redis  │
  │ (Groups)│      │ (Cache) │
  └─────────┘      └────┬────┘
                        │
                   ┌────▼────────┐
                   │  Pub/Sub    │
                   │  Events     │
                   └─────────────┘
```

### Main Components

- **Routes**: OpenAPI endpoint definitions with Zod validation
- **Services**: Business logic for group operations
- **Middleware**: JWT authentication and request validation
- **Consumers**: Redis event subscription from other services
- **Circuit Breaker**: Resilience for external service calls
- **Cache Layer**: Redis for frequent query optimization

## 🛠️ Technologies

- **Runtime**: [Bun](https://bun.sh/) - High-performance JavaScript/TypeScript runtime
- **Framework**: [Hono](https://hono.dev/) - Ultra-lightweight web framework
- **Database**: [MongoDB](https://www.mongodb.com/) with Mongoose ODM
- **Cache/Pub-Sub**: [Redis](https://redis.io/) with ioredis
- **API Documentation**: [@hono/zod-openapi](https://github.com/honojs/middleware) + Swagger UI
- **Validation**: [Zod](https://zod.dev/) for type-safe schema validation
- **Authentication**: JWT with [jose](https://github.com/panva/jose) library
- **External APIs**: [Unsplash API](https://unsplash.com/developers) for images

## 📦 Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) and Docker Compose (optional but recommended)
- [MongoDB](https://www.mongodb.com/) >= 6.0
- [Redis](https://redis.io/) >= 7.0

## 💻 Installation

### Local Installation

```bash
# Clone the repository
git clone <repository-url>
cd groups-service

# Install dependencies
bun install
```

## ⚙️ Configuration

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=3000

# MongoDB
MONGODB_URL=mongodb://admin:password@localhost:27017/groupsdb?authSource=admin

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET_KEY=your-jwt-secret-key-here

# Users Service (for member validation)
USERS_SERVICE_URL=http://localhost:3001

# Unsplash API (optional - for group images)
ACCES_KEY_UNSPLASH=your-unsplash-access-key

# Environment
NODE_ENV=development
```

### Getting API Keys

**Unsplash API** (optional):
1. Sign up at [Unsplash Developers](https://unsplash.com/developers)
2. Create a new application
3. Copy the Access Key

## 🚦 Starting the Service

### With Docker Compose (Recommended)

```bash
# Start MongoDB and Redis
docker-compose up -d

# Start the service
bun run dev
```

### Manually

```bash
# Ensure MongoDB and Redis are running
# Then start the service in development mode
bun run dev
```

The service will be available at: `http://localhost:3000`

### Swagger UI

Interactive API documentation available at: `http://localhost:3000/api/docs`

## 📡 API Endpoints

### Authentication

All endpoints require a JWT token in the header:
```
Authorization: Bearer <token>
```

### Available Endpoints

#### **GET** `/api/groups/{groupId}/summary`
Retrieve the materialized summary of a group (with caching).

**Response:**
```json
{
  "groupId": "string",
  "name": "string",
  "description": "string",
  "members": ["userId1", "userId2"],
  "membersCount": 2,
  "owner": "ownerId",
  "imageUrl": "https://...",
  "createdAt": "2026-01-07T...",
  "updatedAt": "2026-01-07T..."
}
```

#### **GET** `/api/groups/{groupId}/members/{userId}`
Verify if a user is a member of a group (used by expenses-service).

**Response:**
```json
{
  "groupId": "string",
  "userId": "string",
  "isMember": true
}
```

#### **POST** `/api/groups`
Create a new group.

**Body:**
```json
{
  "name": "Group Name",
  "description": "Optional description"
}
```

**Response:** `201 Created`
```json
{
  "_id": "groupId",
  "name": "Group Name",
  "description": "Description",
  "owner": "userId",
  "members": ["userId"],
  "imageUrl": "https://...",
  "createdAt": "2026-01-07T...",
  "updatedAt": "2026-01-07T..."
}
```

#### **DELETE** `/api/groups/{id}`
Delete a group (owner only).

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

#### **POST** `/api/groups/updateMember`
Add or remove members from a group (owner only).

**Body:**
```json
{
  "groupId": "string",
  "members": ["email-to-add@example.com", "email-to-remove@example.com"]
}
```

#### **PATCH** `/api/groups/{groupId}`
Update group name or description (owner only).

**Body:**
```json
{
  "name": "New Name",
  "description": "New Description"
}
```

#### **GET** `/api/groups?memberId={userId}`
Retrieve all groups for a user.

**Query Parameters:**
- `memberId` (optional): User ID (default: authenticated user)

**Response:**
```json
[
  {
    "_id": "groupId",
    "name": "Group Name",
    "members": [...],
    "owner": "userId",
    ...
  }
]
```

## 💎 Subscription Plans

The service implements three plan tiers:

| Plan | Max Groups | Max Members per Group |
|-------|------------|----------------------|
| **FREE** | 3 | 5 |
| **PRO** | ∞ | 50 |
| **ENTERPRISE** | ∞ | ∞ |

Limits are automatically enforced during:
- Group creation
- Member addition

## 🎯 Implemented Patterns

### Circuit Breaker

Protection against external service failures (Unsplash, Users Service):

```typescript
// States: CLOSED -> OPEN -> HALF_OPEN
// Threshold: 5 failures
// Timeout: 60 seconds
```

### Event-Driven Architecture

Events published on Redis:
- `group.created`
- `group.deleted`
- `group.updated`
- `group.member.added`
- `group.member.removed`

### Materialized Views

Pre-calculated group summaries with Redis caching (TTL: 1 hour).

### Caching Strategy

- User query cache (email → userId)
- Group summary cache
- Daily counter cache
- Configured TTLs per data type

## 🧪 Testing

```bash
# Run all tests
bun test

# Specific tests
bun test src/tests/auth.test.ts
bun test src/tests/circuitBreaker.test.ts
bun test src/tests/routes.test.ts
```

### Test Coverage

The project includes tests for:
- JWT authentication
- Circuit Breaker
- Route handlers
- Middleware

## 🐳 Docker

### Build Image

```bash
docker build -t groups-service .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e MONGODB_URL=mongodb://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET_KEY=... \
  groups-service
```

### Docker Compose

The `docker-compose.yml` file includes:
- Redis with persistence
- MongoDB with authentication
- Configured health checks

```bash
# Start complete stack
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## 📂 Project Structure

```
groups-service/
├── src/
│   ├── index.ts              # Entry point
│   ├── api/
│   │   └── openapi.ts        # OpenAPI configuration + Swagger
│   ├── config/
│   │   └── plans.ts          # Subscription plans definition
│   ├── consumers/
│   │   └── expensesConsumer.ts  # Expenses events consumer
│   ├── db/
│   │   └── db.ts             # MongoDB connection
│   ├── lib/
│   │   ├── circuitBreaker.ts # Circuit Breaker implementation
│   │   ├── redisPublisher.ts # Redis events publisher
│   │   ├── redisSubscriber.ts# Redis events subscriber
│   │   └── unsplash.ts       # Unsplash API client
│   ├── middlware/
│   │   └── auth.ts           # JWT authentication middleware
│   ├── routes/
│   │   └── groups.ts         # Groups routes (OpenAPI)
│   ├── services/
│   │   ├── services.ts       # Groups business logic
│   │   └── summaryGroup.ts   # Materialized views
│   ├── tests/                # Test suite
│   ├── types/
│   │   └── app.ts            # Type definitions
│   └── utils/
│       └── jwt.ts            # JWT utilities
├── types/
│   └── appEnv.ts             # Environment types
├── docker-compose.yml        # Local stack MongoDB + Redis
├── Dockerfile                # Service build
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Troubleshooting

### MongoDB Connection Error

Verify that MongoDB is running and the URL is correct:
```bash
docker-compose ps
# Or test the connection
mongosh "mongodb://admin:password@localhost:27017/groupsdb?authSource=admin"
```

### Redis Connection Error

Verify that Redis is running:
```bash
docker-compose ps
redis-cli ping  # Should respond "PONG"
```

### JWT Invalid Token

Make sure that:
- The token is valid and not expired
- The `JWT_SECRET_KEY` is the same used to generate the token
- The `Authorization` header is in the format: `Bearer <token>`

### Circuit Breaker OPEN

If you see "service unavailable" errors, the circuit breaker is open:
- Wait 60 seconds for automatic reset
- Verify that the external service is available

## 📝 Development Notes

- The service uses Bun as runtime for optimal performance
- All endpoints are documented with OpenAPI 3.0
- Input validation happens via Zod schemas
- Events are published asynchronously on Redis
- Unsplash images are optional (graceful fallback)

## 🤝 Contributing

To contribute to the project:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is distributed under the MIT License.

## 👥 Authors

Developed by the 0debt team
