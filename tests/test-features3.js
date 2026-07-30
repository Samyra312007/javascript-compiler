class Person {
    constructor(name, age) {
        this.name = name;
        this.age = age;
    }
    greet() {
        return "Hello";
    }
}
let p = new Person("Alice", 30);
console.log(p.name);

let asyncCheck = true !== false;
console.log(asyncCheck);

let nullVal = null;
let checkNull = nullVal ?? "default";
console.log(checkNull);

let optObj = { foo: { bar: 42 } };
let val = optObj.foo.bar;
console.log(val);

let cond = true;
let ternaryVal = cond ? "yes" : "no";
console.log(ternaryVal);