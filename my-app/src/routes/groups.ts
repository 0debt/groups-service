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

//route for expenses-service or Gateway 
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
        } catch (error) {
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

                members: z.tuple([
                  z.string().optional(),  // email del membro da aggiungere
                  z.string().optional()           // userId del membro da rimuovere
                ])
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
  
        const emailToAdd = body.members[0]      // email
        const memberToRemove = body.members[1]  // userId
  
        let memberIdToAdd: string | undefined = undefined
  
        // Se devo aggiungere un membro, prima chiedo a users-service il suo ID
        if (emailToAdd) {
          const res = await fetch(
            `http://users-service:3000//internal/users/:id`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          )
  
          if (res.status === 404) {
            return c.json({ error: 'User not found' }, 400)
          }
  
          if (!res.ok) {
            return c.json({ error: 'Error calling users-service' }, 400)
          }
  
          const user = await res.json() as { id: string }
          memberIdToAdd = String(emailToAdd)  // questo è lo userId da passare al service
        }
  
        // Qui chiami il tuo service come prima ma gli passi lo userId (non l'email) se stai aggiungendo
        const group = await updateGroupMembers(
          body.groupId,
          memberIdToAdd,   // può essere undefined se non stai aggiungendo
          memberToRemove   // lo lasci uguale (userId da rimuovere)
        )
  
        return c.json(group)
      }
      catch (error) {
        console.error(error)
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
