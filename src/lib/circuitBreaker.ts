
export class circuitBreaker {
    private failureCount: number = 0;
    private threshold: number;
    private timeout: number;
    private lastFailureTime: number = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';




    constructor(threshold = 3, timeout = 30000) {

        this.threshold = threshold;
        this.timeout = timeout;
    }

    private reset() {
        this.failureCount = 0;
        this.state = 'CLOSED';
        this.lastFailureTime = 0;
    }

    public recordFailure() {
        this.failureCount += 1;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
        }
        if (this.state == 'HALF_OPEN') {
            this.state = 'OPEN'
        }

    }

    public recordSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.reset();
            this.state = 'CLOSED';
        }
        this.failureCount = 0;
    }
    
    public canRequest(): boolean {
        if (this.state == 'OPEN' && (Date.now() - this.lastFailureTime) > this.timeout) {
            this.state = 'HALF_OPEN'
            return true
        }
        if (this.state == 'CLOSED') {
            return true
        }
        return false;
    }
}