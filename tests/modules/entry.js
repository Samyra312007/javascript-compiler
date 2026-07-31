import { add, bump, count, Counter, internalSecret, version } from "./lib.js";
import greet from "./lib.js";
import { double, extra } from "./barrel.js";
import * as lib from "./lib.js";
import * as pkg from "pkg";
import cjs from "./cjs.js";
import { greet as cjsGreet } from "./cjs.js";
import { aCallsB } from "./cycle-a.js";
import "./side-effect.js";

console.log(version);
console.log(add(2, 3));
console.log(greet("World"));
console.log(double(21));
console.log(extra);
console.log(lib.add(10, 20));
console.log(lib.count);
console.log(internalSecret);

let c = new Counter();
c.inc();
console.log(c.get());

bump();
console.log(lib.count);

console.log(cjs.greet("CJS"));
console.log(cjsGreet("Named CJS"));
console.log(pkg.name);
console.log(pkg.pkgFn());
console.log(aCallsB());
