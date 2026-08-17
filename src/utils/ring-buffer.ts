export class RingBuffer<T> {
    private readonly items: T[] = []

    constructor(private readonly capacity: number) {
        if (capacity <= 0) {
            throw new Error('RingBuffer capacity must be greater than zero')
        }
    }

    push(item: T): void {
        this.items.push(item)
        if (this.items.length > this.capacity) {
            this.items.shift()
        }
    }

    toArray(): T[] {
        return [...this.items]
    }

    clear(): void {
        this.items.length = 0
    }

    get length(): number {
        return this.items.length
    }
}
