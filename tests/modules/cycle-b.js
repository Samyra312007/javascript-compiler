import { aFn } from "./cycle-a.js";

export function bFn() {
    return aFn();
}
