import { Hono } from 'hono'
import mongoose, { connect } from 'mongoose'
import { Group, ReserachchByName } from './models/Group'
import { serve } from "bun"
import { connectDB } from './db/db'
import { createGroup } from './models/Group'
import { requestPhoto } from './models/Group'
import './models/Group'

const app = new Hono()


async function startServer() {
  await connectDB(); // connessione al DB prima di partire

  serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/groups/creation" && req.method === "POST") {
        try {
          const body = await req.json()
          const { name, owner, description, members } = body

          const group = await createGroup(name, owner, description, members)
          return new Response(JSON.stringify(group), {
            headers: { "Content-Type": "application/json" },
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to create group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })

        }
      }

      if (url.pathname === "/groups/deletion" && req.method === "POST") {
        try{
          const body = await req.json()
          const { groupId } = body

          const deletedGroup = await deleteGroup(groupId)
          return new Response(JSON.stringify(deletedGroup), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to create group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      if (url.pathname === "/groups/updateMember" && req.method === "POST") {
        try{
          const body = await req.json()
          const { groupId, memberToAdd, memberToRemove} = body

          const updatedGroup = await updateGroupMembers(groupId, memberToAdd, memberToRemove)
          return new Response(JSON.stringify(updatedGroup), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to create group' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      

      if (url.pathname == "/groups/visualization" && req.method === "GET") {
        try {
          const searchParams = new URL(req.url).searchParams;
          const name = searchParams.get("name") || ""

          const groups = await ReserachchByName(name)
          return new Response(JSON.stringify(groups), {
            headers: { "Content-Type": "application/json" },
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to get groups' }), {
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


export default app


















function deleteGroup(groupId: any) {
  throw new Error('Function not implemented.')
}

function updateGroupMembers(groupId: any, memberToAdd: any, memberToRemove: any) {
  throw new Error('Function not implemented.')
}

