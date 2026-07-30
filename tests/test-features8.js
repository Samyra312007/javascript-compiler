class Animal {
    constructor(name) {
        this.name = name;
    }
    speak() {
        return "sound";
    }
}

class Dog extends Animal {
    constructor(name, breed) {
        super(name);
        this.breed = breed;
    }
    speak() {
        return "woof";
    }
}

let dog = new Dog("Rex", "Husky");
console.log(dog.name);
console.log(dog.speak());

class MathUtils {
    static double(x) {
        return x * 2;
    }
}
console.log(MathUtils.double(5));

class Counter {
    constructor() {
        this.count = 0;
    }
    get value() {
        return this.count;
    }
    set value(v) {
        this.count = v;
    }
    increment() {
        this.count++;
    }
}
let c = new Counter();
c.increment();
console.log(c.count);
