// routes/groups.ts
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { createGroup, deleteGroup, updateGroupMembers, updateGroupInfo, IGroup } from '../services/services'
import { publishGroupEvent } from '../lib/redisPublisher'
import { ReserachchByName } from '../services/services'
import { getGroupSummary } from '../services/summaryGroup';
import { circuitBreaker } from '../lib/circuitBreaker';
import { redisCache } from '../services/services';
import { PLAN_LIMITS } from '../config/plans';
import mongoose from 'mongoose';
import type { AppEnv } from '../types/app';
import { authMiddleware } from '../middlware/auth';




export const groupsRoute = new OpenAPIHono<AppEnv>()


const circuitBreakerInstance = new circuitBreaker(5, 60000);

groupsRoute.use('*', authMiddleware);


const groupSchema = z.object({
  name: z.string(),
  owner: z.string(),
  description: z.string().optional(),
  members: z.array(z.string()),
})

groupsRoute.openapi(
  {
    method: 'get',
    path: '/{groupId}/summary',
    summary: 'Get materialized summary for a group',
    request: {
      params: z.object({
        groupId: z.string(),
      })
    },
    responses: {
      200: {
        description: 'Group summary',
        content: {
          'application/json': {
            schema: z.object({
              groupId: z.string(),
              name: z.string(),
              description: z.string().optional(),
              members: z.array(z.string()),
              membersCount: z.number(),
              owner: z.string(),
              imageUrl: z.string().optional(),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
          }
        }
      }
    }
  },

  async (c) => {

    const { groupId } = c.req.valid('param');
    const cachedSummary = await redisCache.get(`group_summary:${groupId}`);
    if (!cachedSummary) {

      const summary = await getGroupSummary(groupId);
      if (!summary) {
        throw new Error('Group not found');
      }
      await redisCache.set(`group_summary:${groupId}`, JSON.stringify(summary), 'EX', 3600);
      return c.json(summary, 200);

    }
    else {
      return c.json(JSON.parse(cachedSummary), 200);

    }

  }
);

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
      const isMember = group.some((g: IGroup) => (g._id as mongoose.Types.ObjectId).toString() === groupId);
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
      const user = c.get('user')
      const body = await c.req.valid('json')

      //check plan limits
      if (!user.plan) {
        return c.json({ error: 'User plan not found' }, 400);
      }
      const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];

      const userGroupsCount = await redisCache.get(`user_groups_count:${user.sub}`);
      if (!userGroupsCount) {
        //if not in cache, fetch from DB and set cache
        const groups = await ReserachchByName(user.sub);
        const count = groups.length;
        await redisCache.set(`user_groups_count:${user.sub}`, count.toString(), 'EX', 86400);
      }
      const currentCount = userGroupsCount ? parseInt(userGroupsCount) : 0;
      if (currentCount >= limits.maxGroups) {
        return c.json({ error: 'Group creation limit reached for your plan' }, 403);
      }

      const group = await createGroup(body.name, body.owner, body.description || '', body.members)
      //update cached count

      await redisCache.set(`user_groups_count:${user.sub}`, (currentCount + 1).toString(), 'EX', 86400);

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

      await publishGroupEvent({
        type: 'group.deleted',
        groupId: body.groupId,
        payload: {
          name: group.name,
          owner: group.owner,
          members: group.members,
        },
        timestamp: new Date().toISOString(),
      })
      const user = c.get('user')
      //update cached count
      const userGroupsCount = await redisCache.get(`user_groups_count:${user.sub}`);
      if (!userGroupsCount) {
        //if not in cache, fetch from DB and set cache
        const groups = await ReserachchByName(user.sub);
        const count = groups.length;
        if (count > 0) { await redisCache.set(`user_groups_count:${user.sub}`, (count - 1).toString(), 'EX', 86400); }
        else {
          await redisCache.set(`user_groups_count:${user.sub}`, '0', 'EX', 86400);
          return c.json({ error: 'not enough groups to delete' }, 400);
        }

      }
      const currentCount = userGroupsCount ? parseInt(userGroupsCount) : 0;
      await redisCache.set(`user_groups_count:${user.sub}`, Math.max(0, currentCount - 1).toString(), 'EX', 86400);

      return c.json(group)
    } catch (error) {
      console.error(error)
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
                z.string().optional(), // email del membro da aggiungere
                z.string().optional(), // userId del membro da rimuovere
              ]),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Member added or deleted correctly' },
      400: {
        description: 'Error on adding or deleting a member of the group',
      },
    },
  },
  async (c) => {
    try {
      const body = await c.req.valid('json')

      const emailToAdd = body.members[0]
      const memberToRemove = body.members[1]
      const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL!;

      let memberIdToAdd: string | undefined = undefined
      let memberIdToRemove: string | undefined = undefined
      //First check if we can add a member and resolve the userId
      if (emailToAdd) {
        const user = c.get('user')
        //check plan limits
        if (!user.plan) {
          return c.json({ error: 'User plan not found' }, 400);
        }

        const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
        const group = await ReserachchByName(user.sub)
        const targetGroup = group.find((g: IGroup) => (g._id as mongoose.Types.ObjectId).toString() === body.groupId);
        if (!targetGroup) {
          return c.json({ error: 'Group not found' }, 404);
        }
        if (targetGroup.ownerId.toString() !== user.sub) {
          return c.json({ error: 'Only group owner can add members' }, 403);
        }
        if (targetGroup.members.length >= limits.maxMembers) {
          return c.json({ error: 'Member addition limit reached for your plan' }, 403);
        }


        if (!circuitBreakerInstance.canRequest()) {
          return c.json({ error: 'Users service is currently unavailable' }, 503)
        }
        const cachedMemberId = await redisCache.get(`user_email:${emailToAdd}`);
        if (cachedMemberId) {
          memberIdToAdd = cachedMemberId;
          circuitBreakerInstance.recordSuccess();
        } else {
          const res = await fetch(
            `${USERS_SERVICE_URL}?email=${encodeURIComponent(emailToAdd)}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          )

          if (res.status === 404) {
            circuitBreakerInstance.recordFailure();
            return c.json({ error: 'User not found' }, 400)
          }

          if (!res.ok) {
            circuitBreakerInstance.recordFailure();
            return c.json({ error: 'Error calling users-service' }, 400)

          }

          const user = (await res.json()) as { id: string }
          memberIdToAdd = user.id
          circuitBreakerInstance.recordSuccess();
          await redisCache.set(`user_email:${emailToAdd}`, memberIdToAdd, 'EX', 3600);
        }

      }

      // Converti email → userId per RIMOZIONE
      if (memberToRemove) {
        if (!circuitBreakerInstance.canRequest()) {
          return c.json({ error: 'Users service is currently unavailable' }, 503)
        }


        const cachedMemberId = await redisCache.get(`user_email:${memberToRemove}`);
        if (cachedMemberId) {
          memberIdToRemove = cachedMemberId;
          circuitBreakerInstance.recordSuccess();
        } else {
          const res = await fetch(
            `${USERS_SERVICE_URL}?email=${encodeURIComponent(memberToRemove)}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          )

          if (res.status === 404) {
            circuitBreakerInstance.recordFailure();
            return c.json({ error: 'User to remove not found' }, 400)
          }

          if (!res.ok) {
            circuitBreakerInstance.recordFailure();
            return c.json({ error: 'Error calling users-service for remove' }, 400)
          }

          const user = (await res.json()) as { id: string }
          memberIdToRemove = user.id
          circuitBreakerInstance.recordSuccess();
          await redisCache.set(`user_email:${memberToRemove}`, memberIdToRemove, 'EX', 3600);
        }
      }

      const group = await updateGroupMembers(
        body.groupId,
        memberIdToAdd,  // può essere undefined
        memberIdToRemove  // può essere undefined
      )

      if (memberIdToAdd) {
        await publishGroupEvent({
          type: 'group.member.added',
          groupId: body.groupId,
          payload: {
            memberId: memberIdToAdd,
            email: emailToAdd,
            members: group.members,
          },
          timestamp: new Date().toISOString(),
        })
      }

      if (memberIdToRemove) {
        await publishGroupEvent({
          type: 'group.member.removed',
          groupId: body.groupId,
          payload: {
            memberId: memberIdToRemove,
            members: group.members,
          },
          timestamp: new Date().toISOString(),
        })
      }

      return c.json(group)
    } catch (error) {
      console.error(error)
      return c.json(
        { error: 'Failed to add or delete a member of a group' },
        400
      )
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

      const group = await updateGroupInfo(groupId, name, description)

      await publishGroupEvent({
        type: 'group.updated',
        groupId,
        payload: {
          name: group.name,
          description: group.description,
        },
        timestamp: new Date().toISOString(),
      })

      return c.json(group)
    } catch (error) {
      console.error(error)
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
