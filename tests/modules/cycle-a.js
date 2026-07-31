import { bFn } from "./cycle-b.js";

export function aFn() {
    return "a";
}

export function aCallsB() {
    return bFn();
}
