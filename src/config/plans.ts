
export const PLAN_LIMITS = {
    FREE: {
        maxGroups: 3,
        maxMembers: 5
    },
    PRO: {
        maxGroups: Infinity,
        maxMembers: 50
    },
    ENTERPRISE: {
        maxGroups: Infinity,
        maxMembers: Infinity
    }
} as const;