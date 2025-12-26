import { connectDB } from './db/db'
import './services/services'
import { Hono } from 'hono'
import { api } from './api/openapi'
import { cors } from 'hono/cors'
import { startExpensesConsumer } from './consumers/expensesConsumer'

export const app = new Hono()

app.use('*', cors())

connectDB();
(async () => {
  try {
    await startExpensesConsumer();
  } catch (err) {
    console.error("Failed to start expenses consumer", err);
  }
})();

app.route('/api', api as unknown as Hono<any, any, string>)

//SERVER
const port = Number(process.env.PORT);
console.log(`Server is running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
}

