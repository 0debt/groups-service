
import { ReserachchByName } from './services/Group'
import { serve } from "bun"
import { connectDB } from './db/db'
import { createGroup } from './services/Group'
import './services/Group'
import { Hono } from 'hono'
import { api } from './api/openapi'
import { groupsRoute } from './routes/groups'
import { cors } from 'hono/cors'

export const app = new Hono()

app.use('*', cors())

connectDB();


app.route('/api', api as unknown as Hono<any, any, string>)



//SERVER
const port = Number(process.env.PORT) || 3000
console.log(`Server is running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
}