import Redis from "ioredis";
import { upsertExpensesIntoGroupSummary } from "../services/summaryGroup";

const url = process.env.REDIS_URL;
if (!url) throw new Error("REDIS_URL is not defined");

const redisSubscriber = new Redis(url);

const redisClient = new Redis(url); // Additional client for idempotency checks

const EVENT_TTL_SECONDS = 60 * 60 * 24;


redisSubscriber.subscribe("events", (err, count) => {
    if (err) {
        console.error("Failed to subscribe to Redis channel 'events'", err);
        return;
    }
    console.log(`Subscribed to 'events' channel (${count} channels)`);
});


redisSubscriber.on("message", async (channel: string, rawMessage: string) => {
    try {
        const event: { type: string; data: any; timestamp: string } = JSON.parse(rawMessage);


        if (event.type !== "expense.created") return;

        const { expenseId, groupId, amount } = event.data;
        const timestamp = event.timestamp;

        if (!expenseId || !groupId || amount == null) {
            console.warn("Expense event missing required data, skipping", event);
            return;
        }


        const processed = await redisClient.get(`processedEvent:${expenseId}`);
        if (processed) {
            console.log(`Skipping already processed expense ${expenseId}`);
            return;
        }


        await upsertExpensesIntoGroupSummary(groupId, {
            totalAmount: amount,
            expensesCount: 1,
            lastExpenseAt: timestamp,
            currency: "EUR",
        });


        await redisClient.set(`processedEvent:${expenseId}`, "1", "EX", EVENT_TTL_SECONDS); //idempotency key

        console.log(`Updated GroupSummary for group ${groupId} from expense.created`);
    } catch (err) {
        console.error("Error processing expense.created event", err);
    }
});
