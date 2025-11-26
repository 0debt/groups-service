// routes/groups.ts
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { createGroup, deleteGroup, updateGroupMembers } from '../services/Group'

import { ReserachchByName } from '../services/Group'

export const groupsRoute = new OpenAPIHono()



const groupSchema = z.object({
    groupId: z.string(),
    name: z.string(),
    owner: z.string(),
    description: z.string().optional(),
    members: z.array(z.string()),
})

groupsRoute.openapi(
    {
        method: 'post',
        path: '/creation',
        summary: 'Creation of a group',
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
            200: { description: 'Group correctly created' },
            400: { description: 'Error on the creation of the group' },
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
        method: 'post',
        path: '/deletion',
        summary: 'Deletion of a group',
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            groupId: z.string(),
                        }),
                    },
                },
            },
        },
        responses: {
            200: { description: 'Group correctly deleted' },
            400: { description: 'Error on the deletion of the group' },
        },
    },
    async (c) => {
        try {
            const body = await c.req.valid('json')
            const group = await deleteGroup(body.groupId)
            return c.json(group)
        }catch (error) {
            return c.json({ error: 'Failed to delete group' }, 400)
        }
    }
)


groupsRoute.openapi(
    {
        method: 'post',
        path: '/updateMember',
        summary: 'Add or delete an element of a group',
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            groupId: z.string(),
                            members: z.tuple([z.string().optional(), z.string().optional()])
                        }),
                    },
                },
            },
        },
        responses: {
            200: { description: 'Member added or deleted correctly' },
            400: { description: 'Error on adding or deleting a member of the group' },
        },
    },
    async (c) => {
        try {
            const body = await c.req.valid('json')
            const memberToAdd = body.members[0]
            const memberToRemove = body.members[1]
            const group = await updateGroupMembers(body.groupId, memberToAdd, memberToRemove)
            return c.json(group)
        }
        catch (error) {
            return c.json({ error: 'Failed to add or delete a member of a group' }, 400)
        }
    }
)

groupsRoute.openapi(
    {
        method: 'post',
        path: '/updateDetails',
        summary: 'Modify a detail (name or description) of a group',
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            groupId: z.string(),
                            name: z.string().optional(),
                            description: z.string().optional(),
                        }),
                    },
                },
            },
        },
        responses: {
            200: { description: 'Detail of the group modified correctly' },
            400: { description: 'Error on modifying a detail of the group' },
        },
    },
    async (c) => {
        try {
            const body = await c.req.valid('json')
            const groupId = body.groupId
            const name = body.name
            const description = body.description

            const group = await updateGroupMembers(groupId, name, description)
            
            return c.json(group)
        } catch (error) {
            return c.json({ error: 'Failed to modify a detail of a group' }, 400)
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
