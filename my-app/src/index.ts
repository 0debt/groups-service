
import { ReserachchByName } from './services/Group'
import { serve } from "bun"
import { connectDB } from './db/db'
import { createGroup } from './services/Group'
import './services/Group'
import { Hono } from 'hono'
import { api } from './api/openapi'
import { groupsRoute } from './routes/groups'



export const app = new Hono()

connectDB();


app.route('/api', api as unknown as Hono<any, any, string>)



//SERVER
const port = process.env.PORT
console.log(`Server is running on port ${port}`);
export default {
  port: port,
  fetch: app.fetch,
}




















