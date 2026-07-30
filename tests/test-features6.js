let a = 10;
a += 5;
a -= 3;
a *= 2;
a /= 2;
console.log(a);

let b = 10;
b = b % 3;
console.log(b);

let exp = 2 ** 3;
console.log(exp);

let bitAnd = 5 & 3;
let bitOr = 5 | 3;
let bitXor = 5 ^ 3;
let bitNot = ~5;
let shl = 5 << 1;
let shr = 5 >> 1;
let ushr = -5 >>> 1;
console.log(bitAnd);
console.log(bitOr);
console.log(bitXor);
console.log(bitNot);
console.log(shl);
console.log(shr);
console.log(ushr);

let count = 0;
count++;
++count;
count--;
--count;
console.log(count);

let t = 10;
t **= 2;
t <<= 1;
t >>= 1;
console.log(t);

let truthy = true && false;
let falsy = true || false;
console.log(truthy);
console.log(falsy);

let nullVal = null;
let check = nullVal ?? "default";
console.log(check);

let result = typeof 42;
let isObj = typeof {};
console.log(result);
console.log(isObj);

let del = delete a;
console.log(del);

let v = void 0;
console.log(v);
