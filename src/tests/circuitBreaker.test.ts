import { it, expect, describe, beforeAll, afterAll } from 'bun:test';
import { circuitBreaker } from '../lib/circuitBreaker';


describe('circuitBreaker start CLOSED', () => {
    const circuitBreakerTest = new circuitBreaker(3, 1000); // 3 failures, 1 second timeout
    it('should allow calls when closed', () => {
        expect(circuitBreakerTest.getState()).toBe('CLOSED');
        expect(circuitBreakerTest.canRequest()).toBe(true);
    }
    )
});




describe('circuitBreaker transitions to OPEN after threshold failures', () => {
    const circuitBreakerTest = new circuitBreaker(3, 1000);
    it('should transition to OPEN after threshold failures', () => {
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        expect(circuitBreakerTest.getState()).toBe('OPEN');
        expect(circuitBreakerTest.canRequest()).toBe(false);
    })
});




describe('circuitBreaker transitions to HALF_OPEN after timeout', () => {
    const circuitBreakerTest = new circuitBreaker(3, 1000);
    it('should transition to HALF_OPEN after timeout', async () => {
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        expect(circuitBreakerTest.getState()).toBe('OPEN');
        await new Promise(resolve => setTimeout(resolve, 1100));
        expect(circuitBreakerTest.canRequest()).toBe(true);
        expect(circuitBreakerTest.getState()).toBe('HALF_OPEN');
    }
    )
});




describe('circuitBreaker transitions to CLOSED after success in HALF_OPEN', () => {
    const circuitBreakerTest = new circuitBreaker(3, 1000);
    it('should transition to CLOSED after success in HALF_OPEN', async () => {
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        expect(circuitBreakerTest.getState()).toBe('OPEN');
        await new Promise(resolve => setTimeout(resolve, 1100));
        expect(circuitBreakerTest.canRequest()).toBe(true);
        expect(circuitBreakerTest.getState()).toBe('HALF_OPEN');
        circuitBreakerTest.recordSuccess();
        expect(circuitBreakerTest.getState()).toBe('CLOSED');
        expect(circuitBreakerTest.canRequest()).toBe(true);
    })
});




describe('circuitBreaker remains OPEN on failure in HALF_OPEN', () => {
    const circuitBreakerTest = new circuitBreaker(3, 1000);
    it('should remain OPEN on failure in HALF_OPEN', async () => {
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();

        expect(circuitBreakerTest.getState()).toBe('OPEN');
        await new Promise(resolve => setTimeout(resolve, 1100));
        expect(circuitBreakerTest.canRequest()).toBe(true);
        expect(circuitBreakerTest.getState()).toBe('HALF_OPEN');
        circuitBreakerTest.recordFailure();
        expect(circuitBreakerTest.getState()).toBe('OPEN');
        expect(circuitBreakerTest.canRequest()).toBe(false);
    }
    );
});

describe('circuitBreaker does not allow requests when OPEN before timeout', () => {
    const circuitBreakerTest = new circuitBreaker(3, 5000);
    it('should not allow requests when OPEN before timeout', () => {
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        circuitBreakerTest.recordFailure();
        expect(circuitBreakerTest.getState()).toBe('OPEN');
        expect(circuitBreakerTest.canRequest()).toBe(false);
    }
    );
});