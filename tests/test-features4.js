let sum = 0;
for (let i = 0; i < 5; i++) {
    sum = sum + i;
}
console.log(sum);

let found = 0;
let arr2 = [1, 2, 3];
for (let val of arr2) {
    found = found + val;
}
console.log(found);

let obj = { a: 10, b: 20 };
let total = 0;
for (let key in obj) {
    total = total + 1;
}
console.log(total);

let j = 0;
while (j < 3) {
    j = j + 1;
}
console.log(j);

let k = 0;
do {
    k = k + 1;
} while (k < 3);
console.log(k);
