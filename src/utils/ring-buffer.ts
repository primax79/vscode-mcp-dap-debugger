/**
 * A fixed-size circular buffer that overwrites the oldest elements when full.
 * Implemented using a pointer rather than array shifting for optimal O(1) performance.
 */
export class RingBuffer<T> {
    private buffer: (T | undefined)[]
    private head: number = 0
    private count: number = 0
    private readonly maxSize: number

    constructor(maxSize: number) {
        if (maxSize <= 0) {
            throw new Error('RingBuffer must have a positive maximum size.')
        }
        this.maxSize = maxSize
        this.buffer = new Array(maxSize)
    }

    /**
     * Adds a new item to the buffer. If the buffer is full, the oldest item is discarded.
     */
    push(element: T): void {
        this.buffer[this.head] = element
        this.head = (this.head + 1) % this.maxSize
        
        if (this.count < this.maxSize) {
            this.count++
        }
    }

    /**
     * Returns all elements currently in the buffer, ordered from oldest to newest.
     */
    toArray(): T[] {
        if (this.count === 0) {
            return []
        }

        const result: T[] = []
        // The oldest element is at `head` if we are full, otherwise at 0
        const startIdx = this.count === this.maxSize ? this.head : 0

        for (let i = 0; i < this.count; i++) {
            const idx = (startIdx + i) % this.maxSize
            result.push(this.buffer[idx] as T)
        }

        return result
    }

    /**
     * Empties the buffer.
     */
    clear(): void {
        this.buffer = new Array(this.maxSize)
        this.head = 0
        this.count = 0
    }

    /**
     * Gets the number of items currently held in the buffer.
     */
    get length(): number {
        return this.count
    }
}
