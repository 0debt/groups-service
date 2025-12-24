import { createClient } from "redis";
import { upsertExpensesIntoGroupSummary } from "../services/services";

export async function startExpensesConsumer() {
  const sub = createClient({ url: process.env.REDIS_URL });
  await sub.connect();

  await sub.subscribe("expenses.events", async (message) => {
    const evt = JSON.parse(message);
    if (evt.type !== "expenses.group.summary.updated") return;

    await upsertExpensesIntoGroupSummary(evt.groupId, evt.payload);
  });

  console.log("subscribed to expenses.events");
}