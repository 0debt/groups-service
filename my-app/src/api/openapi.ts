
import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { groupsRoute } from '../routes/groups'
export const api = new OpenAPIHono()

api.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
        title: 'groups-service API',
        version: '1.0.0',
    },
    servers: [{ url: '/api', description: 'Base delle API' }],
})

// INTERFACCIA SWAGGER-UI
api.get('/docs', swaggerUI({ url: '/openapi.json' }))


