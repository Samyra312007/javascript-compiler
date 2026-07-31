export const version = "1.0";
export let count = 0;

export function add(a, b) {
    return a + b;
}

export function bump() {
    count = count + 1;
}

export class Counter {
    constructor() {
        this.value = 0;
    }
    inc() {
        this.value = this.value + 1;
    }
    get() {
        return this.value;
    }
}

const secret = 42;

export default function greet(name) {
    return "Hello, " + name;
}

export { secret as internalSecret };
