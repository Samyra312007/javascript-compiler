let n = 7;
let out = 0;
if (n > 3) {
  out = out + 10;
  if (n < 10) {
    out = out + 5;
  }
} else {
  out = out + 100;
}
console.log(out);
