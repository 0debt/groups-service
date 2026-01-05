import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import mongoose from "mongoose";
import { GroupSummary, upsertGroupSummary, getGroupSummary, upsertExpensesIntoGroupSummary, IGroupSummary } from "../services/summaryGroup";
import { Group, redisCache } from "../services/services";
import { beforeAll } from "bun:test";

beforeAll(() => {
    
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/groups-service-test";
    process.env.PORT = process.env.PORT || "3000";
});

describe("summaryGroup", () => {
    beforeEach(async () => {
       
        await GroupSummary.deleteMany({});
        await Group.deleteMany({});

        // Mock Redis cache
        mock.module("./services", () => ({
            redisCache: {
                get: mock(() => Promise.resolve(null)),
                del: mock(() => Promise.resolve(1)),
                set: mock(() => Promise.resolve("OK")),
            },
            Group: Group,
        }));
    });

    afterEach(async () => {
        await GroupSummary.deleteMany({});
        await Group.deleteMany({});
    });

    describe("upsertGroupSummary", () => {
        it("should create a new group summary if it doesn't exist", async () => {
            const group = await Group.create({
                name: "Test Group",
                description: "Test Description",
                members: ["user1@test.com", "user2@test.com"],
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
            });

            await upsertGroupSummary(group);

            const summary = await GroupSummary.findOne({ groupId: group._id.toString() });
            expect(summary).toBeDefined();
            expect(summary?.name).toBe("Test Group");
            expect(summary?.membersCount).toBe(2);
            expect(summary?.totalAmount).toBe(0);
            expect(summary?.expensesCount).toBe(0);
        });

        it("should update existing group summary without affecting expense fields", async () => {
            const group = await Group.create({
                name: "Original Name",
                description: "Original Description",
                members: ["user1@test.com"],
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
            });

            // Crea summary con dati spese
            await GroupSummary.create({
                groupId: group._id.toString(),
                name: "Original Name",
                members: ["user1@test.com"],
                membersCount: 1,
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
                totalAmount: 100,
                expensesCount: 5,
                currency: "USD",
            });

            // Aggiorna il gruppo
            group.name = "Updated Name";
            group.members = ["user1@test.com", "user2@test.com"];
            await group.save();

            await upsertGroupSummary(group);

            const summary = await GroupSummary.findOne({ groupId: group._id.toString() });
            expect(summary?.name).toBe("Updated Name");
            expect(summary?.membersCount).toBe(2);
            // I campi delle spese devono rimanere invariati
            expect(summary?.totalAmount).toBe(100);
            expect(summary?.expensesCount).toBe(5);
            expect(summary?.currency).toBe("USD");
        });

        it("should invalidate cache after upsert", async () => {
            const deleteSpy = spyOn(redisCache, "del");

            const group = await Group.create({
                name: "Test Group",
                members: ["user1@test.com"],
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
            });

            await upsertGroupSummary(group);

            expect(deleteSpy).toHaveBeenCalledWith(`group_summary:${group._id.toString()}`);
        });
    });

    describe("getGroupSummary", () => {
        it("should return cached group summary if available", async () => {
            const mockSummary: IGroupSummary = {
                groupId: "123",
                name: "Cached Group",
                members: ["user1@test.com"],
                membersCount: 1,
                owner: "owner@test.com",
                imageUrl: "",
                createdAt: new Date(),
                updatedAt: new Date(),
                totalAmount: 50,
                expensesCount: 2,
                currency: "EUR",
            };

            spyOn(redisCache, "get").mockResolvedValue(JSON.stringify(mockSummary));

            const result = await getGroupSummary("123");

            expect(result.name).toBe("Cached Group");
            expect(result.totalAmount).toBe(50);
        });

        it("should fetch from database if cache miss", async () => {
            const group = await Group.create({
                name: "DB Group",
                members: ["user1@test.com"],
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
            });

            await GroupSummary.create({
                groupId: group._id.toString(),
                name: "DB Group",
                members: ["user1@test.com"],
                membersCount: 1,
                owner: "owner@test.com",
                imageUrl: "https://example.com/image.jpg",
                createdAt: new Date(),
                totalAmount: 0,
                expensesCount: 0,
            });

            spyOn(redisCache, "get").mockResolvedValue(null);

            const result = await getGroupSummary(group._id.toString());

            expect(result.name).toBe("DB Group");
            expect(result.groupId).toBe(group._id.toString());
        });

        it("should throw error if group summary not found", async () => {
            spyOn(redisCache, "get").mockResolvedValue(null);

            await expect(getGroupSummary("nonexistent")).rejects.toThrow("Group summary not found");
        });
    });

    describe("upsertExpensesIntoGroupSummary", () => {
        it("should increment totalAmount and expensesCount", async () => {
            const groupId = new mongoose.Types.ObjectId().toString();

            await GroupSummary.create({
                groupId,
                name: "Test Group",
                members: ["user1@test.com"],
                membersCount: 1,
                owner: "owner@test.com",
                imageUrl: "",
                createdAt: new Date(),
                totalAmount: 100,
                expensesCount: 5,
            });

            await upsertExpensesIntoGroupSummary(groupId, {
                totalAmount: 50,
                expensesCount: 2,
                lastExpenseAt: "2025-12-29T10:00:00Z",
                currency: "EUR",
            });

            const summary = await GroupSummary.findOne({ groupId });
            expect(summary?.totalAmount).toBe(150); // 100 + 50
            expect(summary?.expensesCount).toBe(7); // 5 + 2
            expect(summary?.lastExpenseAt).toBeInstanceOf(Date);
            expect(summary?.currency).toBe("EUR");
        });

        it("should create new summary if it doesn't exist (upsert)", async () => {
            const groupId = new mongoose.Types.ObjectId().toString();

            await upsertExpensesIntoGroupSummary(groupId, {
                totalAmount: 75,
                expensesCount: 3,
                currency: "USD",
            });

            const summary = await GroupSummary.findOne({ groupId });
            expect(summary).toBeDefined();
            expect(summary?.totalAmount).toBe(75);
            expect(summary?.expensesCount).toBe(3);
            expect(summary?.currency).toBe("USD");
        });

        it("should invalidate cache after updating expenses", async () => {
            const deleteSpy = spyOn(redisCache, "del");
            const groupId = new mongoose.Types.ObjectId().toString();

            await upsertExpensesIntoGroupSummary(groupId, {
                totalAmount: 25,
                expensesCount: 1,
            });

            expect(deleteSpy).toHaveBeenCalledWith(`group_summary:${groupId}`);
        });

        it("should handle undefined values gracefully", async () => {
            const groupId = new mongoose.Types.ObjectId().toString();

            await upsertExpensesIntoGroupSummary(groupId, {
                totalAmount: 0,
                expensesCount: 0,
            });

            const summary = await GroupSummary.findOne({ groupId });
            expect(summary?.totalAmount).toBe(0);
            expect(summary?.currency).toBe("EUR"); // default
            expect(summary?.lastExpenseAt).toBeUndefined();
        });
    });
});