import { Hono } from 'hono'
import mongoose, { connect } from 'mongoose'
import { Group } from './models/Group'
import { serve } from "bun"
import { connectDB } from './db/db'
import { createGroup } from './models/Group'


const app = new Hono()


async function startServer() {
  await connectDB(); // connessione al DB prima di partire

  serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/groups" && req.method === "POST") {
        try {
          const body = await req.json()
          const { name, description, members, createdAt, imageUrl } = body

          const group = createGroup(name, description, members, imageUrl)
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


      return new Response("Not Found", { status: 404 });
    },
  });
}

startServer()


export default app


















