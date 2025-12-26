
import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error("REDIS_URL is not defined in environment variables");
}

export const redis = new Redis(url);

export type GroupEventType =
  | "group.member.added"
  | "group.member.removed"
  | "group.deleted"
  | "group.updated";

export interface GroupEvent<T = any> {
  type: GroupEventType;
  groupId: string;
  payload: T;
  timestamp: string;
}

export async function publishGroupEvent<T>(event: GroupEvent<T>) {
  try {
    await redis.publish("group-events", JSON.stringify(event));
    console.log("Published group event:", event.type, "for group", event.groupId);
  } catch (err) {
    console.error("Error publishing group event:", err);
  }
}