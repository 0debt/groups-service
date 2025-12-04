// src/redisClient.ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export type GroupEventType =
  | "group.member.added"
  | "group.member.removed"
  | "group.deleted"
  | "group.updated";

export interface GroupEvent<T = any> {
  type: GroupEventType;
  groupId: string;
  payload: T;
  timestamp: string; // ISO
}

export async function publishGroupEvent<T>(event: GroupEvent<T>) {
  try {
    await redis.publish("group-events", JSON.stringify(event));
    console.log("Published group event:", event.type, "for group", event.groupId);
  } catch (err) {
    console.error("Error publishing group event:", err);
  }
}