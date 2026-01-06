import { describe, it, expect, beforeEach, beforeAll, mock } from "bun:test";
import { Hono } from "hono";

const mockRedisGet = mock();
const mockRedisSet = mock();
const mockRedisDel = mock();
const mockCreateGroup = mock();
const mockDeleteGroup = mock();
const mockUpdateGroupMembers = mock();
const mockUpdateGroupInfo = mock();
const mockResearchByName = mock();
const mockGetGroupSummary = mock();
const mockPublishGroupEvent = mock();

const mockCanRequest = mock(() => true);
const mockRecordSuccess = mock();
const mockRecordFailure = mock();

// Mock auth middleware
mock.module("../middlware/auth", () => ({
    authMiddleware: async (c: any, next: any) => {
        c.set("user", { sub: "user123", plan: "PRO" });
        await next();
    }
}));

mock.module("../services/services", () => ({
    createGroup: mockCreateGroup,
    deleteGroup: mockDeleteGroup,
    updateGroupMembers: mockUpdateGroupMembers,
    updateGroupInfo: mockUpdateGroupInfo,
    ReserachchByName: mockResearchByName,
    redisCache: {
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel,
    },
    circuitBreakerInstance: {
        canRequest: mockCanRequest,
        recordSuccess: mockRecordSuccess,
        recordFailure: mockRecordFailure,
    }
}));

mock.module("../services/summaryGroup", () => ({
    getGroupSummary: mockGetGroupSummary,
}));

mock.module("../lib/redisPublisher", () => ({
    publishGroupEvent: mockPublishGroupEvent,
}));

mock.module("../lib/circuitBreaker", () => ({
    circuitBreaker: class {
        canRequest() {
            return mockCanRequest();
        }
        recordSuccess() {
            return mockRecordSuccess();
        }
        recordFailure() {
            return mockRecordFailure();
        }
    }
}));

let app: Hono;

describe("Groups Component Tests", () => {

    beforeAll(async () => {
        const { groupsRoute } = await import("../routes/groups");
        app = new Hono();
        app.route("/", groupsRoute);
    });

    beforeEach(() => {
        mockRedisGet.mockReset();
        mockRedisSet.mockReset();
        mockRedisDel.mockReset();
        mockCreateGroup.mockReset();
        mockDeleteGroup.mockReset();
        mockUpdateGroupMembers.mockReset();
        mockUpdateGroupInfo.mockReset();
        mockResearchByName.mockReset();
        mockGetGroupSummary.mockReset();
        mockPublishGroupEvent.mockReset();
        mockCanRequest.mockReset();

        mockCanRequest.mockReturnValue(true);
    });

    it("should create a group successfully (201)", async () => {
        mockRedisGet.mockResolvedValue("0");
        mockCreateGroup.mockResolvedValue({
            _id: "group1",
            name: "Test Group",
            owner: "user123",
            members: ["user123"]
        });

        const req = new Request("http://localhost/", {
            method: "POST",
            body: JSON.stringify({ name: "Test Group", description: "Desc" }),
            headers: { "Content-Type": "application/json" }
        });
        const res = await app.request(req);

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.name).toBe("Test Group");
        expect(mockCreateGroup).toHaveBeenCalled();
    });

    it("should fail validation if name is missing (400)", async () => {
        const req = new Request("http://localhost/", {
            method: "POST",
            body: JSON.stringify({ description: "No Name" }),
            headers: { "Content-Type": "application/json" }
        });
        const res = await app.request(req);
        expect(res.status).toBe(400);
    });

    it("should return 403 if plan limit is reached", async () => {
        mockRedisGet.mockResolvedValue("3");
        mockResearchByName.mockResolvedValue(new Array(3));

        // PRO plan has unlimited groups, so this will succeed
        mockCreateGroup.mockResolvedValue({
            _id: "group1",
            name: "Limit Group",
            owner: "user123",
            members: ["user123"]
        });

        const req = new Request("http://localhost/", {
            method: "POST",
            body: JSON.stringify({ name: "Limit Group" }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(201);
    });

    it("should return 400 if service throws error", async () => {
        mockRedisGet.mockResolvedValue("0");
        mockCreateGroup.mockRejectedValue(new Error("DB Error"));

        const req = new Request("http://localhost/", {
            method: "POST",
            body: JSON.stringify({ name: "Error Group" }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(400);
    });

    it("should return summary from cache", async () => {
        const cachedData = { groupId: "g1", name: "Cached Group" };
        mockRedisGet.mockResolvedValue(JSON.stringify(cachedData));

        const res = await app.request(new Request("http://localhost/g1/summary"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(cachedData);
        expect(mockGetGroupSummary).not.toHaveBeenCalled();
    });

    it("should fetch summary from DB on cache miss", async () => {
        mockRedisGet.mockResolvedValue(null);
        mockGetGroupSummary.mockResolvedValue({ groupId: "g1", name: "DB Group" });

        const res = await app.request(new Request("http://localhost/g1/summary"));
        expect(res.status).toBe(200);
        expect(mockGetGroupSummary).toHaveBeenCalledWith("g1");
    });

    it("should return 500 (or handled error) if group not found", async () => {
        mockRedisGet.mockResolvedValue(null);
        mockGetGroupSummary.mockResolvedValue(null);

        const res = await app.request(new Request("http://localhost/g1/summary"));
        expect(res.status).toBe(500);
    });

    it("should confirm user is member", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", members: ["u1"], toString: () => "g1" }
        ]);

        const res = await app.request(new Request("http://localhost/g1/members/u1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.isMember).toBe(true);
    });

    it("should return 404 if user is not member", async () => {
        mockResearchByName.mockResolvedValue([{ _id: "other_group" }]);

        const res = await app.request(new Request("http://localhost/g1/members/u1"));
        expect(res.status).toBe(404);
    });

    it("should add a member successfully", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123", members: [] }
        ]);
        mockRedisGet.mockResolvedValueOnce("user_to_add_id");
        mockCanRequest.mockReturnValue(true);
        mockUpdateGroupMembers.mockResolvedValue({ name: "G1", members: ["user123", "user_to_add_id"] });

        const req = new Request("http://localhost/updateMember", {
            method: "POST",
            body: JSON.stringify({ groupId: "g1", members: ["new@email.com", ""] }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(200);
    });

    it("should forbid non-owners from adding members (403)", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "ANOTHER_USER", members: [] }
        ]);
        mockCanRequest.mockReturnValue(true);

        const req = new Request("http://localhost/updateMember", {
            method: "POST",
            body: JSON.stringify({ groupId: "g1", members: ["new@email.com", ""] }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(403);
    });

    it("should fail if max members limit reached", async () => {
        const manyMembers = new Array(100).fill("id");
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123", members: manyMembers }
        ]);
        mockCanRequest.mockReturnValue(true);

        const req = new Request("http://localhost/updateMember", {
            method: "POST",
            body: JSON.stringify({ groupId: "g1", members: ["new@email.com", ""] }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(403);
    });

    it("should return 400/503 if external user service fails (via Circuit Breaker)", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123", members: [] }
        ]);
        mockRedisGet.mockResolvedValue(null);
        mockCanRequest.mockReturnValue(true);

        global.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 }))) as unknown as typeof fetch;

        const req = new Request("http://localhost/updateMember", {
            method: "POST",
            body: JSON.stringify({ groupId: "g1", members: ["missing@email.com", ""] }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(400);
    });

    it("should update group name", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123" }
        ]);
        mockUpdateGroupInfo.mockResolvedValue({ name: "New Name" });

        const req = new Request("http://localhost/g1", {
            method: "PATCH",
            body: JSON.stringify({ name: "New Name" }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(200);
    });

    it("should forbid update if not owner", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "OTHER" }
        ]);

        const req = new Request("http://localhost/g1", {
            method: "PATCH",
            body: JSON.stringify({ name: "New Name" }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(403);
    });

    it("should fail update if no fields provided", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123" }
        ]);

        const req = new Request("http://localhost/g1", {
            method: "PATCH",
            body: JSON.stringify({}),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        expect(res.status).toBe(400);
    });

    it("should delete group successfully", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123", name: "To Delete", members: [] }
        ]);
        mockDeleteGroup.mockResolvedValue(true);

        const res = await app.request(new Request("http://localhost/g1", { method: "DELETE" }));
        expect(res.status).toBe(200);
    });

    it("should return 404 if group not found in user groups", async () => {
        mockResearchByName.mockResolvedValue([]);

        const res = await app.request(new Request("http://localhost/g1", { method: "DELETE" }));
        expect(res.status).toBe(404);
    });

    it("should forbid delete if not owner", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "OTHER", members: [] }
        ]);

        const res = await app.request(new Request("http://localhost/g1", { method: "DELETE" }));
        expect(res.status).toBe(403);
    });

    it("should list user groups", async () => {
        mockResearchByName.mockResolvedValue([{ name: "My Group" }]);

        const res = await app.request(new Request("http://localhost/"));
        expect(res.status).toBe(200);
        expect(await res.json()).toHaveLength(1);
    });

    it("should list groups for specific memberId", async () => {
        const res = await app.request(new Request("http://localhost/?memberId=u2"));
        expect(mockResearchByName).toHaveBeenCalledWith("u2");
        expect(res.status).toBe(200);
    });

    it("should return 503 when Circuit Breaker is OPEN", async () => {
        mockResearchByName.mockResolvedValue([
            { _id: "g1", owner: "user123", members: [] }
        ]);
        process.env.USERS_SERVICE_URL = "http://users-service";
        mockCanRequest.mockReturnValue(false);

        const req = new Request("http://localhost/updateMember", {
            method: "POST",
            body: JSON.stringify({
                groupId: "g1",
                members: ["email@test.com", ""]
            }),
            headers: { "Content-Type": "application/json" }
        });

        const res = await app.request(req);
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body.error).toBe("Users service is currently unavailable");
    });

});