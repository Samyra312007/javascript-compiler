let sum = 0;
for (let i = 0; i < 5; i++) {
    sum = sum + i;
}
console.log(sum);

let x = 0;
do {
    x = x + 1;
} while (x < 3);
console.log(x);

let day = 2;
let dayName = "";
switch (day) {
    case 1:
        dayName = "Monday";
        break;
    case 2:
        dayName = "Tuesday";
        break;
    default:
        dayName = "Unknown";
}
console.log(dayName);

let name = "World";
let greeting = `Hello, ${name}!`;
console.log(greeting);

let result = typeof 42;
console.log(result);

let counter = 0;
counter++;
counter++;
counter--;
console.log(counter);

let a = 10;
a += 5;
a -= 3;
console.log(a);

let bits = 5;
bits = bits & 3;
bits = bits | 8;
console.log(bits);