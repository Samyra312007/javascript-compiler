let obj1 = { a: 1, b: 2 };
let computedKey = "dynamic";
let obj2 = {};
obj2[computedKey] = 42;
console.log(obj2.dynamic);

let spread1 = [1, 2, 3];
console.log(spread1.length);

let arr = [1, 2, 3];
let [x, y, z] = arr;
console.log(x);
console.log(y);
console.log(z);

let obj = { p: 10, q: 20 };
let { p, q } = obj;
console.log(p);
console.log(q);

let arr2 = [1, 2, 3, 4];
let [first, ...rest] = arr2;
console.log(first);
console.log(rest.length);

let spread2 = [...arr, 4, 5];
console.log(spread2.length);
