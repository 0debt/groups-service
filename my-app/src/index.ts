
import { ReserachchByName } from './services/Group'
import { serve } from "bun"
import { connectDB } from './db/db'
import { createGroup } from './services/Group'
import './services/Group'
import { Hono } from 'hono'
import { api } from './api/openapi'
import { groupsRoute } from './routes/groups'



export const app = new Hono()

api.route('/groups', groupsRoute)
app.route('/api/v1', api)



async function startServer() {
  await connectDB(); // connessione al DB prima di partire

  serve({
    port: 3000,


    async fetch(req) {
      const url = new URL(req.url);




      if (url.pathname === "/groups/deletion" && req.method === "POST") {
        try {
          const body = await req.json()
          const { groupId } = body

          const deletedGroup = await deleteGroup(groupId)
          return new Response(JSON.stringify(deletedGroup), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to delete group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      if (url.pathname === "/groups/updateMember" && req.method === "POST") {
        try {
          const body = await req.json()
          const { groupId, memberToAdd, memberToRemove } = body

          const updatedGroup = await updateGroupMembers(groupId, memberToAdd, memberToRemove)
          return new Response(JSON.stringify(updatedGroup), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to add or delete a member of a  group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      if (url.pathname === "/groups/updateDetails" && req.method === "POST") {
        try {
          const body = await req.json()
          const { groupId, name, description } = body

          const updatedGroup = await updateGroupDetails(groupId, name, description)
          return new Response(JSON.stringify(updatedGroup), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to modify a detail of a  group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }




      return new Response("Not Found", { status: 404 });
    },
  });
}

startServer()


export default {
  port: Number(Bun.env.PORT || 3000),
  fetch: app.fetch,
}


















function deleteGroup(groupId: any) {
  throw new Error('Function not implemented.')
}

function updateGroupMembers(groupId: any, memberToAdd: any, memberToRemove: any) {
  throw new Error('Function not implemented.')
}

function updateGroupDetails(groupId: any, name: any, description: any) {
  throw new Error('Function not implemented.')
}

