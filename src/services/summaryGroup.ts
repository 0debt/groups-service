import mongoose from 'mongoose';
import { IGroup, redisCache } from './services';
import { Group } from './services';
import { circuitBreakerInstance } from './services';
import { redis } from 'bun';


type ExpensesSummaryDTO = {
    totalAmount: number;
    expensesCount: number;
    lastExpenseAt?: string;
    currency?: string;
};

export interface IGroupSummary {
    groupId: string;
    name: string;
    description?: string;
    members: string[];
    membersCount: number;
    owner: string;
    imageUrl: string;
    createdAt: Date;
    updatedAt: Date;
    totalAmount: number;
    expensesCount: number;
    lastExpenseAt?: Date;
    currency?: string;
}

const groupSummarySchema = new mongoose.Schema<IGroupSummary>({
    groupId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    members: { type: [String], required: true },
    membersCount: { type: Number, required: true },
    owner: { type: String, required: true },
    imageUrl: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, default: Date.now },
    totalAmount: { type: Number, required: true, default: 0 },
    expensesCount: { type: Number, required: true, default: 0 },
    lastExpenseAt: { type: Date },
    currency: { type: String, default: "EUR" },
});

export const GroupSummary = mongoose.model<IGroupSummary>('GroupSummary', groupSummarySchema);


export async function upsertGroupSummary(group: mongoose.HydratedDocument<IGroup>) {
    await GroupSummary.findOneAndUpdate(
        { groupId: group._id.toString() },
        {
            $set: {
                groupId: group._id.toString(),
                name: group.name,
                description: group.description,
                members: group.members,
                membersCount: group.members.length,
                owner: group.owner,
                imageUrl: group.imageUrl,
                createdAt: group.createdAt,
                updatedAt: new Date(),
            },
        },
        { upsert: true, new: true }
    );

    const cacheKey = `group_summary:${group._id.toString()}`;
    await redisCache.del(cacheKey);
    console.log(`Cache invalidated for group summary: ${cacheKey}`);
}

export async function getGroupSummary(groupId: string): Promise<IGroupSummary> {
    const cacheKey = `group_summary:${groupId}`;

    const cachedSummary = await redisCache.get(cacheKey);
    if (cachedSummary) {
        console.log("Returning cached group summary");
        return JSON.parse(cachedSummary) as IGroupSummary;
    }

    console.log("Cache miss for group summary, fetching from DB");

    const summary = await GroupSummary
        .findOne({ groupId })
        .lean<IGroupSummary>();

    if (!summary) {
        throw new Error("Group summary not found");

    }

    return summary;
}

export async function upsertExpensesIntoGroupSummary(groupId: string, exp: ExpensesSummaryDTO) {
    await GroupSummary.updateOne(
        { groupId },
        {
            $inc: {
                totalAmount: exp.totalAmount ?? 0,
                expensesCount: exp.expensesCount ?? 0
            },
            $set: {
                lastExpenseAt: exp.lastExpenseAt ? new Date(exp.lastExpenseAt) : undefined,
                currency: exp.currency ?? "EUR",
                expensesStale: false,
                updatedAt: new Date(),
            },
        },
        { upsert: true }
    );
    const cacheKey = `group_summary:${groupId}`;
    await redisCache.del(cacheKey);
    console.log(`Cache invalidated for group summary: ${cacheKey}`);
}