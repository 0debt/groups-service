import { OpenAPIHono, z } from "@hono/zod-openapi"
import {
  createGroup,
  deleteGroup,
  updateGroupMembers,
  updateGroupInfo,
  IGroup,
} from "../services/services"
import { publishGroupEvent } from "../lib/redisPublisher"
import { ReserachchByName } from "../services/services"
import { getGroupSummary } from "../services/summaryGroup"
import { circuitBreaker } from "../lib/circuitBreaker"
import { redisCache } from "../services/services"
import { PLAN_LIMITS } from "../config/plans"
import mongoose from "mongoose"
import type { AppEnv } from "../types/app"
import { authMiddleware } from "../middlware/auth"

export const groupsRoute = new OpenAPIHono<AppEnv>()

const circuitBreakerInstance = new circuitBreaker(5, 60000)

groupsRoute.use("*", authMiddleware)

//client send name + optionalq description
const groupSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

groupsRoute.openapi(
  {
    method: "get",
    path: "/{groupId}/summary",
    summary: "Get materialized summary for a group",
    request: {
      params: z.object({
        groupId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Group summary",
        content: {
          "application/json": {
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
            }),
          },
        },
      },
    },
  },
  async (c) => {
    const { groupId } = c.req.valid("param")

    const cachedSummary = await redisCache.get(`group_summary:${groupId}`)
    if (!cachedSummary) {
      const summary = await getGroupSummary(groupId)
      if (!summary) {
        throw new Error("Group not found")
      }
      await redisCache.set(
        `group_summary:${groupId}`,
        JSON.stringify(summary),
        "EX",
        3600
      )
      return c.json(summary, 200)
    } else {
      return c.json(JSON.parse(cachedSummary), 200)
    }
  }
)

// route for expenses-service or Gateway
groupsRoute.openapi(
  {
    method: "get",
    path: "/{groupId}/members/{userId}",
    summary: "Verify if a user is member of a group",
    request: {
      params: z.object({
        groupId: z.string().openapi({ description: "ID of the group" }),
        userId: z.string().openapi({ description: "ID of the user" }),
      }),
    },
    responses: {
      200: {
        description: "User is member of the group",
        content: {
          "application/json": {
            schema: z.object({
              groupId: z.string(),
              userId: z.string(),
              isMember: z.boolean(),
            }),
          },
        },
      },
      404: {
        description: "User is not member of the group",
      },
    },
  },
  async (c) => {
    try {
      const groupId = c.req.param("groupId")
      const userId = c.req.param("userId")

      if (!groupId || !userId) {
        return c.json({ error: "Missing groupId or userId" }, 400)
      }

      const group = await ReserachchByName(userId)
      const isMember = group.some(
        (g: IGroup) =>
          (g._id as mongoose.Types.ObjectId).toString() === groupId
      )

      if (isMember) {
        return c.json({ groupId, userId, isMember: true })
      } else {
        return c.json({ error: "User is not member of the group" }, 404)
      }
    } catch (error) {
      return c.json({ error: "Failed to verify membership" }, 400)
    }
  }
)

groupsRoute.openapi(
  {
    method: "post",
    path: "/",
    summary: "Create a group",
    request: {
      body: {
        content: {
          "application/json": {
            schema: groupSchema, // { name: string, description?: string }
          },
        },
      },
    },
    responses: {
      201: { description: "Group created" },
      400: { description: "Error on group creation" },
      403: { description: "Plan limit reached" },
    },
  },
  async (c) => {
    try {
      const user = c.get("user") // authMiddleware
      const body = await c.req.valid("json")

      const owner = user.sub
      const members = [user.sub]

      if (!user.plan) {
        return c.json({ error: "User plan not found" }, 400)
      }
      const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS]

      const cachedCount = await redisCache.get(`user_groups_count:${user.sub}`)
      let currentCount = cachedCount ? parseInt(cachedCount, 10) : 0

      if (!cachedCount) {
        const groups = await ReserachchByName(user.sub)
        currentCount = groups.length
        await redisCache.set(
          `user_groups_count:${user.sub}`,
          currentCount.toString(),
          "EX",
          86400
        )
      }

      if (currentCount >= limits.maxGroups) {
        return c.json({ error: "Group creation limit reached for your plan" }, 403)
      }

      const group = await createGroup(
        body.name,
        owner,
        body.description || "",
        members
      )

      await redisCache.set(
        `user_groups_count:${user.sub}`,
        (currentCount + 1).toString(),
        "EX",
        86400
      )

      return c.json(group, 201)
    } catch (error) {
      console.error(error)
      return c.json({ error: "Failed to create group" }, 400)
    }
  }
)


groupsRoute.openapi(
  {
    method: "delete",
    path: "/{id}", // ID in URL
    summary: "Deletion of a group",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "ID of the group to delete" }),
      }),
    },
    responses: {
      200: { description: "Group correctly deleted" },
      400: { description: "Invalid Group ID" },
      403: { description: "Forbidden: only the owner can delete the group" },
      404: { description: "Group not found" },
    },
  },
  async (c) => {
    try {
      const groupId = c.req.param("id")
      if (!groupId) {
        return c.json({ error: "Invalid Group ID" }, 400)
      }

      const user = c.get("user") // auth middleware
      const userGroups = await ReserachchByName(user.sub)

      const groupToDelete = userGroups.find(
        (g: IGroup) => (g._id as mongoose.Types.ObjectId).toString() === groupId
      )

      if (!groupToDelete) {
        return c.json({ error: "Group not found or you are not a member" }, 404)
      }

      const ownerId = groupToDelete.owner || groupToDelete.ownerId
      if (ownerId.toString() !== user.sub) {
        return c.json(
          { error: "Forbidden: Only the owner can delete the group" },
          403
        )
      }

      await deleteGroup(groupId)

      await publishGroupEvent({
        type: "group.deleted",
        groupId: groupId,
        payload: {
          name: groupToDelete.name,
          owner: ownerId,
          members: groupToDelete.members,
        },
        timestamp: new Date().toISOString(),
      })

      return c.json({ success: true, message: "Group deleted successfully" })
    } catch (error) {
      console.error(error)
      return c.json({ error: "Failed to delete group" }, 400)
    }
  }
)

groupsRoute.openapi(
  {
    method: "post",
    path: "/updateMember",
    summary: "Add or delete an element of a group",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              groupId: z.string(),
              members: z.tuple([
                z.string().optional(), // email of the users that we want to add
                z.string().optional(), // email of the users that we want to remove
              ]),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Member added or deleted correctly" },
      400: { description: "Error on adding or deleting a member of the group" },
    },
  },
  async (c) => {
    try {
      const body = await c.req.valid("json")

      const emailToAdd = body.members[0]
      const memberToRemove = body.members[1]
      const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL!

      let memberIdToAdd: string | undefined = undefined
      let memberIdToRemove: string | undefined = undefined

      // Add: email -> userId
      if (emailToAdd) {
        const user = c.get("user")

        if (!user.plan) {
          return c.json({ error: "User plan not found" }, 400)
        }
        const limits = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS]

        const group = await ReserachchByName(user.sub)
        const targetGroup = group.find(
          (g: IGroup) =>
            (g._id as mongoose.Types.ObjectId).toString() === body.groupId
        )
        if (!targetGroup) {
          return c.json({ error: "Group not found" }, 404)
        }
        const ownerId = targetGroup.owner || targetGroup.ownerId
        if (ownerId.toString() !== user.sub) {
          return c.json({ error: "Only group owner can add members" }, 403)
        }
        if (targetGroup.members.length >= limits.maxMembers) {
          return c.json(
            { error: "Member addition limit reached for your plan" },
            403
          )
        }

        if (!circuitBreakerInstance.canRequest()) {
          return c.json(
            { error: "Users service is currently unavailable" },
            503
          )
        }

        const cachedMemberId = await redisCache.get(`user_email:${emailToAdd}`)
        if (cachedMemberId) {
          memberIdToAdd = cachedMemberId
          circuitBreakerInstance.recordSuccess()
        } else {
          const res = await fetch(
            `${USERS_SERVICE_URL}?email=${encodeURIComponent(emailToAdd)}`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            }
          )

          if (res.status === 404) {
            circuitBreakerInstance.recordFailure()
            return c.json({ error: "User not found" }, 400)
          }

          if (!res.ok) {
            circuitBreakerInstance.recordFailure()
            return c.json({ error: "Error calling users-service" }, 400)
          }

          const user = (await res.json()) as { id: string }
          memberIdToAdd = user.id
          circuitBreakerInstance.recordSuccess()
          await redisCache.set(
            `user_email:${emailToAdd}`,
            memberIdToAdd,
            "EX",
            3600
          )
        }
      }

      if (memberToRemove) {
        if (!circuitBreakerInstance.canRequest()) {
          return c.json(
            { error: "Users service is currently unavailable" },
            503
          )
        }

        const cachedMemberId = await redisCache.get(
          `user_email:${memberToRemove}`
        )
        if (cachedMemberId) {
          memberIdToRemove = cachedMemberId
          circuitBreakerInstance.recordSuccess()
        } else {
          const res = await fetch(
            `${USERS_SERVICE_URL}?email=${encodeURIComponent(memberToRemove)}`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            }
          )

          if (res.status === 404) {
            circuitBreakerInstance.recordFailure()
            return c.json({ error: "User to remove not found" }, 400)
          }

          if (!res.ok) {
            circuitBreakerInstance.recordFailure()
            return c.json(
              { error: "Error calling users-service for remove" },
              400
            )
          }

          const user = (await res.json()) as { id: string }
          memberIdToRemove = user.id
          circuitBreakerInstance.recordSuccess()
          await redisCache.set(
            `user_email:${memberToRemove}`,
            memberIdToRemove,
            "EX",
            3600
          )
        }
      }

      const group = await updateGroupMembers(
        body.groupId,
        memberIdToAdd,
        memberIdToRemove
      )

      if (memberIdToAdd) {
        await publishGroupEvent({
          type: "group.member.added",
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
          type: "group.member.removed",
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
        { error: "Failed to add or delete a member of a group" },
        400
      )
    }
  }
)

groupsRoute.openapi(
  {
    method: "patch",
    path: "/{groupId}",
    summary: "Update group name or description",
    request: {
      params: z.object({
        groupId: z.string().openapi({
          description: "ID of the group to update",
        }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              description: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Group updated successfully" },
      400: { description: "Invalid request" },
      403: { description: "Forbidden: only owner can update the group" },
      404: { description: "Group not found" },
    },
  },
  async (c) => {
    try {
      const { groupId } = c.req.valid("param")
      const { name, description } = c.req.valid("json")

      const user = c.get("user")

      // Recupero gruppi dell'utente
      const userGroups = await ReserachchByName(user.sub)

      const targetGroup = userGroups.find(
        (g: IGroup) =>
          (g._id as mongoose.Types.ObjectId).toString() === groupId
      )

      if (!targetGroup) {
        return c.json({ error: "Group not found" }, 404)
      }

      const ownerId = targetGroup.owner || targetGroup.ownerId
      if (ownerId.toString() !== user.sub) {
        return c.json(
          { error: "Forbidden: only the owner can update the group" },
          403
        )
      }

      if (!name && !description) {
        return c.json(
          { error: "At least one field (name or description) must be provided" },
          400
        )
      }

      const updatedGroup = await updateGroupInfo(
        groupId,
        name,
        description
      )

      await publishGroupEvent({
        type: "group.updated",
        groupId,
        payload: {
          name: updatedGroup.name,
          description: updatedGroup.description,
        },
        timestamp: new Date().toISOString(),
      })

      return c.json(updatedGroup, 200)
    } catch (error) {
      console.error(error)
      return c.json({ error: "Failed to update group" }, 400)
    }
  }
)

groupsRoute.openapi(
  {
    method: "get",
    path: "/",
    summary: "Get groups for authenticated user (or by memberId)",
    request: {
      query: z.object({
        memberId: z
          .string()
          .optional()
          .openapi({ description: "Member id (optional, defaults to authenticated user id)" }),
      }),
    },
    responses: {
      200: { description: "Groups fetched successfully" },
      400: { description: "Error fetching groups" },
    },
  },
  async (c) => {
    try {
      const user = c.get("user")
      const memberId = c.req.query("memberId") || user.sub

      const groups = await ReserachchByName(memberId)
      return c.json(groups, 200)
    } catch (error) {
      console.error(error)
      return c.json({ error: "Failed to get groups" }, 400)
    }
  }
)