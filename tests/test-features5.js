let arrow1 = x => x * 2;
console.log(arrow1(5));

let arrow3 = () => 42;
console.log(arrow3());

function* genFn() {
    let a = 1;
    return a;
}
console.log(genFn);

function regular(a, b = 10) {
    return a + b;
}
console.log(regular(5));
console.log(regular(5, 20));

function restFn(a, ...rest) {
    return rest.length;
}
console.log(restFn(1, 2, 3));
