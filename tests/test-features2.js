function add(a, b = 10) {
    return a + b;
}
console.log(add(5));
console.log(add(5, 20));

function restFn(a, ...rest) {
    return rest.length;
}
console.log(restFn(1, 2, 3, 4));

let arr = [1, 2, 3];
let arr2 = [...arr, 4, 5];
console.log(arr2.length);

let obj1 = { x: 1, y: 2 };
console.log(obj1.x);
console.log(obj1.y);

let a = 1;
let b = 2;
let shorthand = { a, b };
console.log(shorthand.a);
console.log(shorthand.b);

let objWithMethod = {
    val: 42,
    getVal() {
        return this.val;
    }
};
console.log(objWithMethod.getVal());