import { describe, it, expect, mock, beforeEach, beforeAll } from "bun:test";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

const mockVerifyJwt = mock();

mock.module("../utils/jwt", () => ({
    verifyJwt: mockVerifyJwt,
}));

describe("authMiddleware", () => {
    let authMiddleware: MiddlewareHandler;
    let app: Hono;

    beforeAll(async () => {
        const module = await import("../middlware/auth");
        authMiddleware = module.authMiddleware;

        app = new Hono();
        app.use("*", authMiddleware);
        app.get("/test", (c) => c.json({ ok: true }));
    });

    beforeEach(() => {
        mockVerifyJwt.mockReset();
    });

    it("should return 401 when Authorization header is missing", async () => {
        const res = await app.request("/test");

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 when token is invalid", async () => {
        mockVerifyJwt.mockRejectedValueOnce(new Error("invalid"));

        const res = await app.request("/test", {
            headers: {
                Authorization: "Bearer faketoken",
            },
        });

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Invalid token" });
    });

    it("should allow request when token is valid", async () => {
        mockVerifyJwt.mockResolvedValueOnce({
            id: "123",
            email: "test@test.com",
        });

        const res = await app.request("/test", {
            headers: {
                Authorization: "Bearer validtoken",
            },
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });
});
