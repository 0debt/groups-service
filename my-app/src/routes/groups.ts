// routes/groups.ts
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { createGroup } from '../services/Group'

import { ReserachchByName } from '../services/Group'

export const groupsRoute = new OpenAPIHono()



const groupSchema = z.object({
    name: z.string(),
    owner: z.string(),
    description: z.string().optional(),
    members: z.array(z.string()),
})
groupsRoute.openapi(
    {
        method: 'get',
        path: '/{groupId}/members/{userId}',
        summary: 'Verify if a user is member of a group',
        request: {
            params: z.object({
                groupId: z.string().openapi({ description: 'ID of the group' }),
                userId: z.string().openapi({ description: 'ID of the user' }),
            })
        },
        responses: {
            200: {
                description: 'User is member of the group',
                content: {
                    'application/json': {
                        schema: z.object({
                            groupId: z.string(),
                            userId: z.string(),
                            isMember: z.boolean(),
                        })
                    }
                }
            },
            404: {
                description: 'User is not member of the group'

            }
        }
    },
    async (c) => {
        try {
            const groupId = c.req.param('groupId')
            const userId = c.req.param('userId')
            if (!groupId || !userId) {
                return c.json({ error: 'Missing groupId or userId' }, 400)
            }
            const group = await ReserachchByName(userId)
            const isMember = group.some(g => g._id.toString() === groupId);
            if (isMember) {
                return c.json({ groupId, userId, isMember: true })
            } else {
                return c.json({ error: 'User is not member of the group' }, 404)
            }
        } catch (error) {
            return c.json({ error: 'Failed to verify membership' }, 400)
        }
    }

)
groupsRoute.openapi(
    {
        method: 'post',
        path: '/creation',
        summary: 'Crea un nuovo gruppo',
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: groupSchema,
                    },
                },
            },
        },
        responses: {
            200: { description: 'Gruppo creato correttamente' },
            400: { description: 'Errore nella creazione del gruppo' },
        },
    },
    async (c) => {
        try {
            const body = await c.req.valid('json')
            const group = await createGroup(body.name, body.owner, body.description || '', body.members)
            return c.json(group)
        } catch (error) {
            return c.json({ error: 'Failed to create group' }, 400)
        }
    }
)



groupsRoute.openapi(
    {
        method: 'get',
        path: '/visualization',
        summary: 'Ricerca gruppi per nome membro',
        request: {
            query: z.object({
                name: z.string().openapi({ description: 'Nome del membro' }),
            }),
        },

        responses: {
            200: { description: 'Gruppi recuperati correttamente' },
            400: { description: 'Errore nel recupero dei gruppi' },
        },
    },
    async (c) => {
        try {
            const memberName = c.req.query('name') || ''
            const groups = await ReserachchByName(memberName)
            return c.json(groups)
        } catch (error) {
            return c.json({ error: 'Failed to get groups' }, 400)
        }
    }

)
