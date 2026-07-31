import { add } from "./modules/lib.js";
import greet from "./modules/lib.js";

export function hello() {
    return "world";
}

export default class MyClass {
    constructor() {
        this.value = 1;
    }
}

console.log(add(1, 2));
console.log(greet("Modules"));
